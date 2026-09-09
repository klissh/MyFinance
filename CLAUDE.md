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

## Ronde 4 (2026-09-09) — mata uang RM/Rp + reset data

- **`lib/currency.ts`** — sumber tunggal mata uang. `getCurrency()`/`setCurrency()`
  (localStorage `myfinance_currency`, default **MYR**), `formatMoney()`,
  `formatAmountInput()`/`parseAmountInput()` (MYR boleh desimal), dan hook reaktif
  `useMoney()` → `{ fmt, fmtShort, formatInput, parseInput, symbol, currency, setCurrency }`.
  Toggle: nav-user dropdown ("Mata Uang") + `/pengaturan`. localStorage per-device.
  Angka yang tersimpan di DB TIDAK diubah — hanya simbol & format.
- Semua tampilan uang di 11 halaman + `full-calendar` pakai `fmt()`; semua kolom
  input nominal pakai `formatInput`/`parseInput`. Halaman **`/kurs` sengaja
  dibiarkan** (memang alat kurs valuta terhadap IDR).
- Dashboard: kartu konversi kecil membalik arah (RM→Rp / Rp→RM) ikut mata uang aktif.
- **`/pengaturan`** (baru, di sidebar) — pilih mata uang + **Zona Berbahaya:
  "Hapus Semua Data"** → `dangerService.wipeAll()`: hapus transaksi/goal/saving_logs/
  akun/jadwal + kamar yang dibuat (cascade) + keluar dari kamar yang diikuti +
  bersihkan seluruh cache lokal. `proxy.ts` melindungi `/pengaturan`.

### Keterbatasan mata uang

- Pilihan mata uang per-device (localStorage), belum sinkron antar device / antar
  anggota kamar. Untuk split bill lintas mata uang tidak ada konversi — asumsinya
  semua anggota pakai mata uang yang sama.
- Konversi angka tersimpan saat toggle mata uang **sengaja tidak dibuat** — lossy,
  merusak akurasi historis, dan tidak aman untuk tabel `room_*` yang dipakai
  bersama (lihat diskusi Ronde 6). Ganti mata uang = wipe + input ulang.

## Ronde 5 (2026-09-09) — tombol Edit & Hapus di semua entitas

RLS baru (migrasi `add_edit_delete_policies_room_entities`): `room_transactions`
DELETE (creator), `room_transaction_splits` DELETE (tx creator), `room_requirements`
UPDATE+DELETE (anggota kamar), `room_members` DELETE (Ketua Kos keluarkan anggota lain).

- **Transaksi** (`/transaksi`): `transactionService.update()` (menyeimbangkan saldo:
  efek lama dibatalkan, efek baru diterapkan, termasuk saat akun diganti) & `remove()`.
  Transaksi **auto** (split bill kos, setoran tabungan, bayar iuran/tagihan) dikunci
  di UI — ditandai `[#auto]` / `[#sbS:]` di notes; helper `isSystemTransaction(notes)`.
  `LEDGER_REF_RE` & `stripLedgerRef` juga menyaring `[#auto]`.
- **Sumber dana** (`/finance`): `accountService.update()` / `remove()`. Hapus akun →
  `transactions.account_id` jadi NULL otomatis (FK `ON DELETE SET NULL`).
- **Target nabung** (`/goals`): `goalService.update()` (status dihitung ulang) /
  `remove()` (cascade `saving_logs`; transaksi "Setoran Tabungan" tetap ada).
- **Jadwal tagihan** (`/scheduled`): `scheduledService.update()` / `remove()`.
- **Split bill kos** (`/kamar/kos`): `kamarService.updateSharedTransaction()` — hanya
  creator; total & peserta bisa diubah selama belum ada anggota lain yang melunasi
  (baris split dibuat ulang), kalau sudah → hanya judul/kategori.
  `deleteSharedTransaction()` — hanya creator. `SharedTransactionRecord` bawa
  `createdByUserId` + `splitUserIds`.
- **Kebutuhan bulanan** (`/kamar/kos/kebutuhan`): `updateRequirement()` /
  `deleteRequirement()` (cascade `room_requirement_payments`).
- **Anggota kos** (`/kamar/kos/anggota`): `removeMember(rowId)` (Ketua Kos) +
  `leaveRoom()` kini benar-benar menghapus baris `room_members` sendiri. "Hapus
  Kamar" dibatasi ke Ketua Kos; anggota biasa dapat "Keluar dari Kamar".
- **Rekonsiliasi**: `reconcileRoomLedger` hitung `validSbKeys` dari split bill yang
  masih ada → `transactionService._purgeSbOrphans()` buang entri `[#sbS:*]` yatim
  (split bill dihapus/diedit) + kembalikan saldo. Idempoten, jalan tiap load.

### Keterbatasan Ronde 5

- Split bill yang dihapus/diedit creator baru tersinkron di ledger anggota lain saat
  mereka membuka aplikasi (reconcile jalan saat load). Tidak ada push realtime.
- Menghapus split bill membatalkan pencatatan "bagian saya" tiap anggota (termasuk
  yang sudah melunasi) — sesuai model "transaksi ini tidak pernah terjadi".
- Tabel "Riwayat Mutasi" di `/finance` tetap read-only — kelola lewat `/transaksi`.

## Ronde 6 (2026-09-09) — input nominal gaya bank Malaysia (MYR)

- **`formatAmountInput` (MYR)** diganti jadi **entri sen**: user mengetik digit,
  2 angka terakhir otomatis jadi sen, titik disisipkan sendiri. `"1"→"0.01"`,
  `"125050"→"1,250.50"`, backspace menggeser nilai. Persis Maybank / Touch 'n Go.
  IDR tetap digit-only (tanpa sen).
- **`formatAmountValue(amount, c?)`** baru + `useMoney().formatValue` — untuk MENGISI
  kolom input dari nilai yang sudah ada (dialog "Ubah"). Wajib dipakai di situ
  (bukan `formatInput`), karena `formatInput` menafsirkan string sebagai ketikan
  mentah. MYR selalu 2 desimal supaya digit-nya round-trip ke entri sen.
  6 dialog Ubah (transaksi/finance/goals/scheduled/kebutuhan/kamar-kos) sudah pakai.
- **`formatMoney` (MYR)** sekarang selalu 2 desimal (`minimumFractionDigits: 2`) —
  "RM 1,250.50", bukan "RM 1,250.5". IDR tetap 0 desimal.
- `useMoney().zero` → `"0.00"` (RM) / `"0"` (Rp). Semua kolom nominal pakai
  `placeholder={zero}` + `inputMode="numeric"` — jadi kolom kosong tampil "0.00"
  bukan "0" (persis bank Malaysia).
- `/pengaturan` menampilkan contoh cara ketik sesuai mata uang aktif.
- `kamar/baru`: default `createMonthlyFee` `""` (dulu `"200000"` mentah yang
  bentrok dengan entri sen); placeholder ikut mata uang.
- Diskusi konversi kurs real-time saat toggle: **ditolak** — 4 masalah (tidak ada
  penanda mata uang di baris DB, tabel `room_*` shared 7 user, presisi/sejarah
  hilang tiap round-trip, bulk update tak atomik). Solusi aman (kolom `currency`
  di `profiles`/`rooms` + RPC atomik + preview) dipetakan tapi tidak dibangun
  karena data masih testing → wipe + mulai bersih di RM.

## Ronde 7 (2026-09-10) — jenis/jaringan kartu di Sumber Dana

- Migrasi `add_accounts_card_network`: kolom `accounts.card_network text NOT NULL
  DEFAULT 'mastercard'`. Nilai: `visa | mastercard | amex | unionpay | jcb |
  other | none`.
- `lib/card-networks.ts` (baru): `CardNetwork` type, `CARD_NETWORKS` (value+label
  untuk Select), `normalizeCardNetwork()`.
- `FinancialAccountRecord.cardNetwork`; `accountService.getAll/add/update` baca &
  tulis kolomnya (sync antar device — beda dari nomor/pemilik kartu yang di
  sidecar lokal).
- `components/shared-assets/credit-card/icons.tsx`: tanda merek sederhana
  (geometris + teks, bukan reproduksi logo) `VisaIcon`/`AmexIcon`/`UnionPayIcon`/
  `JcbIcon`/`GenericCardIcon` + dispatcher `NetworkLogo({ network, variant })`.
  `credit-card.tsx` prop `network` (default `"mastercard"`); `variant` diturunkan
  dari desain kartu (`LIGHT_CARD_TYPES` → logo gelap). `"none"` → logo disembunyikan.
- `/finance`: Select "Jenis / Jaringan Kartu" di dialog Tambah & Ubah sumber dana;
  `<CreditCard network={acc.cardNetwork} />`.

## Ronde 8 (2026-09-10) — responsif mobile menyeluruh + tabel

- **`SidebarInset`** (`components/ui/sidebar.tsx`): `min-w-0 max-w-full` — akar
  masalah "halaman geser horizontal di HP" (flex child tanpa min-width). Fix ini
  membuat semua `overflow-x-auto` di dalam bekerja benar.
- **`DialogContent`** (`components/ui/dialog.tsx`): `max-h-[calc(100dvh-2rem)]
  overflow-y-auto` — form panjang bisa di-scroll, tidak terpotong di layar pendek.
- **`components/ui/list-card.tsx`** (baru): `ListCard` / `ListCardHead` /
  `ListCardMeta` — pengganti baris tabel di layar sempit.
- **Semua tabel data** kini render ganda: `<Table>` `hidden md:block`, daftar
  kartu ringkas `md:hidden`. Berlaku di `/transaksi`, `/finance` (Riwayat Mutasi),
  `/dashboard` (Transaksi Terakhir), `/scheduled` (Daftar Tagihan), `/kamar/kos`
  (Split Bill). `/kamar/kos/kebutuhan`: toggle tabel/grid disembunyikan di mobile
  (selalu kartu, helper `reqCard`).
- **`full-calendar.tsx`**: grid bulan/minggu `hidden md:block`; di mobile tampil
  **daftar agenda** (transaksi dikelompokkan per tanggal, terbaru dulu, bisa
  di-scroll). Kontrol grid (search/prev-next/view) `hidden md:flex`.
- Dialog per-baris `<AlertDialog>` hapus → satu `AlertDialog` terkontrol per
  halaman (`confirmDelete` state) + helper cluster aksi dipakai tabel & kartu.
- Kartu metrik: sudah 2-kolom + `p-3.5`/`text-lg` di mobile sejak Ronde 6.
- Grid pasangan input dialog: `grid grid-cols-1 sm:grid-cols-2 gap-3`.
- Header `/finance` & `/kamar/kos/anggota`: `flex-wrap` + label tombol/breadcrumb
  disingkat di mobile (`hidden sm:inline`).

## Ronde 9 (2026-09-10) — pilih Sumber Dana pakai akun asli

Dropdown "Sumber Dana" di dialog **tambah** (bukan cuma edit) sebelumnya
hardcoded `Bank BCA / Mandiri / Tunai / GoPay` — tidak nyambung ke akun asli, jadi
`transactionService.add` gagal resolve `account_id` & saldo tak berubah.

- `resolvePersonalAccount` di `lib/db.ts` di-`export`.
- **`/transaksi`** (dialog Catat Transaksi), **`/goals`** (Setor Tabungan + Setoran
  Awal saat buat target), **`/scheduled`** (Sumber Dana Default): dropdown kini
  `accounts.map()` dari `accountService.getAll()`. Default dipilih via
  `resolvePersonalAccount` (akun bank pertama → akun mana pun). Kalau belum ada
  akun: dropdown disabled + hint link ke `/finance` (transaksi tetap tercatat,
  saldo tidak berubah).
- `goals` sekarang ikut load `accountService.getAll()` (dulu tidak).
- Daftar akun di-refresh tiap dialog dibuka (`useEffect` pada state open-dialog),
  jadi akun yang baru dibuat langsung muncul.

## Ronde 10 (2026-09-10) — poles komponen `Select`

`components/ui/select.tsx` dirapikan (semua ~48 dropdown ikut berubah):
- **Panel dropdown**: dulu dipaksa `dark` + glass blur `bg-popover/70` → sekarang
  **solid `bg-popover` & ikut tema** (fix: dulu putih-di-atas-gelap kalau HP light
  mode), `rounded-2xl`, `border border-border`, `shadow-lg`.
- **Posisi**: `position="popper"` (muncul di bawah field, lebar ≥ trigger) —
  bukan lagi `item-aligned` yang menumpuki trigger.
- **Trigger**: default `w-full` (dulu `w-fit`, tiap pemakaian override); `hover`
  & `aria-expanded` beri feedback bg + border; chevron **berputar 180°** saat buka.
  Radius/isi tetap sama dengan `<Input>` (`rounded-3xl` translucent).
- **Item**: bobot normal, item terpilih `font-medium` + centang warna primary di
  kanan; highlight `bg-accent`.
- `max-h` panel dibatasi 20rem (dulu setinggi layar).

## Ronde 11 (2026-09-10) — kurangi kebisingan visual

Keluhan: layout "bikin pusing / susah dibaca". Sumbernya: 6-7 ukuran font
bercampur, warna di mana-mana (tiap kategori/status pill beda warna, kotak ikon
warna-warni di kartu metrik), `font-extrabold`/`tracking-tight` berlebihan.

- **`components/ui/metric-card.tsx`** (baru) — `<MetricCard label value hint? tone?
  progress? />`. Satu skala tipe: label `text-xs` muted, angka `text-lg sm:text-xl
  font-semibold`, satu baris konteks opsional. Warna HANYA di angka & hanya kalau
  bermakna (`tone` positive/negative/warning). Tidak ada kotak ikon warna.
  Menggantikan ~25 kartu metrik copy-paste di 7 halaman (transaksi/finance/dashboard/
  goals/scheduled/kamar-kos/kebutuhan). Grid metrik semua `grid-cols-2` di mobile.
  Kartu "Auto-Sync / Tersambung" (hiasan) di `/scheduled` dibuang.
- **Toast notifikasi**: dulu blok hijau besar di tiap halaman → kartu netral
  `bg-card border` + centang hijau kecil.
- Global di semua `app/(app)/*/page.tsx`: hapus `tracking-tight`,
  `font-extrabold`→`font-semibold`, hapus `min-h-screen` dari div konten.

## Yang TIDAK perlu dikerjakan otomatis

- Migrasi data dari Bizmo ke MSU — menunggu tindakan manusia (pemilik Bizmo invite member, atau ekspor file manual).
- Jangan commit/push kredensial apa pun ke repo, termasuk ke file ini.
