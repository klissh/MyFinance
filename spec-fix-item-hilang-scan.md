# Spec: Perbaikan Item Hilang/Salah Identifikasi di Hasil Scan Struk

Dokumen ini untuk diberikan ke Claude Code. Ini menindaklanjuti temuan yang
sudah dicatat di `CLAUDE.md` Ronde 17 ("Masalah nyata #2 — belum diperbaiki:
kadang satu item hilang total dari hasil, kemungkinan tergabung ke entity
tetangga") dengan root cause yang sudah dikonfirmasi lewat pembacaan kode
langsung, bukan lagi dugaan.

## 0. Root Cause

**Lokasi:** `inference/modal_app.py`, fungsi `_reconstruct()`, baris ~190–215.

Fungsi ini menutup ("flush") satu item HANYA ketika entity `menu.nm` (nama
item) baru terdeteksi:

```python
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
```

**Masalah:** kalau LayoutLMv3/EasyOCR gagal melabeli `menu.nm` untuk satu
item (nama tak terdeteksi atau salah gabung ke label lain — realistis
terjadi di foto struk asli yang miring/blur, beda dari gambar CORD-v2 yang
bersih), field `qty`/`harga_satuan`/`subtotal` milik item itu tidak pernah
memicu flush baru. Field-field itu langsung MENIMPA nilai yang sudah ada di
`cur` dari item sebelumnya (assignment biasa, tanpa cek "slot ini sudah
terisi milik item lain?"). Begitu item berikutnya yang namanya berhasil
terbaca muncul, `cur` baru di-flush — isinya sudah campuran: nama dari item
lama, angka dari item yang "hilang".

Ini yang paling menjelaskan kasus "JAGUNG MAN 5.49" di struk Lotus's
(Ronde 17): namanya kemungkinan gagal terdeteksi sebagai `menu.nm`, sehingga
harganya diam-diam menimpa harga item sebelumnya sebelum ter-flush dengan
nama item sebelumnya itu. Efeknya dua lapis: item itu tidak pernah muncul
sebagai baris sendiri, DAN item sebelumnya kemungkinan tampil dengan harga
yang salah tapi terlihat masuk akal (pola yang sama seperti bug parsing
nominal di Ronde 16, cuma di layer berbeda).

## 1. Perbaikan Wajib — Flush Lebih Ketat

Ubah syarat flush supaya juga bereaksi ke slot yang sudah terisi, bukan cuma
ke `menu.nm` baru. Prinsipnya: field apa pun yang mau menimpa slot yang
sudah non-`None` di `cur` adalah sinyal item baru sudah mulai, meski
namanya gagal terdeteksi.

```python
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
    QTY_FIELDS = ("menu.cnt", "menu.num", "menu.sub.cnt")
    PRICE_FIELDS = ("menu.unitprice", "menu.sub.unitprice")
    SUBTOTAL_FIELDS = ("menu.price", "menu.itemsubtotal", "menu.sub.price")

    def _flush():
        nonlocal cur
        if cur.get("nama") or cur.get("subtotal") or cur.get("qty") or cur.get("harga_satuan"):
            items.append(cur)
        cur = {}

    def _set(key, text):
        nonlocal cur
        if cur.get(key) is not None:
            # Slot ini sudah terisi -> item baru sudah mulai walau nama
            # gagal terdeteksi. Flush dulu (nama akan kosong, dikoreksi
            # manual di layar review), baru mulai item baru.
            _flush()
        cur[key] = text

    for field, text in ents:
        if field == "menu.nm":
            if cur.get("nama") or cur.get("subtotal"):
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
```

Catatan: ini TIDAK menyelesaikan masalah nama yang gagal terdeteksi (itu
keterbatasan model/OCR, bukan bug kode) — tapi mencegah data numeriknya
ikut hilang atau menimpa item lain secara senyap. Hasilnya jadi baris
dengan `nama: null` yang gampang dikoreksi manual di layar review,
alih-alih hilang total atau salah tempel ke item tetangga.

## 2. Perbaikan Wajib — Cross-Check Jumlah Item

`_SUMMARY_MAP` sudah mengekstrak `total.menuqty_cnt` jadi `ringkasan.jml_item`
tapi tidak pernah dibandingkan dengan `len(items)` hasil rekonstruksi.
Tambahkan pengecekan di `_process()` (setelah pemanggilan `_reconstruct`),
ikuti pola `warnings` yang sudah ada:

```python
items, ringkasan = _reconstruct(words, wl)
jml_item_struk = ringkasan.get("jml_item")
if jml_item_struk and jml_item_struk.get("value") is not None:
    expected = int(jml_item_struk["value"])
    if expected != len(items):
        warnings.append(
            f"Struk menyatakan {expected} item, tapi cuma {len(items)} "
            f"yang terdeteksi — cek manual, kemungkinan ada yang tergabung/hilang."
        )
```

## 3. Keputusan yang Perlu Diambil Dulu (Jangan Langsung Diputuskan Sepihak)

Field `menu.sub.cnt`/`menu.sub.unitprice`/`menu.sub.price` (sub-item di
skema CORD) sekarang ditampung di key yang SAMA dengan field utama
(`qty`/`harga_satuan`/`subtotal`) lewat helper `_set()` di atas — artinya
kalau field utama dan field sub muncul di item yang sama, yang belakangan
akan memicu flush (dianggap item baru), padahal mungkin maksudnya sub-item
itu catatan/varian dari item yang sama. Sebelum Claude Code mengerjakan
bagian ini, konfirmasi dulu: apakah `menu.sub.*` pada data Anda memang
selalu berarti item terpisah (perilaku baru di atas sudah benar), atau bisa
juga berarti modifier/catatan dari item utama (butuh key terpisah, bukan
di-flush)?

## 4. Test yang Wajib Ditambahkan

Root cause ini adalah fungsi Python murni (`_reconstruct`, tanpa I/O) tapi
sekarang nol test — ini yang paling murah untuk dites dan paling berisiko
di seluruh pipeline. Tambahkan file `inference/test_reconstruct.py`
(pytest), minimal skenario berikut:

1. **Kasus normal:** 2 item lengkap (nama+qty+harga+subtotal semua ada)
   berurutan → hasil harus 2 item terpisah dengan data yang benar.
2. **Kasus regresi utama (bug ini):** item A lengkap, lalu field
   `menu.cnt`/`menu.unitprice`/`menu.price` milik item B muncul TANPA
   `menu.nm` di antaranya, lalu item C dengan nama muncul → harus
   menghasilkan 3 item (A benar, B dengan `nama: None`, C benar) — BUKAN 2
   item dengan data A tertimpa B.
3. **Kasus akhir struk:** urutan field berakhir dengan field harga tanpa
   nama sesudahnya (item terakhir di struk tanpa nama terdeteksi) → harus
   tetap muncul sebagai item terakhir (via `_flush()` di luar loop), bukan
   hilang karena tidak ada trigger flush berikutnya.
4. **Cross-check jumlah item:** `ringkasan.jml_item` = 5 tapi `_reconstruct`
   menghasilkan 4 item → `warnings` harus berisi pesan mismatch.

## 5. Tidak Termasuk Scope Ini

- Perubahan ke pendekatan pengelompokan spasial (berbasis koordinat `box`
  alih-alih urutan token) — ini perbaikan lebih besar/lebih robust untuk
  masalah yang sama, tapi didiskusikan terpisah karena berdampak ke seluruh
  alur `_reconstruct`, bukan patch kecil.
- Breakdown metrik precision/recall per label (`menu.nm` vs field lain) di
  notebook — relevan untuk BAB IV, tapi itu di `notebooks/layoutlmv3-cord-v2-finetuning.ipynb`,
  bukan di kode inferensi ini.
- Perbedaan `computeOwed()` (`lib/scan-struk.ts`) yang membagi selisih rata
  flat, padahal `spec-fitur-scan-struk.md` merekomendasikan proporsional —
  ini soal split bill, bukan identifikasi item, tapi perlu diputuskan
  terpisah karena keduanya belum sinkron.
