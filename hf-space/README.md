---
title: ManageMyMoney Scan Struk
emoji: 🧾
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
pinned: false
license: mit
short_description: OCR + LayoutLMv3 struk belanja untuk split bill kos
---

# ManageMyMoney — Scan Struk API

Layanan inferensi untuk fitur **scan struk + split per item** di aplikasi
[managemymoney](https://github.com/devilk1d/managemymoney).

Pipeline: foto struk → **EasyOCR** (kata + bounding box) → **LayoutLMv3**
(fine-tuned di [CORD-v2](https://huggingface.co/datasets/naver-clova-ix/cord-v2))
→ JSON terstruktur (daftar item, harga, subtotal, pajak, total).

Model: [`Klissh/layoutlmv3-cord-v2`](https://huggingface.co/Klissh/layoutlmv3-cord-v2)

## Arsitektur

- **FastAPI** + **Docker**, CPU (HF Space gratis: 2 vCPU / 16 GB).
- Model LayoutLMv3 + bobot EasyOCR **di-bake ke image** saat build → tidak ada
  unduhan saat runtime → cold start cepat.
- Pemrosesan **asinkron**: `POST /scan` balas `job_id` seketika, klien polling
  `GET /scan/{job_id}`. Kebal timeout proxy untuk struk panjang.
- **Antrean 1** (satu struk diproses pada satu waktu) → lindungi RAM/CPU.
- Autentikasi lewat header `X-API-Key` (kecuali `/health`).

## Endpoint

| Method | Path | Auth | Fungsi |
| --- | --- | --- | --- |
| `GET` | `/health` | — | Cek hidup + status model. Dipakai keep-alive. |
| `GET` | `/` | — | Info singkat (JSON). |
| `POST` | `/scan` | `X-API-Key` | Upload gambar (`multipart/form-data`, field `file`). Balas `{job_id}`. |
| `GET` | `/scan/{job_id}` | `X-API-Key` | Status + hasil bila `status == "done"`. |
| `GET` | `/docs` | — | Swagger UI. |

### Contoh

```bash
# 1. kirim struk
curl -s -X POST https://klissh-managemymoney-scan-struk.hf.space/scan \
  -H "X-API-Key: $SCAN_API_KEY" \
  -F "file=@struk.jpg"
# -> {"job_id":"a1b2...","poll":"/scan/a1b2..."}

# 2. polling sampai status "done"
curl -s https://klissh-managemymoney-scan-struk.hf.space/scan/a1b2... \
  -H "X-API-Key: $SCAN_API_KEY"
```

### Bentuk hasil (`status == "done"`)

```jsonc
{
  "status": "done",
  "timing": { "ocr_s": 9.1, "layoutlm_s": 2.2, "total_s": 11.6 },
  "image": { "w": 1600, "h": 2133, "downscaled_from": [3024, 4032] },
  "raw_words": [
    { "text": "Indomie", "box": [120, 340, 300, 372], "label": "menu.nm", "ocr_conf": 0.97 }
  ],
  "items": [
    { "nama": "Indomie Goreng", "qty": "3", "harga_satuan": "3.500", "subtotal": "10.500", "diskon_item": null }
  ],
  "ringkasan": {
    "subtotal": "112.000",
    "pajak": "11.200",
    "diskon": null,
    "total": "123.200"
  },
  "warnings": []
}
```

## Konfigurasi (Space secrets / env)

| Variabel | Wajib | Default | Keterangan |
| --- | --- | --- | --- |
| `SCAN_API_KEY` | ya (produksi) | — | Kalau kosong, endpoint terbuka + log peringatan (khusus dev lokal). |
| `OCR_MAX_SIDE` | tidak | `1600` | Sisi terpanjang gambar setelah downscale (px). |
| `OCR_BATCH_SIZE` | tidak | `16` | Batch pengenalan EasyOCR. |
| `OCR_LANGS` | tidak | `en,id` | Bahasa EasyOCR (koma). |
| `JOB_TTL_SECONDS` | tidak | `3600` | Umur job di memori sebelum dibersihkan. |
| `TORCH_NUM_THREADS` | tidak | `2` | Sesuai jumlah vCPU Space. |

## Jalankan lokal

```bash
docker build -t scan-struk .
docker run -p 7860:7860 -e SCAN_API_KEY=dev scan-struk
# http://localhost:7860/docs
```
