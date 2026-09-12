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

# Pengelompokan field level-item untuk _reconstruct(). `menu.sub.*` (topping/
# tambahan yang menempel di 1 baris menu, mis. "JASMINE MT (L)" 24.000 dengan
# sub "COCONUT JELLY (L)" 4.000) DISENGAJA disamakan dengan field utama
# (bukan digabung ke nama item induk) supaya sub-item selalu jadi BARIS
# TERSENDIRI dengan harga sendiri — keputusan produk: sub-item harus bisa
# di-assign ke kelompok pembagi yang beda dari item induknya (spec-fix-item-
# hilang-scan.md bagian 3).
NAME_FIELDS = ("menu.nm", "menu.sub.nm")
QTY_FIELDS = ("menu.cnt", "menu.num", "menu.sub.cnt")
PRICE_FIELDS = ("menu.unitprice", "menu.sub.unitprice")
SUBTOTAL_FIELDS = ("menu.price", "menu.itemsubtotal", "menu.sub.price")


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


def _has_decimal_suffix(text):
    """True kalau `text` (setelah pra-proses yang SAMA seperti _amount_value)
    punya akhiran desimal 2-digit yang jelas (mis. "61,20") -- sinyal jauh
    lebih bisa dipercaya sebagai nominal uang valid dibanding angka polos
    hasil tebakan kasar (mis. "20" saja dari "61 20" yang kepisah spasi
    tanpa tanda pemisah sama sekali -- ditemukan di struk Rosyam Mart nyata,
    field yang sama kepecah jadi beberapa entity dengan kualitas OCR beda)."""
    if not text:
        return False
    t = re.sub(r"(?<=\d)\s*([.,])\s*(?=\d)", r"\1", text)
    t = re.sub(r"(?<=\d)\s+(?=[0oO]{2,3}(?:\b|$))", "", t)
    candidates = [m.group(0) for m in re.finditer(r"[\d.,oO]+", t) if re.search(r"\d", m.group(0))]
    if not candidates:
        return False
    s = re.sub(r"[oO]", "0", candidates[-1])
    return re.search(r"[.,](\d{2})$", s) is not None


def _summary_rank(text):
    # Dipakai saat SATU field ringkasan kepecah jadi beberapa entity (lihat
    # _has_decimal_suffix) -- entity dengan akhiran desimal jelas menang di
    # atas entity yang cuma kebetulan mengandung angka (fallback kasar),
    # yang menang di atas entity tanpa angka sama sekali.
    if _has_decimal_suffix(text):
        return 2
    if _amount_value(text) is not None:
        return 1
    return 0


assert _summary_rank("61,20") > _summary_rank("61 20") > _summary_rank("Sub Total")


def _is_barcode_like(word: str) -> bool:
    """True untuk kode barang/barcode (>=8 digit murni, tanpa titik/koma) —
    ditemukan dari struk retail asli, kata seperti ini menghabiskan jatah
    token LayoutLMv3 secara tidak proporsional dan tidak bernilai klasifikasi."""
    digits_only = re.sub(r"\s", "", word)
    return len(digits_only) >= 8 and digits_only.isdigit()


assert _is_barcode_like("9555452100071") is True
assert _is_barcode_like("2.30") is False
assert _is_barcode_like("15") is False


_BARCODE_PREFIX_RE = re.compile(r"^\s*\d{8,}\s+(?=\S)")


def _strip_barcode_prefix(word: str) -> str:
    """EasyOCR kadang menggabung SATU baris (barcode + nama barang) jadi
    SATU token teks, mis. "09555663102185 FRESHEST" (struk retail Lotus's)
    -- _is_barcode_like() (yang mengecek kata MURNI angka) tak pernah kena
    di sini karena hasil gabungannya bukan lagi murni angka, jadi barcode-nya
    ikut terkirim ke model DAN MENUTUPI nama barang aslinya (root cause item
    jadi "No (Reg" / "B" alih-alih "FRESHEST B" / "JAGUNG MAN"). Potong
    awalan angka >=8 digit itu, sisakan teks aslinya."""
    m = _BARCODE_PREFIX_RE.match(word)
    return word[m.end():] if m else word


assert _strip_barcode_prefix("09555663102185 FRESHEST") == "FRESHEST"
assert _strip_barcode_prefix("09555349113795   JAGUNG   MAN") == "JAGUNG   MAN"
assert _strip_barcode_prefix("FRESHEST B") == "FRESHEST B"
assert _strip_barcode_prefix("2.30") == "2.30"
assert _strip_barcode_prefix("9555452100071") == "9555452100071"  # murni angka -> tetap (ranah _is_barcode_like)


def _reading_order(ocr_results):
    """Urutkan hasil EasyOCR ke urutan baca (baris atas->bawah, lalu kiri->
    kanan DALAM satu baris) lewat pengelompokan baris berbasis tumpang-tindih
    rentang-y, BUKAN sort satu-kunci (top-y kata, lalu x) seperti sebelumnya.

    Kenapa perlu: foto struk asli dipegang tangan sering sedikit miring/
    melengkung -- dua kata yang SATU baris visual bisa punya top-y piksel
    berbeda cukup jauh (ujung kanan baris bisa lebih tinggi/rendah dari ujung
    kiri tergantung arah kemiringan kertas). Sort satu-kunci pernah terbukti
    (struk Lotus's) menukar urutan HARGA (kanan) dengan BARANG (kiri) yang
    SATU baris yang sama, dan mengacak total header toko yang melipat 2
    baris jadi urutan acak. LayoutLMv3 lalu salah mengelompokkan field
    karena urutan token sudah rusak sebelum sampai ke model -- ini bukan
    kesalahan model, tapi data urutan yang sudah cacat duluan.
    """
    entries = []
    for pts, text, conf in ocr_results:
        text = (text or "").strip()
        if not text:
            continue
        ys = [p[1] for p in pts]
        xs = [p[0] for p in pts]
        entries.append({"pts": pts, "text": text, "conf": conf, "y0": min(ys), "y1": max(ys), "x0": min(xs)})
    entries.sort(key=lambda d: (d["y0"] + d["y1"]) / 2)

    lines = []
    for e in entries:
        placed = False
        for line in lines:
            overlap = min(e["y1"], line["y1"]) - max(e["y0"], line["y0"])
            min_h = min(e["y1"] - e["y0"], line["y1"] - line["y0"]) or 1
            if overlap > 0.5 * min_h:
                line["words"].append(e)
                line["y0"] = min(line["y0"], e["y0"])
                line["y1"] = max(line["y1"], e["y1"])
                placed = True
                break
        if not placed:
            lines.append({"y0": e["y0"], "y1": e["y1"], "words": [e]})

    lines.sort(key=lambda l: (l["y0"] + l["y1"]) / 2)
    ordered = []
    for line in lines:
        line["words"].sort(key=lambda d: d["x0"])
        ordered.extend(line["words"])
    return [(e["pts"], e["text"], e["conf"]) for e in ordered]


def _ro_check():
    # 2 "baris" sengaja dibuat miring (y kiri != y kanan) supaya sort
    # satu-kunci lama akan salah, tapi pengelompokan-baris tetap benar.
    fake = [
        ([[50, 12], [90, 10], [90, 20], [50, 22]], "kanan1", 0.9),   # baris 1, kanan, y~10-22
        ([[0, 0], [40, 2], [40, 12], [0, 10]], "kiri1", 0.9),        # baris 1, kiri, y~0-12 (tumpang tindih baris 1)
        ([[0, 100], [40, 100], [40, 110], [0, 110]], "kiri2", 0.9),  # baris 2, kiri
        ([[50, 100], [90, 100], [90, 110], [50, 110]], "kanan2", 0.9),  # baris 2, kanan
    ]
    out = [t[1] for t in _reading_order(fake)]
    assert out == ["kiri1", "kanan1", "kiri2", "kanan2"], f"urutan baca salah: {out}"


_ro_check()


def _strip_bio(label):
    return label[2:] if label[:2] in ("B-", "I-") else ("" if label == "O" else label)


def _norm_box(pts, w, h):
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    x0, y0 = int(1000 * min(xs) / w), int(1000 * min(ys) / h)
    x1, y1 = int(1000 * max(xs) / w), int(1000 * max(ys) / h)
    x0, y0, x1, y1 = (min(max(v, 0), 1000) for v in (x0, y0, x1, y1))
    return [min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)]


def _same_line(box_a, box_b):
    _, y0a, _, y1a = box_a
    _, y0b, _, y1b = box_b
    overlap = min(y1a, y1b) - max(y0a, y0b)
    min_h = min(y1a - y0a, y1b - y0b) or 1
    return overlap > 0.5 * min_h


def _reconstruct(words, labels, boxes=None):
    # `boxes` opsional (kompatibel dengan pemanggil lama/test tanpa box) --
    # kalau ada, dipakai untuk MEMAKSA batas entity baru saat kata
    # selanjutnya lompat baris, MESKI model bilang lanjutan (I-). Ditemukan
    # dari struk Lotus's asli: model kerap salah memberi label I- lintas
    # baris yang sama sekali tak berhubungan (header toko 2 baris + 2 nama
    # barang pertama semua nyambung jadi SATU entity "menu.nm" raksasa)
    # karena batas entity kontinu/baru itu sendiri di luar distribusi
    # training model pada teks non-CORD. Baris fisik adalah sinyal batas
    # yang jauh lebih bisa diandalkan daripada tebakan B-/I- model di sini.
    ents, cur_field, cur_words, cur_box = [], None, [], None
    for i, (w, lab) in enumerate(zip(words, labels)):
        field = _strip_bio(lab)
        is_b = lab.startswith("B-")
        box = boxes[i] if boxes is not None else None
        same_line = box is None or cur_box is None or _same_line(box, cur_box)
        if not field:
            if cur_field:
                ents.append((cur_field, " ".join(cur_words)))
            cur_field, cur_words, cur_box = None, [], None
        elif field == cur_field and not is_b and same_line:
            cur_words.append(w)
            cur_box = box
        else:
            if cur_field:
                ents.append((cur_field, " ".join(cur_words)))
            cur_field, cur_words, cur_box = field, [w], box
    if cur_field:
        ents.append((cur_field, " ".join(cur_words)))

    items, cur, summary = [], {}, {}

    # Tutup ("flush") item yang sedang dibangun. Dulu hanya dipicu oleh
    # menu.nm baru -- kalau nama satu item gagal terdeteksi (realistis di
    # foto struk asli yang miring/blur), field angkanya menimpa milik item
    # SEBELUMNYA secara senyap alih-alih memicu flush (lihat
    # spec-fix-item-hilang-scan.md). Sekarang: field APA PUN yang mau
    # menimpa slot yang sudah terisi = sinyal item baru sudah mulai, dan
    # setiap slot yang sempat terisi (bukan cuma nama+subtotal) membuat
    # baris itu layak disimpan -- meski `nama` berakhir None (dikoreksi
    # manual di layar review), datanya tidak hilang/tertimpa diam-diam.
    def _flush():
        nonlocal cur
        if cur:
            items.append(cur)
        cur = {}

    def _set(key, text):
        nonlocal cur
        if cur.get(key) is not None:
            _flush()
        cur[key] = text

    # Field ringkasan (subtotal/pajak/total/dst) SELALU muncul setelah semua
    # baris item di struk mana pun (kafe/CORD-v2 maupun retail) -- begitu
    # wilayah ringkasan dimulai, apa pun yang model coba anggap sebagai field
    # item sesudahnya hampir pasti teks footer (nomor kartu, poin member,
    # "sign up for savings", dll -- di luar distribusi training model, jadi
    # labelnya asal tebak). SENGAJA cuma 2 field paling bisa diandalkan
    # posisinya yang dipakai sebagai PEMICU berhenti (bukan seluruh
    # _SUMMARY_MAP): `sub_total.subtotal_price`/`total.total_price` selalu
    # muncul PERSIS SEKALI, di akhir. Field lain seperti `total.menuqty_cnt`
    # (jml_item) TERBUKTI dari struk nyata (Rosyam Mart, 15 item) kadang
    # tersasar ke TENGAH daftar item -- kalau field itu ikut jadi pemicu,
    # sisa item asli sesudahnya (3 item, termasuk RUSSET POTATO) ikut
    # terbuang senyap. Field ringkasan lain tetap direkam ke `summary`
    # seperti biasa, cuma tidak memicu berhenti. Item terakhir yang masih
    # terbangun (`cur`) tetap di-flush dulu saat trigger aktif, supaya
    # tidak ikut hilang.
    _SUMMARY_STOP_FIELDS = ("sub_total.subtotal_price", "total.total_price")
    seen_summary = False
    for field, text in ents:
        if field in _SUMMARY_MAP:
            if not seen_summary and field in _SUMMARY_STOP_FIELDS:
                _flush()
                seen_summary = True
            # Bukan setdefault polos: satu field ringkasan kadang kepecah
            # jadi >1 entity kalau ada kata lain nyelip di tengah (mis.
            # "Sub Total" lalu "Rounding" lalu baru "61,20" -- ditemukan di
            # struk Rosyam Mart nyata). setdefault akan mengunci ke entity
            # PERTAMA ("Sub Total", tanpa angka) dan membuang nilai asli
            # yang muncul belakangan. _summary_rank() memilih entity paling
            # meyakinkan sebagai nominal uang (akhiran desimal jelas > ada
            # angka sekadarnya > tanpa angka sama sekali).
            key = _SUMMARY_MAP[field]
            if key not in summary or _summary_rank(text) > _summary_rank(summary[key]):
                summary[key] = text
            continue
        if seen_summary:
            continue
        if field in NAME_FIELDS:
            if cur:
                _flush()
            cur["nama"] = text
        elif field in QTY_FIELDS:
            _set("qty", text)
        elif field in PRICE_FIELDS:
            _set("harga_satuan", text)
        elif field in SUBTOTAL_FIELDS:
            _set("subtotal", text)
        elif field == "menu.discountprice":
            _set("diskon_item", text)
    _flush()

    # Baris tanpa field UANG sama sekali (subtotal/harga_satuan/diskon)
    # bukan item -- alat ini untuk split tagihan, baris tanpa nilai uang tak
    # bisa dibagi. SENGAJA tidak menghitung `qty` di sini (beda dari versi
    # sebelumnya): ditemukan dari struk Rosyam Mart nyata, alamat toko
    # ("JALAN TENGKU AMPUAN") dan nama kasir ("SYaHZanaNI") kadang salah
    # kena label field qty dengan potongan nomor telepon/invoice sebagai
    # "quantity"-nya (mis. qty=940100, qty=5905202609070114) -- qty sebesar
    # itu jelas bukan quantity barang asli, dan tanpa field uang apa pun
    # baris begini pasti sampah, bukan item. Baris dengan nama None TAPI ada
    # field uangnya (bug lama Ronde 18) tetap dipertahankan.
    items = [
        it for it in items
        if any(it.get(k) is not None for k in ("harga_satuan", "subtotal", "diskon_item"))
    ]

    full = {v: None for v in ("subtotal", "pajak", "diskon", "layanan", "total")}
    full.update(summary)
    full = {k: ({"text": v, "value": _amount_value(v)} if v is not None else None) for k, v in full.items()}

    # Satu baris item TAK MUNGKIN lebih mahal dari total keseluruhan struk --
    # invarian ini berlaku universal, apa pun bahasa/formatnya. Ditemukan
    # dari struk Rosyam Mart nyata: timestamp cetakan struk "17:31:26"
    # terbaca OCR sebagai "17,31,26" (koma menggantikan titik dua), salah
    # kena label menu.price, lalu parser nominal salah mengira 2 digit
    # terakhir sebagai sen -> "RM 1.731,26", padahal total struk cuma
    # RM 61,20. Pakai subtotal/total struk (mana pun yang lebih dulu
    # ketemu) sebagai batas atas kewajaran; field uang yang melampauinya
    # dianggap salah baca dan dikosongkan, BUKAN nilai valid yang kebetulan
    # besar.
    grand = full["total"]["value"] if full["total"] else (full["subtotal"]["value"] if full["subtotal"] else None)
    if grand:
        for it in items:
            for k in ("harga_satuan", "subtotal", "diskon_item"):
                if it.get(k) is not None and (_amount_value(it[k]) or 0) > grand:
                    it[k] = None
        items = [
            it for it in items
            if any(it.get(k) is not None for k in ("harga_satuan", "subtotal", "diskon_item"))
        ]

    for it in items:
        for k in ("nama", "qty", "harga_satuan", "subtotal", "diskon_item"):
            it.setdefault(k, None)
        it["qty_value"] = _amount_value(it["qty"])
        it["harga_satuan_value"] = _amount_value(it["harga_satuan"])
        it["subtotal_value"] = _amount_value(it["subtotal"])

    return items, full


def _item_count_warning(ringkasan, items):
    # Cross-check ringkasan.jml_item (dari total.menuqty_cnt) vs jumlah baris
    # item hasil _reconstruct -- sinyal murah untuk "kemungkinan ada yang
    # tergabung/hilang" tanpa perlu tahu baris mana yang salah.
    jml_item_struk = ringkasan.get("jml_item")
    if not jml_item_struk or jml_item_struk.get("value") is None:
        return None
    expected = int(jml_item_struk["value"])
    # Struk pribadi/rumah tangga tak pernah punya ratusan item -- nilai
    # segila ini (ditemukan dari struk Rosyam Mart nyata: "02544=", fragmen
    # kode barang yang salah kena-label total.menuqty_cnt) hampir pasti
    # salah baca, bukan jumlah item asli. Diamkan saja alih-alih memberi
    # peringatan yang jelas tidak masuk akal.
    if expected <= 0 or expected > 200:
        return None
    if expected == len(items):
        return None
    return (
        f"Struk menyatakan {expected} item, tapi cuma {len(items)} "
        f"yang terdeteksi — cek manual, kemungkinan ada yang tergabung/hilang."
    )


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
        ocr = _reading_order(ocr)

        words, boxes, confs = [], [], []
        for pts, text, conf in ocr:
            # (sudah di-strip & difilter kosong oleh _reading_order, tapi
            # dicek lagi di sini karena tidak semua caller lewat situ)
            if not text:
                continue
            boxes.append(_norm_box(pts, w, h))
            confs.append(round(float(conf), 3))
            words.append(_strip_barcode_prefix(text))

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
        items, ringkasan = _reconstruct(words, wl, boxes)
        if not items:
            warnings.append("Tidak ada baris item terdeteksi — mungkin bukan struk belanja atau OCR rendah. Bisa lanjut input manual.")
        count_warning = _item_count_warning(ringkasan, items)
        if count_warning:
            warnings.append(count_warning)
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
