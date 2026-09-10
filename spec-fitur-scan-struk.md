# Spec: Fitur Scan Struk + Split Per Item untuk Belanja Bersama

Dokumen ini untuk diberikan ke Claude Code sebagai instruksi implementasi. Versi ini merevisi versi sebelumnya karena ada dua perubahan besar: (1) split sekarang harus bisa per item, bukan cuma rata total, dan (2) ditemukan bug di kode yang sudah ada yang harus diperbaiki bersamaan, karena fitur baru ini bergantung penuh pada data yang sekarang ternyata tidak akurat.

## 0. Temuan Kritis di Kode yang Sudah Ada (Harus Diperbaiki Dulu)

Sebelum menambah fitur baru, ada bug di alur split yang sudah berjalan sekarang, dan ini penting karena fitur item-level split tidak akan bisa benar kalau fondasinya salah.

**Bug 1: Tabel `room_transaction_splits` tidak pernah diisi.**
Skema Supabase sudah punya tabel ini untuk menyimpan siapa berutang berapa per transaksi, tapi fungsi `addSharedTransaction()` di `lib/db.ts` cuma insert ke tabel `room_transactions`, tidak pernah insert ke `room_transaction_splits`. Jadi data "siapa saja yang ikut split" sebenarnya tidak pernah tersimpan permanen di database.

**Bug 2: Kolom `split_between` yang dibaca kembali tidak ada di tabel.**
Fungsi `getSharedTransactions()` membaca `t.split_between` dari hasil query Supabase, padahal kolom itu tidak ada di `CREATE TABLE room_transactions`. Hasilnya akan selalu kosong setelah reload halaman.

**Bug 3: Perhitungan `myShare` tidak mengecek keanggotaan.**
Baris ini di `getSharedTransactions()`:
```
myShare: t.paid_by_user_id === currentUser?.id ? -(total - perPerson) : perPerson
```
Logikanya menganggap SEMUA orang yang bukan pembayar otomatis berutang `per_person_amount`, tanpa mengecek apakah orang itu benar-benar ada di daftar yang ikut split. Jadi kalau ada anggota kos yang sengaja tidak diikutkan di suatu transaksi, sistem tetap salah menagih dia.

Ketiga bug ini harus diperbaiki sebagai bagian dari pekerjaan ini, karena desain split per item di bawah ini butuh pencatatan siapa-ikut-split yang benar dan persisten, bukan tebakan di sisi client.

## 1. Konsep Split Per Item

Kebutuhan nyata: dalam satu struk belanja bersama, tidak semua item dibagi ke kelompok orang yang sama. Contoh dari kasus Anda: 4 orang belanja lauk mingguan (lauk itu cuma dibagi ke 4 orang itu), tapi ada beras dan sabun cuci piring (sponge) yang harus dibagi ke seluruh 7 anggota kos, bukan cuma yang belanja.

Jadi satu struk bisa punya banyak "kelompok pembagi" berbeda, tergantung item. Ini beda dari desain awal (split rata satu angka untuk seluruh transaksi).

## 2. Skema Database

Tambahan tabel baru:

```sql
-- Item per baris struk, hasil scan atau input manual
CREATE TABLE IF NOT EXISTS public.room_transaction_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID NOT NULL REFERENCES public.room_transactions(id) ON DELETE CASCADE,
    item_name TEXT NOT NULL,
    quantity NUMERIC(10,2) DEFAULT 1,
    unit_price NUMERIC(15,2),
    item_total NUMERIC(15,2) NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('scan', 'manual')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Siapa saja yang menanggung item tersebut, dan berapa bagiannya
CREATE TABLE IF NOT EXISTS public.room_transaction_item_splits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id UUID NOT NULL REFERENCES public.room_transaction_items(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    share_amount NUMERIC(15,2) NOT NULL,
    UNIQUE(item_id, user_id)
);
```

Tabel `room_transaction_splits` yang sudah ada di schema lama (tapi belum pernah dipakai) sekarang diberi fungsi jelas: menyimpan total akhir per anggota per transaksi, hasil agregat dari semua item yang dia tanggung. Ini yang dipakai untuk tampilan "siapa berutang berapa", bukan menghitung ulang setiap saat di client.

Alur pengisian saat submit transaksi:
1. Simpan baris ke `room_transactions` (seperti sekarang, `total_amount` = total struk).
2. Simpan tiap baris item ke `room_transaction_items`.
3. Untuk tiap item, simpan pembagian ke `room_transaction_item_splits` (item_total dibagi rata ke anggota yang ditandai ikut item itu).
4. Jumlahkan semua `share_amount` per user lintas semua item di transaksi itu, lalu simpan hasil akhirnya ke `room_transaction_splits` (satu baris per anggota per transaksi).

Untuk transaksi yang tidak pakai rincian item (misalnya patungan makan malam tanpa struk, tetap mau input cepat rata), langsung isi `room_transaction_splits` dengan `total / jumlah orang`, tanpa perlu isi `room_transaction_items`. Jadi dua mode ini (rata vs per item) tetap bisa hidup berdampingan, tidak saling menghapus fitur yang sudah ada.

## 3. Alur Pengguna yang Diperbarui

Koreksi hasil OCR dan penentuan split bill digabung jadi satu layar konfirmasi, bukan dua langkah terpisah. Pola interaksinya:

1. Scan struk, hasil OCR muncul sebagai daftar baris item (nama, qty, harga satuan, subtotal), masing-masing dengan checkbox di sisi kiri dan ikon edit di sisi kanan.
2. Sebelum scan dimulai, pengguna sudah memilih "kelompok default" (misalnya 4 orang yang belanja bareng). Begitu hasil OCR muncul, semua item otomatis sudah tertandai masuk kelompok default itu, jadi mayoritas item sudah "selesai" tanpa aksi tambahan.
3. Ikon edit di tiap baris dipakai untuk membetulkan hasil OCR yang salah baca (nama, qty, harga), tanpa mempengaruhi status pembagiannya.
4. Untuk item pengecualian (misalnya beras dan sponge), pengguna centang checkbox di baris-baris itu (bisa pilih lebih dari satu item sekaligus), lalu tekan tombol aksi "Bagi ke..." yang muncul di bagian bawah layar begitu ada item yang tercentang. Tombol ini membuka daftar anggota kos untuk dipilih (misalnya "Semua Anggota Kos, 7 orang"), lalu satu kali konfirmasi langsung menerapkan kelompok itu ke semua item yang tadi dicentang bersamaan.
5. Setiap baris item menampilkan badge kecil yang menunjukkan status pembagiannya saat ini (contoh: "4 orang" atau "Belum dibagi"), supaya pengguna langsung tahu item mana yang masih perlu diatur ulang tanpa harus membuka satu-satu.
6. Tampilkan juga total berjalan per anggota (real time) di bagian bawah layar yang sama, supaya kelihatan langsung siapa kebagian berapa sebelum disimpan.
7. Submit menyimpan ke skema di bagian 2, hanya aktif kalau semua item sudah punya status pembagian (tidak ada yang "Belum dibagi").

Catatan implementasi untuk Claude Code: mode "pilih lalu assign ke banyak item sekaligus" ini butuh satu fungsi terpisah di state management, misalnya `assignGroupToItems(itemIds: string[], memberIds: string[])`, yang dipanggil sekali untuk seluruh item yang sedang dicentang, bukan dipanggil berulang per item. Setelah dipanggil, checkbox yang tadi tercentang otomatis dikosongkan lagi supaya siap untuk kelompok pengecualian berikutnya.

## 4. Kasus-Kasus yang Perlu Diperhatikan (Edge Cases)

**Selisih pajak, diskon, atau pembulatan.**
Total struk sering tidak persis sama dengan jumlah semua subtotal item, karena ada pajak, biaya kantong plastik, atau diskon promo yang tidak melekat ke item tertentu. Rekomendasi saya: selisih ini dibagi proporsional ke semua orang berdasarkan porsi belanja masing-masing (bukan dibagi rata flat), supaya orang yang belanjaannya lebih banyak juga menanggung pajak lebih besar secara proporsional. Kalau Anda maunya beda (misalnya selisih ini dianggap tanggungan bersama rata semua anggota kos, terlepas dari siapa belanja apa), kasih tahu saya supaya rumusnya disesuaikan sebelum masuk ke Claude Code.

**Kuantitas dalam satu baris item dipakai tidak merata.**
Misalnya beli 3 mie instan tapi cuma 2 dari 4 orang yang mau. Untuk versi awal, satu baris item = satu kelompok pembagi yang sama untuk seluruh kuantitas di baris itu. Kalau pembagiannya beda di dalam satu jenis barang, pengguna perlu pisah manual jadi dua baris item saat tahap review (misalnya split "Mie Instan" jadi dua baris dengan qty berbeda), bukan sistem otomatis mendeteksi ini sendiri.

**Hasil OCR salah kelompok baris.**
Kalau EasyOCR/LayoutLMv3 salah membaca satu barang jadi dua baris terpisah, atau harga satuan meleset, pengguna harus bisa edit, gabung, hapus, atau tambah baris item secara manual di tahap review, sebelum assign kelompok pembagi. Jangan biarkan hasil mentah OCR langsung dikunci tanpa tahap koreksi ini.

**Cakupan anggota yang bisa di-assign.**
Untuk versi awal, kelompok pembagi per item dibatasi ke anggota kos yang sudah terdaftar di `room_members`, tidak mendukung tamu/orang luar dulu. Ini cukup untuk kasus yang Anda contohkan (4 dari 7 anggota kos yang sama).

## 5. Dampak ke Kode yang Sudah Ada

- `kamarService.addSharedTransaction()` perlu ditulis ulang supaya menerima struktur item + assignment, lalu melakukan langkah 1 sampai 4 di bagian 2 di atas dalam satu transaksi database (pakai Supabase RPC/transaction supaya tidak setengah tersimpan kalau ada error di tengah proses).
- `kamarService.getSharedTransactions()` dan `getDebtSummary()` perlu dibaca ulang dari `room_transaction_splits` yang sudah benar terisi, bukan dihitung ulang dengan asumsi "semua yang bukan pembayar otomatis berutang rata".
- Dialog "Tambah Transaksi" di `kamar/kos/page.tsx` butuh mode baru untuk pengaturan per item, di luar mode cepat yang sudah ada (rata total).

## 6. Yang Tidak Berubah

- Fitur input manual cepat tanpa rincian item tetap ada untuk kasus sederhana (patungan tanpa struk), memakai jalur split rata seperti sekarang, cuma datanya sekarang benar tersimpan ke `room_transaction_splits`.
- Tabel `room_requirements` (kebutuhan bulanan seperti wifi) tidak disentuh, itu alur terpisah dan tidak butuh split per item.
