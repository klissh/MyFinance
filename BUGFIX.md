# Dokumentasi Bug & Rencana Perbaikan — ManageMyMoney

Dokumen ini berisi hasil code review manual terhadap repo `managemymoney`
(clone per 11 September 2026). Semua temuan didasarkan pada pembacaan
langsung `lib/db.ts`, `supabase_schema.sql`, `middleware.ts`, dan
`app/api/kurs/route.ts` — **bukan** hasil pengujian runtime penuh, jadi
tiap isu sebaiknya diverifikasi ulang sebelum ditutup.

Level severity: 🔴 Kritis · 🟠 Tinggi · 🟡 Sedang · 🟢 Rendah

---

> **Status triase (2026-09-11):** dokumen ini ternyata sebagian besar
> mendeskripsikan clone sebelum Ronde 1-13 (lihat `CLAUDE.md` Ronde 14).
> Tiap temuan diverifikasi ulang terhadap kode & live DB sebelum dieksekusi:
>
> | # | Status |
> |---|---|
> | 1, 3, 4, 8, 9 | **Sudah diperbaiki** di ronde sebelumnya — tidak disentuh lagi |
> | 2 | **Masih nyata, sudah diperbaiki** ronde ini (migrasi `fix_room_rls_scope_to_members`) |
> | 6, 7 | **Sudah diperbaiki** ronde ini (masking nomor kartu, `crypto.randomUUID()`) |
> | 5 | Pola arsitektur disengaja — tidak diubah (perlu keputusan desain, bukan tambal 1 baris) |
> | 10 | Prioritas rendah, tidak dikerjakan (perlu setup test runner terpisah) |

---

## Ringkasan Prioritas

| # | Isu | Severity | Area |
|---|-----|----------|------|
| 1 | Auth bypass saat koneksi gagal | 🔴 Kritis | Auth |
| 2 | RLS policy `USING (true)` di semua tabel `room_*` | 🔴 Kritis | Security |
| 3 | Split bill tidak tersimpan per-anggota (tabel `room_transaction_splits` tidak dipakai) | 🔴 Kritis | Data integrity |
| 4 | Status bayar iuran kos tidak tersinkron antar user | 🟠 Tinggi | Data integrity |
| 5 | Pola fallback `localStorage` vs Supabase yang tersebar & tidak konsisten | 🟠 Tinggi | Arsitektur |
| 6 | Nomor kartu & masa berlaku disimpan polos (plaintext) | 🟡 Sedang | Security |
| 7 | ID dibuat dari `Date.now()` — rawan tabrakan | 🟡 Sedang | Data integrity |
| 8 | Middleware hanya cek keberadaan cookie, bukan validitas token | 🟡 Sedang | Security |
| 9 | Dokumentasi proyek nyaris kosong (`README.md`, `AGENTS.md`) | 🟡 Sedang | Dokumentasi |
| 10 | Tidak ada automated test | 🟢 Rendah | Quality |

---

## 1. 🔴 Auth bisa dilewati saat koneksi ke Supabase gagal

**Lokasi:** `lib/db.ts` — `authService.login()` dan `authService.signup()`

**Masalah:** Kalau `supabase.auth.signInWithPassword()` atau `.signUp()` gagal
karena alasan jaringan (pesan error mengandung `"504"`, `"timeout"`, atau
`"Failed to fetch"`), kode langsung membuat sesi lokal palsu
(`id: usr_${Date.now()}`) dan mengembalikan `{ user: fallbackSession, error: null }`
— **tanpa pernah memverifikasi password**. Efeknya, siapa pun yang mengalami
koneksi tidak stabil bisa "berhasil login" memakai email apa saja.

**Rekomendasi:**
- Hapus seluruh logic fallback-ke-sesi-lokal di jalur `login()`. Kalau
  request ke Supabase gagal, tampilkan error yang jelas ("koneksi
  bermasalah, coba lagi") — jangan pernah membuat sesi otentikasi.
- Fallback lokal untuk mode "belum ada Supabase dikonfigurasi" (development
  tanpa `.env`) boleh dipertahankan, tapi harus dipisah jelas dari fallback
  akibat *error* di tengah proses autentikasi asli.

---

## 2. 🔴 RLS policy terbuka untuk seluruh tabel `room_*`

**Lokasi:** `supabase_schema.sql`, baris ~311–329

**Masalah:** Policy `SELECT` untuk `rooms`, `room_members`,
`room_transactions`, `room_transaction_splits`, `room_requirements`, dan
`room_requirement_payments` semuanya `USING (true)` untuk role
`authenticated`. Artinya **siapa pun yang login ke aplikasi** bisa membaca
data kamar, transaksi, dan tagihan milik kamar kos siapa pun — bukan cuma
kamarnya sendiri.

**Rekomendasi:** Ganti tiap policy `SELECT` supaya membatasi baris hanya
untuk anggota kamar terkait, contoh pola untuk `room_transactions`:

```sql
CREATE POLICY "Room members can view room transactions"
ON public.room_transactions FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.room_members
    WHERE room_members.room_id = room_transactions.room_id
    AND room_members.user_id = auth.uid()
  )
);
```

Terapkan pola serupa (cek keanggotaan lewat `room_members`) untuk kelima
tabel `room_*` lainnya.

---

## 3. 🔴 Split bill tidak disimpan per-anggota

**Lokasi:** `lib/db.ts` — `kamarService.addSharedTransaction()`;
skema: `supabase_schema.sql` tabel `room_transaction_splits`

**Masalah:** Skema sudah punya tabel `room_transaction_splits` yang
dirancang untuk menyimpan porsi utang tiap anggota per transaksi, tapi
`addSharedTransaction()` tidak pernah menulis ke tabel itu. Field
`splitBetween` yang dipilih user di UI juga tidak ikut di-insert ke
`room_transactions`. Saat data diambil kembali di `getSharedTransactions()`,
`myShare` dihitung ulang dengan asumsi **semua anggota selalu membagi rata**
— bukan berdasarkan siapa yang benar-benar dipilih.

**Rekomendasi:**
- Saat insert ke `room_transactions`, sekaligus insert satu baris ke
  `room_transaction_splits` untuk tiap `user_id` di `splitBetween`, dengan
  porsi masing-masing.
- Ubah `getSharedTransactions()` dan `getDebtSummary()` supaya membaca dari
  `room_transaction_splits`, bukan menghitung ulang asumsi rata.

---

## 4. 🟠 Status pembayaran iuran kos tidak tersinkron

**Lokasi:** `lib/db.ts` — `kamarService.payRequirement()`;
skema: tabel `room_requirement_payments` (tidak terpakai)

**Masalah:** `payRequirement()` hanya mengubah `isPaidByMe: true` di
`localStorage` perangkat yang bersangkutan. Tabel `room_requirement_payments`
di skema tidak pernah ditulis. Akibatnya anggota kos lain tidak pernah tahu
kalau seseorang sudah membayar tagihan bersama.

**Rekomendasi:** Ubah `payRequirement()` untuk insert baris ke
`room_requirement_payments` (dengan `user_id`, `requirement_id`, `paid_at`),
dan ubah `getRequirements()` supaya status `isPaidByMe`/status pembayaran
tiap anggota dibaca dari tabel itu, bukan disimpan lokal.

---

## 5. 🟠 Pola fallback localStorage vs Supabase tersebar & tidak konsisten

**Lokasi:** Hampir semua fungsi di `lib/db.ts`
(pola `if (isSupabaseConfigured && supabase && ...)`)

**Masalah:** Aplikasi berjalan di dua "mode" paralel — Supabase asli vs
`localStorage` per perangkat — yang keputusannya diambil diam-diam per
fungsi. Kalau satu request Supabase gagal di tengah jalan, sebagian data
tersimpan di server dan sebagian jatuh ke localStorage tanpa notifikasi ke
user, sehingga state gampang tidak sinkron tanpa disadari.

**Rekomendasi:** Pertimbangkan localStorage hanya untuk *caching*
(mempercepat render), bukan sebagai *source of truth* alternatif. Kalau
insert/update ke Supabase gagal, tampilkan error ke user secara eksplisit
alih-alih diam-diam menyimpan lokal.

---

## 6. 🟡 Nomor kartu & masa berlaku disimpan polos

**Lokasi:** `lib/db.ts` — `accountService`; skema: tabel `accounts`,
kolom `card_number`, `expiration`

**Masalah:** `FinancialAccountRecord` menyimpan nomor kartu lengkap dan
tanggal kedaluwarsa secara utuh, bukan hanya 4 digit terakhir.

**Rekomendasi:** Simpan hanya beberapa digit terakhir untuk keperluan
tampilan (mis. `**** **** **** 1234`). Kalau nomor penuh memang perlu
disimpan untuk suatu alasan, wajib dienkripsi at-rest — tapi untuk kasus
pemakaian aplikasi ini, kemungkinan besar tidak perlu disimpan sama sekali.

---

## 7. 🟡 ID dibuat dari `Date.now()` — rawan tabrakan

**Lokasi:** Tersebar di `lib/db.ts`, contoh:
`` `ROOM-${Date.now().toString().slice(-4)}` ``,
`` `ACC-${Date.now().toString().slice(-4)}` ``

**Masalah:** Mengambil 4 digit terakhir dari timestamp bisa menghasilkan ID
yang sama kalau dua record dibuat pada milidetik yang berdekatan dari
device berbeda.

**Rekomendasi:** Gunakan `crypto.randomUUID()` (tersedia native di
browser & Node modern) untuk semua ID yang dibuat di sisi klien, atau
biarkan Supabase yang generate `uuid` seperti kolom `id` di skema.

---

## 8. 🟡 Middleware hanya cek keberadaan cookie

**Lokasi:** `middleware.ts`

**Masalah:** `hasUserSession` hanya mengecek apakah cookie
`myfinance_session` atau `sb-access-token` *ada*, tanpa memvalidasi
isi/tanda tangannya. Ini cukup untuk UX (redirect halaman), tapi jangan
dianggap sebagai lapisan keamanan utama — proteksi data sebenarnya harus
ada di level RLS (lihat isu #2).

**Rekomendasi:** Tidak mendesak untuk diubah, tapi sebutkan di laporan
bahwa middleware ini murni UX gate, bukan security boundary.

---

## 9. 🟡 Dokumentasi proyek nyaris kosong

**Lokasi:** `README.md`, `AGENTS.md`

**Masalah:** `README.md` masih boilerplate template Next.js + shadcn.
`AGENTS.md` berisi instruksi generik untuk AI coding agent, bukan
dokumentasi proyek.

**Rekomendasi:** Tulis ulang `README.md` minimal mencakup: deskripsi
proyek, fitur utama, cara setup `.env` (`NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`), cara menjalankan `supabase_schema.sql`,
dan struktur folder singkat.

---

## 10. 🟢 Tidak ada automated test

**Lokasi:** `package.json` (tidak ada `jest`/`vitest`/`playwright` di
`devDependencies`)

**Rekomendasi:** Prioritas rendah untuk sekarang, tapi setidaknya
tambahkan test unit untuk logika kalkulasi split bill (isu #3) begitu
diperbaiki, supaya regresi ke bug yang sama tidak terulang.

---

## Checklist Eksekusi (urutan disarankan)

- [ ] #1 — Hilangkan auth bypass di `login()`/`signup()`
- [ ] #2 — Perbaiki RLS policy jadi berbasis keanggotaan kamar
- [ ] #3 — Sambungkan `addSharedTransaction()` ke `room_transaction_splits`
- [ ] #4 — Sambungkan `payRequirement()` ke `room_requirement_payments`
- [ ] #5 — Rapikan pola fallback localStorage vs Supabase
- [ ] #6 — Masking nomor kartu
- [ ] #7 — Ganti ID generation ke UUID
- [ ] #9 — Tulis ulang `README.md`
- [ ] #10 — Tambah test dasar untuk split bill
