import { supabase, isSupabaseConfigured } from "./supabase"

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
  splitBetween: string[]
  perPersonAmount: number
  /** >0 = saya berutang segini; <0 = orang lain berutang ke saya; 0 = lunas / tidak terlibat. */
  myShare: number
  date: string
  formattedDate: string
  status: "settled" | "pending"
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
}

// Penanda tak-terlihat di kolom `notes` transaksi pribadi supaya rekonsiliasi
// split bill IDEMPOTEN (tidak dobel walau dijalankan berkali-kali / di banyak device).
//   sbP = pengeluaran talangan (saya penalang, bayar penuh ke vendor)
//   sbO = pengeluaran pelunasan bagian saya ke penalang
//   sbB = pemasukan: anggota lain mengembalikan uang talangan ke saya
function ledgerRef(kind: "sbP" | "sbO" | "sbB", id: string): string {
  return `[#${kind}:${id.replace(/[^a-z0-9]/gi, "").slice(0, 16).toLowerCase()}]`
}
const LEDGER_REF_RE = /\s*\[#sb[POB]:[a-z0-9]{3,16}\]/gi
export function stripLedgerRef(notes?: string | null): string {
  return (notes || "").replace(LEDGER_REF_RE, "").trim()
}
function collectLedgerRefs(notes: string | null | undefined, into: Set<string>): void {
  for (const m of (notes || "").matchAll(/\[#(sb[POB]):([a-z0-9]{3,16})\]/gi)) {
    into.add(`${m[1].toLowerCase()}:${m[2].toLowerCase()}`)
  }
}
function refKey(kind: "sbP" | "sbO" | "sbB", id: string): string {
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

// Tanggal "YYYY-MM-DD" menurut waktu LOKAL (bukan UTC). Penting di UTC+8:
// `new Date().toISOString()` bisa mundur 1 hari lewat tengah malam.
function todayLocalISO(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function formatIdDate(input: string | Date): string {
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

function writeCardMeta(accountId: string, meta: CardMeta): void {
  if (typeof window === "undefined") return
  try {
    const all = readCardMeta()
    all[accountId] = meta
    localStorage.setItem(BASE_STORAGE_KEYS.CARD_META, JSON.stringify(all))
  } catch {
    // ignore
  }
}

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
          const cardMeta = readCardMeta()
          const mapped: FinancialAccountRecord[] = data.map((a) => {
            const meta = cardMeta[a.id as string]
            return {
              id: a.id,
              name: a.name,
              type: a.type,
              accountCategory: deriveAccountCategory(a.type || ""),
              balance: Number(a.balance),
              cardNumber: meta?.cardNumber || "**** **** 0000",
              cardHolder: meta?.cardHolder || currentUser.fullName || "USER",
              expiration: meta?.expiration || "12/29",
              cardDesignType: (a.color as FinancialAccountRecord["cardDesignType"]) || "brand-dark",
            }
          })
          if (typeof window !== "undefined") {
            localStorage.setItem(
              getUserStorageKey(BASE_STORAGE_KEYS.ACCOUNTS),
              JSON.stringify(mapped),
            )
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

  async add(item: Omit<FinancialAccountRecord, "id">): Promise<FinancialAccountRecord> {
    const currentUser = authService.getCurrentUser()
    let newRecord: FinancialAccountRecord = {
      ...item,
      id: `ACC-${Date.now().toString().slice(-4)}`,
    }

    if (isSupabaseConfigured && supabase && currentUser?.id && currentUser.id.includes("-")) {
      try {
        const { data, error } = await supabase
          .from("accounts")
          .insert([
            {
              user_id: currentUser.id,
              name: item.name,
              type: item.type,
              balance: item.balance,
              color: item.cardDesignType,
            },
          ])
          .select()
          .single()

        if (!error && data) {
          newRecord = {
            id: data.id,
            name: data.name,
            type: data.type,
            accountCategory: deriveAccountCategory(data.type || item.type),
            balance: Number(data.balance),
            cardNumber: item.cardNumber,
            cardHolder: item.cardHolder,
            expiration: item.expiration,
            cardDesignType: (data.color as FinancialAccountRecord["cardDesignType"]) || item.cardDesignType,
          }
        } else if (error) {
          console.error("Supabase account insert error:", error)
        }
      } catch (err) {
        console.warn("Supabase account insert exception:", err)
      }
    }

    // Simpan dekorasi kartu di sidecar lokal.
    writeCardMeta(newRecord.id, {
      cardNumber: item.cardNumber,
      cardHolder: item.cardHolder,
      expiration: item.expiration,
    })

    const list = await this.getAll()
    const updated = [newRecord, ...list.filter((a) => a.id !== newRecord.id)]
    if (typeof window !== "undefined") {
      localStorage.setItem(
        getUserStorageKey(BASE_STORAGE_KEYS.ACCOUNTS),
        JSON.stringify(updated),
      )
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
   * @param opts.adjustBalance default `true` — saldo akun terkait ikut berubah
   *   (`out` → berkurang, `in` → bertambah). Set `false` khusus untuk transfer
   *   antar akun yang sudah menyesuaikan saldo sendiri.
   */
  async add(
    item: Omit<TransactionRecord, "id">,
    opts: { adjustBalance?: boolean } = {},
  ): Promise<TransactionRecord> {
    const { adjustBalance = true } = opts
    const currentUser = authService.getCurrentUser()
    let newRecord: TransactionRecord = {
      ...item,
      id: `TX-${Date.now().toString().slice(-4)}`,
    }

    if (isSupabaseConfigured && supabase && currentUser?.id && currentUser.id.includes("-")) {
      try {
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

        if (!error && data) {
          newRecord = {
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
        } else if (error) {
          console.error("Supabase transaction insert error:", error)
        }
      } catch (err) {
        console.warn("Supabase transaction insert exception:", err)
      }
    }

    // Saldo akun ikut bergerak.
    if (adjustBalance && item.account) {
      const delta = item.type === "in" ? item.amount : -item.amount
      await accountService.adjustBalanceByName(item.account, delta)
    }

    const list = await this.getAll()
    const updated = [newRecord, ...list.filter((t) => t.id !== newRecord.id)]
    if (typeof window !== "undefined") {
      const key = getUserStorageKey(BASE_STORAGE_KEYS.TRANSACTIONS)
      localStorage.setItem(key, JSON.stringify(updated))
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

  async add(item: Omit<GoalRecord, "id" | "currentAmount" | "status">): Promise<GoalRecord> {
    const currentUser = authService.getCurrentUser()
    let newGoal: GoalRecord = {
      ...item,
      id: `G-${Date.now().toString().slice(-4)}`,
      currentAmount: 0,
      status: "active",
    }

    if (isSupabaseConfigured && supabase && currentUser?.id && currentUser.id.includes('-')) {
      try {
        const { data, error } = await supabase.from('goals').insert([{
          user_id: currentUser.id,
          title: item.title,
          category: item.category,
          target_amount: item.targetAmount,
          current_amount: 0,
          deadline: item.deadline,
          status: 'active',
        }]).select().single()

        if (!error && data) {
          newGoal = {
            id: data.id,
            title: data.title,
            category: data.category,
            targetAmount: Number(data.target_amount),
            currentAmount: Number(data.current_amount),
            deadline: data.deadline || item.deadline,
            status: data.status as GoalRecord["status"],
          }
        } else if (error) {
          console.error("Supabase goal insert error:", error)
        }
      } catch (err) {
        console.warn("Supabase goal insert exception:", err)
      }
    }

    const list = await this.getAll()
    const updated = [newGoal, ...list.filter(g => g.id !== newGoal.id)]
    if (typeof window !== "undefined") {
      const key = getUserStorageKey(BASE_STORAGE_KEYS.GOALS)
      localStorage.setItem(key, JSON.stringify(updated))
    }
    return newGoal
  },

  async deposit(goalId: string, amount: number, accountName: string): Promise<void> {
    const list = await this.getAll()
    const targetGoal = list.find((g) => g.id === goalId)
    if (!targetGoal) return

    const nextAmt = targetGoal.currentAmount + amount
    const nextStatus: "active" | "almost" | "completed" =
      nextAmt >= targetGoal.targetAmount ? "completed" : nextAmt / targetGoal.targetAmount >= 0.75 ? "almost" : "active"

    if (isSupabaseConfigured && supabase && goalId.includes("-")) {
      try {
        await supabase
          .from("goals")
          .update({ current_amount: nextAmt, status: nextStatus })
          .eq("id", goalId)

        // Catat riwayat setoran ke saving_logs (RLS: goal milik user).
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
        console.warn("Supabase goal deposit error:", err)
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

    // Auto-catat ke transaksi pribadi (mengurangi saldo akun sumber).
    await transactionService.add({
      title: `Setoran Tabungan: ${targetGoal.title}`,
      category: "Tabungan & Target",
      type: "out",
      amount,
      account: accountName || "Bank BCA",
      date: todayLocalISO(),
      formattedDate: formatIdDate(new Date()),
      notes: `Setoran otomatis ke target ${targetGoal.title}`,
    })
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
          .select('*')
          .eq('user_id', currentUser.id)
          .order('created_at', { ascending: false })

        if (!error && data) {
          const mapped: ScheduledBillRecord[] = data.map((b) => ({
            id: b.id,
            title: b.title,
            amount: Number(b.amount),
            date: b.due_date,
            formattedDate: new Date(b.due_date).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }),
            category: b.category,
            account: "Bank BCA",
            status: b.status || "pending",
            notes: b.title,
          }))
          if (typeof window !== "undefined") {
            const key = getUserStorageKey(BASE_STORAGE_KEYS.SCHEDULED)
            localStorage.setItem(key, JSON.stringify(mapped))
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

  async add(item: Omit<ScheduledBillRecord, "id">): Promise<ScheduledBillRecord> {
    const currentUser = authService.getCurrentUser()
    let newBill: ScheduledBillRecord = {
      ...item,
      id: `SCH-${Date.now().toString().slice(-4)}`,
    }

    if (isSupabaseConfigured && supabase && currentUser?.id && currentUser.id.includes('-')) {
      try {
        const { data, error } = await supabase.from('scheduled_payments').insert([{
          user_id: currentUser.id,
          title: item.title,
          category: item.category,
          amount: item.amount,
          due_date: item.date,
          status: item.status || 'pending'
        }]).select().single()

        if (!error && data) {
          newBill = {
            id: data.id,
            title: data.title,
            amount: Number(data.amount),
            date: data.due_date,
            formattedDate: item.formattedDate,
            category: data.category,
            account: item.account,
            status: data.status as "pending" | "paid",
            notes: item.notes,
          }
        } else if (error) {
          console.error("Supabase scheduled payment insert error:", error)
        }
      } catch (err) {
        console.warn("Supabase scheduled payment insert fallback:", err)
      }
    }

    const list = await this.getAll()
    const updated = [newBill, ...list.filter(b => b.id !== newBill.id)]
    if (typeof window !== "undefined") {
      const key = getUserStorageKey(BASE_STORAGE_KEYS.SCHEDULED)
      localStorage.setItem(key, JSON.stringify(updated))
    }
    return newBill
  },

  async pay(id: string): Promise<void> {
    const list = await this.getAll()
    const target = list.find((b) => b.id === id)
    if (!target) return

    if (isSupabaseConfigured && supabase && id.includes('-')) {
      try {
        await supabase.from('scheduled_payments').update({ status: 'paid' }).eq('id', id)
      } catch (err) {
        console.warn("Supabase scheduled payment pay fallback:", err)
      }
    }

    const updated = list.map((b) => (b.id === id ? { ...b, status: "paid" as const } : b))
    if (typeof window !== "undefined") {
      const key = getUserStorageKey(BASE_STORAGE_KEYS.SCHEDULED)
      localStorage.setItem(key, JSON.stringify(updated))
    }

    // Auto-catat ke transaksi pribadi (mengurangi saldo akun).
    await transactionService.add({
      title: `Pembayaran Tagihan: ${target.title}`,
      category: target.category,
      type: "out",
      amount: target.amount,
      account: target.account || "Bank BCA",
      date: todayLocalISO(),
      formattedDate: formatIdDate(new Date()),
      notes: target.notes || `Pelunasan jadwal tagihan ${target.title}`,
    })
  },
}

// Helper: ubah teks tanggal bebas ("25 Aug 2026", "2026-08-25", dll) → "YYYY-MM-DD".
// Kolom `due_date` di Postgres bertipe date, jadi harus format valid; kalau gagal
// diparse, pakai tanggal hari ini.
function toISODate(input: string): string {
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

  async createRoom(name: string, location?: string, monthlyFee: number = 200000, maxMembers: number = 4): Promise<KamarRoomRecord> {
    const currentUser = authService.getCurrentUser()
    const code = `KOS-${Math.floor(100 + Math.random() * 900)}`

    let newRoom: KamarRoomRecord = {
      id: `ROOM-${Date.now().toString().slice(-4)}`,
      name,
      code,
      location,
      monthlyFee,
      maxMembers,
      role: "Ketua Kos",
    }

    if (isSupabaseConfigured && supabase) {
      try {
        const { data: authUser } = await supabase.auth.getUser()
        const sbUserId = authUser?.user?.id || currentUser?.id

        if (sbUserId && sbUserId.includes('-')) {
          const { data, error } = await supabase.from('rooms').insert([{
            name,
            invite_code: code,
            location: location || '',
            monthly_fee: monthlyFee,
            max_members: maxMembers,
            created_by: sbUserId
          }]).select().single()

          if (error) {
            console.error("Supabase createRoom insert error:", error)
          } else if (data) {
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
            } else {
              newRoom = {
                id: data.id,
                name: data.name,
                code: data.invite_code || data.code || code,
                location: data.location,
                monthlyFee: data.monthly_fee,
                maxMembers: data.max_members,
                role: "Ketua Kos",
              }
            }
          }
        }
      } catch (err) {
        console.error("Supabase room create exception:", err)
      }
    }

    if (typeof window !== "undefined") {
      const key = getUserStorageKey(BASE_STORAGE_KEYS.ROOM)
      localStorage.setItem(key, JSON.stringify(newRoom))
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
        const { data: roomData, error: roomErr } = await supabase
          .from("rooms")
          .select("*")
          .eq("invite_code", cleanCode)
          .maybeSingle()

        if (roomErr) {
          return { room: null, error: "Gagal mencari kamar. Coba lagi." }
        }
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
      id: `ROOM-${Date.now().toString().slice(-4)}`,
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
    if (typeof window !== "undefined") {
      const key = getUserStorageKey(BASE_STORAGE_KEYS.ROOM)
      localStorage.removeItem(key)
      window.dispatchEvent(new Event("room-updated"))
    }
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
          .select("*, room_transaction_splits(*)")
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
              splitBetween,
              perPersonAmount: perPerson,
              myShare,
              status,
              date: t.date,
              formattedDate: formatIdDate(t.date),
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
      id: `STX-${Date.now().toString().slice(-4)}`,
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
          // Buat baris utang per anggota (kecuali si penalang).
          const splitRows = nonPayerSharers
            .filter((id) => id.includes("-"))
            .map((userId) => ({
              transaction_id: data.id,
              user_id: userId,
              amount_owed: perPerson,
              is_settled: false,
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
      writeSplitMeta(newTx.id, item.payerAccount)
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
   * Selaraskan transaksi pribadi user dengan kondisi split bill kamar.
   * IDEMPOTEN (pakai penanda di notes) — aman dipanggil berkali-kali / di banyak device.
   * Ada guard "in-flight" supaya panggilan bersamaan (mis. beberapa komponen mount
   * sekaligus) tidak menghasilkan transaksi dobel dalam satu sesi.
   *
   * Tiga kejadian yang dicatat ke transaksi pribadi:
   *   (a) Saya penalang        → pengeluaran = TOTAL yang saya bayar ke vendor
   *   (b) Saya melunasi bagian  → pengeluaran = bagian saya, ke penalang
   *   (c) Anggota lain melunasi → pemasukan  = uang talangan kembali ke saya
   */
  reconcileRoomLedger(roomId?: string): Promise<void> {
    // Serialkan: setiap panggilan jalan SETELAH yang sebelumnya selesai, sehingga
    // tidak ada dobel-tulis dan setiap panggilan tetap melihat state terbaru.
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

    const seen = new Set<string>()
    for (const n of await transactionService._rawNotes()) collectLedgerRefs(n, seen)

    const splitMeta = readSplitMeta()
    const accounts = await accountService.getAll()
    const nameMap = await this._memberNameMap(room.id)
    const resolveAcct = (preferred?: string): string => {
      if (preferred && accounts.some((a) => a.name === preferred)) return preferred
      const bank = accounts.find((a) => a.accountCategory === "bank")
      return bank?.name || accounts[0]?.name || "Bank BCA"
    }

    type Split = { id: string; user_id: string; amount_owed: number; is_settled: boolean }
    type RTx = {
      id: string
      title: string
      total_amount: number
      paid_by_user_id: string
      room_transaction_splits: Split[]
    }
    let rows: RTx[] = []

    if (isSupabaseConfigured && supabase && myId.includes("-") && room.id.includes("-")) {
      const { data, error } = await supabase
        .from("room_transactions")
        .select("id, title, total_amount, paid_by_user_id, room_transaction_splits(id, user_id, amount_owed, is_settled)")
        .eq("room_id", room.id)
      if (error || !data) return
      rows = data as RTx[]
    } else {
      // Mode lokal: dari cache SHARED_TX (biasanya single-user, split kosong).
      try {
        const local: SharedTransactionRecord[] = JSON.parse(
          localStorage.getItem(getUserStorageKey(BASE_STORAGE_KEYS.SHARED_TX)) || "[]",
        )
        rows = local.map((t) => ({
          id: t.id,
          title: t.title,
          total_amount: t.totalAmount,
          paid_by_user_id: t.paidByUserId || "",
          room_transaction_splits: [],
        }))
      } catch {
        return
      }
    }

    for (const t of rows) {
      const splits = t.room_transaction_splits || []

      // (a) Saya penalang → pengeluaran sebesar total yang saya keluarkan.
      if (t.paid_by_user_id === myId && !seen.has(refKey("sbP", t.id))) {
        await transactionService.add({
          title: `Talangan Kos: ${t.title}`,
          category: "Kamar Kos",
          type: "out",
          amount: Number(t.total_amount),
          account: resolveAcct(splitMeta[t.id]?.account),
          date: todayLocalISO(),
          formattedDate: formatIdDate(new Date()),
          notes: `Saya menalangi total tagihan bersama kos ${ledgerRef("sbP", t.id)}`,
        })
        seen.add(refKey("sbP", t.id))
      }

      for (const s of splits) {
        if (!s.is_settled) continue

        // (b) Bagian saya sudah saya lunasi ke penalang → pengeluaran.
        if (s.user_id === myId && !seen.has(refKey("sbO", s.id))) {
          const payerName = nameMap.get(t.paid_by_user_id) || "penalang"
          await transactionService.add({
            title: `Bayar Bagian Split: ${t.title}`,
            category: "Kamar Kos",
            type: "out",
            amount: Number(s.amount_owed),
            account: resolveAcct(),
            date: todayLocalISO(),
            formattedDate: formatIdDate(new Date()),
            notes: `Pelunasan bagian saya ke ${payerName} ${ledgerRef("sbO", s.id)}`,
          })
          seen.add(refKey("sbO", s.id))
        }

        // (c) Saya penalang & anggota lain sudah melunasi → pemasukan.
        if (
          t.paid_by_user_id === myId &&
          s.user_id !== myId &&
          !seen.has(refKey("sbB", s.id))
        ) {
          await transactionService.add({
            title: `Pengembalian Talangan: ${t.title}`,
            category: "Kamar Kos",
            type: "in",
            amount: Number(s.amount_owed),
            account: resolveAcct(splitMeta[t.id]?.account),
            date: todayLocalISO(),
            formattedDate: formatIdDate(new Date()),
            notes: `Anggota kos mengembalikan uang talangan ${ledgerRef("sbB", s.id)}`,
          })
          seen.add(refKey("sbB", s.id))
        }
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

          const mapped: RequirementRecord[] = data.map((r: Record<string, unknown>) => ({
            id: r.id as string,
            title: r.title as string,
            category: r.category as string,
            totalPrice: Number(r.total_price),
            splitPeopleCount: Number(r.split_people_count) || 1,
            perPersonPrice: Number(r.per_person_price),
            dueDate: r.due_date
              ? new Date(r.due_date as string).toLocaleDateString("id-ID", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })
              : "-",
            responsiblePerson: (r.responsible_name as string) || "Ketua Kos",
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

    let newReq: RequirementRecord = {
      id: `REQ-${Date.now().toString().slice(-4)}`,
      title: item.title,
      category: item.category,
      totalPrice: item.totalPrice,
      splitPeopleCount: item.splitPeopleCount,
      perPersonPrice: perPerson,
      dueDate: item.dueDate,
      responsiblePerson: item.responsiblePerson,
      isPaidByMe: false,
    }

    if (isSupabaseConfigured && supabase && room?.id && room.id.includes("-")) {
      try {
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
              responsible_user_id: null,
            },
          ])
          .select()
          .single()

        if (!error && data) {
          newReq = {
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
        } else if (error) {
          console.error("Supabase addRequirement insert error:", error)
        }
      } catch (err) {
        console.warn("Supabase addRequirement exception:", err)
      }
    }

    const list = await this.getRequirements()
    const updated = [newReq, ...list.filter((r) => r.id !== newReq.id)]
    if (typeof window !== "undefined") {
      localStorage.setItem(
        getUserStorageKey(BASE_STORAGE_KEYS.REQUIREMENTS),
        JSON.stringify(updated),
      )
    }
    return newReq
  },

  async payRequirement(reqId: string): Promise<void> {
    const list = await this.getRequirements()
    const req = list.find((r) => r.id === reqId)
    if (!req || req.isPaidByMe) return

    const currentUser = authService.getCurrentUser()

    // 1. Auto-catat ke transaksi pribadi (potongan bagian saya).
    const tx = await transactionService.add({
      title: `Iuran Bulanan Kos: ${req.title}`,
      category: "Kamar Kos",
      type: "out",
      amount: req.perPersonPrice,
      account: "Bank BCA",
      date: new Date().toISOString().split("T")[0],
      formattedDate: new Date().toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
      notes: `Potongan otomatis setoran kebutuhan kos`,
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
}
