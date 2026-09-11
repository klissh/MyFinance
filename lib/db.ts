import { supabase, isSupabaseConfigured } from "./supabase"
import { normalizeCardNetwork, type CardNetwork } from "./card-networks"

// Data Types
export interface UserSession {
  id: string
  fullName: string
  email: string
  avatarUrl?: string
}

export interface FinancialAccountRecord {
  id: string
  name: string
  type: string
  accountCategory: "bank" | "cash" | "ewallet"
  balance: number
  cardNumber: string
  cardHolder: string
  expiration: string
  cardDesignType: "brand-dark" | "transparent-gradient" | "salmon-strip" | "gray-dark" | "brand-light" | "gray-light"
  cardNetwork: CardNetwork
}

export interface TransactionRecord {
  id: string
  title: string
  category: string
  type: "in" | "out"
  amount: number
  account: string
  date: string
  formattedDate: string
  notes?: string
}

export interface GoalRecord {
  id: string
  title: string
  category: string
  targetAmount: number
  currentAmount: number
  deadline: string
  status: "active" | "almost" | "completed"
}

export interface ScheduledBillRecord {
  id: string
  title: string
  amount: number
  date: string
  formattedDate: string
  category: string
  account: string
  status: "pending" | "paid"
  notes?: string
}

export interface SharedTransactionRecord {
  id: string
  title: string
  category: string
  totalAmount: number
  paidBy: string
  paidByUserId?: string
  createdByUserId?: string
  splitBetween: string[]
  splitUserIds?: string[]
  perPersonAmount: number
  /** >0 = saya berutang segini; <0 = orang lain berutang ke saya; 0 = lunas / tidak terlibat. */
  myShare: number
  date: string
  formattedDate: string
  status: "settled" | "pending"
  /** true = dibuat lewat "scan struk / split per item" (punya baris room_transaction_items). */
  isItemized?: boolean
}

/** Satu baris item di dalam struk belanja bersama (split per item). */
export interface RoomItemInput {
  itemName: string
  quantity: number
  unitPrice?: number | null
  itemTotal: number
  source: "scan" | "manual"
  /** user_id anggota kamar yang menanggung item ini. */
  memberIds: string[]
}

export interface RoomTransactionItemRecord {
  id: string
  itemName: string
  quantity: number
  unitPrice: number | null
  itemTotal: number
  source: "scan" | "manual"
  memberIds: string[]
  perMemberShare: number
}

export interface RequirementRecord {
  id: string
  title: string
  category: string
  totalPrice: number
  splitPeopleCount: number
  perPersonPrice: number
  dueDate: string
  responsiblePerson: string
  isPaidByMe: boolean
}

export interface KamarRoomRecord {
  id: string
  name: string
  code: string
  location?: string
  monthlyFee: number
  maxMembers: number
  role: "Ketua Kos" | "Anggota"
}

export interface KamarMemberRecord {
  id: string
  userId?: string
  name: string
  isMe: boolean
  role: "Ketua Kos" | "Anggota"
  roomNumber: string
  avatar: string
  netBalance: number
  status: "clear" | "owes" | "is_owed"
}

export interface DebtSummaryRecord {
  from: string
  to: string
  amount: number
  note: string
}

// Local Storage Base Keys
const BASE_STORAGE_KEYS = {
  USER: "myfinance_user_session",
  ACCOUNTS: "myfinance_db_accounts",
  TRANSACTIONS: "myfinance_db_transactions",
  GOALS: "myfinance_db_goals",
  SCHEDULED: "myfinance_db_scheduled",
  SHARED_TX: "myfinance_db_shared_tx",
  REQUIREMENTS: "myfinance_db_requirements",
  ROOM: "myfinance_db_active_room",
  // Sidecar: detail visual kartu (nomor/pemilik/expiry) yang tidak ada kolomnya
  // di tabel `accounts` — hanya dekorasi, disimpan lokal per-device.
  CARD_META: "myfinance_card_meta",
  // Sidecar: akun yang dipakai penalang saat bikin split bill (tabel
  // room_transactions tidak punya kolomnya). Dipakai saat rekonsiliasi ledger.
  SPLIT_META: "myfinance_split_payer_acct",
  // Sidecar: akun + catatan untuk jadwal tagihan (tabel scheduled_payments
  // tidak punya kolom account/notes).
  SCHEDULED_META: "myfinance_scheduled_meta",
}

// Pilih akun personal untuk auto-catat transaksi: pakai `preferred` bila valid,
// kalau tidak ambil akun bank pertama, lalu akun mana pun, terakhir "Bank BCA".
export function resolvePersonalAccount(
  accounts: FinancialAccountRecord[],
  preferred?: string,
): string {
  if (preferred && accounts.some((a) => a.name === preferred)) return preferred
  return (
    accounts.find((a) => a.accountCategory === "bank")?.name ||
    accounts[0]?.name ||
    "Bank BCA"
  )
}

// Penanda tak-terlihat di kolom `notes` transaksi pribadi supaya rekonsiliasi
// split bill IDEMPOTEN (tidak dobel walau dijalankan berkali-kali / di banyak device).
//   sbS = pengeluaran = BAGIAN SAYA pada satu split bill (model saat ini)
//   sbP/sbO/sbB = penanda model LAMA (talangan penuh + pengembalian) — dibersihkan
//                 otomatis oleh reconcileRoomLedger lalu digantikan sbS.
type LedgerKind = "sbS"
function ledgerRef(kind: LedgerKind, id: string): string {
  return `[#${kind}:${id.replace(/[^a-z0-9]/gi, "").slice(0, 16).toLowerCase()}]`
}
const LEDGER_REF_RE = /\s*\[#(?:sb[SPOB]:[a-z0-9]{3,16}|auto)\]/gi
// Versi non-global untuk `.test()` (LEDGER_REF_RE punya flag /g → lastIndex stateful).
const SYSTEM_TX_RE = /\[#(?:sb[SPOB]:[a-z0-9]{3,16}|auto)\]/i
/**
 * True bila transaksi pribadi ini dibuat OTOMATIS oleh sistem (bagian split bill
 * kos, setoran tabungan, bayar iuran/tagihan). Di UI tombol edit/hapus-nya
 * dikunci — koreksinya lewat fitur sumbernya.
 */
export function isSystemTransaction(notes?: string | null): boolean {
  return SYSTEM_TX_RE.test(notes || "")
}
// Deteksi entri model LAMA (untuk migrasi/purge otomatis). Mencakup:
//  - penanda bertanda `[#sbP/sbO/sbB:id]` (versi reconcile lama)
//  - entri TANPA penanda dari settleMyShare paling awal
//    ("Pelunasan ke X" / notes "Pelunasan bagian saya untuk talangan kos ...")
const LEGACY_LEDGER_RE =
  /\[#sb[POB]:[a-z0-9]{3,16}\]|Pelunasan bagian saya untuk talangan kos/i
export function stripLedgerRef(notes?: string | null): string {
  return (notes || "").replace(LEDGER_REF_RE, "").trim()
}
function collectLedgerRefs(notes: string | null | undefined, into: Set<string>): void {
  for (const m of (notes || "").matchAll(/\[#(sb[SPOB]):([a-z0-9]{3,16})\]/gi)) {
    into.add(`${m[1].toLowerCase()}:${m[2].toLowerCase()}`)
  }
}
function refKey(kind: LedgerKind, id: string): string {
  return `${kind.toLowerCase()}:${id.replace(/[^a-z0-9]/gi, "").slice(0, 16).toLowerCase()}`
}

// Guard supaya reconcileRoomLedger tidak jalan paralel dalam satu sesi.
let _reconcileInFlight: Promise<void> | null = null

function readSplitMeta(): Record<string, { account: string }> {
  if (typeof window === "undefined") return {}
  try {
    return JSON.parse(localStorage.getItem(BASE_STORAGE_KEYS.SPLIT_META) || "{}")
  } catch {
    return {}
  }
}
function writeSplitMeta(txId: string, account: string): void {
  if (typeof window === "undefined" || !account) return
  try {
    const all = readSplitMeta()
    all[txId] = { account }
    localStorage.setItem(BASE_STORAGE_KEYS.SPLIT_META, JSON.stringify(all))
  } catch {
    // ignore
  }
}

/**
 * Simpan akun penalang ke kolom `room_transactions.payer_account_id` (sinkron
 * antar device — pengganti sidecar SPLIT_META). Best-effort: kalau update
 * Supabase gagal, jatuh ke sidecar lokal supaya reconcile di device INI masih
 * benar sampai percobaan berikutnya berhasil.
 */
async function writePayerAccount(txId: string, accountName: string): Promise<void> {
  if (!accountName) return
  if (isSupabaseConfigured && supabase && txId.includes("-")) {
    try {
      const accs = await accountService.getAll()
      const accId = accs.find((a) => a.name === accountName)?.id
      if (accId && accId.includes("-")) {
        const { error } = await supabase
          .from("room_transactions")
          .update({ payer_account_id: accId })
          .eq("id", txId)
        if (!error) return
      }
    } catch (err) {
      console.warn("writePayerAccount exception:", err)
    }
  }
  writeSplitMeta(txId, accountName)
}

function readScheduledMeta(): Record<string, { account?: string; notes?: string }> {
  if (typeof window === "undefined") return {}
  try {
    return JSON.parse(localStorage.getItem(BASE_STORAGE_KEYS.SCHEDULED_META) || "{}")
  } catch {
    return {}
  }
}
// writeScheduledMeta() dihapus — account/notes sekarang kolom Supabase asli
// (`scheduled_payments.account_id`/`notes`). readScheduledMeta() tetap ada
// hanya untuk backfill sekali dari cache lama (lihat scheduledService.getAll).

// Tanggal "YYYY-MM-DD" menurut waktu LOKAL (bukan UTC). Penting di UTC+8:
// `new Date().toISOString()` bisa mundur 1 hari lewat tengah malam.
export function todayLocalISO(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

// ID sementara sisi klien (dipakai sebelum id asli dari Supabase datang, atau
// sebagai id permanen di mode lokal tanpa Supabase). `crypto.randomUUID()`
// dipakai supaya tak rawan tabrakan seperti 4 digit terakhir `Date.now()`
// (dua device bisa membuat record di milidetik yang berdekatan).
export function localId(prefix: string): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return `${prefix}-${crypto.randomUUID()}`
    }
  } catch {
    // ignore, pakai fallback di bawah
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// Nomor kartu di sini murni dekorasi visual (lihat CardMeta) — tidak pernah
// dibutuhkan utuh oleh logika apa pun. Kalau user mengetik nomor kartu ASLI
// (>=12 digit berurutan) alih-alih pola contoh ("**** **** 8829"), maskir
// semua kecuali 4 digit terakhir sebelum disimpan ke localStorage.
export function maskCardNumber(input: string): string {
  const digits = input.replace(/\D/g, "")
  if (digits.length >= 12) {
    return `**** **** **** ${digits.slice(-4)}`
  }
  return input
}

export function formatIdDate(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input
  if (isNaN(d.getTime())) return "-"
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
}

interface CardMeta {
  cardNumber: string
  cardHolder: string
  expiration: string
}

function readCardMeta(): Record<string, CardMeta> {
  if (typeof window === "undefined") return {}
  try {
    return JSON.parse(localStorage.getItem(BASE_STORAGE_KEYS.CARD_META) || "{}")
  } catch {
    return {}
  }
}

// writeCardMeta() dihapus — nomor/pemilik/expiry kartu sekarang kolom Supabase
// asli (`accounts.card_number`/`card_holder`/`expiration`, di-mask sebelum
// disimpan — lihat maskCardNumber()). readCardMeta() tetap ada hanya untuk
// backfill sekali dari cache lama (lihat accountService.getAll).

// Turunkan kategori akun ("bank" | "cash" | "ewallet") dari label tipe.
function deriveAccountCategory(type: string): FinancialAccountRecord["accountCategory"] {
  const t = type.toLowerCase()
  if (t.includes("wallet") || t.includes("digital") || t.includes("gopay") || t.includes("dana")) return "ewallet"
  if (t.includes("tunai") || t.includes("cash") || t.includes("dompet")) return "cash"
  return "bank"
}

// Automatic cleanup of legacy global keys containing old mock data
if (typeof window !== "undefined") {
  try {
    localStorage.removeItem(BASE_STORAGE_KEYS.ACCOUNTS)
    localStorage.removeItem(BASE_STORAGE_KEYS.TRANSACTIONS)
    localStorage.removeItem(BASE_STORAGE_KEYS.GOALS)
    localStorage.removeItem(BASE_STORAGE_KEYS.SCHEDULED)
    localStorage.removeItem(BASE_STORAGE_KEYS.SHARED_TX)
    localStorage.removeItem(BASE_STORAGE_KEYS.REQUIREMENTS)
    localStorage.removeItem(BASE_STORAGE_KEYS.ROOM)
  } catch {
    // Ignore error
  }
}

// Helper to get User-Scoped Storage Key
function getUserStorageKey(baseKey: string): string {
  if (typeof window === "undefined") return baseKey
  const storedUser = localStorage.getItem(BASE_STORAGE_KEYS.USER)
  if (!storedUser) return `${baseKey}_guest`
  try {
    const user: UserSession = JSON.parse(storedUser)
    const safeUserEmail = user.email.replace(/[^a-zA-Z0-9]/g, "_")
    return `${baseKey}_usr_${safeUserEmail}`
  } catch {
    return `${baseKey}_guest`
  }
}

// Helper for local session saving
function saveLocalUserSession(session: UserSession): UserSession {
  if (typeof window !== "undefined") {
    localStorage.setItem(BASE_STORAGE_KEYS.USER, JSON.stringify(session))
  }
  return session
}

// ==========================================================
// 1. AUTH SERVICE (Login, Signup, Logout, Session)
// ==========================================================
export const authService = {
  async signup(
    fullName: string,
    email: string,
    password: string,
  ): Promise<{ user: UserSession | null; needsConfirmation?: boolean; error: string | null }> {
    // Supabase dikonfigurasi → HARUS lewat Supabase Auth. Tidak ada lagi
    // "fallback sesi palsu" saat jaringan bermasalah (itu lubang keamanan).
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo:
              typeof window !== "undefined"
                ? `${window.location.origin}/auth/confirm`
                : undefined,
            data: { full_name: fullName },
          },
        })

        if (error) {
          return { user: null, error: error.message }
        }

        if (!data.user) {
          return { user: null, error: "Pendaftaran gagal. Coba lagi." }
        }

        const session: UserSession = {
          id: data.user.id,
          fullName: fullName || data.user.email || "User",
          email: data.user.email || email,
        }

        // Ada sesi = konfirmasi email dimatikan → langsung login.
        // Tidak ada sesi = user harus konfirmasi email dulu.
        if (data.session) {
          saveLocalUserSession(session)
          return { user: session, error: null }
        }
        return { user: session, needsConfirmation: true, error: null }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Tidak bisa terhubung ke server."
        return { user: null, error: `Gagal mendaftar: ${message}` }
      }
    }

    // Mode lokal (Supabase tidak dikonfigurasi sama sekali).
    const localSession = saveLocalUserSession({
      id: `usr_${Date.now()}`,
      fullName,
      email,
    })
    return { user: localSession, error: null }
  },

  async login(
    email: string,
    password: string,
  ): Promise<{ user: UserSession | null; error: string | null }> {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (error) {
          return { user: null, error: error.message }
        }

        if (!data.user) {
          return { user: null, error: "Email atau kata sandi salah." }
        }

        const session: UserSession = {
          id: data.user.id,
          fullName:
            data.user.user_metadata?.full_name ||
            data.user.email?.split("@")[0] ||
            "User",
          email: data.user.email || email,
        }
        saveLocalUserSession(session)
        return { user: session, error: null }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Tidak bisa terhubung ke server."
        return { user: null, error: `Gagal masuk: ${message}` }
      }
    }

    // Mode lokal (Supabase tidak dikonfigurasi sama sekali).
    const localSession = saveLocalUserSession({
      id: `usr_${Date.now()}`,
      fullName: email.split("@")[0] || "User",
      email,
    })
    return { user: localSession, error: null }
  },

  async logout(): Promise<void> {
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.auth.signOut()
      } catch {
        // Abaikan error jaringan saat logout
      }
    }
    if (typeof window !== "undefined") {
      localStorage.removeItem(BASE_STORAGE_KEYS.USER)
    }
  },

  /**
   * User untuk kebutuhan UI (nama, email). Sumber kebenaran keamanan tetap
   * sesi Supabase yang diverifikasi di `proxy.ts`, bukan nilai ini.
   */
  getCurrentUser(): UserSession | null {
    if (typeof window === "undefined") return null
    const stored = localStorage.getItem(BASE_STORAGE_KEYS.USER)
    if (!stored) return null
    try {
      return JSON.parse(stored)
    } catch {
      return null
    }
  },

  /** Ambil user Supabase yang terverifikasi (async, memanggil server Auth). */
  async getVerifiedUser(): Promise<UserSession | null> {
    if (!isSupabaseConfigured || !supabase) return this.getCurrentUser()
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return null
      const session: UserSession = {
        id: user.id,
        fullName:
          user.user_metadata?.full_name || user.email?.split("@")[0] || "User",
        email: user.email || "",
      }
      saveLocalUserSession(session)
      return session
    } catch {
      return this.getCurrentUser()
    }
  },
}

// ==========================================================
// 2. ACCOUNT SERVICE (User-Scoped Sumber Dana / Accounts)
// ==========================================================
// Kolom `accounts` yang ADA di skema: id, user_id, name, type, balance, color.
// Nomor/pemilik/expiry kartu tidak punya kolom → disimpan di sidecar lokal
// (`readCardMeta`/`writeCardMeta`), hanya dekorasi. `color` menyimpan cardDesignType.
export const accountService = {
  async getAll(): Promise<FinancialAccountRecord[]> {
    const currentUser = authService.getCurrentUser()
    if (isSupabaseConfigured && supabase && currentUser?.id && currentUser.id.includes("-")) {
      try {
        const { data, error } = await supabase
          .from("accounts")
          .select("*")
          .eq("user_id", currentUser.id)
          .order("created_at", { ascending: false })

        if (!error && data) {
          // Sidecar CARD_META lama — hanya dipakai untuk BACKFILL sekali dari device
          // yang masih punya cache lama, sebelum kolom `accounts.card_number` dkk ada.
          // Sumber kebenaran sekarang kolom Supabase (sinkron antar device).
          const legacyMeta = readCardMeta()
          const backfills: Array<{ id: string; meta: CardMeta }> = []
          const mapped: FinancialAccountRecord[] = data.map((a) => {
            const legacy = legacyMeta[a.id as string]
            const cardNumber = a.card_number || legacy?.cardNumber || "**** **** 0000"
            const cardHolder = a.card_holder || legacy?.cardHolder || currentUser.fullName || "USER"
            const expiration = a.expiration || legacy?.expiration || "12/29"
            if (!a.card_number && legacy) {
              backfills.push({ id: a.id as string, meta: { cardNumber, cardHolder, expiration } })
            }
            return {
              id: a.id,
              name: a.name,
              type: a.type,
              accountCategory: deriveAccountCategory(a.type || ""),
              balance: Number(a.balance),
              cardNumber,
              cardHolder,
              expiration,
              cardDesignType: (a.color as FinancialAccountRecord["cardDesignType"]) || "brand-dark",
              cardNetwork: normalizeCardNetwork(a.card_network),
            }
          })
          if (typeof window !== "undefined") {
            localStorage.setItem(
              getUserStorageKey(BASE_STORAGE_KEYS.ACCOUNTS),
              JSON.stringify(mapped),
            )
          }
          // Backfill best-effort (tidak diblokir/di-await oleh pemanggil) — sekali
          // migrasi selesai, sidecar CARD_META boleh dihapus total dari codebase.
          for (const b of backfills) {
            supabase
              .from("accounts")
              .update({
                card_number: maskCardNumber(b.meta.cardNumber),
                card_holder: b.meta.cardHolder,
                expiration: b.meta.expiration,
              })
              .eq("id", b.id)
              .then(() => {})
          }
          return mapped
        }
      } catch (err) {
        console.warn("Supabase accounts query fallback:", err)
      }
    }

    if (typeof window === "undefined") return []
    const stored = localStorage.getItem(getUserStorageKey(BASE_STORAGE_KEYS.ACCOUNTS))
    if (!stored) return []
    try {
      return JSON.parse(stored)
    } catch {
      return []
    }
  },

  /**
   * @throws Error kalau Supabase dikonfigurasi tapi insert gagal (sesi tidak
   *   valid / RLS / jaringan) — TIDAK LAGI diam-diam jatuh ke record lokal
   *   palsu yang terlihat "berhasil" padahal tak pernah tersimpan di server.
   */
  async add(item: Omit<FinancialAccountRecord, "id">): Promise<FinancialAccountRecord> {
    const currentUser = authService.getCurrentUser()

    if (isSupabaseConfigured && supabase) {
      if (!currentUser?.id || !currentUser.id.includes("-")) {
        throw new Error("Sesi tidak valid. Silakan login ulang.")
      }
      const { data, error } = await supabase
        .from("accounts")
        .insert([
          {
            user_id: currentUser.id,
            name: item.name,
            type: item.type,
            balance: item.balance,
            color: item.cardDesignType,
            card_network: item.cardNetwork,
            card_number: maskCardNumber(item.cardNumber),
            card_holder: item.cardHolder,
            expiration: item.expiration,
          },
        ])
        .select()
        .single()

      if (error || !data) {
        console.error("Supabase account insert error:", error)
        throw new Error("Gagal menambah sumber dana. Coba lagi.")
      }

      const newRecord: FinancialAccountRecord = {
        id: data.id,
        name: data.name,
        type: data.type,
        accountCategory: deriveAccountCategory(data.type || item.type),
        balance: Number(data.balance),
        cardNumber: data.card_number || item.cardNumber,
        cardHolder: data.card_holder || item.cardHolder,
        expiration: data.expiration || item.expiration,
        cardDesignType: (data.color as FinancialAccountRecord["cardDesignType"]) || item.cardDesignType,
        cardNetwork: data.card_network ? normalizeCardNetwork(data.card_network) : item.cardNetwork,
      }
      const list = await this.getAll()
      const updated = [newRecord, ...list.filter((a) => a.id !== newRecord.id)]
      if (typeof window !== "undefined") {
        localStorage.setItem(getUserStorageKey(BASE_STORAGE_KEYS.ACCOUNTS), JSON.stringify(updated))
      }
      return newRecord
    }

    // Mode lokal murni (Supabase TIDAK dikonfigurasi sama sekali, mis. dev tanpa
    // .env) — localStorage sengaja jadi source of truth di sini. Beda dari
    // fallback diam-diam saat request Supabase asli gagal (sudah dihapus di atas).
    const newRecord: FinancialAccountRecord = { ...item, id: localId("ACC") }
    const list = await this.getAll()
    const updated = [newRecord, ...list.filter((a) => a.id !== newRecord.id)]
    if (typeof window !== "undefined") {
      localStorage.setItem(getUserStorageKey(BASE_STORAGE_KEYS.ACCOUNTS), JSON.stringify(updated))
    }
    return newRecord
  },

  async updateBalanceByName(name: string, newBalance: number): Promise<void> {
    const currentUser = authService.getCurrentUser()
    if (isSupabaseConfigured && supabase && currentUser?.id && currentUser.id.includes("-")) {
      try {
        await supabase
          .from("accounts")
          .update({ balance: newBalance })
          .eq("user_id", currentUser.id)
          .eq("name", name)
      } catch (err) {
        console.warn("Supabase update balance error:", err)
      }
    }

    const list = await this.getAll()
    const updated = list.map((a) => (a.name === name ? { ...a, balance: newBalance } : a))
    if (typeof window !== "undefined") {
      localStorage.setItem(
        getUserStorageKey(BASE_STORAGE_KEYS.ACCOUNTS),
        JSON.stringify(updated),
      )
    }
  },

  /**
   * Ubah saldo akun secara relatif (delta bisa negatif). Dipakai otomatis oleh
   * `transactionService.add` supaya saldo akun ikut bergerak saat ada transaksi.
   * Match akun berdasarkan nama (yang dipilih user di form).
   */
  async adjustBalanceByName(name: string, delta: number): Promise<void> {
    if (!name || delta === 0) return
    const list = await this.getAll()
    const acc = list.find((a) => a.name === name)
    if (!acc) return // akun tidak dikenal (mis. default "Bank BCA" padahal belum dibuat)
    const next = Math.round((acc.balance + delta) * 100) / 100
    await this.updateBalanceByName(name, next)
  },

  /** Ubah detail satu sumber dana (nama, tipe, saldo, desain, detail kartu). */
  async update(
    id: string,
    patch: Partial<Pick<
      FinancialAccountRecord,
      "name" | "type" | "balance" | "cardNumber" | "cardHolder" | "expiration" | "cardDesignType" | "cardNetwork"
    >>,
  ): Promise<void> {
    const list = await this.getAll()
    const before = list.find((a) => a.id === id)
    if (!before) return

    if (isSupabaseConfigured && supabase && id.includes("-")) {
      const upd: Record<string, unknown> = {}
      if (patch.name !== undefined) upd.name = patch.name
      if (patch.type !== undefined) upd.type = patch.type
      if (patch.balance !== undefined) upd.balance = patch.balance
      if (patch.cardDesignType !== undefined) upd.color = patch.cardDesignType
      if (patch.cardNetwork !== undefined) upd.card_network = patch.cardNetwork
      if (patch.cardNumber !== undefined) upd.card_number = maskCardNumber(patch.cardNumber)
      if (patch.cardHolder !== undefined) upd.card_holder = patch.cardHolder
      if (patch.expiration !== undefined) upd.expiration = patch.expiration
      if (Object.keys(upd).length) {
        const { error } = await supabase.from("accounts").update(upd).eq("id", id)
        if (error) {
          console.error("account update error:", error)
          throw new Error("Gagal menyimpan perubahan sumber dana. Coba lagi.")
        }
      }
    }

    const updated = list.map((a) =>
      a.id === id
        ? {
            ...a,
            ...patch,
            accountCategory: patch.type ? deriveAccountCategory(patch.type) : a.accountCategory,
          }
        : a,
    )
    if (typeof window !== "undefined") {
      localStorage.setItem(
        getUserStorageKey(BASE_STORAGE_KEYS.ACCOUNTS),
        JSON.stringify(updated),
      )
      // Nama akun berubah → sesuaikan cache transaksi lokal supaya label ikut.
      if (patch.name && patch.name !== before.name) {
        try {
          const txKey = getUserStorageKey(BASE_STORAGE_KEYS.TRANSACTIONS)
          const txs = (JSON.parse(localStorage.getItem(txKey) || "[]") as TransactionRecord[]).map(
            (t) => (t.account === before.name ? { ...t, account: patch.name as string } : t),
          )
          localStorage.setItem(txKey, JSON.stringify(txs))
        } catch {
          // ignore
        }
      }
    }
  },

  /**
   * Hapus satu sumber dana. Transaksi yang terkait tetap ada — kolom `account_id`
   * di-set NULL otomatis oleh FK (label sumbernya jadi "—").
   */
  async remove(id: string): Promise<void> {
    const list = await this.getAll()
    const target = list.find((a) => a.id === id)
    if (!target) return

    if (isSupabaseConfigured && supabase && id.includes("-")) {
      const { error } = await supabase.from("accounts").delete().eq("id", id)
      if (error) {
        console.error("account remove error:", error)
        throw new Error("Gagal menghapus sumber dana. Coba lagi.")
      }
    }

    const updated = list.filter((a) => a.id !== id)
    if (typeof window !== "undefined") {
      localStorage.setItem(getUserStorageKey(BASE_STORAGE_KEYS.ACCOUNTS), JSON.stringify(updated))
    }
  },
}

// ==========================================================
// 3. TRANSACTIONS SERVICE (User-Scoped Database Arus Kas)
// ==========================================================
// Skema `transactions`: pakai `account_id` (uuid → accounts.id), TIDAK ada kolom
// `account` teks. Nama akun untuk UI di-resolve dari embed `accounts(name)`.
export const transactionService = {
  async getAll(): Promise<TransactionRecord[]> {
    const currentUser = authService.getCurrentUser()
    if (isSupabaseConfigured && supabase && currentUser?.id && currentUser.id.includes("-")) {
      try {
        const { data, error } = await supabase
          .from("transactions")
          .select("*, accounts(name)")
          .eq("user_id", currentUser.id)
          .order("date", { ascending: false })
          .order("created_at", { ascending: false })

        if (!error && data) {
          // notes disimpan MENTAH (dengan penanda ledger split bill).
          // Pembersihan untuk tampilan dilakukan di komponen via stripLedgerRef().
          const mapped: TransactionRecord[] = data.map((t) => ({
            id: t.id,
            title: t.title,
            category: t.category,
            type: t.type as "in" | "out",
            amount: Number(t.amount),
            account: (t.accounts as { name?: string } | null)?.name || "—",
            date: t.date,
            formattedDate: formatIdDate(t.date),
            notes: t.notes || "",
          }))
          if (typeof window !== "undefined") {
            localStorage.setItem(
              getUserStorageKey(BASE_STORAGE_KEYS.TRANSACTIONS),
              JSON.stringify(mapped),
            )
          }
          return mapped
        }
      } catch (err) {
        console.warn("Supabase transactions query fallback:", err)
      }
    }

    if (typeof window === "undefined") return []
    const stored = localStorage.getItem(getUserStorageKey(BASE_STORAGE_KEYS.TRANSACTIONS))
    if (!stored) return []
    try {
      return JSON.parse(stored)
    } catch {
      return []
    }
  },

  /** Notes semua transaksi (mentah, dengan penanda) untuk rekonsiliasi ledger. */
  async _rawNotes(): Promise<string[]> {
    const currentUser = authService.getCurrentUser()
    if (isSupabaseConfigured && supabase && currentUser?.id && currentUser.id.includes("-")) {
      try {
        const { data } = await supabase
          .from("transactions")
          .select("notes")
          .eq("user_id", currentUser.id)
        if (data) return data.map((t: { notes?: string }) => t.notes || "")
      } catch {
        // fall through
      }
    }
    return (await this.getAll()).map((t) => t.notes || "")
  },

  /**
   * Hapus transaksi milik user yang notes-nya cocok `pattern`, sekaligus
   * mengembalikan efeknya ke saldo akun (kebalikan dari `add`). Dipakai untuk
   * migrasi entri ledger split-bill model lama.
   */
  async _purgeByNotePattern(pattern: RegExp): Promise<void> {
    const currentUser = authService.getCurrentUser()

    type Row = { id: string; notes: string; type: "in" | "out"; amount: number; account: string }
    let rows: Row[] = []

    if (isSupabaseConfigured && supabase && currentUser?.id && currentUser.id.includes("-")) {
      try {
        const { data } = await supabase
          .from("transactions")
          .select("id, notes, type, amount, account_id, accounts(name)")
          .eq("user_id", currentUser.id)
        rows = (data || [])
          .filter((t: { notes?: string }) => pattern.test(t.notes || ""))
          .map((t: Record<string, unknown>) => ({
            id: t.id as string,
            notes: (t.notes as string) || "",
            type: t.type as "in" | "out",
            amount: Number(t.amount),
            account: (t.accounts as { name?: string } | null)?.name || "",
          }))
        for (const r of rows) {
          if (r.id.includes("-")) {
            await supabase.from("transactions").delete().eq("id", r.id)
          }
        }
      } catch (err) {
        console.warn("_purgeByNotePattern exception:", err)
      }
    } else if (typeof window !== "undefined") {
      try {
        rows = (JSON.parse(
          localStorage.getItem(getUserStorageKey(BASE_STORAGE_KEYS.TRANSACTIONS)) || "[]",
        ) as TransactionRecord[])
          .filter((t) => pattern.test(t.notes || ""))
          .map((t) => ({ id: t.id, notes: t.notes || "", type: t.type, amount: t.amount, account: t.account }))
      } catch {
        rows = []
      }
    }

    // Balikkan efek ke saldo: entri "out" dulu mengurangi → sekarang tambah lagi.
    for (const r of rows) {
      const delta = r.type === "out" ? r.amount : -r.amount
      await accountService.adjustBalanceByName(r.account, delta)
    }

    // Bersihkan cache lokal.
    if (typeof window !== "undefined" && rows.length > 0) {
      try {
        const key = getUserStorageKey(BASE_STORAGE_KEYS.TRANSACTIONS)
        const ids = new Set(rows.map((r) => r.id))
        const kept = (JSON.parse(localStorage.getItem(key) || "[]") as TransactionRecord[]).filter(
          (t) => !ids.has(t.id),
        )
        localStorage.setItem(key, JSON.stringify(kept))
      } catch {
        // ignore
      }
    }
  },

  /**
   * @param opts.adjustBalance default `true` — saldo akun terkait ikut berubah
   *   (`out` → berkurang, `in` → bertambah). Set `false` khusus untuk transfer
   *   antar akun yang sudah menyesuaikan saldo sendiri.
   * @throws Error kalau Supabase dikonfigurasi tapi insert gagal — TIDAK LAGI
   *   diam-diam jatuh ke record lokal palsu. Pemanggil auto-log (goal deposit,
   *   bayar tagihan, reconcile split bill) membungkus panggilan ini sendiri
   *   dengan try/catch supaya satu auto-log gagal tidak merusak alur lain;
   *   panggilan langsung dari halaman /transaksi SENGAJA dibiarkan melempar
   *   supaya usernya lihat errornya, bukan entri yang terlihat tersimpan
   *   padahal tidak pernah sampai ke server.
   */
  async add(
    item: Omit<TransactionRecord, "id">,
    opts: { adjustBalance?: boolean } = {},
  ): Promise<TransactionRecord> {
    const { adjustBalance = true } = opts
    const currentUser = authService.getCurrentUser()

    if (isSupabaseConfigured && supabase) {
      if (!currentUser?.id || !currentUser.id.includes("-")) {
        throw new Error("Sesi tidak valid. Silakan login ulang.")
      }
      // Resolve nama akun → account_id.
      let accountId: string | null = null
      if (item.account) {
        const accs = await accountService.getAll()
        accountId = accs.find((a) => a.name === item.account)?.id || null
        if (accountId && !accountId.includes("-")) accountId = null // id lokal, bukan uuid
      }

      const { data, error } = await supabase
        .from("transactions")
        .insert([
          {
            user_id: currentUser.id,
            account_id: accountId,
            title: item.title,
            category: item.category,
            type: item.type,
            amount: item.amount,
            date: item.date || todayLocalISO(),
            notes: item.notes || "",
          },
        ])
        .select("*, accounts(name)")
        .single()

      if (error || !data) {
        console.error("Supabase transaction insert error:", error)
        throw new Error("Gagal menyimpan transaksi. Coba lagi.")
      }

      const newRecord: TransactionRecord = {
        id: data.id,
        title: data.title,
        category: data.category,
        type: data.type as "in" | "out",
        amount: Number(data.amount),
        account: (data.accounts as { name?: string } | null)?.name || item.account,
        date: data.date,
        formattedDate: formatIdDate(data.date),
        notes: data.notes || "",
      }

      if (adjustBalance && item.account) {
        const delta = item.type === "in" ? item.amount : -item.amount
        await accountService.adjustBalanceByName(item.account, delta)
      }

      const list = await this.getAll()
      const updated = [newRecord, ...list.filter((t) => t.id !== newRecord.id)]
      if (typeof window !== "undefined") {
        localStorage.setItem(getUserStorageKey(BASE_STORAGE_KEYS.TRANSACTIONS), JSON.stringify(updated))
      }
      return newRecord
    }

    // Mode lokal murni (Supabase TIDAK dikonfigurasi sama sekali).
    const newRecord: TransactionRecord = { ...item, id: localId("TX") }
    if (adjustBalance && item.account) {
      const delta = item.type === "in" ? item.amount : -item.amount
      await accountService.adjustBalanceByName(item.account, delta)
    }
    const list = await this.getAll()
    const updated = [newRecord, ...list.filter((t) => t.id !== newRecord.id)]
    if (typeof window !== "undefined") {
      localStorage.setItem(getUserStorageKey(BASE_STORAGE_KEYS.TRANSACTIONS), JSON.stringify(updated))
    }
    return newRecord
  },

  async clearAll(): Promise<void> {
    const currentUser = authService.getCurrentUser()
    if (isSupabaseConfigured && supabase && currentUser?.id && currentUser.id.includes('-')) {
      try {
        await supabase.from('transactions').delete().eq('user_id', currentUser.id)
      } catch (err) {
        console.warn("Supabase clearAll transactions error:", err)
      }
    }
    if (typeof window !== "undefined") {
      const key = getUserStorageKey(BASE_STORAGE_KEYS.TRANSACTIONS)
      localStorage.removeItem(key)
    }
  },

  /**
   * Ubah satu transaksi manual. Menyeimbangkan saldo akun: efek lama dibatalkan,
   * efek baru diterapkan (termasuk bila akun sumbernya diganti).
   */
  async update(
    id: string,
    patch: Partial<Pick<TransactionRecord, "title" | "category" | "type" | "amount" | "account" | "date" | "notes">>,
  ): Promise<void> {
    const list = await this.getAll()
    const before = list.find((t) => t.id === id)
    if (!before) return
    const after = { ...before, ...patch }

    if (isSupabaseConfigured && supabase && id.includes("-")) {
      const upd: Record<string, unknown> = {}
      if (patch.title !== undefined) upd.title = patch.title
      if (patch.category !== undefined) upd.category = patch.category
      if (patch.type !== undefined) upd.type = patch.type
      if (patch.amount !== undefined) upd.amount = patch.amount
      if (patch.date !== undefined) upd.date = patch.date
      if (patch.notes !== undefined) upd.notes = patch.notes
      if (patch.account !== undefined && patch.account !== before.account) {
        const accs = await accountService.getAll()
        let accId = accs.find((a) => a.name === patch.account)?.id || null
        if (accId && !accId.includes("-")) accId = null
        upd.account_id = accId
      }
      if (Object.keys(upd).length) {
        const { error } = await supabase.from("transactions").update(upd).eq("id", id)
        if (error) {
          console.error("transaction update error:", error)
          throw new Error("Gagal menyimpan perubahan transaksi. Coba lagi.")
        }
      }
    }

    // Saldo: batalkan efek lama, terapkan efek baru. (Baru dilakukan SETELAH
    // Supabase sukses — supaya saldo tidak pernah menyimpang dari data server.)
    const oldDelta = before.type === "in" ? before.amount : -before.amount
    const newDelta = after.type === "in" ? after.amount : -after.amount
    if (before.account === after.account) {
      await accountService.adjustBalanceByName(after.account, newDelta - oldDelta)
    } else {
      await accountService.adjustBalanceByName(before.account, -oldDelta)
      await accountService.adjustBalanceByName(after.account, newDelta)
    }

    const updated = list.map((t) =>
      t.id === id ? { ...after, formattedDate: formatIdDate(after.date) } : t,
    )
    if (typeof window !== "undefined") {
      localStorage.setItem(
        getUserStorageKey(BASE_STORAGE_KEYS.TRANSACTIONS),
        JSON.stringify(updated),
      )
    }
  },

  /** Hapus satu transaksi & kembalikan efeknya ke saldo akun. */
  async remove(id: string): Promise<void> {
    const list = await this.getAll()
    const target = list.find((t) => t.id === id)
    if (!target) return

    if (isSupabaseConfigured && supabase && id.includes("-")) {
      const { error } = await supabase.from("transactions").delete().eq("id", id)
      if (error) {
        console.error("transaction remove error:", error)
        throw new Error("Gagal menghapus transaksi. Coba lagi.")
      }
    }

    const delta = target.type === "out" ? target.amount : -target.amount
    await accountService.adjustBalanceByName(target.account, delta)

    const updated = list.filter((t) => t.id !== id)
    if (typeof window !== "undefined") {
      localStorage.setItem(
        getUserStorageKey(BASE_STORAGE_KEYS.TRANSACTIONS),
        JSON.stringify(updated),
      )
    }
  },

  /**
   * Hapus transaksi pribadi ber-penanda `[#sbS:*]` yang kuncinya TIDAK ada di
   * `validKeys` — artinya split bill sumbernya sudah dihapus atau diedit (sehingga
   * id split-nya berganti). Efek ke saldo dikembalikan. Dipakai reconcileRoomLedger.
   */
  async _purgeSbOrphans(validKeys: Set<string>): Promise<void> {
    const currentUser = authService.getCurrentUser()
    type Row = { id: string; notes: string; type: "in" | "out"; amount: number; account: string }
    let rows: Row[] = []

    if (isSupabaseConfigured && supabase && currentUser?.id && currentUser.id.includes("-")) {
      try {
        const { data } = await supabase
          .from("transactions")
          .select("id, notes, type, amount, accounts(name)")
          .eq("user_id", currentUser.id)
          .ilike("notes", "%[#sbS:%")
        rows = (data || []).map((t: Record<string, unknown>) => ({
          id: t.id as string,
          notes: (t.notes as string) || "",
          type: t.type as "in" | "out",
          amount: Number(t.amount),
          account: (t.accounts as { name?: string } | null)?.name || "",
        }))
      } catch (err) {
        console.warn("_purgeSbOrphans exception:", err)
        return
      }
    } else if (typeof window !== "undefined") {
      try {
        rows = (JSON.parse(
          localStorage.getItem(getUserStorageKey(BASE_STORAGE_KEYS.TRANSACTIONS)) || "[]",
        ) as TransactionRecord[])
          .filter((t) => /\[#sbS:/i.test(t.notes || ""))
          .map((t) => ({ id: t.id, notes: t.notes || "", type: t.type, amount: t.amount, account: t.account }))
      } catch {
        rows = []
      }
    }

    const orphans = rows.filter((r) => {
      const m = r.notes.match(/\[#sbS:([a-z0-9]{3,16})\]/i)
      return m ? !validKeys.has(`sbs:${m[1].toLowerCase()}`) : false
    })
    if (orphans.length === 0) return

    for (const r of orphans) {
      if (isSupabaseConfigured && supabase && r.id.includes("-")) {
        try {
          await supabase.from("transactions").delete().eq("id", r.id)
        } catch {
          // ignore
        }
      }
      const delta = r.type === "out" ? r.amount : -r.amount
      await accountService.adjustBalanceByName(r.account, delta)
    }

    if (typeof window !== "undefined") {
      try {
        const key = getUserStorageKey(BASE_STORAGE_KEYS.TRANSACTIONS)
        const ids = new Set(orphans.map((o) => o.id))
        const kept = (JSON.parse(localStorage.getItem(key) || "[]") as TransactionRecord[]).filter(
          (t) => !ids.has(t.id),
        )
        localStorage.setItem(key, JSON.stringify(kept))
      } catch {
        // ignore
      }
    }
  },
}

// ==========================================================
// 4. GOALS SERVICE (User-Scoped Database Nabung & Target)
// ==========================================================
export const goalService = {
  async getAll(): Promise<GoalRecord[]> {
    const currentUser = authService.getCurrentUser()
    if (isSupabaseConfigured && supabase && currentUser?.id && currentUser.id.includes('-')) {
      try {
        const { data, error } = await supabase
          .from('goals')
          .select('*')
          .eq('user_id', currentUser.id)
          .order('created_at', { ascending: false })

        if (!error && data) {
          const mapped: GoalRecord[] = data.map((g) => ({
            id: g.id,
            title: g.title,
            category: g.category,
            targetAmount: Number(g.target_amount),
            currentAmount: Number(g.current_amount),
            deadline: g.deadline || "",
            status: g.status as GoalRecord["status"],
          }))
          if (typeof window !== "undefined") {
            const key = getUserStorageKey(BASE_STORAGE_KEYS.GOALS)
            localStorage.setItem(key, JSON.stringify(mapped))
          }
          return mapped
        }
      } catch (err) {
        console.warn("Supabase goals query fallback:", err)
      }
    }

    if (typeof window === "undefined") return []
    const key = getUserStorageKey(BASE_STORAGE_KEYS.GOALS)
    const stored = localStorage.getItem(key)
    if (!stored) return []
    try {
      return JSON.parse(stored)
    } catch {
      return []
    }
  },

  /** @throws Error kalau Supabase dikonfigurasi tapi insert gagal. */
  async add(item: Omit<GoalRecord, "id" | "currentAmount" | "status">): Promise<GoalRecord> {
    const currentUser = authService.getCurrentUser()

    if (isSupabaseConfigured && supabase) {
      if (!currentUser?.id || !currentUser.id.includes("-")) {
        throw new Error("Sesi tidak valid. Silakan login ulang.")
      }
      const { data, error } = await supabase.from('goals').insert([{
        user_id: currentUser.id,
        title: item.title,
        category: item.category,
        target_amount: item.targetAmount,
        current_amount: 0,
        deadline: item.deadline,
        status: 'active',
      }]).select().single()

      if (error || !data) {
        console.error("Supabase goal insert error:", error)
        throw new Error("Gagal menambah target. Coba lagi.")
      }

      const newGoal: GoalRecord = {
        id: data.id,
        title: data.title,
        category: data.category,
        targetAmount: Number(data.target_amount),
        currentAmount: Number(data.current_amount),
        deadline: data.deadline || item.deadline,
        status: data.status as GoalRecord["status"],
      }
      const list = await this.getAll()
      const updated = [newGoal, ...list.filter(g => g.id !== newGoal.id)]
      if (typeof window !== "undefined") {
        localStorage.setItem(getUserStorageKey(BASE_STORAGE_KEYS.GOALS), JSON.stringify(updated))
      }
      return newGoal
    }

    // Mode lokal murni (Supabase TIDAK dikonfigurasi sama sekali).
    const newGoal: GoalRecord = { ...item, id: localId("G"), currentAmount: 0, status: "active" }
    const list = await this.getAll()
    const updated = [newGoal, ...list.filter(g => g.id !== newGoal.id)]
    if (typeof window !== "undefined") {
      localStorage.setItem(getUserStorageKey(BASE_STORAGE_KEYS.GOALS), JSON.stringify(updated))
    }
    return newGoal
  },

  /** @throws Error kalau Supabase dikonfigurasi tapi update/insert gagal — setoran
   *  TIDAK ditandai berhasil di cache lokal kalau server menolaknya. */
  async deposit(goalId: string, amount: number, accountName: string): Promise<void> {
    const list = await this.getAll()
    const targetGoal = list.find((g) => g.id === goalId)
    if (!targetGoal) return

    const nextAmt = targetGoal.currentAmount + amount
    const nextStatus: "active" | "almost" | "completed" =
      nextAmt >= targetGoal.targetAmount ? "completed" : nextAmt / targetGoal.targetAmount >= 0.75 ? "almost" : "active"

    if (isSupabaseConfigured && supabase && goalId.includes("-")) {
      const { error: goalErr } = await supabase
        .from("goals")
        .update({ current_amount: nextAmt, status: nextStatus })
        .eq("id", goalId)
      if (goalErr) {
        console.error("Supabase goal deposit error:", goalErr)
        throw new Error("Gagal mencatat setoran. Coba lagi.")
      }

      // Catat riwayat setoran ke saving_logs (RLS: goal milik user). Ini best-effort
      // (histori pelengkap) — goal utama sudah tersimpan di atas.
      try {
        const accs = await accountService.getAll()
        const accId = accs.find((a) => a.name === accountName)?.id || null
        await supabase.from("saving_logs").insert([
          {
            goal_id: goalId,
            account_id: accId && accId.includes("-") ? accId : null,
            amount,
            date: todayLocalISO(),
            auto_logged_to_transactions: true,
          },
        ])
      } catch (err) {
        console.warn("saving_logs insert gagal (setoran tetap tercatat di goal):", err)
      }
    }

    const updated = list.map((g) =>
      g.id === goalId ? { ...g, currentAmount: nextAmt, status: nextStatus } : g,
    )
    if (typeof window !== "undefined") {
      localStorage.setItem(
        getUserStorageKey(BASE_STORAGE_KEYS.GOALS),
        JSON.stringify(updated),
      )
    }

    // Auto-catat ke transaksi pribadi (mengurangi saldo akun sumber). Setoran
    // ke target sendiri (goals/saving_logs) sudah tersimpan di atas — kalau
    // auto-log ke transaksi pribadi ini gagal, jangan gagalkan seluruh setoran
    // (cuma catatan pelengkap); log saja supaya bisa ditelusuri.
    try {
      const accts = await accountService.getAll()
      await transactionService.add({
        title: `Setoran Tabungan: ${targetGoal.title}`,
        category: "Tabungan & Target",
        type: "out",
        amount,
        account: resolvePersonalAccount(accts, accountName),
        date: todayLocalISO(),
        formattedDate: formatIdDate(new Date()),
        notes: `Setoran otomatis ke target ${targetGoal.title} [#auto]`,
      })
    } catch (err) {
      console.error("goal deposit: auto-log ke transaksi pribadi gagal:", err)
    }
  },

  /** Ubah detail target (judul, kategori, nominal target, tenggat). Status
   *  dihitung ulang terhadap `currentAmount` yang sudah terkumpul. */
  async update(
    id: string,
    patch: Partial<Pick<GoalRecord, "title" | "category" | "targetAmount" | "deadline">>,
  ): Promise<void> {
    const list = await this.getAll()
    const before = list.find((g) => g.id === id)
    if (!before) return
    const targetAmount = patch.targetAmount ?? before.targetAmount
    const status: GoalRecord["status"] =
      before.currentAmount >= targetAmount
        ? "completed"
        : targetAmount > 0 && before.currentAmount / targetAmount >= 0.75
          ? "almost"
          : "active"

    if (isSupabaseConfigured && supabase && id.includes("-")) {
      const upd: Record<string, unknown> = {}
      if (patch.title !== undefined) upd.title = patch.title
      if (patch.category !== undefined) upd.category = patch.category
      if (patch.deadline !== undefined) upd.deadline = patch.deadline
      if (patch.targetAmount !== undefined) {
        upd.target_amount = patch.targetAmount
        upd.status = status
      }
      if (Object.keys(upd).length) {
        const { error } = await supabase.from("goals").update(upd).eq("id", id)
        if (error) {
          console.error("goal update error:", error)
          throw new Error("Gagal menyimpan perubahan target. Coba lagi.")
        }
      }
    }

    const updated = list.map((g) =>
      g.id === id ? { ...g, ...patch, targetAmount, status } : g,
    )
    if (typeof window !== "undefined") {
      localStorage.setItem(getUserStorageKey(BASE_STORAGE_KEYS.GOALS), JSON.stringify(updated))
    }
  },

  /**
   * Hapus satu target (beserta riwayat setoran `saving_logs` — cascade). Transaksi
   * "Setoran Tabungan" yang sudah tercatat di log pribadi TIDAK ikut terhapus
   * (uang memang sudah berpindah).
   */
  async remove(id: string): Promise<void> {
    if (isSupabaseConfigured && supabase && id.includes("-")) {
      const { error } = await supabase.from("goals").delete().eq("id", id)
      if (error) {
        console.error("goal remove error:", error)
        throw new Error("Gagal menghapus target. Coba lagi.")
      }
    }
    const list = await this.getAll()
    const updated = list.filter((g) => g.id !== id)
    if (typeof window !== "undefined") {
      localStorage.setItem(getUserStorageKey(BASE_STORAGE_KEYS.GOALS), JSON.stringify(updated))
    }
  },
}

// ==========================================================
// 5. SCHEDULED BILLS SERVICE (User-Scoped Scheduled Bills & Reminders)
// ==========================================================
export const scheduledService = {
  async getAll(): Promise<ScheduledBillRecord[]> {
    const currentUser = authService.getCurrentUser()
    if (isSupabaseConfigured && supabase && currentUser?.id && currentUser.id.includes('-')) {
      try {
        const { data, error } = await supabase
          .from('scheduled_payments')
          .select('*, accounts(name)')
          .eq('user_id', currentUser.id)
          .order('created_at', { ascending: false })

        if (!error && data) {
          // Sidecar SCHEDULED_META lama — hanya untuk backfill sekali dari device
          // yang masih punya cache lama. Sumber kebenaran sekarang kolom asli
          // (`account_id`, `notes`), sinkron antar device.
          const legacyMeta = readScheduledMeta()
          const backfills: Array<{ id: string; accountName?: string; notes?: string }> = []
          const mapped: ScheduledBillRecord[] = data.map((b) => {
            const legacy = legacyMeta[b.id as string]
            const accountName = (b.accounts as { name?: string } | null)?.name
            const account = accountName || legacy?.account || "Bank BCA"
            const notes = (b.notes as string) || legacy?.notes || ""
            if (!accountName && !b.notes && legacy) {
              backfills.push({ id: b.id as string, accountName: legacy.account, notes: legacy.notes })
            }
            return {
              id: b.id,
              title: b.title,
              amount: Number(b.amount),
              date: b.due_date,
              formattedDate: formatIdDate(b.due_date),
              category: b.category,
              account,
              status: b.status || "pending",
              notes,
            }
          })
          if (typeof window !== "undefined") {
            const key = getUserStorageKey(BASE_STORAGE_KEYS.SCHEDULED)
            localStorage.setItem(key, JSON.stringify(mapped))
          }
          // Backfill best-effort (tak diblokir pemanggil).
          for (const b of backfills) {
            ;(async () => {
              const upd: Record<string, unknown> = {}
              if (b.notes) upd.notes = b.notes
              if (b.accountName) {
                const accs = await accountService.getAll()
                const accId = accs.find((a) => a.name === b.accountName)?.id
                if (accId && accId.includes("-")) upd.account_id = accId
              }
              if (Object.keys(upd).length) {
                await supabase.from("scheduled_payments").update(upd).eq("id", b.id)
              }
            })()
          }
          return mapped
        }
      } catch (err) {
        console.warn("Supabase scheduled payments query fallback:", err)
      }
    }

    if (typeof window === "undefined") return []
    const key = getUserStorageKey(BASE_STORAGE_KEYS.SCHEDULED)
    const stored = localStorage.getItem(key)
    if (!stored) return []
    try {
      return JSON.parse(stored)
    } catch {
      return []
    }
  },

  /** @throws Error kalau Supabase dikonfigurasi tapi insert gagal. */
  async add(item: Omit<ScheduledBillRecord, "id">): Promise<ScheduledBillRecord> {
    const currentUser = authService.getCurrentUser()

    if (isSupabaseConfigured && supabase) {
      if (!currentUser?.id || !currentUser.id.includes("-")) {
        throw new Error("Sesi tidak valid. Silakan login ulang.")
      }
      let accountId: string | null = null
      if (item.account) {
        const accs = await accountService.getAll()
        accountId = accs.find((a) => a.name === item.account)?.id || null
        if (accountId && !accountId.includes("-")) accountId = null
      }

      const { data, error } = await supabase.from('scheduled_payments').insert([{
        user_id: currentUser.id,
        title: item.title,
        category: item.category,
        amount: item.amount,
        due_date: item.date,
        status: item.status || 'pending',
        account_id: accountId,
        notes: item.notes || null,
      }]).select('*, accounts(name)').single()

      if (error || !data) {
        console.error("Supabase scheduled payment insert error:", error)
        throw new Error("Gagal menambah jadwal tagihan. Coba lagi.")
      }

      const newBill: ScheduledBillRecord = {
        id: data.id,
        title: data.title,
        amount: Number(data.amount),
        date: data.due_date,
        formattedDate: item.formattedDate,
        category: data.category,
        account: (data.accounts as { name?: string } | null)?.name || item.account,
        status: data.status as "pending" | "paid",
        notes: (data.notes as string) || item.notes,
      }
      const list = await this.getAll()
      const updated = [newBill, ...list.filter(b => b.id !== newBill.id)]
      if (typeof window !== "undefined") {
        localStorage.setItem(getUserStorageKey(BASE_STORAGE_KEYS.SCHEDULED), JSON.stringify(updated))
      }
      return newBill
    }

    // Mode lokal murni (Supabase TIDAK dikonfigurasi sama sekali).
    const newBill: ScheduledBillRecord = { ...item, id: localId("SCH") }
    const list = await this.getAll()
    const updated = [newBill, ...list.filter(b => b.id !== newBill.id)]
    if (typeof window !== "undefined") {
      localStorage.setItem(getUserStorageKey(BASE_STORAGE_KEYS.SCHEDULED), JSON.stringify(updated))
    }
    return newBill
  },

  /** @throws Error kalau Supabase dikonfigurasi tapi update status gagal. */
  async pay(id: string): Promise<void> {
    const list = await this.getAll()
    const target = list.find((b) => b.id === id)
    if (!target) return

    if (isSupabaseConfigured && supabase && id.includes('-')) {
      const { error } = await supabase.from('scheduled_payments').update({ status: 'paid' }).eq('id', id)
      if (error) {
        console.error("Supabase scheduled payment pay error:", error)
        throw new Error("Gagal menandai tagihan lunas. Coba lagi.")
      }
    }

    const updated = list.map((b) => (b.id === id ? { ...b, status: "paid" as const } : b))
    if (typeof window !== "undefined") {
      const key = getUserStorageKey(BASE_STORAGE_KEYS.SCHEDULED)
      localStorage.setItem(key, JSON.stringify(updated))
    }

    // Auto-catat ke transaksi pribadi (mengurangi saldo akun). Status tagihan
    // (scheduled_payments) sudah "paid" di atas — kalau auto-log ini gagal,
    // jangan gagalkan seluruh aksi bayar; log saja supaya bisa ditelusuri.
    try {
      const accts = await accountService.getAll()
      await transactionService.add({
        title: `Pembayaran Tagihan: ${target.title}`,
        category: target.category,
        type: "out",
        amount: target.amount,
        account: resolvePersonalAccount(accts, target.account),
        date: todayLocalISO(),
        formattedDate: formatIdDate(new Date()),
        notes: `${target.notes || `Pelunasan jadwal tagihan ${target.title}`} [#auto]`,
      })
    } catch (err) {
      console.error("scheduled pay: auto-log ke transaksi pribadi gagal:", err)
    }
  },

  /** Ubah detail jadwal tagihan (judul, kategori, nominal, tempo, akun, catatan). */
  async update(
    id: string,
    patch: Partial<Pick<ScheduledBillRecord, "title" | "category" | "amount" | "date" | "account" | "notes">>,
  ): Promise<void> {
    const list = await this.getAll()
    const before = list.find((b) => b.id === id)
    if (!before) return

    if (isSupabaseConfigured && supabase && id.includes("-")) {
      const upd: Record<string, unknown> = {}
      if (patch.title !== undefined) upd.title = patch.title
      if (patch.category !== undefined) upd.category = patch.category
      if (patch.amount !== undefined) upd.amount = patch.amount
      if (patch.notes !== undefined) upd.notes = patch.notes
      if (patch.account !== undefined) {
        const accs = await accountService.getAll()
        const accId = accs.find((a) => a.name === patch.account)?.id
        upd.account_id = accId && accId.includes("-") ? accId : null
      }
      if (patch.date !== undefined) upd.due_date = toISODate(patch.date)
      if (Object.keys(upd).length) {
        const { error } = await supabase.from("scheduled_payments").update(upd).eq("id", id)
        if (error) {
          console.error("scheduled update error:", error)
          throw new Error("Gagal menyimpan perubahan jadwal tagihan. Coba lagi.")
        }
      }
    }

    const updated = list.map((b) =>
      b.id === id
        ? {
            ...b,
            ...patch,
            formattedDate: patch.date ? formatIdDate(toISODate(patch.date)) : b.formattedDate,
          }
        : b,
    )
    if (typeof window !== "undefined") {
      localStorage.setItem(getUserStorageKey(BASE_STORAGE_KEYS.SCHEDULED), JSON.stringify(updated))
    }
  },

  /** Hapus satu jadwal tagihan. Kalau sudah "paid", transaksi pembayarannya di
   *  log pribadi tetap ada. */
  async remove(id: string): Promise<void> {
    if (isSupabaseConfigured && supabase && id.includes("-")) {
      const { error } = await supabase.from("scheduled_payments").delete().eq("id", id)
      if (error) {
        console.error("scheduled remove error:", error)
        throw new Error("Gagal menghapus jadwal tagihan. Coba lagi.")
      }
    }
    const list = await this.getAll()
    const updated = list.filter((b) => b.id !== id)
    if (typeof window !== "undefined") {
      localStorage.setItem(getUserStorageKey(BASE_STORAGE_KEYS.SCHEDULED), JSON.stringify(updated))
    }
  },
}

// Helper: ubah teks tanggal bebas ("25 Aug 2026", "2026-08-25", dll) → "YYYY-MM-DD".
// Kolom `due_date` di Postgres bertipe date, jadi harus format valid; kalau gagal
// diparse, pakai tanggal hari ini.
export function toISODate(input: string): string {
  const parsed = new Date(input)
  if (!isNaN(parsed.getTime())) {
    return todayLocalISO(parsed)
  }
  return todayLocalISO()
}

// ==========================================================
// 6. KAMAR KOS SERVICE (User-Scoped Room Management & Split Bill)
// ==========================================================
export const kamarService = {
  /** Baca cepat (sinkron) status kamar dari cache lokal. */
  getUserRoom(): KamarRoomRecord | null {
    if (typeof window === "undefined") return null
    const key = getUserStorageKey(BASE_STORAGE_KEYS.ROOM)
    const stored = localStorage.getItem(key)
    if (!stored) return null
    try {
      return JSON.parse(stored)
    } catch {
      return null
    }
  },

  /**
   * Sinkronkan keanggotaan kamar dari Supabase ke cache lokal.
   * Dipanggil saat aplikasi dibuka supaya status "sudah gabung kamar mana"
   * ikut pindah antar device/browser (tidak lagi murni localStorage).
   * Mengembalikan kamar aktif (atau null bila user tidak tergabung di kamar mana pun).
   */
  async syncUserRoom(): Promise<KamarRoomRecord | null> {
    if (typeof window === "undefined") return null
    const key = getUserStorageKey(BASE_STORAGE_KEYS.ROOM)

    const currentUser = authService.getCurrentUser()
    if (!isSupabaseConfigured || !supabase || !currentUser?.id || !currentUser.id.includes("-")) {
      return this.getUserRoom()
    }

    try {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser()
      if (!authUser) return this.getUserRoom()

      const { data, error } = await supabase
        .from("room_members")
        .select("role, room_number, rooms(*)")
        .eq("user_id", authUser.id)
        .order("joined_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) {
        console.warn("syncUserRoom query error:", error)
        return this.getUserRoom()
      }

      if (!data || !data.rooms) {
        // User tidak (lagi) tergabung di kamar mana pun → bersihkan cache.
        localStorage.removeItem(key)
        window.dispatchEvent(new Event("room-updated"))
        return null
      }

      const r = data.rooms as unknown as {
        id: string
        name: string
        invite_code?: string
        code?: string
        location?: string
        monthly_fee?: number
        max_members?: number
      }
      const synced: KamarRoomRecord = {
        id: r.id,
        name: r.name,
        code: r.invite_code || r.code || "",
        location: r.location,
        monthlyFee: Number(r.monthly_fee ?? 0),
        maxMembers: Number(r.max_members ?? 4),
        role: (data.role as "Ketua Kos" | "Anggota") || "Anggota",
      }
      localStorage.setItem(key, JSON.stringify(synced))
      window.dispatchEvent(new Event("room-updated"))
      return synced
    } catch (err) {
      console.warn("syncUserRoom exception:", err)
      return this.getUserRoom()
    }
  },

  /** @throws Error kalau Supabase dikonfigurasi tapi pembuatan kamar gagal —
   *  TIDAK LAGI diam-diam mengembalikan kamar lokal palsu yang tak pernah ada
   *  di server (anggota lain tak akan pernah melihatnya). */
  async createRoom(name: string, location?: string, monthlyFee: number = 200000, maxMembers: number = 4): Promise<KamarRoomRecord> {
    const currentUser = authService.getCurrentUser()
    const code = `KOS-${Math.floor(100 + Math.random() * 900)}`

    if (isSupabaseConfigured && supabase) {
      const { data: authUser } = await supabase.auth.getUser()
      const sbUserId = authUser?.user?.id || currentUser?.id
      if (!sbUserId || !sbUserId.includes("-")) {
        throw new Error("Sesi tidak valid. Silakan login ulang.")
      }

      const { data, error } = await supabase.from('rooms').insert([{
        name,
        invite_code: code,
        location: location || '',
        monthly_fee: monthlyFee,
        max_members: maxMembers,
        created_by: sbUserId
      }]).select().single()

      if (error || !data) {
        console.error("Supabase createRoom insert error:", error)
        throw new Error("Gagal membuat kamar. Coba lagi.")
      }

      // Tambahkan pembuat sebagai Ketua Kos. Kalau gagal, hapus room yatim.
      const { error: memberErr } = await supabase.from('room_members').insert([{
        room_id: data.id,
        user_id: sbUserId,
        user_name: currentUser?.fullName || 'Saya',
        role: 'Ketua Kos',
        room_number: 'Kamar 01'
      }])
      if (memberErr) {
        console.error("Supabase createRoom member insert error, rolling back room:", memberErr)
        await supabase.from('rooms').delete().eq('id', data.id)
        throw new Error("Gagal membuat kamar. Coba lagi.")
      }

      const newRoom: KamarRoomRecord = {
        id: data.id,
        name: data.name,
        code: data.invite_code || data.code || code,
        location: data.location,
        monthlyFee: data.monthly_fee,
        maxMembers: data.max_members,
        role: "Ketua Kos",
      }
      if (typeof window !== "undefined") {
        localStorage.setItem(getUserStorageKey(BASE_STORAGE_KEYS.ROOM), JSON.stringify(newRoom))
        window.dispatchEvent(new Event("room-updated"))
      }
      return newRoom
    }

    // Mode lokal murni (Supabase TIDAK dikonfigurasi sama sekali).
    const newRoom: KamarRoomRecord = { id: localId("ROOM"), name, code, location, monthlyFee, maxMembers, role: "Ketua Kos" }
    if (typeof window !== "undefined") {
      localStorage.setItem(getUserStorageKey(BASE_STORAGE_KEYS.ROOM), JSON.stringify(newRoom))
      window.dispatchEvent(new Event("room-updated"))
    }
    return newRoom
  },

  async joinRoom(code: string): Promise<{ room: KamarRoomRecord | null; error: string | null }> {
    const currentUser = authService.getCurrentUser()
    const cleanCode = code.trim().toUpperCase()

    // Mode Supabase: kode HARUS valid — tidak lagi memalsukan kamar lokal.
    if (isSupabaseConfigured && supabase) {
      if (!currentUser?.id || !currentUser.id.includes("-")) {
        return { room: null, error: "Sesi tidak valid. Silakan login ulang." }
      }
      try {
        // Lewat RPC (bukan SELECT langsung ke `rooms`): sejak RLS dibatasi ke
        // anggota kamar (lihat migrasi fix_room_rls_scope_to_members), user yang
        // BELUM jadi anggota tidak bisa SELECT baris kamar tujuan secara langsung.
        const { data: roomRows, error: roomErr } = await supabase.rpc(
          "find_room_by_invite_code",
          { p_code: cleanCode },
        )

        if (roomErr) {
          return { room: null, error: "Gagal mencari kamar. Coba lagi." }
        }
        const roomData = roomRows?.[0]
        if (!roomData) {
          return { room: null, error: `Kode undangan "${cleanCode}" tidak ditemukan.` }
        }

        const joinedRoom: KamarRoomRecord = {
          id: roomData.id,
          name: roomData.name,
          code: roomData.invite_code || cleanCode,
          location: roomData.location,
          monthlyFee: Number(roomData.monthly_fee ?? 0),
          maxMembers: Number(roomData.max_members ?? 4),
          role: "Anggota",
        }

        const { error: memberErr } = await supabase.from("room_members").insert([
          {
            room_id: roomData.id,
            user_id: currentUser.id,
            user_name: currentUser.fullName || "Anggota",
            role: "Anggota",
            room_number: "Kamar Baru",
          },
        ])

        // 23505 = unique_violation → sudah jadi anggota, anggap sukses.
        if (memberErr && memberErr.code !== "23505") {
          return { room: null, error: "Gagal bergabung ke kamar." }
        }

        if (typeof window !== "undefined") {
          localStorage.setItem(
            getUserStorageKey(BASE_STORAGE_KEYS.ROOM),
            JSON.stringify(joinedRoom),
          )
          window.dispatchEvent(new Event("room-updated"))
        }
        return { room: joinedRoom, error: null }
      } catch (err) {
        console.warn("joinRoom exception:", err)
        return { room: null, error: "Tidak bisa terhubung ke server." }
      }
    }

    // Mode lokal (Supabase tidak dikonfigurasi).
    const localRoom: KamarRoomRecord = {
      id: localId("ROOM"),
      name: `Kamar Kos (${cleanCode})`,
      code: cleanCode,
      monthlyFee: 200000,
      maxMembers: 4,
      role: "Anggota",
    }
    if (typeof window !== "undefined") {
      localStorage.setItem(
        getUserStorageKey(BASE_STORAGE_KEYS.ROOM),
        JSON.stringify(localRoom),
      )
      window.dispatchEvent(new Event("room-updated"))
    }
    return { room: localRoom, error: null }
  },

  async leaveRoom(): Promise<void> {
    const currentUser = authService.getCurrentUser()
    const room = this.getUserRoom()
    if (
      isSupabaseConfigured &&
      supabase &&
      currentUser?.id &&
      currentUser.id.includes("-") &&
      room?.id &&
      room.id.includes("-")
    ) {
      try {
        await supabase
          .from("room_members")
          .delete()
          .eq("room_id", room.id)
          .eq("user_id", currentUser.id)
      } catch (err) {
        console.warn("leaveRoom exception:", err)
      }
    }
    if (typeof window !== "undefined") {
      localStorage.removeItem(getUserStorageKey(BASE_STORAGE_KEYS.ROOM))
      localStorage.removeItem(getUserStorageKey(BASE_STORAGE_KEYS.SHARED_TX))
      localStorage.removeItem(getUserStorageKey(BASE_STORAGE_KEYS.REQUIREMENTS))
      window.dispatchEvent(new Event("room-updated"))
    }
  },

  /**
   * Keluarkan anggota lain dari kamar (hanya Ketua Kos — dijaga RLS policy
   * "Ketua Kos can remove members"). `memberRowId` = kolom `id` baris room_members.
   */
  async removeMember(memberRowId: string): Promise<{ error: string | null }> {
    if (isSupabaseConfigured && supabase && memberRowId.includes("-")) {
      try {
        const { error } = await supabase.from("room_members").delete().eq("id", memberRowId)
        if (error) {
          return { error: "Hanya Ketua Kos yang bisa mengeluarkan anggota." }
        }
      } catch {
        return { error: "Tidak bisa terhubung ke server." }
      }
    }
    if (typeof window !== "undefined") window.dispatchEvent(new Event("room-updated"))
    return { error: null }
  },

  async deleteRoom(roomId?: string): Promise<void> {
    if (isSupabaseConfigured && supabase && roomId && roomId.includes('-')) {
      try {
        await supabase.from('room_members').delete().eq('room_id', roomId)
        await supabase.from('rooms').delete().eq('id', roomId)
      } catch (err) {
        console.warn("Supabase room delete error:", err)
      }
    }

    if (typeof window !== "undefined") {
      const key = getUserStorageKey(BASE_STORAGE_KEYS.ROOM)
      localStorage.removeItem(key)
      const keyShared = getUserStorageKey(BASE_STORAGE_KEYS.SHARED_TX)
      localStorage.removeItem(keyShared)
      const keyReq = getUserStorageKey(BASE_STORAGE_KEYS.REQUIREMENTS)
      localStorage.removeItem(keyReq)
      window.dispatchEvent(new Event("room-updated"))
    }
  },

  async getRoomMembers(roomId?: string): Promise<KamarMemberRecord[]> {
    const currentUser = authService.getCurrentUser()
    const myName = currentUser ? currentUser.fullName : "Saya"

    if (isSupabaseConfigured && supabase && roomId && roomId.includes("-")) {
      try {
        const { data, error } = await supabase
          .from("room_members")
          .select("*")
          .eq("room_id", roomId)
          .order("joined_at", { ascending: true })

        if (!error && data && data.length > 0) {
          return data.map((m: Record<string, unknown>) => {
            const name = (m.user_name as string) || "Anggota"
            return {
              id: (m.id as string) || (m.user_id as string),
              userId: m.user_id as string,
              name,
              isMe: m.user_id === currentUser?.id,
              role: (m.role as "Ketua Kos" | "Anggota") || "Anggota",
              roomNumber: (m.room_number as string) || "Kamar 01",
              avatar: name.slice(0, 2).toUpperCase(),
              netBalance: 0,
              status: "clear" as const,
            }
          })
        }
      } catch (err) {
        console.warn("Supabase room members query fallback:", err)
      }
    }

    // Fallback: minimal berisi diri sendiri (kamar lokal / offline).
    return [
      {
        id: currentUser?.id || "M-1",
        userId: currentUser?.id,
        name: myName,
        isMe: true,
        role: "Ketua Kos",
        roomNumber: "Kamar 01",
        avatar: myName.slice(0, 2).toUpperCase(),
        netBalance: 0,
        status: "clear",
      },
    ]
  },

  /** Peta user_id → nama anggota untuk kamar tertentu. */
  async _memberNameMap(roomId?: string): Promise<Map<string, string>> {
    const members = await this.getRoomMembers(roomId)
    const map = new Map<string, string>()
    for (const m of members) if (m.userId) map.set(m.userId, m.name)
    return map
  },

  async getSharedTransactions(): Promise<SharedTransactionRecord[]> {
    const room = this.getUserRoom()
    if (isSupabaseConfigured && supabase && room?.id && room.id.includes("-")) {
      try {
        const { data, error } = await supabase
          .from("room_transactions")
          .select("*, room_transaction_splits(*), room_transaction_items(id)")
          .eq("room_id", room.id)
          .order("date", { ascending: false })
          .order("created_at", { ascending: false })

        if (!error && data) {
          const currentUser = authService.getCurrentUser()
          const myId = currentUser?.id
          const nameMap = await this._memberNameMap(room.id)

          const mapped: SharedTransactionRecord[] = data.map((t) => {
            const splits = (t.room_transaction_splits as Array<{
              user_id: string
              amount_owed: number
              is_settled: boolean
            }>) || []
            const perPerson = Number(t.per_person_amount || 0)
            const paidById = t.paid_by_user_id as string
            const isPayer = paidById === myId
            const mySplit = splits.find((s) => s.user_id === myId)

            let myShare = 0
            if (isPayer) {
              myShare = -splits
                .filter((s) => !s.is_settled)
                .reduce((sum, s) => sum + Number(s.amount_owed), 0)
            } else if (mySplit) {
              myShare = mySplit.is_settled ? 0 : Number(mySplit.amount_owed)
            }

            const allSettled = splits.length > 0 && splits.every((s) => s.is_settled)
            const status: "settled" | "pending" =
              t.status === "settled" || allSettled ? "settled" : "pending"

            const sharerNames = splits.map(
              (s) => nameMap.get(s.user_id) || "Anggota",
            )
            const payerName = nameMap.get(paidById) || "Anggota"
            const splitBetween = Array.from(new Set([payerName, ...sharerNames]))

            return {
              id: t.id,
              title: t.title,
              category: t.category,
              totalAmount: Number(t.total_amount),
              paidBy: payerName,
              paidByUserId: paidById,
              createdByUserId: (t.created_by as string) || undefined,
              splitBetween,
              splitUserIds: splits.map((s) => s.user_id),
              perPersonAmount: perPerson,
              myShare,
              status,
              date: t.date,
              formattedDate: formatIdDate(t.date),
              isItemized: Array.isArray(t.room_transaction_items) && t.room_transaction_items.length > 0,
            }
          })

          if (typeof window !== "undefined") {
            localStorage.setItem(
              getUserStorageKey(BASE_STORAGE_KEYS.SHARED_TX),
              JSON.stringify(mapped),
            )
          }
          return mapped
        }
      } catch (err) {
        console.warn("Supabase room transactions query fallback:", err)
      }
    }

    if (typeof window === "undefined") return []
    const stored = localStorage.getItem(getUserStorageKey(BASE_STORAGE_KEYS.SHARED_TX))
    if (!stored) return []
    try {
      return JSON.parse(stored)
    } catch {
      return []
    }
  },

  async addSharedTransaction(item: {
    title: string
    category: string
    totalAmount: number
    paidByUserId: string
    paidByName: string
    splitUserIds: string[]
    splitNames: string[]
    /** Akun yang dipakai penalang (hanya relevan jika penalang = user saat ini). */
    payerAccount?: string
    status?: "pending" | "settled"
  }): Promise<SharedTransactionRecord> {
    const room = this.getUserRoom()
    const currentUser = authService.getCurrentUser()

    const sharerCount = Math.max(1, item.splitUserIds.length)
    const perPerson = Math.ceil(item.totalAmount / sharerCount)
    const nonPayerSharers = item.splitUserIds.filter((id) => id !== item.paidByUserId)

    const myId = currentUser?.id
    let myShare = 0
    if (item.paidByUserId === myId) myShare = -(perPerson * nonPayerSharers.length)
    else if (item.splitUserIds.includes(myId || "")) myShare = perPerson

    let newTx: SharedTransactionRecord = {
      id: localId("STX"),
      title: item.title,
      category: item.category,
      totalAmount: item.totalAmount,
      paidBy: item.paidByName,
      paidByUserId: item.paidByUserId,
      splitBetween: Array.from(new Set([item.paidByName, ...item.splitNames])),
      perPersonAmount: perPerson,
      myShare,
      status: item.status || "pending",
      date: todayLocalISO(),
      formattedDate: formatIdDate(new Date()),
    }

    if (
      isSupabaseConfigured &&
      supabase &&
      room?.id &&
      room.id.includes("-") &&
      currentUser?.id &&
      currentUser.id.includes("-") &&
      item.paidByUserId.includes("-")
    ) {
      try {
        const { data, error } = await supabase
          .from("room_transactions")
          .insert([
            {
              room_id: room.id,
              created_by: currentUser.id,
              paid_by_user_id: item.paidByUserId,
              title: item.title,
              category: item.category,
              total_amount: item.totalAmount,
              per_person_amount: perPerson,
              date: todayLocalISO(),
              status: item.status || "pending",
            },
          ])
          .select()
          .single()

        if (!error && data) {
          // Satu baris split per anggota yang menanggung. Bagian si penalang
          // langsung `is_settled: true` (dia sudah bayar duluan) — bagian anggota
          // lain `false` sampai mereka melunasi.
          const splitRows = item.splitUserIds
            .filter((id) => id.includes("-"))
            .map((userId) => ({
              transaction_id: data.id,
              user_id: userId,
              amount_owed: perPerson,
              is_settled: userId === item.paidByUserId,
              settled_at: userId === item.paidByUserId ? new Date().toISOString() : null,
            }))
          if (splitRows.length > 0) {
            const { error: splitErr } = await supabase
              .from("room_transaction_splits")
              .insert(splitRows)
            if (splitErr) console.error("Supabase splits insert error:", splitErr)
          }

          newTx = { ...newTx, id: data.id, date: data.date, formattedDate: formatIdDate(data.date) }
        } else if (error) {
          console.error("Supabase addSharedTransaction error:", error)
        }
      } catch (err) {
        console.warn("Supabase addSharedTransaction exception:", err)
      }
    }

    // Simpan akun penalang (dipakai rekonsiliasi) — hanya jika penalang = saya.
    if (item.paidByUserId === myId && item.payerAccount) {
      await writePayerAccount(newTx.id, item.payerAccount)
    }

    const list = await this.getSharedTransactions()
    const updated = [newTx, ...list.filter((t) => t.id !== newTx.id)]
    if (typeof window !== "undefined") {
      localStorage.setItem(
        getUserStorageKey(BASE_STORAGE_KEYS.SHARED_TX),
        JSON.stringify(updated),
      )
    }

    // Catat dampak ke transaksi pribadi (untuk penalang: pengeluaran talangan).
    await this.reconcileRoomLedger(room?.id)
    return newTx
  },

  /**
   * Buat satu split bill kos dengan RINCIAN PER ITEM (scan struk / input manual).
   * Semua langkah (room_transactions + room_transaction_items +
   * room_transaction_item_splits + agregat room_transaction_splits) dijalankan
   * ATOMIK di server lewat RPC `create_room_transaction_with_items` — kalau ada
   * error di tengah, tidak ada yang setengah tersimpan.
   *
   * Selisih (total struk - jumlah semua item_total) dibagi RATA ke peserta struk
   * (gabungan semua anggota yang menanggung minimal 1 item).
   */
  async addSharedTransactionWithItems(input: {
    title: string
    category: string
    totalAmount: number
    paidByUserId: string
    date?: string
    items: RoomItemInput[]
    /** Akun penalang (hanya dipakai kalau penalang = user saat ini). */
    payerAccount?: string
  }): Promise<{ txId: string | null; error: string | null }> {
    const room = this.getUserRoom()
    const currentUser = authService.getCurrentUser()
    const myId = currentUser?.id

    if (!input.items.length) return { txId: null, error: "Tidak ada item." }
    if (input.items.some((it) => !it.memberIds.length)) {
      return { txId: null, error: "Masih ada item yang belum dibagi ke siapa pun." }
    }

    if (
      !isSupabaseConfigured ||
      !supabase ||
      !room?.id ||
      !room.id.includes("-") ||
      !myId ||
      !myId.includes("-") ||
      !input.paidByUserId.includes("-")
    ) {
      return { txId: null, error: "Fitur ini butuh kamar yang tersambung ke server." }
    }

    try {
      const { data, error } = await supabase.rpc("create_room_transaction_with_items", {
        p_room_id: room.id,
        p_paid_by_user_id: input.paidByUserId,
        p_title: input.title,
        p_category: input.category || "Konsumsi Kos",
        p_total_amount: input.totalAmount,
        p_date: input.date || todayLocalISO(),
        p_items: input.items.map((it) => ({
          item_name: it.itemName,
          quantity: it.quantity,
          unit_price: it.unitPrice ?? null,
          item_total: it.itemTotal,
          source: it.source,
          member_ids: it.memberIds.filter((id) => id.includes("-")),
        })),
      })
      if (error) {
        console.error("create_room_transaction_with_items error:", error)
        return { txId: null, error: error.message || "Gagal menyimpan split bill." }
      }

      const txId = data as string
      if (input.paidByUserId === myId && input.payerAccount) {
        await writePayerAccount(txId, input.payerAccount)
      }

      // Segarkan cache & catat pengeluaran "bagian saya" ke transaksi pribadi.
      await this.getSharedTransactions()
      await this.reconcileRoomLedger(room.id)
      return { txId, error: null }
    } catch (err) {
      console.warn("addSharedTransactionWithItems exception:", err)
      return { txId: null, error: "Tidak bisa terhubung ke server." }
    }
  },

  /** Rincian item satu split bill (untuk tampilan detail & edit). */
  async getTransactionItems(txId: string): Promise<RoomTransactionItemRecord[]> {
    if (!isSupabaseConfigured || !supabase || !txId.includes("-")) return []
    try {
      const { data, error } = await supabase
        .from("room_transaction_items")
        .select("*, room_transaction_item_splits(user_id, share_amount)")
        .eq("transaction_id", txId)
        .order("created_at", { ascending: true })
      if (error || !data) return []
      return data.map((it: Record<string, unknown>) => {
        const splits =
          (it.room_transaction_item_splits as Array<{ user_id: string; share_amount: number }>) || []
        return {
          id: it.id as string,
          itemName: it.item_name as string,
          quantity: Number(it.quantity ?? 1),
          unitPrice: it.unit_price == null ? null : Number(it.unit_price),
          itemTotal: Number(it.item_total),
          source: (it.source as "scan" | "manual") || "manual",
          memberIds: splits.map((s) => s.user_id),
          perMemberShare: splits.length ? Number(splits[0].share_amount) : 0,
        }
      })
    } catch (err) {
      console.warn("getTransactionItems exception:", err)
      return []
    }
  },

  /**
   * Tandai bagian SAYA pada satu transaksi talangan sebagai lunas.
   * Pencatatan ke transaksi pribadi dilakukan oleh reconcileRoomLedger().
   */
  async settleMyShare(txId: string): Promise<void> {
    const currentUser = authService.getCurrentUser()
    const room = this.getUserRoom()

    const list = await this.getSharedTransactions()
    const target = list.find((t) => t.id === txId)
    if (!target || target.myShare <= 0) return // bukan utang saya / sudah lunas

    if (
      isSupabaseConfigured &&
      supabase &&
      txId.includes("-") &&
      currentUser?.id &&
      currentUser.id.includes("-")
    ) {
      try {
        await supabase
          .from("room_transaction_splits")
          .update({ is_settled: true, settled_at: new Date().toISOString() })
          .eq("transaction_id", txId)
          .eq("user_id", currentUser.id)

        const { data: remaining } = await supabase
          .from("room_transaction_splits")
          .select("is_settled")
          .eq("transaction_id", txId)
        if ((remaining || []).every((s: { is_settled: boolean }) => s.is_settled)) {
          await supabase.from("room_transactions").update({ status: "settled" }).eq("id", txId)
        }
      } catch (err) {
        console.warn("settleMyShare exception:", err)
      }
    }

    // Update cache lokal.
    const updated = list.map((t) =>
      t.id === txId ? { ...t, myShare: 0, status: "settled" as const } : t,
    )
    if (typeof window !== "undefined") {
      localStorage.setItem(
        getUserStorageKey(BASE_STORAGE_KEYS.SHARED_TX),
        JSON.stringify(updated),
      )
    }

    // Catat pelunasan bagian saya ke transaksi pribadi.
    await this.reconcileRoomLedger(room?.id)
  },

  /**
   * Ubah satu split bill kos. Hanya pembuat/penalang (dijaga RLS). Bila belum ada
   * anggota lain yang melunasi, total & daftar peserta boleh diubah — baris split
   * dibuat ulang. Bila sudah ada yang melunasi, hanya `title`/`category`.
   * Rekonsiliasi membereskan pengeluaran pribadi tiap anggota.
   */
  async updateSharedTransaction(
    txId: string,
    patch: {
      title?: string
      category?: string
      totalAmount?: number
      splitUserIds?: string[]
      payerAccount?: string
    },
  ): Promise<{ error: string | null }> {
    const currentUser = authService.getCurrentUser()
    const room = this.getUserRoom()
    const myId = currentUser?.id

    const structural = patch.totalAmount !== undefined || patch.splitUserIds !== undefined

    if (
      isSupabaseConfigured &&
      supabase &&
      txId.includes("-") &&
      currentUser?.id &&
      currentUser.id.includes("-")
    ) {
      try {
        const { data, error: getErr } = await supabase
          .from("room_transactions")
          .select("paid_by_user_id, total_amount, room_transaction_splits(id, user_id, is_settled), room_transaction_items(id)")
          .eq("id", txId)
          .single()
        if (getErr || !data) return { error: "Transaksi tidak ditemukan." }

        const payerId = data.paid_by_user_id as string
        const splits =
          (data.room_transaction_splits as Array<{ id: string; user_id: string; is_settled: boolean }>) || []
        const isItemized =
          Array.isArray(data.room_transaction_items) && data.room_transaction_items.length > 0
        if (structural && isItemized) {
          return {
            error:
              "Split bill per item — total & peserta tidak bisa diubah di sini. Hapus lalu buat ulang, atau ubah hanya judul/kategori.",
          }
        }
        const someoneElseSettled = splits.some((s) => s.user_id !== payerId && s.is_settled)
        if (structural && someoneElseSettled) {
          return {
            error: "Sudah ada anggota yang melunasi — hanya judul & kategori yang bisa diubah.",
          }
        }

        const newSharerIds = patch.splitUserIds ?? splits.map((s) => s.user_id)
        const sharerCount = Math.max(1, newSharerIds.length)
        const newTotal = patch.totalAmount ?? Number(data.total_amount)
        const perPerson = Math.ceil(newTotal / sharerCount)

        const upd: Record<string, unknown> = {}
        if (patch.title !== undefined) upd.title = patch.title
        if (patch.category !== undefined) upd.category = patch.category
        if (structural) {
          upd.total_amount = newTotal
          upd.per_person_amount = perPerson
        }
        if (Object.keys(upd).length) {
          const { error: updErr } = await supabase
            .from("room_transactions")
            .update(upd)
            .eq("id", txId)
          if (updErr) return { error: "Hanya pembuat / penalang yang bisa mengubah." }
        }

        if (structural) {
          await supabase.from("room_transaction_splits").delete().eq("transaction_id", txId)
          const rows = newSharerIds
            .filter((id) => id.includes("-"))
            .map((userId) => ({
              transaction_id: txId,
              user_id: userId,
              amount_owed: perPerson,
              is_settled: userId === payerId,
              settled_at: userId === payerId ? new Date().toISOString() : null,
            }))
          if (rows.length > 0) {
            const { error: splitErr } = await supabase
              .from("room_transaction_splits")
              .insert(rows)
            if (splitErr) console.error("updateSharedTransaction splits insert error:", splitErr)
          }
        }

        if (payerId === myId && patch.payerAccount) await writePayerAccount(txId, patch.payerAccount)
      } catch (err) {
        console.warn("updateSharedTransaction exception:", err)
        return { error: "Tidak bisa terhubung ke server." }
      }
    }

    await this.reconcileRoomLedger(room?.id)
    return { error: null }
  },

  /**
   * Hapus satu split bill kos (baris `room_transaction_splits` ikut lewat cascade).
   * Hanya pembuat (dijaga RLS policy "Creator can delete room transactions").
   * Rekonsiliasi tiap anggota membuang pengeluaran pribadi yang jadi yatim &
   * mengembalikan saldo.
   */
  async deleteSharedTransaction(txId: string): Promise<{ error: string | null }> {
    const currentUser = authService.getCurrentUser()
    const room = this.getUserRoom()

    if (
      isSupabaseConfigured &&
      supabase &&
      txId.includes("-") &&
      currentUser?.id &&
      currentUser.id.includes("-")
    ) {
      try {
        const { error } = await supabase.from("room_transactions").delete().eq("id", txId)
        if (error) return { error: "Hanya pembuat transaksi yang bisa menghapus." }
      } catch {
        return { error: "Tidak bisa terhubung ke server." }
      }
    }

    if (typeof window !== "undefined") {
      try {
        const key = getUserStorageKey(BASE_STORAGE_KEYS.SHARED_TX)
        const kept = (
          JSON.parse(localStorage.getItem(key) || "[]") as SharedTransactionRecord[]
        ).filter((t) => t.id !== txId)
        localStorage.setItem(key, JSON.stringify(kept))
        const sm = readSplitMeta()
        delete sm[txId]
        localStorage.setItem(BASE_STORAGE_KEYS.SPLIT_META, JSON.stringify(sm))
      } catch {
        // ignore
      }
    }

    await this.reconcileRoomLedger(room?.id)
    return { error: null }
  },

  /**
   * Selaraskan transaksi pribadi user dengan split bill kamar.
   * IDEMPOTEN (penanda `[#sbS:id]` di notes) — aman dipanggil berkali-kali / di
   * banyak device. Guard "in-flight" mencegah panggilan paralel bikin dobel.
   *
   * MODEL: setiap orang hanya mencatat BAGIAN-NYA sendiri sebagai pengeluaran
   * (bukan total). Penalang: bagiannya tercatat saat split dibuat (split miliknya
   * langsung `is_settled`). Anggota lain: bagiannya tercatat saat mereka melunasi.
   * Tidak ada "pengembalian" sebagai pemasukan — talangan antar anggota adalah
   * pinjaman yang tercermin di kartu "Piutang / Tunggakan", bukan di arus kas.
   *
   * Juga membersihkan entri model LAMA (talangan penuh + pengembalian) sekali.
   */
  reconcileRoomLedger(roomId?: string): Promise<void> {
    const run = () => this._doReconcileRoomLedger(roomId)
    const next = _reconcileInFlight ? _reconcileInFlight.then(run, run) : run()
    _reconcileInFlight = next
    next.finally(() => {
      if (_reconcileInFlight === next) _reconcileInFlight = null
    })
    return next
  },

  async _doReconcileRoomLedger(roomId?: string): Promise<void> {
    if (typeof window === "undefined") return
    const room = roomId ? { id: roomId } : this.getUserRoom()
    if (!room?.id) return
    const currentUser = authService.getCurrentUser()
    const myId = currentUser?.id
    if (!myId) return

    const rawNotes = await transactionService._rawNotes()

    // Migrasi: buang entri model lama (sbP/sbO/sbB) sekali; nanti dibuat ulang sbS.
    if (rawNotes.some((n) => LEGACY_LEDGER_RE.test(n))) {
      await transactionService._purgeByNotePattern(LEGACY_LEDGER_RE)
    }

    const seen = new Set<string>()
    for (const n of await transactionService._rawNotes()) collectLedgerRefs(n, seen)

    // splitMeta = sidecar LEGACY (pra-kolom `payer_account_id`), dipakai hanya
    // untuk baris lama yang belum punya kolomnya terisi.
    const splitMeta = readSplitMeta()
    const accounts = await accountService.getAll()
    const nameMap = await this._memberNameMap(room.id)
    const resolveAcct = (preferred?: string) => resolvePersonalAccount(accounts, preferred)
    const acctNameById = (id?: string | null) => accounts.find((a) => a.id === id)?.name

    type Split = { id: string; user_id: string; amount_owed: number; is_settled: boolean }
    type RTx = {
      id: string
      title: string
      total_amount: number
      per_person_amount: number
      paid_by_user_id: string
      payer_account_id?: string | null
      room_transaction_splits: Split[]
    }
    let rows: RTx[] = []

    if (isSupabaseConfigured && supabase && myId.includes("-") && room.id.includes("-")) {
      const { data, error } = await supabase
        .from("room_transactions")
        .select("id, title, total_amount, per_person_amount, paid_by_user_id, payer_account_id, room_transaction_splits(id, user_id, amount_owed, is_settled)")
        .eq("room_id", room.id)
      if (error || !data) return
      rows = data as RTx[]
    } else {
      try {
        const local: SharedTransactionRecord[] = JSON.parse(
          localStorage.getItem(getUserStorageKey(BASE_STORAGE_KEYS.SHARED_TX)) || "[]",
        )
        rows = local.map((t) => ({
          id: t.id,
          title: t.title,
          total_amount: t.totalAmount,
          per_person_amount: t.perPersonAmount,
          paid_by_user_id: t.paidByUserId || "",
          room_transaction_splits: [],
        }))
      } catch {
        return
      }
    }

    // Kunci [#sbS:*] yang MASIH valid (split bill-nya masih ada). Entri pengeluaran
    // pribadi dengan kunci di luar ini = yatim (split bill dihapus / diedit sehingga
    // id split-nya berganti) → dibuang + saldo dikembalikan.
    const validSbKeys = new Set<string>()
    for (const t of rows) {
      const splits = t.room_transaction_splits || []
      const iAmPayer = t.paid_by_user_id === myId
      const mySettledSplit = splits.find((s) => s.user_id === myId && s.is_settled)
      const key = mySettledSplit ? mySettledSplit.id : iAmPayer ? t.id : null
      if (key) validSbKeys.add(refKey("sbS", key))
    }
    await transactionService._purgeSbOrphans(validSbKeys)

    for (const t of rows) {
      const splits = t.room_transaction_splits || []
      const iAmPayer = t.paid_by_user_id === myId

      // Bagian SAYA yang sudah "terbayar" (payer: begitu split dibuat;
      // anggota lain: begitu melunasi) → catat sebagai pengeluaran sekali.
      const mySettledSplit = splits.find((s) => s.user_id === myId && s.is_settled)

      // Fallback untuk data tanpa baris split milik payer (mis. dibuat versi lama
      // yang tidak menyimpan split penalang): pakai id transaksi sebagai kunci.
      const key = mySettledSplit ? mySettledSplit.id : iAmPayer ? t.id : null
      if (!key) continue
      if (seen.has(refKey("sbS", key))) continue

      // Kalau penalang tidak termasuk yang menanggung, dia tidak punya bagian.
      const payerHasNoSplitButIsSharer =
        iAmPayer && !mySettledSplit &&
        Math.abs(t.total_amount - Number(t.per_person_amount) * (splits.length + 1)) <=
          splits.length + 1
      const shareAmount = mySettledSplit
        ? Number(mySettledSplit.amount_owed)
        : payerHasNoSplitButIsSharer
          ? Number(t.per_person_amount)
          : 0
      if (shareAmount <= 0) continue

      // Akun penalang: kolom `payer_account_id` (sinkron antar device) kalau
      // sudah ada, kalau tidak jatuh ke sidecar lokal lama (baris pra-migrasi).
      const payerAccountName = iAmPayer
        ? acctNameById(t.payer_account_id) || splitMeta[t.id]?.account
        : undefined

      // Auto-log ini "bagian saya" dari split bill kos — kalau gagal (jaringan/
      // RLS), jangan gagalkan seluruh reconcile (dipanggil tiap halaman kamar
      // dibuka); lanjut ke transaksi berikutnya, coba lagi di reconcile berikutnya.
      try {
        await transactionService.add({
          title: `Split Bill Kos: ${t.title}`,
          category: "Kamar Kos",
          type: "out",
          amount: shareAmount,
          account: resolveAcct(payerAccountName),
          date: todayLocalISO(),
          formattedDate: formatIdDate(new Date()),
          notes: iAmPayer
            ? `Bagian saya dari tagihan bersama "${t.title}" ${ledgerRef("sbS", key)}`
            : `Bayar bagian saya ke ${nameMap.get(t.paid_by_user_id) || "penalang"} untuk "${t.title}" ${ledgerRef("sbS", key)}`,
        })
        seen.add(refKey("sbS", key))
      } catch (err) {
        console.error("reconcileRoomLedger: auto-log split bill gagal untuk tx", t.id, err)
      }
    }
  },

  async getDebtSummary(): Promise<DebtSummaryRecord[]> {
    const room = this.getUserRoom()

    // Sumber kebenaran: baris split yang belum lunas → "X harus bayar ke Y".
    if (isSupabaseConfigured && supabase && room?.id && room.id.includes("-")) {
      try {
        const { data, error } = await supabase
          .from("room_transactions")
          .select("title, paid_by_user_id, room_transaction_splits(user_id, amount_owed, is_settled)")
          .eq("room_id", room.id)

        if (!error && data) {
          const nameMap = await this._memberNameMap(room.id)
          const debts: DebtSummaryRecord[] = []
          for (const t of data) {
            const payer = nameMap.get(t.paid_by_user_id as string) || "Anggota"
            const splits = (t.room_transaction_splits as Array<{
              user_id: string
              amount_owed: number
              is_settled: boolean
            }>) || []
            for (const s of splits) {
              if (s.is_settled) continue
              debts.push({
                from: nameMap.get(s.user_id) || "Anggota",
                to: payer,
                amount: Number(s.amount_owed),
                note: t.title as string,
              })
            }
          }
          return debts
        }
      } catch (err) {
        console.warn("getDebtSummary exception:", err)
      }
    }

    // Fallback lokal: turunkan dari myShare pada shared transactions.
    const txs = await this.getSharedTransactions()
    const debts: DebtSummaryRecord[] = []
    for (const t of txs) {
      if (t.status !== "pending" || t.myShare === 0) continue
      if (t.myShare > 0) {
        debts.push({ from: "Saya", to: t.paidBy, amount: t.myShare, note: t.title })
      } else {
        debts.push({ from: "Anggota Kos", to: "Saya", amount: Math.abs(t.myShare), note: t.title })
      }
    }
    return debts
  },

  async getRequirements(): Promise<RequirementRecord[]> {
    const room = this.getUserRoom()
    const currentUser = authService.getCurrentUser()

    if (isSupabaseConfigured && supabase && room?.id && room.id.includes("-")) {
      try {
        const { data, error } = await supabase
          .from("room_requirements")
          .select("*")
          .eq("room_id", room.id)
          .order("created_at", { ascending: false })

        if (!error && data) {
          // Cek kebutuhan mana yang sudah dibayar oleh user ini.
          let paidReqIds = new Set<string>()
          if (currentUser?.id && currentUser.id.includes("-")) {
            const { data: pays } = await supabase
              .from("room_requirement_payments")
              .select("requirement_id")
              .eq("user_id", currentUser.id)
            paidReqIds = new Set(
              (pays || []).map((p: { requirement_id: string }) => p.requirement_id),
            )
          }

          const nameMap = await this._memberNameMap(room.id)
          const mapped: RequirementRecord[] = data.map((r: Record<string, unknown>) => ({
            id: r.id as string,
            title: r.title as string,
            category: r.category as string,
            totalPrice: Number(r.total_price),
            splitPeopleCount: Number(r.split_people_count) || 1,
            perPersonPrice: Number(r.per_person_price),
            dueDate: r.due_date ? formatIdDate(r.due_date as string) : "-",
            responsiblePerson:
              nameMap.get(r.responsible_user_id as string) || "Ketua Kos",
            isPaidByMe: paidReqIds.has(r.id as string),
          }))

          if (typeof window !== "undefined") {
            localStorage.setItem(
              getUserStorageKey(BASE_STORAGE_KEYS.REQUIREMENTS),
              JSON.stringify(mapped),
            )
          }
          return mapped
        }
      } catch (err) {
        console.warn("Supabase room requirements query fallback:", err)
      }
    }

    if (typeof window === "undefined") return []
    const key = getUserStorageKey(BASE_STORAGE_KEYS.REQUIREMENTS)
    const stored = localStorage.getItem(key)
    if (!stored) return []
    try {
      return JSON.parse(stored)
    } catch {
      return []
    }
  },

  /**
   * Tambah kebutuhan bulanan kos. Insert ke tabel `room_requirements` (bila kamar
   * tersambung Supabase), lalu simpan ke cache lokal ter-scope per user.
   * Menggantikan penulisan langsung `localStorage["myfinance_db_requirements"]`
   * (key mentah) yang sebelumnya bikin data langsung hilang.
   */
  /** @throws Error kalau Supabase dikonfigurasi tapi insert gagal — TIDAK LAGI
   *  diam-diam mengembalikan kebutuhan lokal palsu yang tak pernah dilihat
   *  anggota kamar lain (fitur ini SHARED, jadi bug ini sangat terasa). */
  async addRequirement(item: {
    title: string
    category: string
    totalPrice: number
    splitPeopleCount: number
    dueDate: string
    responsiblePerson: string
    perPersonPrice?: number
  }): Promise<RequirementRecord> {
    const room = this.getUserRoom()
    const perPerson =
      item.perPersonPrice ??
      Math.ceil(item.totalPrice / Math.max(1, item.splitPeopleCount))

    if (isSupabaseConfigured && supabase) {
      if (!room?.id || !room.id.includes("-")) {
        throw new Error("Kamar tidak valid. Muat ulang halaman.")
      }
      // Petakan nama penanggung jawab → user_id anggota kamar (kalau ada).
      const members = await this.getRoomMembers(room.id)
      const responsibleId =
        members.find((m) => m.name === item.responsiblePerson)?.userId || null

      const { data, error } = await supabase
        .from("room_requirements")
        .insert([
          {
            room_id: room.id,
            title: item.title,
            category: item.category,
            total_price: item.totalPrice,
            split_people_count: item.splitPeopleCount,
            per_person_price: perPerson,
            due_date: toISODate(item.dueDate),
            responsible_user_id:
              responsibleId && responsibleId.includes("-") ? responsibleId : null,
          },
        ])
        .select()
        .single()

      if (error || !data) {
        console.error("Supabase addRequirement insert error:", error)
        throw new Error("Gagal menambah kebutuhan bulanan. Coba lagi.")
      }

      const newReq: RequirementRecord = {
        id: data.id,
        title: data.title,
        category: data.category,
        totalPrice: Number(data.total_price),
        splitPeopleCount: Number(data.split_people_count) || item.splitPeopleCount,
        perPersonPrice: Number(data.per_person_price),
        dueDate: item.dueDate,
        responsiblePerson: item.responsiblePerson,
        isPaidByMe: false,
      }
      const list = await this.getRequirements()
      const updated = [newReq, ...list.filter((r) => r.id !== newReq.id)]
      if (typeof window !== "undefined") {
        localStorage.setItem(getUserStorageKey(BASE_STORAGE_KEYS.REQUIREMENTS), JSON.stringify(updated))
      }
      return newReq
    }

    // Mode lokal murni (Supabase TIDAK dikonfigurasi sama sekali).
    const newReq: RequirementRecord = {
      id: localId("REQ"),
      title: item.title,
      category: item.category,
      totalPrice: item.totalPrice,
      splitPeopleCount: item.splitPeopleCount,
      perPersonPrice: perPerson,
      dueDate: item.dueDate,
      responsiblePerson: item.responsiblePerson,
      isPaidByMe: false,
    }
    const list = await this.getRequirements()
    const updated = [newReq, ...list.filter((r) => r.id !== newReq.id)]
    if (typeof window !== "undefined") {
      localStorage.setItem(getUserStorageKey(BASE_STORAGE_KEYS.REQUIREMENTS), JSON.stringify(updated))
    }
    return newReq
  },

  async payRequirement(reqId: string): Promise<void> {
    const list = await this.getRequirements()
    const req = list.find((r) => r.id === reqId)
    if (!req || req.isPaidByMe) return

    const currentUser = authService.getCurrentUser()
    const accts = await accountService.getAll()

    // 1. Auto-catat ke transaksi pribadi (potongan bagian saya).
    const tx = await transactionService.add({
      title: `Iuran Bulanan Kos: ${req.title}`,
      category: "Kamar Kos",
      type: "out",
      amount: req.perPersonPrice,
      account: resolvePersonalAccount(accts),
      date: todayLocalISO(),
      formattedDate: formatIdDate(new Date()),
      notes: `Potongan otomatis setoran kebutuhan kos [#auto]`,
    })

    // 2. Catat pembayaran di tabel room_requirement_payments.
    if (
      isSupabaseConfigured &&
      supabase &&
      reqId.includes("-") &&
      currentUser?.id &&
      currentUser.id.includes("-")
    ) {
      try {
        const { error } = await supabase.from("room_requirement_payments").insert([
          {
            requirement_id: reqId,
            user_id: currentUser.id,
            personal_transaction_id:
              typeof tx.id === "string" && tx.id.includes("-") ? tx.id : null,
          },
        ])
        if (error) console.error("Supabase payRequirement insert error:", error)
      } catch (err) {
        console.warn("Supabase payRequirement exception:", err)
      }
    }

    // 3. Update cache lokal.
    const updated = list.map((r) =>
      r.id === reqId ? { ...r, isPaidByMe: true } : r,
    )
    if (typeof window !== "undefined") {
      localStorage.setItem(
        getUserStorageKey(BASE_STORAGE_KEYS.REQUIREMENTS),
        JSON.stringify(updated),
      )
    }
  },

  /** Ubah detail kebutuhan bulanan kos (semua anggota kamar boleh — RLS
   *  "Room members can update requirements"). Per-orang dihitung ulang. */
  async updateRequirement(
    reqId: string,
    patch: {
      title?: string
      category?: string
      totalPrice?: number
      splitPeopleCount?: number
      dueDate?: string
      responsiblePerson?: string
    },
  ): Promise<void> {
    const room = this.getUserRoom()
    const list = await this.getRequirements()
    const before = list.find((r) => r.id === reqId)
    if (!before) return
    const total = patch.totalPrice ?? before.totalPrice
    const count = patch.splitPeopleCount ?? before.splitPeopleCount
    const perPerson = Math.ceil(total / Math.max(1, count))

    if (isSupabaseConfigured && supabase && reqId.includes("-")) {
      try {
        const upd: Record<string, unknown> = {}
        if (patch.title !== undefined) upd.title = patch.title
        if (patch.category !== undefined) upd.category = patch.category
        if (patch.totalPrice !== undefined || patch.splitPeopleCount !== undefined) {
          upd.total_price = total
          upd.split_people_count = count
          upd.per_person_price = perPerson
        }
        if (patch.dueDate !== undefined) upd.due_date = toISODate(patch.dueDate)
        if (patch.responsiblePerson !== undefined) {
          const members = await this.getRoomMembers(room?.id)
          const rid = members.find((m) => m.name === patch.responsiblePerson)?.userId || null
          upd.responsible_user_id = rid && rid.includes("-") ? rid : null
        }
        if (Object.keys(upd).length) {
          await supabase.from("room_requirements").update(upd).eq("id", reqId)
        }
      } catch (err) {
        console.warn("updateRequirement exception:", err)
      }
    }

    const updated = list.map((r) =>
      r.id === reqId
        ? {
            ...r,
            ...patch,
            totalPrice: total,
            splitPeopleCount: count,
            perPersonPrice: perPerson,
          }
        : r,
    )
    if (typeof window !== "undefined") {
      localStorage.setItem(
        getUserStorageKey(BASE_STORAGE_KEYS.REQUIREMENTS),
        JSON.stringify(updated),
      )
    }
  },

  /** Hapus satu kebutuhan bulanan kos (riwayat pembayaran anggota ikut lewat
   *  cascade; transaksi "Iuran Bulanan Kos" di log pribadi tetap ada). */
  async deleteRequirement(reqId: string): Promise<void> {
    if (isSupabaseConfigured && supabase && reqId.includes("-")) {
      try {
        await supabase.from("room_requirements").delete().eq("id", reqId)
      } catch (err) {
        console.warn("deleteRequirement exception:", err)
      }
    }
    const list = await this.getRequirements()
    const updated = list.filter((r) => r.id !== reqId)
    if (typeof window !== "undefined") {
      localStorage.setItem(
        getUserStorageKey(BASE_STORAGE_KEYS.REQUIREMENTS),
        JSON.stringify(updated),
      )
    }
  },
}

// ==========================================================
// 7. DANGER SERVICE (Reset / Hapus Semua Data)
// ==========================================================
export const dangerService = {
  /**
   * Hapus SEMUA data milik user: transaksi, target, saldo/akun, jadwal, dan
   * kamar kos (yang dia buat — cascade menghapus transaksi/split/kebutuhan;
   * yang cuma dia ikuti — dia keluar). Lalu bersihkan seluruh cache lokal.
   */
  async wipeAll(): Promise<void> {
    const currentUser = authService.getCurrentUser()
    const uid = currentUser?.id

    if (isSupabaseConfigured && supabase && uid && uid.includes("-")) {
      try {
        // Kamar yang SAYA buat → hapus (cascade ke members/tx/splits/requirements).
        const { data: myRooms } = await supabase
          .from("rooms")
          .select("id")
          .eq("created_by", uid)
        for (const r of (myRooms as { id: string }[]) || []) {
          await supabase.from("rooms").delete().eq("id", r.id)
        }
        // Kamar yang cuma SAYA ikuti → keluar.
        await supabase.from("room_members").delete().eq("user_id", uid)
        // Data pribadi.
        await supabase.from("transactions").delete().eq("user_id", uid)
        await supabase.from("goals").delete().eq("user_id", uid) // cascade saving_logs
        await supabase.from("scheduled_payments").delete().eq("user_id", uid)
        await supabase.from("accounts").delete().eq("user_id", uid)
      } catch (err) {
        console.warn("wipeAll Supabase error:", err)
      }
    }

    if (typeof window !== "undefined") {
      try {
        const bases = [
          BASE_STORAGE_KEYS.ACCOUNTS,
          BASE_STORAGE_KEYS.TRANSACTIONS,
          BASE_STORAGE_KEYS.GOALS,
          BASE_STORAGE_KEYS.SCHEDULED,
          BASE_STORAGE_KEYS.SHARED_TX,
          BASE_STORAGE_KEYS.REQUIREMENTS,
          BASE_STORAGE_KEYS.ROOM,
          BASE_STORAGE_KEYS.CARD_META,
          BASE_STORAGE_KEYS.SPLIT_META,
          BASE_STORAGE_KEYS.SCHEDULED_META,
        ]
        const toRemove = Object.keys(localStorage).filter((k) =>
          bases.some((b) => k === b || k.startsWith(`${b}_`)),
        )
        toRemove.forEach((k) => localStorage.removeItem(k))
      } catch {
        // ignore
      }
      window.dispatchEvent(new Event("room-updated"))
    }
  },
}
