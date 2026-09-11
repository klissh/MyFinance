# MyFinance — Finance Tracker Pribadi + Split Bill Kos

Aplikasi web untuk mencatat keuangan pribadi sekaligus mengelola kas & patungan
tagihan (listrik, wifi, galon, dll) bareng teman se-kos. Dipakai bersama oleh
penghuni satu apartemen di Malaysia.

## Tech stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4** + **shadcn/ui**
- **Supabase** (Postgres + Auth, sesi berbasis cookie via `@supabase/ssr`)
- Package manager: **npm**

## Menjalankan secara lokal

```bash
npm install
npm run dev
```

Buka http://localhost:3000 → diarahkan ke `/login`.

### Environment

Buat file `.env.local` (atau `.env`, keduanya dibaca; jangan di-commit) berisi:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

Menunjuk ke project Supabase **MSU** (`managemymoney`). Kalau kedua variabel
kosong, aplikasi jalan dalam **mode lokal** (data disimpan di `localStorage`
browser, tanpa login sungguhan).

### Membuat akun

Belum ada user sama sekali di database. Daftar lewat `/signup`:

- Jika **"Confirm email" dimatikan** di Supabase → Auth → Providers → Email:
  langsung masuk ke dashboard setelah daftar.
- Jika **aktif**: buka email → klik tautan konfirmasi → lalu login.

> Untuk development lokal, mematikan "Confirm email" di dashboard Supabase
> mempercepat pengujian.

## Skrip

| Perintah            | Fungsi                                        |
| ------------------- | --------------------------------------------- |
| `npm run dev`       | Dev server (Turbopack) di port 3000           |
| `npm run build`     | Build produksi                                |
| `npm run start`     | Menjalankan hasil build                       |
| `npm run lint`      | ESLint (harus 0 error)                        |
| `npm run typecheck` | `tsc --noEmit`                                |
| `npm run format`    | Prettier                                      |
| `npm run test`      | Unit test (vitest) — logika murni di `lib/`   |
| `npm run test:watch`| Unit test, mode watch                         |

## Struktur

```
app/
  (app)/              Halaman ter-autentikasi (dashboard, transaksi, finance,
                      goals, kurs, scheduled, kamar/*)
  api/kurs/           Endpoint kurs real-time (Yahoo Finance + fallback)
  login, signup,      Alur autentikasi
  auth/confirm
proxy.ts              Middleware: verifikasi sesi Supabase & proteksi rute
lib/
  db.ts               Semua service data (auth, account, transaction, goal,
                      scheduled, kamar). Pola: Supabase dulu → fallback
                      localStorage ter-scope per user.
  supabase.ts         Browser client (@supabase/ssr, sesi = cookie)
  supabase-server.ts  Server client untuk Server Components / Route Handlers
components/
  ui/                 Komponen shadcn/ui
```

## Autentikasi & keamanan

- Sesi Supabase asli disimpan sebagai **cookie** (`@supabase/ssr`).
- `proxy.ts` memverifikasi sesi di server (`supabase.auth.getUser()`), bukan
  sekadar mengecek keberadaan cookie.
- Tidak ada lagi "fallback sesi palsu" saat jaringan bermasalah — kalau login
  gagal, ya gagal.

## Skema Supabase (public)

13 tabel, RLS aktif di semua: `profiles`, `accounts`, `categories`,
`transactions`, `goals`, `saving_logs`, `scheduled_payments`, `rooms`,
`room_members`, `room_transactions`, `room_transaction_splits`,
`room_requirements`, `room_requirement_payments`.

## Catatan pengembangan

Lihat `CLAUDE.md` untuk konteks proyek, status Supabase, dan daftar
bug/keterbatasan yang masih diketahui.
