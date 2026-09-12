"""Tes untuk `_reconstruct()` dan `_item_count_warning()` di modal_app.py.

Ini fungsi Python murni (tanpa I/O, tanpa model) yang jadi jantung parsing
hasil OCR+LayoutLMv3 jadi item struk terstruktur -- sebelumnya nol test,
padahal paling berisiko di seluruh pipeline (lihat spec-fix-item-hilang-scan.md).

Jalankan: pytest inference/test_reconstruct.py -v
"""

import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from modal_app import _reconstruct, _item_count_warning  # noqa: E402


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
