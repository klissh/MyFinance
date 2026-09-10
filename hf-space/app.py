"""ManageMyMoney — Scan Struk API.

Foto struk -> EasyOCR (kata + bbox) -> LayoutLMv3 fine-tuned CORD-v2 (label
entitas) -> JSON terstruktur (item, harga, subtotal, pajak, total).

Asinkron: POST /scan balas job_id seketika; klien polling GET /scan/{job_id}.
Antrean 1 job pada satu waktu (ThreadPoolExecutor max_workers=1) supaya
RAM/CPU Space gratis tidak jebol.
"""

from __future__ import annotations

import io
import os
import re
import time
import uuid
import base64
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager

import numpy as np
from PIL import Image, ImageOps
from fastapi import FastAPI, UploadFile, File, Header, HTTPException
from fastapi.responses import JSONResponse

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("scan-struk")

# ---------------------------------------------------------------------------
# Konfigurasi
# ---------------------------------------------------------------------------
API_KEY = os.environ.get("SCAN_API_KEY", "").strip()
MODEL_DIR = os.environ.get("MODEL_DIR", "/home/user/app/model")
EASYOCR_DIR = os.environ.get("EASYOCR_DIR", "/home/user/.EasyOCR")
OCR_MAX_SIDE = int(os.environ.get("OCR_MAX_SIDE", "1600"))
OCR_BATCH_SIZE = int(os.environ.get("OCR_BATCH_SIZE", "16"))
OCR_LANGS = [s.strip() for s in os.environ.get("OCR_LANGS", "en,id").split(",") if s.strip()]
JOB_TTL_SECONDS = int(os.environ.get("JOB_TTL_SECONDS", "3600"))
TORCH_NUM_THREADS = int(os.environ.get("TORCH_NUM_THREADS", "2"))
MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_BYTES", str(15 * 1024 * 1024)))
MAX_TOKENS = 512

# ---------------------------------------------------------------------------
# State global (diisi saat lifespan startup)
# ---------------------------------------------------------------------------
STATE: dict = {"ready": False, "model": None, "processor": None, "reader": None, "id2label": {}}
JOBS: dict[str, dict] = {}
_jobs_lock = threading.Lock()
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="scan")

# CORD-v2 -> nama ringkas untuk ringkasan struk
_SUMMARY_MAP = {
    "sub_total.subtotal_price": "subtotal",
    "sub_total.tax_price": "pajak",
    "sub_total.discount_price": "diskon",
    "sub_total.service_price": "layanan",
    "sub_total.othersvc_price": "biaya_lain",
    "sub_total.etc": "lainnya",
    "total.total_price": "total",
    "total.cashprice": "tunai",
    "total.changeprice": "kembalian",
    "total.creditcardprice": "kartu",
    "total.emoneyprice": "emoney",
    "total.menuqty_cnt": "jml_item",
}


# ---------------------------------------------------------------------------
# Util
# ---------------------------------------------------------------------------
def _amount_value(text: str):
    """'Rp 10.500' / '10,500' / '1.234.567' -> 10500 / 1234567 (best-effort)."""
    if not text:
        return None
    digits = re.sub(r"[^\d]", "", text)
    if not digits:
        return None
    try:
        return int(digits)
    except ValueError:
        return None


def _load_image(raw: bytes) -> Image.Image:
    img = Image.open(io.BytesIO(raw))
    img = ImageOps.exif_transpose(img)  # hormati orientasi EXIF dari kamera HP
    return img.convert("RGB")


def _downscale(img: Image.Image, max_side: int):
    w, h = img.size
    if max(w, h) <= max_side:
        return img, (w, h), None
    scale = max_side / float(max(w, h))
    nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
    return img.resize((nw, nh), Image.LANCZOS), (nw, nh), (w, h)


def _norm_box(pts, w: int, h: int):
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    x0 = int(1000 * min(xs) / w)
    y0 = int(1000 * min(ys) / h)
    x1 = int(1000 * max(xs) / w)
    y1 = int(1000 * max(ys) / h)
    x0, y0, x1, y1 = (min(max(v, 0), 1000) for v in (x0, y0, x1, y1))
    return [min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)]


def _strip_bio(label: str) -> str:
    return label[2:] if label[:2] in ("B-", "I-") else ("" if label == "O" else label)


def _reconstruct(words, labels):
    """Kelompokkan kata -> entitas -> daftar item + ringkasan (heuristik awal;
    hasil final tetap dikoreksi user di layar review app)."""
    ents = []
    cur_field, cur_words = None, []
    for w, lab in zip(words, labels):
        field = _strip_bio(lab)
        is_b = lab.startswith("B-")
        if not field:
            if cur_field:
                ents.append((cur_field, " ".join(cur_words)))
            cur_field, cur_words = None, []
        elif field == cur_field and not is_b:
            cur_words.append(w)
        else:
            if cur_field:
                ents.append((cur_field, " ".join(cur_words)))
            cur_field, cur_words = field, [w]
    if cur_field:
        ents.append((cur_field, " ".join(cur_words)))

    items, cur = [], {}
    summary = {}

    def _flush():
        nonlocal cur
        if cur.get("nama") or cur.get("subtotal") or cur.get("harga_satuan"):
            items.append(cur)
        cur = {}

    for field, text in ents:
        if field == "menu.nm":
            if cur.get("nama") or cur.get("subtotal"):
                _flush()
            cur["nama"] = text
        elif field in ("menu.cnt", "menu.num", "menu.sub.cnt"):
            cur["qty"] = text
        elif field in ("menu.unitprice", "menu.sub.unitprice"):
            cur["harga_satuan"] = text
        elif field in ("menu.price", "menu.itemsubtotal", "menu.sub.price"):
            cur["subtotal"] = text
        elif field == "menu.discountprice":
            cur["diskon_item"] = text
        elif field in ("menu.sub.nm",):
            cur["nama"] = (cur.get("nama", "") + " " + text).strip()
        elif field in _SUMMARY_MAP:
            summary.setdefault(_SUMMARY_MAP[field], text)
    _flush()

    for it in items:
        it["qty"] = it.get("qty")
        it["harga_satuan"] = it.get("harga_satuan")
        it["subtotal"] = it.get("subtotal")
        it["diskon_item"] = it.get("diskon_item")
        it["qty_value"] = _amount_value(it["qty"]) if it.get("qty") else None
        it["harga_satuan_value"] = _amount_value(it["harga_satuan"]) if it.get("harga_satuan") else None
        it["subtotal_value"] = _amount_value(it["subtotal"]) if it.get("subtotal") else None

    summary_full = {v: None for v in ("subtotal", "pajak", "diskon", "layanan", "total")}
    summary_full.update(summary)
    summary_full = {
        k: {"text": v, "value": _amount_value(v)} if v is not None else None
        for k, v in summary_full.items()
    }
    return items, summary_full


# ---------------------------------------------------------------------------
# Inti pemrosesan (jalan di thread executor — boleh blocking)
# ---------------------------------------------------------------------------
def process_receipt(raw: bytes) -> dict:
    import torch

    t_all = time.time()
    warnings: list[str] = []

    img = _load_image(raw)
    img, (w, h), orig = _downscale(img, OCR_MAX_SIDE)

    # 1. EasyOCR
    t0 = time.time()
    reader = STATE["reader"]
    ocr = reader.readtext(np.asarray(img), batch_size=OCR_BATCH_SIZE, detail=1, paragraph=False)
    t_ocr = time.time() - t0

    # urut baca: atas -> bawah, lalu kiri -> kanan
    ocr.sort(key=lambda r: (min(p[1] for p in r[0]), min(p[0] for p in r[0])))

    words, boxes, confs = [], [], []
    for pts, text, conf in ocr:
        text = (text or "").strip()
        if not text:
            continue
        words.append(text)
        boxes.append(_norm_box(pts, w, h))
        confs.append(round(float(conf), 3))

    if not words:
        return {
            "timing": {"ocr_s": round(t_ocr, 2), "layoutlm_s": 0.0, "total_s": round(time.time() - t_all, 2)},
            "image": {"w": w, "h": h, "downscaled_from": list(orig) if orig else None},
            "raw_words": [], "items": [], "ringkasan": None,
            "warnings": ["EasyOCR tidak menemukan teks — cek pencahayaan / fokus / crop foto."],
        }

    # 2. LayoutLMv3
    t0 = time.time()
    model, processor = STATE["model"], STATE["processor"]
    enc = processor(
        img, words, boxes=boxes,
        truncation=True, padding="max_length", max_length=MAX_TOKENS,
        return_tensors="pt",
    )
    with torch.no_grad():
        logits = model(**enc).logits
    pred_ids = logits.argmax(-1)[0].tolist()
    t_layout = time.time() - t0

    id2label = STATE["id2label"]
    word_ids = enc.word_ids(0)
    n_words = len(words)
    word_label = [None] * n_words
    for tok_idx, wid in enumerate(word_ids):
        if wid is not None and wid < n_words and word_label[wid] is None:
            word_label[wid] = id2label.get(int(pred_ids[tok_idx]), "O")
    if any(l is None for l in word_label):
        warnings.append(
            f"Struk panjang: {sum(l is None for l in word_label)}/{n_words} kata terpotong "
            f"batas {MAX_TOKENS} token — periksa bagian bawah struk manual."
        )
    word_label = [l or "O" for l in word_label]

    raw_words = [
        {"text": wd, "box": bx, "label": _strip_bio(lb) or "O", "bio": lb, "ocr_conf": cf}
        for wd, bx, lb, cf in zip(words, boxes, word_label, confs)
    ]
    items, ringkasan = _reconstruct(words, word_label)

    if len(items) == 0:
        warnings.append("Tidak ada baris item terdeteksi — mungkin bukan struk belanja, "
                        "atau kualitas OCR rendah. Bisa lanjut input manual.")
    mean_conf = float(np.mean(confs)) if confs else 0.0
    if mean_conf < 0.5:
        warnings.append(f"Rata-rata keyakinan OCR rendah ({mean_conf:.2f}) — hasil mungkin banyak salah baca.")

    return {
        "timing": {"ocr_s": round(t_ocr, 2), "layoutlm_s": round(t_layout, 2), "total_s": round(time.time() - t_all, 2)},
        "image": {"w": w, "h": h, "downscaled_from": list(orig) if orig else None, "ocr_words": n_words},
        "raw_words": raw_words,
        "items": items,
        "ringkasan": ringkasan,
        "warnings": warnings,
    }


# ---------------------------------------------------------------------------
# Job runner + housekeeping
# ---------------------------------------------------------------------------
def _prune_jobs():
    now = time.time()
    with _jobs_lock:
        stale = [k for k, v in JOBS.items() if now - v["created"] > JOB_TTL_SECONDS]
        for k in stale:
            JOBS.pop(k, None)


def _run_job(job_id: str, raw: bytes):
    with _jobs_lock:
        if job_id in JOBS:
            JOBS[job_id]["status"] = "processing"
            JOBS[job_id]["started"] = time.time()
    try:
        result = process_receipt(raw)
        with _jobs_lock:
            JOBS[job_id].update(status="done", result=result, finished=time.time())
        log.info("job %s done in %.1fs", job_id, result["timing"]["total_s"])
    except Exception as exc:  # noqa: BLE001
        log.exception("job %s gagal", job_id)
        with _jobs_lock:
            JOBS[job_id].update(status="error", error=f"{type(exc).__name__}: {exc}", finished=time.time())
    finally:
        _prune_jobs()


# ---------------------------------------------------------------------------
# Lifespan: muat model + EasyOCR sekali
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(_: FastAPI):
    t0 = time.time()
    import torch
    from transformers import LayoutLMv3ForTokenClassification, LayoutLMv3Processor
    import easyocr

    torch.set_num_threads(max(1, TORCH_NUM_THREADS))
    log.info("memuat model dari %s", MODEL_DIR)
    model = LayoutLMv3ForTokenClassification.from_pretrained(MODEL_DIR)
    model.eval()
    processor = LayoutLMv3Processor.from_pretrained(MODEL_DIR, apply_ocr=False)
    id2label = {int(k): v for k, v in model.config.id2label.items()}

    log.info("memuat EasyOCR %s (dir=%s)", OCR_LANGS, EASYOCR_DIR)
    reader = easyocr.Reader(
        OCR_LANGS, gpu=False,
        model_storage_directory=EASYOCR_DIR,
        download_enabled=False,
        verbose=False,
    )

    STATE.update(ready=True, model=model, processor=processor, reader=reader, id2label=id2label)
    if not API_KEY:
        log.warning("SCAN_API_KEY kosong — endpoint TERBUKA. Set secret di produksi!")
    log.info("siap dalam %.1fs (label=%d)", time.time() - t0, len(id2label))
    try:
        yield
    finally:
        _executor.shutdown(wait=False, cancel_futures=True)


app = FastAPI(title="ManageMyMoney Scan Struk", version="1.0.0", lifespan=lifespan)


def _check_key(x_api_key: str | None):
    if not API_KEY:
        return
    if not x_api_key or x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="X-API-Key salah / tidak ada.")


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------
@app.get("/")
def root():
    return {
        "service": "managemymoney-scan-struk",
        "model": "Klissh/layoutlmv3-cord-v2",
        "ready": STATE["ready"],
        "endpoints": ["POST /scan", "GET /scan/{job_id}", "GET /health", "GET /docs"],
    }


@app.get("/health")
def health():
    with _jobs_lock:
        active = sum(1 for v in JOBS.values() if v["status"] in ("queued", "processing"))
    return {
        "status": "ok" if STATE["ready"] else "loading",
        "model_loaded": STATE["ready"],
        "ocr_langs": OCR_LANGS,
        "jobs_active": active,
        "jobs_total": len(JOBS),
    }


@app.post("/scan")
async def scan(file: UploadFile = File(...), x_api_key: str | None = Header(default=None)):
    _check_key(x_api_key)
    if not STATE["ready"]:
        raise HTTPException(status_code=503, detail="Model belum siap, coba lagi beberapa detik.")

    raw = await file.read()
    if len(raw) == 0:
        raise HTTPException(status_code=400, detail="File kosong.")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"File > {MAX_UPLOAD_BYTES // 1024 // 1024} MB.")
    try:
        _load_image(raw)
    except Exception:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="Bukan gambar yang valid (jpg/png/webp).")

    _prune_jobs()
    job_id = uuid.uuid4().hex[:16]
    with _jobs_lock:
        JOBS[job_id] = {"status": "queued", "created": time.time(), "result": None, "error": None}
        queued_ahead = sum(1 for v in JOBS.values() if v["status"] == "queued") - 1
    _executor.submit(_run_job, job_id, raw)
    return JSONResponse(
        {"job_id": job_id, "status": "queued", "queued_ahead": max(0, queued_ahead),
         "poll": f"/scan/{job_id}", "poll_after_ms": 2000},
        status_code=202,
    )


@app.get("/scan/{job_id}")
def scan_result(job_id: str, x_api_key: str | None = Header(default=None)):
    _check_key(x_api_key)
    with _jobs_lock:
        job = JOBS.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="job_id tidak ditemukan / kedaluwarsa.")
        job = dict(job)
    out = {"job_id": job_id, "status": job["status"]}
    if job["status"] == "done":
        out["result"] = job["result"]
    elif job["status"] == "error":
        out["error"] = job["error"]
    elif job["status"] in ("queued", "processing"):
        out["elapsed_s"] = round(time.time() - job["created"], 1)
    return out
