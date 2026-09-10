# Scan Struk — layanan inferensi

OCR + LayoutLMv3 untuk fitur *scan struk + split per item* di app managemymoney.

- **`modal_app.py`** — deploy utama: **Modal.com** (serverless CPU, scale-to-zero, gratis untuk volume 7 orang).
- **`../hf-space/`** — alternatif: Docker (Hugging Face Space **PRO**, Google Cloud Run, atau VM).

Model: [`Klissh/layoutlmv3-cord-v2`](https://huggingface.co/Klissh/layoutlmv3-cord-v2) (publik).

## Deploy ke Modal

```bash
pip install modal

# 1. login (buka browser) — ATAU set MODAL_TOKEN_ID / MODAL_TOKEN_SECRET
modal token new

# 2. simpan API key rahasia (dipakai app Next untuk auth ke /scan)
modal secret create scan-struk SCAN_API_KEY=<key-acak-panjang>

# 3. deploy (build pertama ~10-15 menit: torch + easyocr + bake model)
modal deploy inference/modal_app.py
```

Output: URL seperti `https://<workspace>--managemymoney-scan-struk-scanservice-web.modal.run`

## Uji

```bash
# uji 1 struk langsung dari terminal (jalan di cloud Modal) + lihat timing
modal run inference/modal_app.py --image-path struk.jpg

# atau via HTTP setelah deploy
curl -s -X POST https://<url>/scan -H "X-API-Key: $KEY" -F "file=@struk.jpg" | jq
curl -s https://<url>/health
```

## Kontrak API

| Method | Path | Auth | |
| --- | --- | --- | --- |
| `GET` | `/health` | — | cek hidup |
| `POST` | `/scan` | `X-API-Key` | `multipart/form-data` field `file`. **Sinkron** — balas hasil langsung (~15-40 s; cold start +20-30 s). |
| `GET` | `/docs` | — | Swagger |

Respons `POST /scan` (200):

```jsonc
{
  "status": "done",
  "timing": { "ocr_s": 9.1, "layoutlm_s": 2.2, "total_s": 11.6 },
  "image": { "w": 1600, "h": 2133, "downscaled_from": [3024, 4032], "ocr_words": 84 },
  "raw_words": [
    { "text": "Indomie", "box": [70,120,210,140], "label": "menu.nm", "bio": "B-menu.nm", "ocr_conf": 0.97 }
  ],
  "items": [
    { "nama": "Indomie Goreng", "qty": "3", "harga_satuan": "3.500", "subtotal": "10.500",
      "diskon_item": null, "qty_value": 3, "harga_satuan_value": 3500, "subtotal_value": 10500 }
  ],
  "ringkasan": {
    "subtotal": { "text": "112.000", "value": 112000 },
    "pajak":    { "text": "11.200",  "value": 11200 },
    "diskon":   null,
    "layanan":  null,
    "total":    { "text": "123.200", "value": 123200 }
  },
  "warnings": []
}
```

`raw_words` = sumber kebenaran untuk layar review app (tiap baris OCR + label +
posisi). `items`/`ringkasan` = rekonstruksi awal (heuristik) yang dikoreksi user.

## Konfigurasi (env / Modal secret `scan-struk`)

| Var | Default | |
| --- | --- | --- |
| `SCAN_API_KEY` | — | wajib di produksi; kalau kosong endpoint terbuka |
| `OCR_MAX_SIDE` | `1600` | downscale sisi terpanjang (px) |
| `OCR_BATCH_SIZE` | `16` | batch pengenalan EasyOCR |

## Biaya Modal (estimasi)

- CPU 2 vCPU / 4 GB, scale-to-zero. ~1 scan = ~15-40 detik compute.
- 7 orang × ~10 scan/bln ≈ 70 scan ≈ **< $0.50/bln** — di dalam kredit gratis $30/bln.
- `min_containers=0` → **$0 saat tidak dipakai**. Cold start ~20-45 detik ditanggung
  scan pertama setelah idle.
