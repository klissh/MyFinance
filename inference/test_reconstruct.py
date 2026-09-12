"""Tes untuk `_reconstruct()` dan `_item_count_warning()` di modal_app.py.

Ini fungsi Python murni (tanpa I/O, tanpa model) yang jadi jantung parsing
hasil OCR+LayoutLMv3 jadi item struk terstruktur -- sebelumnya nol test,
padahal paling berisiko di seluruh pipeline (lihat spec-fix-item-hilang-scan.md).

Jalankan: pytest inference/test_reconstruct.py -v
"""

import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from modal_app import (  # noqa: E402
    _reconstruct,
    _item_count_warning,
    _reading_order,
    _strip_barcode_prefix,
)


def test_kasus_normal_dua_item_lengkap():
    # 2 item lengkap (nama+qty+harga+subtotal) berurutan -> 2 item terpisah.
    words = ["Nasi", "Goreng", "2", "15000", "30000", "Es", "Teh", "1", "5000", "5000"]
    labels = [
        "B-menu.nm", "I-menu.nm",
        "B-menu.cnt", "B-menu.unitprice", "B-menu.price",
        "B-menu.nm", "I-menu.nm",
        "B-menu.cnt", "B-menu.unitprice", "B-menu.price",
    ]
    items, _ = _reconstruct(words, labels)

    assert len(items) == 2

    assert items[0]["nama"] == "Nasi Goreng"
    assert items[0]["qty"] == "2"
    assert items[0]["harga_satuan"] == "15000"
    assert items[0]["subtotal"] == "30000"

    assert items[1]["nama"] == "Es Teh"
    assert items[1]["qty"] == "1"
    assert items[1]["harga_satuan"] == "5000"
    assert items[1]["subtotal"] == "5000"


def test_kasus_regresi_utama_nama_gagal_terdeteksi():
    # Item A lengkap, lalu qty/unitprice/price milik item B muncul TANPA
    # menu.nm di antaranya, lalu item C dengan nama muncul.
    # Harus jadi 3 item (A benar, B dengan nama None, C benar) -- BUKAN 2
    # item dengan data A tertimpa B secara senyap (bug lama).
    words = ["A", "1", "1000", "1000", "2", "2000", "2000", "C", "1", "3000", "3000"]
    labels = [
        "B-menu.nm",
        "B-menu.cnt", "B-menu.unitprice", "B-menu.price",
        "B-menu.cnt", "B-menu.unitprice", "B-menu.price",
        "B-menu.nm",
        "B-menu.cnt", "B-menu.unitprice", "B-menu.price",
    ]
    items, _ = _reconstruct(words, labels)

    assert len(items) == 3

    a, b, c = items
    assert a["nama"] == "A"
    assert a["qty"] == "1" and a["harga_satuan"] == "1000" and a["subtotal"] == "1000"

    assert b["nama"] is None
    assert b["qty"] == "2" and b["harga_satuan"] == "2000" and b["subtotal"] == "2000"

    assert c["nama"] == "C"
    assert c["qty"] == "1" and c["harga_satuan"] == "3000" and c["subtotal"] == "3000"


def test_kasus_akhir_struk_flush_di_luar_loop():
    # Struk berakhir dengan field angka milik item terakhir yang namanya
    # tak terdeteksi -- tidak ada field lain sesudahnya untuk memicu flush,
    # jadi harus tetap muncul lewat _flush() di luar loop, bukan hilang.
    words = ["A", "1", "1000", "1000", "2", "2000"]
    labels = [
        "B-menu.nm",
        "B-menu.cnt", "B-menu.unitprice", "B-menu.price",
        "B-menu.cnt", "B-menu.unitprice",
    ]
    items, _ = _reconstruct(words, labels)

    assert len(items) == 2

    assert items[0]["nama"] == "A"
    assert items[0]["subtotal"] == "1000"

    assert items[1]["nama"] is None
    assert items[1]["qty"] == "2"
    assert items[1]["harga_satuan"] == "2000"
    assert items[1]["subtotal"] is None


def test_menu_sub_jadi_baris_terpisah():
    # Keputusan produk (dikonfirmasi user): menu.sub.nm selalu jadi baris
    # sendiri, bukan digabung sebagai catatan ke item utama.
    words = ["Nasi", "1", "10000", "10000", "Extra", "Telur", "1", "2000", "2000"]
    labels = [
        "B-menu.nm",
        "B-menu.cnt", "B-menu.unitprice", "B-menu.price",
        "B-menu.sub.nm", "I-menu.sub.nm",
        "B-menu.sub.cnt", "B-menu.sub.unitprice", "B-menu.sub.price",
    ]
    items, _ = _reconstruct(words, labels)

    assert len(items) == 2
    assert items[0]["nama"] == "Nasi"
    assert items[1]["nama"] == "Extra Telur"
    assert items[1]["qty"] == "1" and items[1]["harga_satuan"] == "2000" and items[1]["subtotal"] == "2000"


def test_cross_check_jml_item_mismatch_menghasilkan_warning():
    ringkasan = {"jml_item": {"text": "5", "value": 5}}
    items = [{}, {}, {}, {}]  # cuma 4 kedetect
    warning = _item_count_warning(ringkasan, items)
    assert warning is not None
    assert "5 item" in warning
    assert "4" in warning


def test_cross_check_jml_item_cocok_tidak_ada_warning():
    ringkasan = {"jml_item": {"text": "3", "value": 3}}
    items = [{}, {}, {}]
    assert _item_count_warning(ringkasan, items) is None


def test_cross_check_jml_item_tidak_ada_di_ringkasan():
    ringkasan = {"jml_item": None}
    items = [{}, {}]
    assert _item_count_warning(ringkasan, items) is None


def test_cross_check_jml_item_tidak_masuk_akal_diabaikan():
    # Kasus nyata (struk Rosyam Mart): fragmen kode barang "02544=" salah
    # kena-label total.menuqty_cnt -> jml_item jadi 2544. Struk rumah
    # tangga tak mungkin punya 2544 item -- jangan tampilkan peringatan
    # yang jelas tidak masuk akal.
    ringkasan = {"jml_item": {"text": "02544=", "value": 2544}}
    items = [{}] * 22
    assert _item_count_warning(ringkasan, items) is None


def test_berhenti_kumpul_item_setelah_field_ringkasan_pertama():
    # Kasus nyata (struk Lotus's): teks footer setelah TOTAL (TNG Wallet,
    # poin member, "sign up for savings") kadang ikut dilabeli field item
    # oleh model karena di luar distribusi training. Field ringkasan
    # PERTAMA menandai akhir wilayah item -- item terakhir tetap harus
    # ke-flush (tidak ikut hilang gara-gara transisi mode), tapi apa pun
    # field-item sesudahnya (di sini menu.sub.nm "TNGWALLET") harus
    # DIABAIKAN, bukan jadi baris baru.
    words = ["A", "1000", "9999", "TNGWALLET"]
    labels = ["B-menu.nm", "B-menu.price", "B-total.total_price", "B-menu.sub.nm"]
    items, ringkasan = _reconstruct(words, labels)
    assert len(items) == 1
    assert items[0]["nama"] == "A" and items[0]["subtotal"] == "1000"
    assert ringkasan["total"]["value"] == 9999


def test_field_ringkasan_selain_subtotal_total_tidak_memicu_berhenti():
    # Regresi nyata (struk Rosyam Mart, 15 item): total.menuqty_cnt
    # (jml_item) kadang tersasar ke TENGAH daftar item, bukan cuma di akhir.
    # Kalau field itu ikut jadi pemicu "berhenti", item asli SESUDAHNYA
    # (di sini item C) akan hilang. Hanya sub_total.subtotal_price /
    # total.total_price yang boleh memicu berhenti.
    words = ["A", "1000", "5", "B", "2000", "TOTAL", "3000", "C", "9000"]
    labels = [
        "B-menu.nm", "B-menu.price",
        "B-total.menuqty_cnt",  # jml_item tersasar di tengah -- HARUS diabaikan sbg pemicu
        "B-menu.nm", "B-menu.price",
        "B-total.total_price", "I-total.total_price",
        "B-menu.nm", "B-menu.price",  # muncul SETELAH total.total_price -> footer, harus diabaikan
    ]
    items, ringkasan = _reconstruct(words, labels)
    assert [it["nama"] for it in items] == ["A", "B"]
    assert ringkasan["total"]["value"] == 3000
    assert ringkasan["jml_item"]["text"] == "5"


def test_field_ringkasan_terpecah_utamakan_entity_yang_ada_angkanya():
    # Regresi nyata (struk Rosyam Mart): "Sub Total" -> "Rounding" -> "61 20"
    # (TANPA pemisah desimal, jadi _amount_value ambil "20" doang) -> "61,20"
    # (DENGAN pemisah, benar 61.2) -- 3 entity berbeda untuk field yang sama,
    # kata lain nyelip di antaranya tiap kali. Harus berakhir di 61.2, bukan
    # "Sub Total" (tanpa angka) atau "61 20" (angka ada tapi salah/terpotong).
    words = ["A", "1000", "Sub Total", "Rounding", "61 20", "Toral", "61,20"]
    labels = [
        "B-menu.nm", "B-menu.price",
        "B-sub_total.subtotal_price",
        "B-sub_total.service_price",
        "B-sub_total.subtotal_price",
        "B-sub_total.service_price",
        "B-sub_total.subtotal_price",
    ]
    _, ringkasan = _reconstruct(words, labels)
    assert ringkasan["subtotal"]["value"] == 61.2


def test_item_tanpa_nilai_uang_sama_sekali_dibuang():
    # Baris nama-doang tanpa angka apa pun (header toko yang kepotong jadi
    # entity menu.nm tersendiri, mis. "BHD" / "Lotuss STORES..." di struk
    # Lotus's) bukan item -- tak bisa dibagi, cuma sampah.
    words = ["BHD", "Toko", "A", "1", "1000", "1000"]
    labels = [
        "B-menu.nm",
        "B-menu.nm",
        "B-menu.nm",
        "B-menu.cnt", "B-menu.unitprice", "B-menu.price",
    ]
    items, _ = _reconstruct(words, labels)
    assert len(items) == 1
    assert items[0]["nama"] == "A"


def test_item_nama_none_dengan_angka_tetap_dipertahankan():
    # Beda dari kasus di atas: nama None TAPI ada angkanya (bug Ronde 18,
    # nama gagal terdeteksi) tidak boleh ikut terbuang oleh filter baru ini.
    words = ["1", "1000", "1000"]
    labels = ["B-menu.cnt", "B-menu.unitprice", "B-menu.price"]
    items, _ = _reconstruct(words, labels)
    assert len(items) == 1
    assert items[0]["nama"] is None
    assert items[0]["subtotal"] == "1000"


def test_item_qty_only_tanpa_field_uang_dibuang():
    # Regresi nyata (struk Rosyam Mart): alamat toko "JALAN TENGKU AMPUAN"
    # dan nama kasir "SYaHZanaNI" salah kena label field qty dengan
    # potongan nomor telepon/invoice sebagai "quantity"-nya (qty=940100,
    # qty=5905202609070114) -- qty sebesar itu jelas bukan quantity barang
    # asli. Tanpa field UANG (subtotal/harga_satuan/diskon) sama sekali,
    # baris begini harus dibuang -- beda dari sebelumnya yang menganggap
    # qty saja cukup untuk mempertahankan baris.
    words = ["JALAN", "TENGKU AMPUAN", "940100", "A", "1", "1000", "1000"]
    labels = [
        "B-menu.nm", "I-menu.nm",
        "B-menu.cnt",  # nyasar dari alamat, TANPA subtotal/harga_satuan
        "B-menu.nm",
        "B-menu.cnt", "B-menu.unitprice", "B-menu.price",
    ]
    items, _ = _reconstruct(words, labels)
    assert len(items) == 1
    assert items[0]["nama"] == "A"


def test_item_dengan_subtotal_melebihi_total_struk_dianggap_salah_baca():
    # Regresi nyata (struk Rosyam Mart): timestamp cetakan struk "17:31:26"
    # terbaca OCR jadi "17,31,26" (koma menggantikan titik dua), salah kena
    # label menu.price, parser nominal salah kira 2 digit terakhir jadi sen
    # -> "RM 1.731,26" -- padahal total struk cuma RM 61,20. Satu item TAK
    # MUNGKIN lebih mahal dari total keseluruhan struk; field seharusnya
    # dikosongkan, baris tanpa field uang lain ikut dibuang.
    words = ["A", "1", "30", "30", "17,31,26", "Sub Total", "61,20"]
    labels = [
        "B-menu.nm", "B-menu.cnt", "B-menu.unitprice", "B-menu.price",
        "B-menu.price",  # timestamp nyasar, TANPA nama -> nama None
        "B-sub_total.subtotal_price", "I-sub_total.subtotal_price",
    ]
    items, ringkasan = _reconstruct(words, labels)
    assert ringkasan["subtotal"]["value"] == 61.2
    assert len(items) == 1
    assert items[0]["nama"] == "A" and items[0]["subtotal_value"] == 30


def test_strip_barcode_prefix_pisahkan_barcode_dari_nama_barang():
    assert _strip_barcode_prefix("09555663102185 FRESHEST") == "FRESHEST"
    assert _strip_barcode_prefix("09555349113795   JAGUNG   MAN") == "JAGUNG   MAN"
    assert _strip_barcode_prefix("FRESHEST B") == "FRESHEST B"
    assert _strip_barcode_prefix("9555452100071") == "9555452100071"


def test_paksa_batas_entity_baru_saat_lompat_baris_meski_model_bilang_lanjutan():
    # Kasus nyata (struk Lotus's): model salah memberi label I- (lanjutan)
    # lintas baris yang tak berhubungan sama sekali -- 2 baris header toko
    # + 2 nama barang pertama semua nyambung jadi SATU entity "menu.nm"
    # raksasa kalau cuma mengandalkan tebakan B-/I- model. Box y-berbeda
    # (baris fisik berbeda) harus memaksa batas baru, walau label = I-.
    words = ["BHD", "FRESHEST"]
    labels = ["B-menu.nm", "I-menu.nm"]  # model bilang "FRESHEST" lanjutan dari "BHD"
    boxes = [[0, 0, 100, 20], [0, 200, 100, 220]]  # y jauh berbeda -> beda baris
    items, _ = _reconstruct(words, labels, boxes)
    # tanpa box, ini akan jadi SATU nama "BHD FRESHEST" -- dengan box, harus
    # jadi 2 entity terpisah. Keduanya sama2 tanpa angka -> dibuang oleh
    # filter item-tanpa-nilai-uang, jadi cukup pastikan tidak tergabung jadi 1.
    words2 = ["BHD", "FRESHEST", "1", "1000", "1000"]
    labels2 = ["B-menu.nm", "I-menu.nm", "B-menu.cnt", "B-menu.unitprice", "B-menu.price"]
    boxes2 = [[0, 0, 100, 20], [0, 200, 100, 220], [0, 200, 20, 220], [30, 200, 60, 220], [70, 200, 100, 220]]
    items2, _ = _reconstruct(words2, labels2, boxes2)
    assert len(items2) == 1
    assert items2[0]["nama"] == "FRESHEST"  # bukan "BHD FRESHEST"


def test_reconstruct_tanpa_box_tetap_kompatibel_backward():
    # Signature lama (2 argumen, tanpa box) harus tetap jalan seperti dulu.
    words = ["Nasi", "Goreng", "1", "10000", "10000"]
    labels = ["B-menu.nm", "I-menu.nm", "B-menu.cnt", "B-menu.unitprice", "B-menu.price"]
    items, _ = _reconstruct(words, labels)
    assert len(items) == 1
    assert items[0]["nama"] == "Nasi Goreng"


def test_reading_order_baris_miring_tetap_urut_kiri_ke_kanan():
    # Simulasi struk yang difoto sedikit miring: baris kanan (harga) py
    # bounding-box-nya bisa lebih tinggi dari baris kiri (nama barang) yang
    # SATU baris visual yang sama. Sort satu-kunci (top-y saja) akan salah
    # taruh harga sebelum nama; pengelompokan-baris harus tetap benar.
    fake_ocr = [
        ([[60, 5], [100, 3], [100, 15], [60, 17]], "5.49", 0.9),      # kanan, y lebih tinggi
        ([[0, 10], [50, 12], [50, 22], [0, 20]], "JAGUNG MAN", 0.9),  # kiri, y lebih rendah
    ]
    ordered = [t[1] for t in _reading_order(fake_ocr)]
    assert ordered == ["JAGUNG MAN", "5.49"]
