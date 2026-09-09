# CLAUDE.md — Konteks Proyek untuk Claude Code

Claude Code otomatis membaca file ini di setiap sesi baru yang dibuka di dalam folder proyek ini. Tujuannya supaya tidak mulai dari nol setiap kali.

## Tentang proyek ini

Finance tracker pribadi + split bill kos bersama, dipakai oleh 7 orang yang tinggal satu apartemen di Malaysia sambil kuliah di MSU (Management & Science University). Repo asli dibuat oleh teman (https://github.com/devilk1d/managemymoney), sekarang dilanjutkan bersama. Fitur split bill/kebutuhan bulanan adalah prioritas utama karena sering lupa bagi rata tagihan (listrik, wifi, dll) di antara 7 orang.

## Tech stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS v4 + shadcn/ui
- Supabase (Postgres + Auth) sebagai backend
- Package manager: npm

## Status Supabase — PENTING, baca sebelum menyentuh backend

Ada DUA organisasi Supabase yang relevan ke proyek ini:

- **Bizmo** — organisasi milik teman (pemilik repo asli), kemungkinan berisi data production/live yang sudah berjalan. **Belum ada akses ke organisasi ini.** Jangan asumsikan bisa connect ke sana tanpa kredensial yang jelas-jelas diberikan di sesi berjalan.
- **MSU** — organisasi kita sendiri. Project `managemymoney` (ref `uscpfhubuughdjutrzez`) adalah target baru dengan status berikut:
  - Skema lengkap (13 tabel: `profiles`, `accounts`, `categories`, `transactions`, `goals`, `saving_logs`, `scheduled_payments`, `rooms`, `room_members`, `room_transactions`, `room_transaction_splits`, `room_requirements`, `room_requirement_payments`) sudah diterapkan dari `supabase_schema.sql`, Row Level Security aktif di semua tabel.
  - 4 temuan security advisor sudah diperbaiki: `search_path` dikunci di fungsi `handle_new_user` & `update_timestamp`, izin `EXECUTE` publik pada `handle_new_user` sudah dicabut dari `anon`/`authenticated`/`PUBLIC`.
  - Datanya masih **kosong total** — migrasi data dari Bizmo belum terjadi, masih menunggu file ekspor (SQL/CSV) dari pemilik Bizmo atau akses member ke organisasi itu. **Ini pekerjaan manusia, jangan dicoba otomatis.**

`.env.local` atau `.env` (keduanya dibaca Next, keduanya kena `.gitignore`) harus diisi `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_ANON_KEY` yang menunjuk ke project MSU di atas. Saat ini kredensial ada di `.env`. Jangan pernah menaruh kredensial apa pun (Supabase key, GitHub token, dll) ke file yang ter-commit ke git, termasuk file ini.

## Perubahan besar (revisi 2026-09-08)

5 revisi berikut sudah diterapkan — `npm run typecheck`, `npm run lint` (0 error),
dan `npm run build` semuanya lolos:

1. **Fitur "Kebutuhan Bulanan" diperbaiki.** `lib/db.ts` sekarang punya
   `kamarService.addRequirement()` & `payRequirement()` yang benar-benar insert ke
   `room_requirements` / `room_requirement_payments`, plus cache lokal **ter-scope
   per user** (`getUserStorageKey`). Halaman `kamar/kos/kebutuhan/page.tsx` tidak
   lagi menulis ke key mentah `localStorage["myfinance_db_requirements"]`.
2. **Keanggotaan kamar sinkron dari Supabase.** `kamarService.syncUserRoom()`
   query `room_members` + `rooms` untuk user login dan dipanggil di
   `components/app-sidebar.tsx` saat app dibuka → status kamar ikut pindah antar
   device. `getRoomMembers()` mengembalikan `{ userId, name, isMe, ... }` dan
   halaman split-bill (`kamar/kos/page.tsx`, `kebutuhan/page.tsx`) memakai anggota
   asli, bukan lagi array hardcoded `["Abimanyu", ...]`.
3. **Autentikasi jadi nyata.** `lib/supabase.ts` pakai `createBrowserClient`
   (`@supabase/ssr`, sesi = cookie). `proxy.ts` (dulu `middleware.ts`)
   memverifikasi sesi via `supabase.auth.getUser()` — bukan lagi cek keberadaan
   cookie manual. `authService` di `lib/db.ts` **tidak lagi** memalsukan sesi saat
   jaringan error. `lib/supabase-server.ts` ditambahkan untuk Server Components.
4. **`middleware.ts` → `proxy.ts`** (konvensi Next 16) & `next.config.ts` dirapikan
   (`allowedDevOrigins` sekarang benar-benar aktif di dalam objek `nextConfig`).
5. **`npm audit` = 0 kerentanan** (Next dinaikkan 16.2.6 → 16.3.4, termasuk
   patch CVE "Middleware/Proxy bypass"). Lint 0 error. `README.md` ditulis ulang.
   Root `app/layout.tsx` tidak lagi memanggil `cookies()` → sebagian besar
   halaman kembali statis.

Catatan: `AGENTS.md` ternyata **di-generate otomatis oleh Next.js 16** (fitur
`agentRules`), bukan prompt injection buatan manusia. Boleh diabaikan / matikan
dengan `agentRules: false` di `next.config.ts`.

## Ronde 2 (2026-09-08) — "sambungkan logic yang belum nyambung"

Migration `add_missing_room_split_rls_policies` diterapkan ke MSU:
INSERT policy untuk `room_transaction_splits` (creator transaksi) + UPDATE policy
untuk `room_transactions` (creator/payer). Tanpa ini split bill tidak bisa sinkron.

Perbaikan kode di `lib/db.ts` + halaman terkait (typecheck/lint/build lolos):

- **accounts**: hanya insert kolom yang ADA (`name, type, balance, color`);
  `color` = `cardDesignType`; nomor/pemilik/expiry kartu → sidecar lokal
  `myfinance_card_meta` (dekorasi saja). `deriveAccountCategory()` menurunkan
  kategori dari label tipe.
- **transactions**: resolve nama akun → `account_id` (uuid) saat insert; baca nama
  lewat embed `accounts(name)`. **Saldo akun otomatis bergerak** saat transaksi
  ditambah (`accountService.adjustBalanceByName`), kecuali transfer (`{ adjustBalance:false }`).
- **goals**: kolom `deadline` (bukan `target_date`); `deposit()` menulis
  `saving_logs`.
- **room_transactions / splits**: `addSharedTransaction` sekarang menerima
  `paidByUserId` + `splitUserIds`, insert `room_transactions` (kolom benar) +
  baris `room_transaction_splits` per anggota. `getSharedTransactions` menghitung
  `myShare` & status dari baris split. `kamarService.settleMyShare(txId)` baru →
  update split `is_settled`, tandai transaksi settled kalau semua lunas, auto-catat
  pelunasan ke log pribadi. `getDebtSummary` dibangun dari split yang belum lunas
  (nama anggota asli). `handleSettleBill` di halaman kos memanggil ini.
- **joinRoom**: return `{ room, error }` — kode invalid → error, tidak lagi bikin
  kamar palsu lokal. `createRoom` rollback room yatim kalau insert member gagal.
- **Tanggal**: helper `todayLocalISO()` (waktu lokal, bukan UTC) dipakai di semua
  service + halaman transaksi/scheduled/finance.
- **Dashboard**: kartu "Sumber Dana" pakai `accountService.getAll()` asli;
  kurs MYR ambil dari `/api/kurs` (bukan konstanta 4403).
- Halaman **anggota kos**: kolom netto per anggota diturunkan dari matriks utang.

## Ronde 3 (2026-09-09) — bereskan sisa keterbatasan

- **Split bill — model "bagian saya".** `reconcileRoomLedger()` idempoten,
  penanda `[#sbS:id]` di notes (dibersihkan UI via `stripLedgerRef`).
  **Tiap orang HANYA mencatat BAGIAN-NYA** sebagai pengeluaran, bukan total:
  - Penalang: `addSharedTransaction` bikin baris `room_transaction_splits` untuk
    SEMUA yang menanggung; baris penalang langsung `is_settled: true` → bagiannya
    tercatat saat itu juga.
  - Anggota lain: bagiannya tercatat saat `settleMyShare()` (flip `is_settled`).
  - Tidak ada "pengembalian" sebagai pemasukan — talangan antar anggota = pinjaman,
    tercermin di kartu "Piutang/Tunggakan" & metrik, bukan arus kas pribadi.
  - **Migrasi otomatis:** reconcile mendeteksi entri model lama (`sbP/sbO/sbB`),
    `transactionService._purgeByNotePattern()` menghapusnya + membalik saldo, lalu
    dibuat ulang sebagai `sbS`.
  - Dialog split: pilihan akun penalang (`SPLIT_META` sidecar).
  - Halaman kos: kolom "Total Nominal" tampil "Rp X ÷ N orang"; "Bagian Saya"
    selalu tampil rupiah + status; metrik "Total Transaksi Kos" → "Bagian Saya
    (Bulan Ini)".
- **`scheduled_payments` account/notes.** Sidecar `SCHEDULED_META` (`readScheduledMeta`
  /`writeScheduledMeta`) — account & notes bertahan walau tabel tak punya kolomnya.
- **`responsible_user_id`.** `addRequirement` petakan nama PJ → `user_id` anggota;
  `getRequirements` resolve balik lewat `_memberNameMap`.
- **Akun auto-log.** Helper `resolvePersonalAccount(accounts, preferred?)` dipakai
  di semua auto-log (bayar tagihan/setoran/iuran/pelunasan) → akun pilihan → akun
  bank pertama → akun apa pun → "Bank BCA". Tidak lagi hardcoded.

### Keterbatasan yang tersisa

- Sidecar (`*_META`) hanya per-device — detail kartu, akun penalang split, dan
  account/notes jadwal tidak ikut pindah antar device (nilai uang & relasi utama
  tetap sinkron via Supabase; ini cuma metadata pelengkap).
- Verifikasi end-to-end dengan user login sungguhan belum dilakukan (skema + RLS +
  tipe + build sudah dicek; pembuatan user auth otomatis diblokir). Uji manual:
  signup → coba semua alur.
- `room_transactions.status` tetap 'pending' kalau yang melunasi terakhir bukan
  creator/payer (RLS) — tampilan tetap "settled" karena diturunkan dari `is_settled`
  semua split.

## Yang TIDAK perlu dikerjakan otomatis

- Migrasi data dari Bizmo ke MSU — menunggu tindakan manusia (pemilik Bizmo invite member, atau ekspor file manual).
- Jangan commit/push kredensial apa pun ke repo, termasuk ke file ini.
