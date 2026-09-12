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
  - Migrasi data dari Bizmo belum terjadi, masih menunggu file ekspor (SQL/CSV) dari pemilik Bizmo atau akses member ke organisasi itu. **Ini pekerjaan manusia, jangan dicoba otomatis.**
  - Per 2026-09-10 sudah ada **data uji coba** (bukan lagi kosong total): `profiles` 2, `accounts` 2, `transactions` 2, `goals` 1, `saving_logs` 1. Tabel `room_*` masih kosong.
  - 6 migrasi terpasang: `initial_schema_from_repo`, `harden_functions_search_path_and_execute`, `revoke_execute_from_public`, `add_missing_room_split_rls_policies`, `add_edit_delete_policies_room_entities`, `add_accounts_card_network`. **`supabase_schema.sql` sudah disinkronkan** dengan keenam migrasi ini (lihat bagian 16 file itu) — jadi file itu kembali jadi cerminan live yang akurat.

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

## Ronde 12 (2026-09-10) — notebook training LayoutLMv3 + rencana fitur scan struk

Pekerjaan dari `spec-notebook-training-layoutlmv3.md` & `spec-fitur-scan-struk.md`.

- **`notebooks/layoutlmv3-cord-v2-finetuning.ipynb`** (baru) — notebook Kaggle
  fine-tune `microsoft/layoutlmv3-base` di `naver-clova-ix/cord-v2` untuk BAB IV
  skripsi. 28 sel. Mengikuti spec: instalasi terpinning (`transformers==4.41.2`,
  `accelerate==0.34.2`, `datasets==3.6.0`, tanpa `seqeval`/`peft`), test split
  disisihkan total (evaluasi resmi 1x di Bagian 7), kosakata label dari gabungan
  train+val+test, dedup image-hash lintas split, metrik BIO span manual, demo
  inferensi EasyOCR (bukan Tesseract). Tidak terkait kode app — berdiri sendiri.
- **Model terlatih di-host:** [`Klissh/layoutlmv3-cord-v2`](https://huggingface.co/Klissh/layoutlmv3-cord-v2)
  (HF model repo publik, 507 MB, sudah di-upload). Repo model gratis; **HF Space
  Docker TIDAK gratis lagi** (butuh PRO $9/bln — kebijakan baru HF: hanya Static
  Space yang gratis).
- **Layanan inferensi scan struk → Modal.com** (bukan HF Space). File:
  - **`inference/modal_app.py`** — Modal serverless CPU (2 vCPU/4 GB),
    `min_containers=0` (scale-to-zero, ~$0/bln untuk 7 orang), FastAPI di-serve
    dari `@app.cls` + `@modal.enter` (model dimuat sekali/kontainer),
    `@modal.concurrent(max_inputs=1)`. Endpoint **sinkron** `POST /scan`
    (multipart) + `GET /health`. Pipeline: EasyOCR (downscale 1600px,
    `batch_size=16`) → LayoutLMv3 → rekonstruksi item + ringkasan + `raw_words`.
    Belum di-deploy (nunggu user buat akun Modal + token).
  - **`inference/README.md`** — cara deploy + kontrak API + estimasi biaya.
  - **`hf-space/`** — versi Docker (`Dockerfile` + `app.py` FastAPI async
    job-poll) — **alternatif** kalau nanti pindah ke Cloud Run / HF PRO / VM.
  - `SCAN_API_KEY` = `BI-1GHdBpqAFWodET4_aPvXOIBjwZ6Rk` (di scratchpad sesi;
    dipakai app Next auth ke `/scan`). Regenerate untuk produksi nyata.
- **`spec-fitur-scan-struk.md` — Bagian 0 sudah USANG.** Ketiga "bug kritis" yang
  disebut spec (splits tak diisi, baca `split_between`, `myShare` tak cek
  keanggotaan) **sudah diperbaiki** sejak Ronde 2-3. `lib/db.ts` sekarang:
  `addSharedTransaction` insert `room_transaction_splits`; `getSharedTransactions`
  baca embed `room_transaction_splits(*)`; `myShare` diturunkan dari baris split
  milik user. Yang tersisa dari spec = fitur **split per item** (tabel baru
  `room_transaction_items` + `room_transaction_item_splits`, RPC atomik, mode UI
  baru di `kamar/kos`). Keputusan user: selisih pajak/diskon dibagi **rata ke
  peserta struk itu saja** (bukan proporsi belanja, bukan seluruh 7 anggota).
  **Fitur Next belum diimplementasikan** — nunggu layanan inferensi live dulu.

## Ronde 13 (2026-09-10) — fitur scan struk + split per item

Layanan inferensi **live di Modal** (bukan HF Space — Docker Space kena PRO wall):
`https://klissh--managemymoney-scan-struk-scanservice-web.modal.run`
(`inference/modal_app.py`, scale-to-zero, `SCAN_API_KEY` = Modal secret `scan-struk`).
Timing terukur: LayoutLMv3 ~1.2s konstan, EasyOCR 3–13s, total warm ~5–15s,
cold start +15–25s sekali. Kualitas OCR belum diuji dengan foto struk asli.

**Migrasi `add_room_transaction_items_split_per_item`** (diterapkan + diverifikasi
via DO-block rollback):
- Tabel `room_transaction_items` (item_name, quantity, unit_price, item_total,
  source scan|manual) + `room_transaction_item_splits` (item_id, user_id,
  share_amount, UNIQUE(item_id,user_id)). RLS: SELECT anggota kamar; write
  pembuat transaksi induk.
- RPC `create_room_transaction_with_items(p_room_id, p_paid_by_user_id, p_title,
  p_category, p_total_amount, p_date, p_items jsonb) RETURNS uuid` — SECURITY
  DEFINER, `search_path=''`, atomik: room_transactions + tiap item + item_splits
  + agregat ke `room_transaction_splits` (baris penalang `is_settled=true`).
  **Selisih (total − Σ item_total) dibagi RATA ke peserta struk** (union
  member_ids), lalu sisa pembulatan ditaruh di tanggungan terbesar. Advisor
  "authenticated_security_definer_function_executable" = SENGAJA (validasi auth
  di dalam: caller & semua member_ids harus anggota kamar).

**Kode:**
- `.env`: `SCAN_STRUK_URL`, `SCAN_STRUK_API_KEY` (server-only).
- `app/api/scan-struk/route.ts` — proxy server-side ke Modal (key tak bocor ke
  browser; wajib login; timeout 55s).
- `lib/scan-struk.ts` — `scanReceipt()`, `resultToRows()`, `computeOwed()`
  (preview split HARUS cocok dengan RPC).
- `lib/db.ts`: `RoomItemInput`/`RoomTransactionItemRecord`,
  `kamarService.addSharedTransactionWithItems()` (panggil RPC + reconcile),
  `getTransactionItems()`. `SharedTransactionRecord.isItemized`.
  `updateSharedTransaction` menolak edit struktural bila transaksi itemized.
  `getSharedTransactions` embed `room_transaction_items(id)` → `isItemized`.
- `app/(app)/kamar/kos/scan/page.tsx` (baru) — layar review: info transaksi +
  kelompok default, daftar item (edit inline nama/qty/harga/subtotal + checkbox
  + badge status), tombol "Bagi ke…" batch (`assignGroupToItems`), ringkasan
  per anggota real-time, submit terkunci sampai semua item dibagi.
- `kamar/kos/page.tsx`: tombol "Scan Struk / Per Item" → `/kamar/kos/scan`;
  "Catat Transaksi" → "Catat Cepat (Rata)"; badge "per item" di tabel/kartu;
  toast `?scan=ok`.

typecheck + lint + `next build` lolos. **Sudah di-merge ke `master` & live di
`mybarudak.vercel.app`** (deploy `a8ddfcb`). Env var `SCAN_STRUK_URL` +
`SCAN_STRUK_API_KEY` sudah di-set di Vercel project `myfinance` (Production +
Preview). `/api/scan-struk` terverifikasi balas 401 tanpa login (bukan 503 →
env OK). **Belum diuji end-to-end dengan user login + foto struk asli.** Mode
"cepat/rata" lama tak berubah.

### Sisa / belum dikerjakan
- Edit rincian item transaksi itemized yang sudah tersimpan (v1: hapus + buat ulang).
- Kualitas OCR pada foto struk Indonesia asli — perlu tuning param
  (`OCR_*` env di Modal secret) setelah lihat data nyata.
- Gambar struk tidak disimpan (tak ada Supabase Storage) — hanya hasil parse.

## Ronde 14 (2026-09-11) — perbaikan dari `BUGFIX.md`

`BUGFIX.md` (code review manual) ternyata sebagian besar mendeskripsikan clone
**lama**, dari sebelum Ronde 1-13. Sebelum eksekusi, tiap temuan diverifikasi
ulang terhadap kode + live DB:

- **#1 (auth bypass), #3 (split tak tersimpan), #4 (iuran tak sinkron),
  #8 (middleware cek cookie doang), #9 (dokumentasi kosong) — SUDAH
  diperbaiki di ronde sebelumnya**, tidak disentuh lagi (diverifikasi baca
  ulang `authService`, `proxy.ts`, `README.md`, dan `payRequirement()`).
- **#2 (RLS `USING(true)` di semua tabel `room_*`) — MASIH NYATA, 🔴
  Kritis.** Dikonfirmasi lewat query `pg_policies` langsung ke live DB
  sebelum diperbaiki. Migrasi `fix_room_rls_scope_to_members`:
  - Helper `public.is_room_member(room_id, user_id)` SECURITY DEFINER
    (hindari "infinite recursion detected in policy" — tabel `room_members`
    tak boleh mereferensi dirinya sendiri langsung di `USING`).
  - SELECT `rooms`/`room_members`/`room_transactions`/
    `room_transaction_splits`/`room_requirements`/`room_requirement_payments`
    dibatasi ke anggota kamar terkait (dulu bisa dibaca siapa pun yang login).
    INSERT `room_requirements` juga dibatasi (dulu `WITH CHECK(true)`).
  - RPC baru `find_room_by_invite_code(p_code)` (SECURITY DEFINER) — dipakai
    `kamarService.joinRoom()` supaya tetap bisa cari kamar via kode undangan
    SEBELUM jadi anggota (kalau tidak, join-kamar rusak total karena SELECT
    `rooms` sekarang dibatasi anggota).
  - **Diverifikasi via DO-block rollback** (2 kamar simulasi + role
    `authenticated` sungguhan, bukan superuser): anggota Room A tidak bisa
    lagi SELECT rooms/room_members/room_transactions Room B; lookup by kode
    tetap jalan; akses kamar sendiri tidak terganggu.
  - ⚠️ Migrasi diterapkan ke DB **sebelum** kode `joinRoom()` di-deploy —
    ada jendela singkat di mana produksi lama gagal join-kamar. Kode langsung
    di-deploy menyusul di commit yang sama sesi ini untuk menutup jendela itu.
- **#6 (nomor kartu plaintext) — diperbaiki.** `maskCardNumber()` memaskir
  nomor kartu (>=12 digit berurutan → `**** **** **** 1234`) sebelum disimpan
  — sekarang ke kolom Supabase `accounts.card_number` (lihat Ronde 15), bukan
  cuma sidecar lokal.
- **#7 (ID `Date.now().slice(-4)` rawan tabrakan) — diperbaiki.** Helper
  `localId(prefix)` pakai `crypto.randomUUID()` (fallback ke random string
  kalau `crypto` tak tersedia), dipakai di 8 titik (`ACC/TX/G/SCH/ROOM/STX/REQ`).
  ID ini cuma placeholder sebelum id asli dari Supabase datang (mode
  Supabase) atau id permanen di mode lokal — bukan collision-prone lagi.

typecheck + lint + `next build` lolos.

## Ronde 15 (2026-09-11) — #5 "semua di Supabase" + #10 automated test

Ronde 14 sempat menandai #5 & #10 "tidak dikerjakan" — user minta lanjutkan
keduanya secara eksplisit.

**#5 — localStorage bukan lagi source of truth, hanya cache/legacy-fallback.**

1. **Migrasi `move_local_sidecars_to_real_columns`** (diterapkan) — 3 sidecar
   localStorage (per-device, tak sinkron antar device) pindah ke kolom
   Supabase asli:
   - `accounts.card_number/card_holder/expiration` (dulu sidecar `CARD_META`)
   - `scheduled_payments.account_id` (FK) `+ notes` (dulu sidecar `SCHEDULED_META`)
   - `room_transactions.payer_account_id` (FK) (dulu sidecar `SPLIT_META`)
   - `readCardMeta()`/`readSplitMeta()`/`readScheduledMeta()` tetap ada **hanya**
     untuk backfill sekali dari cache device lama (dibaca sekali di `getAll()`,
     ditulis balik ke kolom Supabase secara best-effort, lalu jadi basi).
     `writeCardMeta()`/`writeScheduledMeta()` sudah **dihapus total** — tidak ada
     lagi jalur tulis ke sidecar sebagai sumber kebenaran. `writePayerAccount()`
     (baru) tulis ke `payer_account_id`, fallback sidecar cuma kalau update-nya
     sendiri gagal.
2. **Semua method tulis kritis sekarang MELEMPAR error kalau Supabase
   dikonfigurasi tapi request gagal** — tidak lagi diam-diam membuat record
   lokal palsu yang terlihat "berhasil" (akar masalah #5). Dibatasi ke jalur
   yang datanya benar-benar penting (uang / data shared, bukan setiap fungsi):
   `accountService` (add/update/remove), `transactionService` (add/update/
   remove), `goalService` (add/update/remove/**deposit**), `scheduledService`
   (add/update/remove/**pay**), `kamarService.createRoom()`,
   `kamarService.addRequirement()`. Fallback localStorage MURNI ("mode lokal")
   sekarang HANYA berlaku kalau Supabase sama sekali tidak dikonfigurasi (dev
   tanpa `.env`) — dicek eksplisit lewat `if (isSupabaseConfigured && supabase)
   {...} else {/* mode lokal */}`, bukan lagi "coba Supabase, apa pun hasilnya
   lanjut ke local" seperti sebelumnya.
   - Auto-log yang sifatnya pelengkap (bukan catatan utama) — auto-catat ke
     `transactions` dari `goalService.deposit`/`scheduledService.pay`/
     `reconcileRoomLedger` — dibungkus try/catch di `lib/db.ts` sendiri
     (log + lanjut), supaya satu auto-log gagal tidak merusak fitur lain
     (reconcile jalan tiap buka halaman kamar) atau menggagalkan aksi utama
     yang sudah tersimpan (mis. status tagihan sudah "paid").
   - `kamarService.payRequirement()` **sengaja dibiarkan melempar** (bukan
     dibungkus) — auto-log ke `transactions` di situ bagian integral, bukan
     pelengkap (dipakai `personal_transaction_id`).
3. **6 halaman diupdate**: `finance`, `transaksi`, `goals`, `scheduled`,
   `kamar/baru`, `kamar/kos/kebutuhan` — tiap handler yang manggil method di
   atas dibungkus `try/catch`, notification jadi `{msg, error?}` dengan toast
   merah (`AlertTriangle`) untuk error vs toast netral (`CheckCircle2`) untuk
   sukses (sebelumnya cuma `string`, semua ditampilkan seolah sukses).
4. **Bug tambahan yang ketemu & ikut diperbaiki** saat mengerjakan #5 (pola
   sama, "gagal diam-diam tapi state lokal ikut berubah"):
   - `transactionService.update()`/`remove()`: dulu saldo akun tetap
     disesuaikan walau update/delete transaksi di Supabase gagal (silent) —
     sekarang saldo cuma disesuaikan SETELAH Supabase sukses.
   - `goalService.deposit()`: dulu `goals.update()`/`saving_logs.insert()`
     gagal → tetap ditulis ke cache lokal seolah setoran berhasil.
   - `scheduledService.pay()`: dulu update status "paid" gagal → tetap
     ditandai lunas di cache lokal.
   - `kamarService.createRoom()`: dulu insert gagal → mengembalikan kamar
     lokal palsu yang tak pernah ada di server (anggota lain tak akan pernah
     melihatnya) tapi UI bilang "berhasil dibuat".
   - `kamarService.addRequirement()`: pola sama, untuk fitur **shared**
     (kebutuhan bulanan) — dampaknya lebih terasa karena anggota lain memang
     seharusnya melihat baris ini.

**#10 — automated test (vitest).**

- `vitest@3.2.7` (bukan v5 — konflik peer dependency; temuan audit yang
  tersisa cuma path-traversal di mock-loader vitest, relevan untuk test pihak
  ketiga yang tak tepercaya di CI — tidak relevan di sini, tak masuk bundle
  produksi). `npm run test` / `npm run test:watch`.
- `lib/db.test.ts` (18 test) — `resolvePersonalAccount`, `isSystemTransaction`/
  `stripLedgerRef` (termasuk penanda model lama), `maskCardNumber`, `localId`
  (termasuk cek anti-tabrakan), `todayLocalISO`/`toISODate`/`formatIdDate`.
- `lib/scan-struk.test.ts` (9 test) — `computeOwed` (skenario SAMA dengan yang
  diverifikasi lewat RPC `create_room_transaction_with_items`: Lauk 60rb/2
  orang + Beras 30rb/1 orang, total 100rb → cuklis 65rb, nopal 35rb),
  `round2`, `resultToRows`, `totalFromResult`.
- Method yang manggil Supabase (I/O) sengaja **tidak** di-mock/di-test unit —
  effort mocking `supabase-js` di luar scope sesi ini; method itu diverifikasi
  manual + lewat DO-block rollback test di database.

typecheck + lint + `next build` lolos.

## Ronde 16 (2026-09-12) — uji kualitas deteksi scan struk dengan data nyata

User minta diverifikasi apakah scan struk benar-benar bisa mendeteksi dengan
baik. Tidak ada foto struk asli dari user, jadi dites dengan 5 gambar test
split CORD-v2 (yang punya ground truth resmi, termasuk 1 foto resolusi tinggi
2304×4096) langsung ke endpoint Modal live — bukan sekadar baca kode.

**Temuan #1 (positif): klasifikasi field LayoutLMv3 akurat.** Model konsisten
benar membedakan nama item vs harga vs subtotal vs pajak vs total vs
tunai/kembalian di berbagai format struk — ini nilai utama dari fine-tuning,
bukan cuma OCR mentah.

**Temuan #2 (bug nyata, sekarang diperbaiki): parsing nominal `_amount_value()`
salah pada pola yang justru sering muncul di data asli:**
- Field ringkasan berformat "LABEL ANGKA" (mis. "PB-1 10% 2.818") — kode lama
  ambil angka PERTAMA di string (nomor kode label, "1" dari "PB-1"), bukan
  nilai sebenarnya di ujung. **Diperbaiki:** ambil kandidat angka paling
  belakang.
- EasyOCR sering menyisipkan spasi nyempil di sekitar titik desimal
  ("28 . 182") dan salah baca ekor "000" sebagai huruf ("31 0oo") — nilai
  yang terhitung sebelumnya diam-diam SALAH TAPI TERLIHAT MASUK AKAL (182
  bukan 28.182; 310 bukan 31.000) tanpa error apa pun. **Diperbaiki** dengan
  regex tambahan (rapatkan spasi desimal, koreksi ekor 0oo→000 tanpa
  menggabung dua field angka berbeda yang cuma dipisah 1 spasi).
- Diverifikasi terhadap ground truth CORD-v2: subtotal 28.182 & pajak 2.818
  sekarang **persis sama** dengan angka resmi dataset (sebelumnya 182 & 818).
- Ditambah 5 `assert` sanity-check yang jalan tiap modul di-import (termasuk
  cold-start kontainer Modal) — kalau regex ini rusak lagi, deploy CRASH
  jelas di log, bukan diam-diam menyajikan nominal salah.

**Temuan #3 (proses): `enable_memory_snapshot=True` bikin kode LAMA masih
terpakai walau sudah redeploy** (snapshot dipulihkan dari sebelum perubahan).
Dinonaktifkan sementara — WAJIB verifikasi lewat curl langsung setelah tiap
redeploy Modal, jangan asumsi "deploy sukses" = "kode baru jalan". Pertimbangkan
aktifkan lagi (untuk cold-start lebih cepat) hanya kalau ritme edit sudah
benar-benar berhenti.

**Kesimpulan yang jujur:** nomor makin akurat kalau confidence OCR tinggi;
di gambar yang confidence-nya rendah (satu dari 5 sampel ketahuan skor rata
0.31, sudah otomatis muncul warning), nama item & sebagian angka tetap
berantakan — sesuai desain (makanya ada layar review + edit manual, bukan
"pasti benar otomatis"). **Belum ada foto struk ASLI (hasil foto HP, bukan
gambar dataset) yang dites** — CORD-v2 tetap gambar riset yang sengaja
memuat kondisi buruk (blur/miring/gelap); struk asli hasil foto HP yang niat
kemungkinan lebih baik. Rekomendasi: minta 2-3 foto struk asli dari user
untuk tes definitif.

## Ronde 17 (2026-09-12) — tes dengan foto struk ASLI (bukan dataset)

User kirim 2 foto struk asli (Rosyam Mart & Lotus's, Malaysia — difoto
pegang tangan, pencahayaan normal). Ini tes pertama yang benar-benar
representatif dengan use-case nyata (bukan gambar riset CORD-v2).

**Bagus:** teks EasyOCR terbaca jelas untuk foto yang fokus & terang — nama
barang hampir semua kebaca benar. Angka subtotal per item **akurat**: 14/15
baris (Rosyam Mart) dan 4/5 baris (Lotus's) persis sama dengan struk fisik.
Sub Total/Total footer terdeteksi tepat (61.20 dan 15.25, keduanya exact
match) — setelah perbaikan di bawah.

**Masalah nyata #1 (diperbaiki): kode barang/barcode menghabiskan token.**
Struk ritel/supermarket cetak kode barcode panjang (13-18 digit) di baris
sendiri di bawah tiap nama barang — beda dari struk kafe (data training
CORD-v2) yang tak punya ini. Word-piece tokenizer memecah tiap angka
barcode jadi banyak token, jadi pada struk 15 item (158 kata OCR), **59
kata di ujung (termasuk TOTAL) terpotong** oleh limit 512 token LayoutLMv3
sebelum diperbaiki. **Fix:** filter kata >=8 digit murni (pola barcode,
harga selalu punya titik/koma) sebelum dikirim ke model (tetap muncul di
`raw_words` label "O" untuk transparansi). Turun jadi 23/141 kata terpotong
pada struk yang sama, dan Sub Total (61.20) yang tadinya hilang sekarang
terdeteksi tepat.

**Masalah nyata #2 (belum diperbaiki, didokumentasikan):** kadang **satu
item hilang total** dari hasil (bukan cuma nama berantakan) — kejadian di
struk Lotus's ("JAGUNG MAN 5.49" tak muncul sama sekali, kemungkinan
tergabung ke entity tetangga). Layar review/edit membantu untuk nama yang
berantakan, tapi TIDAK membantu kalau baris hilang sama sekali — user tetap
perlu sekilas cek jumlah item vs struk fisik, terutama untuk struk panjang.
Header nama/alamat toko yang panjang juga makan token — belum difilter
(lebih berisiko salah filter teks yang justru relevan).

Kedua perbaikan (parsing nominal Ronde 16 + filter barcode Ronde 17) sudah
di-redeploy & diverifikasi ulang ke endpoint live dengan curl langsung.

## Ronde 18 (2026-09-12) — perbaikan item hilang (`spec-fix-item-hilang-scan.md`)

Root cause "Masalah nyata #2" Ronde 17 sudah dikonfirmasi lewat baca kode
langsung (bukan dugaan lagi): `_reconstruct()` cuma flush item lama saat
`menu.nm` BARU terdeteksi. Kalau nama satu item gagal terdeteksi (realistis
di foto miring/blur), field `qty`/`harga_satuan`/`subtotal` miliknya
menimpa slot item SEBELUMNYA secara senyap tanpa memicu flush — datanya
tidak hilang dari struk, tapi salah tempel & bikin item lain kelihatan
salah harga secara diam-diam.

**Perbaikan (`inference/modal_app.py`):**
- `_reconstruct()` ditulis ulang: helper `_set(key, text)` otomatis flush
  kalau slot yang mau diisi sudah terisi (sinyal item baru sudah mulai
  walau nama gagal terdeteksi); `_flush()` digeneralisasi jadi `if cur:`
  (baris apa pun yang punya isi disimpan, bukan cuma yang punya
  `nama`/`subtotal`). Beda dari contoh literal di spec: `menu.sub.nm`
  disatukan dengan `menu.nm` lewat `NAME_FIELDS` (bukan digabung sebagai
  catatan ke nama induk) — konsisten dengan keputusan user via
  AskUserQuestion ("Ya, jadikan baris terpisah") bahwa sub-item CORD selalu
  jadi baris independen, bukan modifier.
- Cross-check jumlah item ditambahkan: `ringkasan.jml_item` (dari
  `total.menuqty_cnt`) dibandingkan `len(items)`, mismatch memicu warning
  "cek manual, kemungkinan ada yang tergabung/hilang". Diekstrak jadi
  fungsi murni `_item_count_warning()` supaya bisa dites tanpa `_process()`
  penuh (butuh OCR+model kalau tidak).
- Test baru `inference/test_reconstruct.py` (pytest, 7 skenario: item
  normal, regresi utama (nama gagal terdeteksi di tengah, dulu bikin data
  tertimpa senyap — sekarang jadi baris `nama: null` terpisah), flush di
  akhir struk tanpa nama, `menu.sub.*` jadi baris terpisah, 3 skenario
  cross-check jumlah item). Semua lolos (`pytest inference/test_reconstruct.py`
  → 7 passed).

**Verifikasi live setelah redeploy + `modal container list` kosong
(kontainer lama dimatikan, request berikutnya pasti pakai kode baru):**
- Struk Lotus's: "JAGUNG MAN" (5.49) yang tadinya hilang total sekarang
  muncul sebagai baris sendiri (nama tidak selalu bersih — kadang cuma "B"
  dari fragmen tetangga — tapi **harganya tidak lagi hilang/menimpa item
  lain**, sesuai tujuan perbaikan). Warning cross-check aktif benar: "5
  item struk vs 16 terdeteksi".
- Struk Rosyam Mart: 15/15 nilai subtotal item asli masih persis cocok
  ground truth (termasuk bug lama yang sudah diketahui: USA RUSSET POTATO
  terbaca 5.50 padahal seharusnya 3.50 — bukan regresi baru, sudah
  didokumentasikan Ronde 17). Warning cross-check aktif: "15 item struk vs
  34 terdeteksi".

**Catatan penting (bukan bug baru, keterbatasan terpisah):** jumlah "item"
terdeteksi jauh lebih banyak dari isi struk asli di kedua foto (16 vs 5,
34 vs 15) karena model kadang melabeli teks header/footer non-item
(alamat toko, nama kasir, promo "SIGN UP NOW", dll) sebagai `menu.nm` —
ini murni akurasi model pada foto asli yang jauh lebih berisik dari
gambar training CORD-v2, BUKAN dampak dari fix ini (perilaku flush-per-nama
untuk field `menu.nm` baru sudah sama dari kode lama). Perbaikan yang
benar-benar mengatasi ini adalah pengelompokan berbasis posisi/koordinat
`box`, yang secara eksplisit di luar scope spec ini (lihat Section 5)
karena berdampak ke seluruh alur `_reconstruct`, bukan patch kecil.
Warning cross-check jumlah item di atas jadi mitigasi sementara paling
murah: user tetap diberi tahu untuk cek manual saat selisihnya besar.

## Ronde 19 (2026-09-12) — bug pembulatan sen hilang saat auto-isi dari scan

User tanya "apakah field total harga otomatis terisi setelah scan?" — jawabannya
ya, tapi penelusuran ketat menemukan bug baru (bukan bug item-hilang Ronde 18):
`totalFromResult()` dan `resultToRows()` di `lib/scan-struk.ts` memakai
`Math.round()` untuk mengisi "Total struk" dan `subtotal` tiap baris item —
membulatkan ke Ringgit bulat, MEMBUANG SEN. Struk Lotus's dengan total asli
RM 15.25 akan auto-terisi RM 15 (bukan bug tampilan — nilai yang tersimpan
memang sudah salah sebelum sempat diedit user).

Ini genuinely bug, bukan desain: `lib/currency.ts` sengaja mendukung MYR
2-desimal penuh (ada UX "entri sen" khusus), kolom DB `item_total`/
`unit_price`/`total_amount` semua `NUMERIC(15,2)`, dan file yang sama sudah
punya `round2()` yang benar dipakai di `computeOwed()` — tapi titik masuk
data dari scan (`resultToRows`, `totalFromResult`) sudah keburu membulatkan
ke integer duluan sebelum sempat lewat `round2()`. Untuk IDR tidak berdampak
(nilai OCR Rupiah memang sudah bulat, tak ada sen di struk).

**Fix:** ganti `Math.round()` → `round2()` (fungsi yang sama, sudah
diekspor) di kedua fungsi. Tambah 2 test regresi di
`lib/scan-struk.test.ts` (subtotal item & total RM dengan sen tidak lagi
dibulatkan ke bulat). Semua 29 test (`vitest run`) + `tsc --noEmit` lolos.

## Yang TIDAK perlu dikerjakan otomatis

- Migrasi data dari Bizmo ke MSU — menunggu tindakan manusia (pemilik Bizmo invite member, atau ekspor file manual).
- Jangan commit/push kredensial apa pun ke repo, termasuk ke file ini.
