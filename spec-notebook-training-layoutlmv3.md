# Spec: Notebook Kaggle untuk Fine-tuning LayoutLMv3 pada CORD-v2

Dokumen ini untuk diberikan ke Claude Code, minta dia membuat file `.ipynb` baru yang siap diupload dan dijalankan di Kaggle Notebooks. Ini bukan mulai dari nol secara konsep, karena notebook versi sebelumnya sudah pernah berhasil sampai F1 validasi 0.9495. Tapi dibangun ulang sebagai file baru supaya sekalian memperbaiki beberapa isu metodologi yang penting untuk validitas hasil BAB IV.

## 0. Kenapa Dibuat Ulang, Bukan Cuma Dipakai Lagi

Notebook lama sudah terbukti jalan, tapi ada beberapa isu yang perlu dibenahi supaya angka yang dilaporkan di BAB IV tidak bisa dipertanyakan penguji:

1. **Test split tidak pernah benar-benar dipakai sebagai hasil akhir.** Kalau split validasi dipakai untuk memilih checkpoint terbaik sekaligus dilaporkan sebagai F1 akhir, itu bias, karena checkpoint sudah "dipilih" berdasarkan performanya di data itu. Split test (100 data) harus disisihkan total, tidak disentuh sampai training selesai, baru dipakai sekali untuk laporan akhir.
2. **Kosakata label dibangun hanya dari data train.** Kalau ada kategori label yang cuma muncul di validation/test tapi tidak ada di train, sistem lama diam-diam menganggapnya "O" (bukan entitas), padahal itu masalah cakupan label, bukan prediksi model yang benar. Kosakata label harus dibangun dari gabungan train, validation, dan test sekaligus, sebelum encoding dimulai.
3. **Deteksi duplikat cuma dilakukan per split, bukan lintas split.** Kalau ada gambar yang sama persis muncul di train dan test (bisa terjadi di dataset publik), itu bisa bikin hasil test kelihatan lebih bagus dari yang sebenarnya. Perlu pengecekan hash gambar lintas ketiga split.
4. **Sel demo inferensi di notebook lama pakai Tesseract**, padahal proposal sudah menetapkan EasyOCR sebagai OCR resmi sistem. Ini diselaraskan supaya konsisten.

## 1. Lingkungan dan Instalasi (Cell 1)

Gunakan satu sel instalasi saja, dengan versi yang sudah terbukti kompatibel dengan lingkungan Kaggle saat ini (hasil dari empat kali debugging sebelumnya):

- Jangan gunakan `seqeval`, library ini gagal install di Kaggle karena `setup.py`-nya pakai mekanisme `easy_install` yang sudah dihapus dari setuptools modern. Ganti dengan implementasi metrik BIO manual (lihat bagian 5).
- `accelerate==0.34.2` (bukan versi default Kaggle, karena versi lama tidak punya `clear_device_cache` yang dibutuhkan `peft`).
- Uninstall `peft` sepenuhnya, karena notebook ini tidak pakai LoRA/PEFT, dan versi `peft` bawaan Kaggle bentrok dengan `transformers==4.41.2`.
- `datasets==3.6.0` (versi Kaggle lama gagal konversi kolom `Array2D`/`Array3D` karena perubahan semantik `copy=False` di NumPy 2.x).
- Gunakan `%pip install` (magic command), bukan `!pip install`, karena `!pip` di Kaggle bisa menginstall ke Python yang beda dari kernel yang aktif. Tambahkan sel verifikasi mandiri yang mengecek tiap modul dengan `importlib`, dan kalau hilang, install ulang paksa lewat `sys.executable` + `subprocess.check_call` supaya masuk ke interpreter kernel yang benar.
- Tambahkan `easyocr` di sel instalasi ini juga (dipakai nanti di sel demo inferensi paling akhir, bukan untuk training).

## 2. Memuat dan Membersihkan Data (Cell 2-3)

- Muat `naver-clova-ix/cord-v2` langsung dari Hugging Face Hub lewat `datasets.load_dataset`, ambil ketiga split: train (800), validation (100), test (100).
- Data cleaning diterapkan konsisten ke ketiga split: normalisasi mode gambar ke RGB, validasi dan clipping bounding box supaya tidak keluar batas gambar, pembersihan teks, filter data dengan jumlah kata terlalu sedikit, dan laporan statistik sebelum/sesudah dibersihkan.
- Deteksi duplikat pakai image hashing, dijalankan **lintas ketiga split sekaligus** (bukan per split terpisah), dan kalau ditemukan duplikat lintas split, catat dan buang dari split yang bukan train (supaya train tetap penuh, tapi validation/test tetap bersih dari kebocoran).
- Set `seed=42` secara eksplisit di semua operasi acak (shuffling, split, dsb), jangan mengandalkan default implisit.

## 3. Kosakata Label (Cell 4)

Bangun daftar label BIO dari kategori yang muncul di **gabungan train, validation, dan test**, bukan cuma train. Ini mencegah label yang cuma muncul di validation/test diam-diam dianggap "O". Simpan mapping label ke id secara eksplisit dan cetak jumlah kemunculan tiap label per split untuk verifikasi, termasuk mencatat secara eksplisit di markdown bahwa kelas "O" tidak punya contoh training murni (karena seluruh data CORD-v2 berasal dari `valid_line` yang sudah teranotasi sebagai entitas), sehingga ada celah training-vs-inferensi yang perlu disebut di BAB IV, bukan sesuatu yang bisa diperbaiki dari sisi data training.

## 4. Encoding (Cell 5)

- Pakai `LayoutLMv3Processor` dengan `apply_ocr=False` (karena CORD-v2 sudah punya bounding box dan teks per kata dari anotasi, tidak perlu OCR ulang saat training).
- Konversi eksplisit `pixel_values` dari tensor ke list sebelum disimpan ke kolom dataset, supaya tidak gagal serialisasi ke `Array3D` (bug yang sudah pernah ditemukan sebelumnya).
- Terapkan ke ketiga split.

## 5. Metrik Evaluasi Kustom (Cell 6)

Implementasi manual (~40 baris) untuk precision, recall, F1 berbasis skema BIO, tanpa bergantung pada `seqeval`. Fungsi ini dipanggil oleh `Trainer` lewat `compute_metrics`.

## 6. Model dan Training (Cell 7-8)

- `LayoutLMv3ForTokenClassification.from_pretrained("microsoft/layoutlmv3-base", num_labels=<jumlah label dari bagian 3>)`.
- `TrainingArguments`: `learning_rate=1e-5`, `num_train_epochs=10`, `per_device_train_batch_size=2`, `fp16=True` kalau GPU tersedia, `evaluation_strategy="epoch"`, `save_strategy="epoch"`, `load_best_model_at_end=True`, `metric_for_best_model="f1"`, `save_total_limit=2` (supaya tidak memenuhi kuota disk Kaggle), `seed=42`, `report_to="none"`.
- `Trainer` dilatih dengan `train_dataset` = train, `eval_dataset` = **validation saja**. Test split tidak disentuh sama sekali di tahap ini.

## 7. Evaluasi Akhir (Cell 9, Terpisah dan Diberi Judul Jelas)

Setelah training selesai dan checkpoint terbaik dimuat, jalankan `trainer.evaluate()` **satu kali** pada test split yang belum pernah disentuh. Beri judul markdown yang eksplisit di atas sel ini, misalnya "Hasil Resmi untuk Laporan BAB IV (dari Test Split, Bukan Validation)", supaya jelas ini angka yang dipakai untuk skripsi, bukan angka validasi yang dipakai untuk pemilihan checkpoint.

## 8. Simpan Model (Cell 10)

Simpan model dan processor ke `/kaggle/working/`, dengan opsi tambahan `push_to_hub()` kalau nanti mau langsung diunggah ke Hugging Face Hub untuk keperluan deployment ke Hugging Face Spaces.

## 9. Demo Inferensi dengan EasyOCR (Cell 11, Terakhir)

Sel terakhir untuk mengunggah foto struk baru milik sendiri, jalankan EasyOCR (bukan Tesseract) untuk mendapatkan kata dan bounding box, lalu masukkan ke model hasil fine-tuning untuk melihat prediksi entitasnya. Ini dipakai sebagai sanity check, bukan bagian dari evaluasi resmi (evaluasi resmi tetap dari test split CORD-v2 di bagian 7).

## 10. Yang Perlu Diperhatikan Claude Code

- Bungkus training dalam try/except yang jelas per tahap (instalasi, loading, cleaning, encoding, training, evaluasi), supaya kalau ada error di Kaggle, gampang tahu tahap mana yang gagal, karena riwayat sebelumnya menunjukkan Kaggle sering punya isu environment yang tidak muncul dari kode itu sendiri.
- Jangan gabungkan kembali evaluasi test ke dalam loop training. Sel evaluasi akhir harus benar-benar terpisah dan hanya dijalankan sekali di akhir.
- Filter `FutureWarning` yang tidak relevan supaya output notebook tidak berisik saat dibaca ulang nanti.
