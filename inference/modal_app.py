"""ManageMyMoney — Scan Struk API (Modal.com, serverless CPU, scale-to-zero).

Deploy:
    pip install modal
    modal token new                         # sekali, login
    modal secret create scan-struk SCAN_API_KEY=<key-rahasia>
    modal deploy inference/modal_app.py

Uji lokal (tanpa deploy, tetap jalan di cloud Modal):
    modal serve inference/modal_app.py

Pipeline: foto struk -> EasyOCR (kata + bbox) -> LayoutLMv3 fine-tuned CORD-v2
-> JSON terstruktur (item, harga, subtotal, pajak, total).

Model publik: https://huggingface.co/Klissh/layoutlmv3-cord-v2 (tak butuh token).
"""

import io
import os
import re
import time
from typing import Optional

import modal

APP_NAME = "managemymoney-scan-struk"
HF_MODEL_REPO = "Klissh/layoutlmv3-cord-v2"
MODEL_PATH = "/models/layoutlmv3-cord-v2"
EASYOCR_PATH = "/models/easyocr"
OCR_LANGS = ["en", "id"]
MAX_TOKENS = 512
MAX_UPLOAD_BYTES = 15 * 1024 * 1024


# ---------------------------------------------------------------------------
# Image: dependensi + bobot model & EasyOCR di-bake saat build
# ---------------------------------------------------------------------------
def _bake_assets() -> None:
    from huggingface_hub import snapshot_download

    snapshot_download(
        repo_id=HF_MODEL_REPO,
        local_dir=MODEL_PATH,
        ignore_patterns=["*.bin", ".gitattributes", "README.md"],
    )
    import easyocr  # noqa: F401

    easyocr.Reader(
        OCR_LANGS, gpu=False,
        model_storage_directory=EASYOCR_PATH,
        download_enabled=True, verbose=False,
    )


image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("libglib2.0-0", "libgomp1")
    .pip_install(
        "torch==2.2.2", "torchvision==0.17.2",
        index_url="https://download.pytorch.org/whl/cpu",
    )
    .pip_install(
        "transformers==4.41.2",
        "tokenizers<0.20",
        "safetensors<0.5",
        "huggingface_hub>=0.23,<1.0",
        "easyocr==1.7.2",
        "numpy<2",
        "Pillow<11",
        "fastapi[standard]",
        "python-multipart<0.1",
    )
    .run_function(_bake_assets)
    .env({"HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1", "TORCH_NUM_THREADS": "2"})
)

# Import khusus kontainer ke SCOPE GLOBAL modul (di-skip saat `modal deploy`
# jalan di lokal). Wajib global supaya FastAPI/pydantic bisa me-resolve tipe
# `UploadFile` dari endpoint yang didefinisikan di dalam method `web()`.
with image.imports():
    import numpy as np
    from PIL import Image as PILImage, ImageOps
    from fastapi import FastAPI, UploadFile, File, Header, HTTPException

app = modal.App(APP_NAME)

_SUMMARY_MAP = {
    "sub_total.subtotal_price": "subtotal",
    "sub_total.tax_price": "pajak",
    "sub_total.discount_price": "diskon",
    "sub_total.service_price": "layanan",
    "sub_total.othersvc_price": "biaya_lain",
    "total.total_price": "total",
    "total.cashprice": "tunai",
    "total.changeprice": "kembalian",
    "total.creditcardprice": "kartu",
    "total.emoneyprice": "emoney",
    "total.menuqty_cnt": "jml_item",
}


# ---------------------------------------------------------------------------
# Util pipeline (murni, tanpa framework)
# ---------------------------------------------------------------------------
def _amount_value(text):
    # "12.50" -> 12.5 (desimal RM) ; "1.700" / "60,000" -> 1700 / 60000 (ribuan) ;
    # "Rp 12.000" -> 12000. Heuristik: [.,] + tepat 2 digit di akhir = desimal.
    #
    # Ditemukan dari data nyata: field ringkasan berformat "LABEL ANGKA" (mis.
    # "PB-1 10% 2.818", "TOTAL 31.000") -> ambil kandidat angka PALING BELAKANG,
    # bukan yang pertama (yang pertama sering nomor kode di label). EasyOCR juga
    # sering: (a) menyisipkan spasi nyempil di sekitar pemisah desimal
    # ("28 . 182"), (b) memisah ekor "000" dengan spasi dan membaca sebagian
    # sebagai huruf o/O ("31 0oo").
    if not text:
        return None
    t = re.sub(r"(?<=\d)\s*([.,])\s*(?=\d)", r"\1", text)
    t = re.sub(r"(?<=\d)\s+(?=[0oO]{2,3}(?:\b|$))", "", t)

    candidates = [m.group(0) for m in re.finditer(r"[\d.,oO]+", t) if re.search(r"\d", m.group(0))]
    if not candidates:
        return None
    s = re.sub(r"[oO]", "0", candidates[-1])

    dec = re.search(r"[.,](\d{2})$", s)
    if dec:
        intpart = re.sub(r"[^\d]", "", s[: dec.start()]) or "0"
        return round(int(intpart) + int(dec.group(1)) / 100.0, 2)
    digits = re.sub(r"[^\d]", "", s)
    return int(digits) if digits else None


# Sanity-check jalan tiap kali modul di-import (termasuk saat kontainer Modal
# cold-start) — pernah ada bug di mana ekspresi regex ini rusak diam-diam
# gara-gara lapisan escaping saat file ditulis ulang, dan angka yang keluar
# tetap "terlihat masuk akal" (182 padahal seharusnya 28182) alih-alih error
# yang kelihatan. Kalau assert ini gagal, deploy akan CRASH jelas di log,
# bukan diam-diam menyajikan nominal yang salah ke user.
assert _amount_value("SUBTTL 28 . 182") == 28182, "regresi: spasi di sekitar desimal tak dirapatkan"
assert _amount_value("PB-1  108 2.818") == 2818, "regresi: kandidat pertama terpilih, bukan yang terakhir"
assert _amount_value("TOTAL 31 0oo") == 31000, "regresi: ekor 0oo tak dikoreksi jadi 000"
assert _amount_value("12.50") == 12.5, "regresi: parsing desimal RM"
assert _amount_value("60,000") == 60000, "regresi: parsing ribuan"


def _is_barcode_like(word: str) -> bool:
    """True untuk kode barang/barcode (>=8 digit murni, tanpa titik/koma) —
    ditemukan dari struk retail asli, kata seperti ini menghabiskan jatah
    token LayoutLMv3 secara tidak proporsional dan tidak bernilai klasifikasi."""
    digits_only = re.sub(r"\s", "", word)
    return len(digits_only) >= 8 and digits_only.isdigit()


assert _is_barcode_like("9555452100071") is True
assert _is_barcode_like("2.30") is False
assert _is_barcode_like("15") is False


def _strip_bio(label):
    return label[2:] if label[:2] in ("B-", "I-") else ("" if label == "O" else label)


def _norm_box(pts, w, h):
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    x0, y0 = int(1000 * min(xs) / w), int(1000 * min(ys) / h)
    x1, y1 = int(1000 * max(xs) / w), int(1000 * max(ys) / h)
    x0, y0, x1, y1 = (min(max(v, 0), 1000) for v in (x0, y0, x1, y1))
    return [min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)]


def _reconstruct(words, labels):
    ents, cur_field, cur_words = [], None, []
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

    items, cur, summary = [], {}, {}

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
        elif field == "menu.sub.nm":
            cur["nama"] = (cur.get("nama", "") + " " + text).strip()
        elif field in _SUMMARY_MAP:
            summary.setdefault(_SUMMARY_MAP[field], text)
    _flush()

    for it in items:
        for k in ("qty", "harga_satuan", "subtotal", "diskon_item"):
            it.setdefault(k, None)
        it["qty_value"] = _amount_value(it["qty"])
        it["harga_satuan_value"] = _amount_value(it["harga_satuan"])
        it["subtotal_value"] = _amount_value(it["subtotal"])

    full = {v: None for v in ("subtotal", "pajak", "diskon", "layanan", "total")}
    full.update(summary)
    full = {k: ({"text": v, "value": _amount_value(v)} if v is not None else None) for k, v in full.items()}
    return items, full


# ---------------------------------------------------------------------------
# Service: model dimuat sekali per kontainer, FastAPI di-serve dari sini
# ---------------------------------------------------------------------------
@app.cls(
    image=image,
    cpu=2.0,
    memory=3072,               # cukup untuk torch+easyocr+layoutlmv3 + 1 gambar
    min_containers=0,          # scale-to-zero -> $0 saat idle
    max_containers=2,
    scaledown_window=90,       # mati 90 detik setelah request terakhir (hemat kredit)
    timeout=300,
    # enable_memory_snapshot=True,  # NONAKTIF SEMENTARA: snapshot ke-cache
    # bytecode lama walau sudah redeploy (source dari bug parsing angka yang
    # baru diperbaiki - lihat CLAUDE.md). Aktifkan lagi setelah kode benar2
    # stabil, dan SELALU verifikasi lewat curl setelah redeploy, jangan asumsi.
    secrets=[modal.Secret.from_name("scan-struk")],
)
@modal.concurrent(max_inputs=1)  # 1 struk pada satu waktu per kontainer
class ScanService:
    @modal.enter()
    def load(self):
        import torch
        from transformers import LayoutLMv3ForTokenClassification, LayoutLMv3Processor
        import easyocr

        torch.set_num_threads(2)
        self.torch = torch
        self.model = LayoutLMv3ForTokenClassification.from_pretrained(MODEL_PATH)
        self.model.eval()
        self.processor = LayoutLMv3Processor.from_pretrained(MODEL_PATH, apply_ocr=False)
        self.id2label = {int(k): v for k, v in self.model.config.id2label.items()}
        self.reader = easyocr.Reader(
            OCR_LANGS, gpu=False,
            model_storage_directory=EASYOCR_PATH,
            download_enabled=False, verbose=False,
        )
        self.max_side = int(os.environ.get("OCR_MAX_SIDE", "1800"))
        self.min_side = int(os.environ.get("OCR_MIN_SIDE", "900"))
        self.batch_size = int(os.environ.get("OCR_BATCH_SIZE", "16"))
        self.mag_ratio = float(os.environ.get("OCR_MAG_RATIO", "1.0"))
        self.text_threshold = float(os.environ.get("OCR_TEXT_THRESHOLD", "0.7"))
        self.low_text = float(os.environ.get("OCR_LOW_TEXT", "0.4"))
        self.autocontrast = os.environ.get("OCR_AUTOCONTRAST", "0") == "1"
        print("ScanService siap, label =", len(self.id2label))

    # ---- inti inferensi ----
    def _process(self, raw: bytes) -> dict:
        t_all = time.time()
        warnings = []

        img = ImageOps.exif_transpose(PILImage.open(io.BytesIO(raw))).convert("RGB")
        w0, h0 = img.size
        orig = None
        long_side = max(w0, h0)
        if long_side > self.max_side:
            s = self.max_side / float(long_side)
        elif long_side < self.min_side:
            s = self.min_side / float(long_side)  # struk kecil/berjauhan -> upscale
        else:
            s = 1.0
        if s != 1.0:
            img = img.resize((max(1, round(w0 * s)), max(1, round(h0 * s))), PILImage.LANCZOS)
            orig = [w0, h0]
        img_ocr = ImageOps.autocontrast(img, cutoff=1) if self.autocontrast else img
        w, h = img.size

        t0 = time.time()
        ocr = self.reader.readtext(
            np.asarray(img_ocr), batch_size=self.batch_size, detail=1, paragraph=False,
            mag_ratio=self.mag_ratio, text_threshold=self.text_threshold, low_text=self.low_text,
        )
        t_ocr = time.time() - t0
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
                "image": {"w": w, "h": h, "downscaled_from": orig, "ocr_words": 0},
                "raw_words": [], "items": [], "ringkasan": None,
                "warnings": ["EasyOCR tidak menemukan teks — cek pencahayaan / fokus / crop foto."],
            }

        # Kode barang/barcode (angka murni panjang, mis. "9555452100071") tidak
        # bernilai untuk klasifikasi tapi menghabiskan jatah token TIDAK
        # PROPORSIONAL (word-piece tokenizer sering pecah tiap beberapa digit
        # jadi token sendiri) — ditemukan dari struk retail asli: bagian
        # TOTAL di footer malah terpotong duluan gara-gara kode barang di
        # baris-baris item di atasnya. Kode ini TETAP muncul di raw_words
        # (label "O"), cuma tidak dikirim ke LayoutLMv3.
        model_idx = [i for i, wd in enumerate(words) if not _is_barcode_like(wd)]
        model_words = [words[i] for i in model_idx]
        model_boxes = [boxes[i] for i in model_idx]

        t0 = time.time()
        enc = self.processor(
            img, model_words, boxes=model_boxes,
            truncation=True, padding="max_length", max_length=MAX_TOKENS,
            return_tensors="pt",
        )
        with self.torch.no_grad():
            logits = self.model(**enc).logits
        pred_ids = logits.argmax(-1)[0].tolist()
        t_layout = time.time() - t0

        word_ids = enc.word_ids(0)
        n = len(words)
        m = len(model_words)
        wl = [None] * n
        model_labeled = [False] * m
        for tok_idx, wid in enumerate(word_ids):
            if wid is not None and wid < m and wl[model_idx[wid]] is None:
                wl[model_idx[wid]] = self.id2label.get(int(pred_ids[tok_idx]), "O")
                model_labeled[wid] = True
        n_trunc = sum(1 for lab in model_labeled if not lab)  # dari yg DIKIRIM ke model saja
        if n_trunc:
            warnings.append(f"Struk panjang: {n_trunc}/{m} kata terpotong batas {MAX_TOKENS} token — cek bagian bawah struk (terutama TOTAL) manual.")
        wl = [x or "O" for x in wl]  # kode barang & sisa kata tak terkirim -> "O"

        raw_words = [
            {"text": wd, "box": bx, "label": _strip_bio(lb) or "O", "bio": lb, "ocr_conf": cf}
            for wd, bx, lb, cf in zip(words, boxes, wl, confs)
        ]
        items, ringkasan = _reconstruct(words, wl)
        if not items:
            warnings.append("Tidak ada baris item terdeteksi — mungkin bukan struk belanja atau OCR rendah. Bisa lanjut input manual.")
        mean_conf = float(sum(confs) / len(confs)) if confs else 0.0
        if mean_conf < 0.5:
            warnings.append(f"Rata-rata keyakinan OCR rendah ({mean_conf:.2f}) — kemungkinan banyak salah baca.")

        return {
            "timing": {"ocr_s": round(t_ocr, 2), "layoutlm_s": round(t_layout, 2), "total_s": round(time.time() - t_all, 2)},
            "image": {"w": w, "h": h, "downscaled_from": orig, "ocr_words": n},
            "raw_words": raw_words,
            "items": items,
            "ringkasan": ringkasan,
            "warnings": warnings,
        }

    # ---- dipakai untuk uji CLI ----
    @modal.method()
    def infer(self, raw: bytes) -> dict:
        return {"status": "done", **self._process(raw)}

    # ---- FastAPI di-serve dari kontainer yang sama ----
    @modal.asgi_app()
    def web(self):
        # FastAPI / UploadFile / dst di-import di scope global via image.imports().
        api_key = os.environ.get("SCAN_API_KEY", "").strip()
        api = FastAPI(title="ManageMyMoney Scan Struk", version="1.0.0")

        def _auth(x_api_key):
            if api_key and x_api_key != api_key:
                raise HTTPException(status_code=401, detail="X-API-Key salah / tidak ada.")

        @api.get("/")
        def root():
            return {"service": APP_NAME, "model": HF_MODEL_REPO,
                    "endpoints": ["POST /scan", "GET /health", "GET /docs"]}

        @api.get("/health")
        def health():
            return {"status": "ok", "model": HF_MODEL_REPO, "ocr_langs": OCR_LANGS}

        @api.post("/scan")
        async def scan(file: UploadFile = File(...), x_api_key: Optional[str] = Header(default=None)):
            _auth(x_api_key)
            raw = await file.read()
            if not raw:
                raise HTTPException(status_code=400, detail="File kosong.")
            if len(raw) > MAX_UPLOAD_BYTES:
                raise HTTPException(status_code=413, detail=f"File > {MAX_UPLOAD_BYTES // 1024 // 1024} MB.")
            try:
                PILImage.open(io.BytesIO(raw)).verify()
            except Exception:
                raise HTTPException(status_code=400, detail="Bukan gambar valid (jpg/png/webp).")
            try:
                return {"status": "done", **self._process(raw)}
            except Exception as e:  # noqa: BLE001
                raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}")

        return api


# ---------------------------------------------------------------------------
# Uji cepat 1 struk dari terminal (jalan di cloud Modal, bukan lokal):
#   modal run inference/modal_app.py --image-path struk.jpg
# ---------------------------------------------------------------------------
@app.local_entrypoint()
def main(image_path: str):
    import json

    with open(image_path, "rb") as f:
        raw = f.read()
    out = ScanService().infer.remote(raw)
    print(json.dumps(out, indent=2, ensure_ascii=False))
    t = out.get("timing", {})
    print(f"\n>> OCR {t.get('ocr_s')}s | LayoutLMv3 {t.get('layoutlm_s')}s | total {t.get('total_s')}s")
