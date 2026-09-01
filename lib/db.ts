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
  splitBetween: string[]
  perPersonAmount: number
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
  name: string
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
  async signup(fullName: string, email: string, password: string): Promise<{ user: UserSession | null; error: string | null }> {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: typeof window !== "undefined"
              ? `${window.location.origin}/auth/confirm`
              : "http://localhost:3000/auth/confirm",
            data: { full_name: fullName },
          },
        })

        if (error) {
          if (error.message.includes("504") || error.message.includes("timeout") || error.message.includes("Failed to fetch")) {
            console.warn("Supabase auth timeout/504 encountered. Falling back to local session.", error)
            const fallbackSession = saveLocalUserSession({
              id: `usr_${Date.now()}`,
              fullName,
              email,
            })
            return { user: fallbackSession, error: null }
          }
          return { user: null, error: error.message }
        }

        if (data.user) {
          const session: UserSession = {
            id: data.user.id,
            fullName: fullName || data.user.email || "User",
            email: data.user.email || email,
          }
          saveLocalUserSession(session)
          return { user: session, error: null }
        }
      } catch (err: any) {
        console.warn("Supabase network error/timeout caught. Falling back to local mode:", err)
        const fallbackSession = saveLocalUserSession({
          id: `usr_${Date.now()}`,
          fullName,
          email,
        })
        return { user: fallbackSession, error: null }
      }
    }

    // Local Persistence Fallback
    const session = saveLocalUserSession({
      id: `usr_${Date.now()}`,
      fullName,
      email,
    })
    return { user: session, error: null }
  },

  async login(email: string, password: string): Promise<{ user: UserSession | null; error: string | null }> {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (error) {
          if (error.message.includes("504") || error.message.includes("timeout") || error.message.includes("Failed to fetch")) {
            console.warn("Supabase login timeout/504. Falling back to local session.", error)
            const fallbackSession = saveLocalUserSession({
              id: `usr_${Date.now()}`,
              fullName: email.split("@")[0] || "User",
              email,
            })
            return { user: fallbackSession, error: null }
          }
          return { user: null, error: error.message }
        }

        if (data.user) {
          const session: UserSession = {
            id: data.user.id,
            fullName: data.user.user_metadata?.full_name || data.user.email?.split("@")[0] || "User",
            email: data.user.email || email,
          }
          saveLocalUserSession(session)
          return { user: session, error: null }
        }
      } catch (err: any) {
        console.warn("Supabase login exception. Falling back to local mode:", err)
        const fallbackSession = saveLocalUserSession({
          id: `usr_${Date.now()}`,
          fullName: email.split("@")[0] || "User",
          email,
        })
        return { user: fallbackSession, error: null }
      }
    }

    // Local Persistence Fallback
    const session = saveLocalUserSession({
      id: `usr_${Date.now()}`,
      fullName: email.split("@")[0] || "User",
      email,
    })
    return { user: session, error: null }
  },

  async logout(): Promise<void> {
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.auth.signOut()
      } catch {
        // Ignore network errors on logout
      }
    }
    if (typeof window !== "undefined") {
      localStorage.removeItem(BASE_STORAGE_KEYS.USER)
    }
  },

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
}

// ==========================================================
// 2. ACCOUNT SERVICE (User-Scoped Sumber Dana / Accounts)
// ==========================================================
export const accountService = {
  async getAll(): Promise<FinancialAccountRecord[]> {
    const currentUser = authService.getCurrentUser()
    if (isSupabaseConfigured && supabase && currentUser?.id && currentUser.id.includes('-')) {
      try {
        const { data, error } = await supabase
          .from('accounts')
          .select('*')
          .eq('user_id', currentUser.id)
          .order('created_at', { ascending: false })

        if (!error && data) {
          const mapped: FinancialAccountRecord[] = data.map((a: any) => ({
            id: a.id,
            name: a.name,
            type: a.type,
            accountCategory: a.account_category || "bank",
            balance: Number(a.balance),
            cardNumber: a.card_number || "**** **** 0000",
            cardHolder: a.card_holder || currentUser.fullName || "USER",
            expiration: a.expiration || "12/29",
            cardDesignType: a.card_design_type || "brand-dark",
          }))
          if (typeof window !== "undefined") {
            const key = getUserStorageKey(BASE_STORAGE_KEYS.ACCOUNTS)
            localStorage.setItem(key, JSON.stringify(mapped))
          }
          return mapped
        }
      } catch (err) {
        console.warn("Supabase accounts query fallback:", err)
      }
    }

    if (typeof window === "undefined") return []
    const key = getUserStorageKey(BASE_STORAGE_KEYS.ACCOUNTS)
    const stored = localStorage.getItem(key)
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

    if (isSupabaseConfigured && supabase && currentUser?.id && currentUser.id.includes('-')) {
      try {
        const { data, error } = await supabase.from('accounts').insert([{
          user_id: currentUser.id,
          name: item.name,
          type: item.type,
          account_category: item.accountCategory,
          balance: item.balance,
          card_number: item.cardNumber,
          card_holder: item.cardHolder,
          expiration: item.expiration,
          card_design_type: item.cardDesignType,
        }]).select().single()

        if (!error && data) {
          newRecord = {
            id: data.id,
            name: data.name,
            type: data.type,
            accountCategory: data.account_category || item.accountCategory,
            balance: Number(data.balance),
            cardNumber: data.card_number || item.cardNumber,
            cardHolder: data.card_holder || item.cardHolder,
            expiration: data.expiration || item.expiration,
            cardDesignType: data.card_design_type || item.cardDesignType,
          }
        } else if (error) {
          console.error("Supabase account insert error:", error)
        }
      } catch (err) {
        console.warn("Supabase account insert exception:", err)
      }
    }

    const list = await this.getAll()
    const updated = [newRecord, ...list.filter(a => a.id !== newRecord.id)]
    if (typeof window !== "undefined") {
      const key = getUserStorageKey(BASE_STORAGE_KEYS.ACCOUNTS)
      localStorage.setItem(key, JSON.stringify(updated))
    }
    return newRecord
  },

  async updateBalanceByName(name: string, newBalance: number): Promise<void> {
    const currentUser = authService.getCurrentUser()
    if (isSupabaseConfigured && supabase && currentUser?.id && currentUser.id.includes('-')) {
      try {
        await supabase
          .from('accounts')
          .update({ balance: newBalance })
          .eq('user_id', currentUser.id)
          .eq('name', name)
      } catch (err) {
        console.warn("Supabase update balance error:", err)
      }
    }

    const list = await this.getAll()
    const updated = list.map((a) => (a.name === name ? { ...a, balance: newBalance } : a))
    if (typeof window !== "undefined") {
      const key = getUserStorageKey(BASE_STORAGE_KEYS.ACCOUNTS)
      localStorage.setItem(key, JSON.stringify(updated))
    }
  },
}

// ==========================================================
// 3. TRANSACTIONS SERVICE (User-Scoped Database Arus Kas)
// ==========================================================
export const transactionService = {
  async getAll(): Promise<TransactionRecord[]> {
    const currentUser = authService.getCurrentUser()
    if (isSupabaseConfigured && supabase && currentUser?.id && currentUser.id.includes('-')) {
      try {
        const { data, error } = await supabase
          .from('transactions')
          .select('*')
          .eq('user_id', currentUser.id)
          .order('created_at', { ascending: false })

        if (!error && data) {
          const mapped: TransactionRecord[] = data.map((t: any) => ({
            id: t.id,
            title: t.title,
            category: t.category,
            type: t.type as "in" | "out",
            amount: Number(t.amount),
            account: t.account || "Bank BCA",
            date: t.date,
            formattedDate: new Date(t.date).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }),
            notes: t.notes || "",
          }))
          if (typeof window !== "undefined") {
            const key = getUserStorageKey(BASE_STORAGE_KEYS.TRANSACTIONS)
            localStorage.setItem(key, JSON.stringify(mapped))
          }
          return mapped
        }
      } catch (err) {
        console.warn("Supabase transactions query fallback:", err)
      }
    }

    if (typeof window === "undefined") return []
    const key = getUserStorageKey(BASE_STORAGE_KEYS.TRANSACTIONS)
    const stored = localStorage.getItem(key)
    if (!stored) return []
    try {
      return JSON.parse(stored)
    } catch {
      return []
    }
  },

  async add(item: Omit<TransactionRecord, "id">): Promise<TransactionRecord> {
    const currentUser = authService.getCurrentUser()
    let newRecord: TransactionRecord = {
      ...item,
      id: `TX-${Date.now().toString().slice(-4)}`,
    }

    if (isSupabaseConfigured && supabase && currentUser?.id && currentUser.id.includes('-')) {
      try {
        const { data, error } = await supabase.from('transactions').insert([{
          user_id: currentUser.id,
          title: item.title,
          category: item.category,
          type: item.type,
          amount: item.amount,
          account: item.account,
          date: item.date,
          notes: item.notes || "",
        }]).select().single()

        if (!error && data) {
          newRecord = {
            id: data.id,
            title: data.title,
            category: data.category,
            type: data.type as "in" | "out",
            amount: Number(data.amount),
            account: data.account || item.account,
            date: data.date,
            formattedDate: new Date(data.date).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }),
            notes: data.notes || "",
          }
        } else if (error) {
          console.error("Supabase transaction insert error:", error)
        }
      } catch (err) {
        console.warn("Supabase transaction insert exception:", err)
      }
    }

    const list = await this.getAll()
    const updated = [newRecord, ...list.filter(t => t.id !== newRecord.id)]
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
          const mapped: GoalRecord[] = data.map((g: any) => ({
            id: g.id,
            title: g.title,
            category: g.category,
            targetAmount: Number(g.target_amount),
            currentAmount: Number(g.current_amount),
            deadline: g.target_date || g.deadline || "",
            status: g.status as any,
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
          target_date: item.deadline,
          status: 'active',
        }]).select().single()

        if (!error && data) {
          newGoal = {
            id: data.id,
            title: data.title,
            category: data.category,
            targetAmount: Number(data.target_amount),
            currentAmount: Number(data.current_amount),
            deadline: data.target_date || item.deadline,
            status: data.status as any,
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

    if (isSupabaseConfigured && supabase && goalId.includes('-')) {
      try {
        await supabase.from('goals').update({
          current_amount: nextAmt,
          status: nextStatus,
        }).eq('id', goalId)
      } catch (err) {
        console.warn("Supabase goal deposit error:", err)
      }
    }

    const updated = list.map((g) => (g.id === goalId ? { ...g, currentAmount: nextAmt, status: nextStatus } : g))
    if (typeof window !== "undefined") {
      const key = getUserStorageKey(BASE_STORAGE_KEYS.GOALS)
      localStorage.setItem(key, JSON.stringify(updated))
    }

    // Auto log to personal transactions for this user
    await transactionService.add({
      title: `Setoran Tabungan: ${targetGoal.title}`,
      category: "Tabungan & Target",
      type: "out",
      amount,
      account: accountName || "Bank BCA",
      date: new Date().toISOString().split("T")[0],
      formattedDate: new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }),
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
          const mapped: ScheduledBillRecord[] = data.map((b: any) => ({
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

    // Auto-log to personal transactions
    await transactionService.add({
      title: `Pembayaran Tagihan: ${target.title}`,
      category: target.category,
      type: "out",
      amount: target.amount,
      account: target.account || "Bank BCA",
      date: new Date().toISOString().split("T")[0],
      formattedDate: new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }),
      notes: target.notes || `Pelunasan jadwal tagihan ${target.title}`,
    })
  },
}

// ==========================================================
// 6. KAMAR KOS SERVICE (User-Scoped Room Management & Split Bill)
// ==========================================================
export const kamarService = {
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
            newRoom = {
              id: data.id,
              name: data.name,
              code: data.invite_code || data.code || code,
              location: data.location,
              monthlyFee: data.monthly_fee,
              maxMembers: data.max_members,
              role: "Ketua Kos",
            }
            await supabase.from('room_members').insert([{
              room_id: data.id,
              user_id: sbUserId,
              user_name: currentUser?.fullName || 'Saya',
              role: 'Ketua Kos',
              room_number: 'Kamar 01'
            }])
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

  async joinRoom(code: string): Promise<KamarRoomRecord> {
    const currentUser = authService.getCurrentUser()
    let joinedRoom: KamarRoomRecord = {
      id: `ROOM-${Date.now().toString().slice(-4)}`,
      name: `Kamar Kos (${code.toUpperCase()})`,
      code: code.toUpperCase(),
      monthlyFee: 200000,
      maxMembers: 4,
      role: "Anggota",
    }

    if (isSupabaseConfigured && supabase) {
      try {
        const { data: roomData } = await supabase
          .from('rooms')
          .select('*')
          .eq('invite_code', code.toUpperCase())
          .single()

        if (roomData) {
          joinedRoom = {
            id: roomData.id,
            name: roomData.name,
            code: roomData.invite_code || roomData.code || code.toUpperCase(),
            location: roomData.location,
            monthlyFee: roomData.monthly_fee,
            maxMembers: roomData.max_members,
            role: "Anggota",
          }
          if (currentUser?.id && currentUser.id.includes('-')) {
            await supabase.from('room_members').insert([{
              room_id: roomData.id,
              user_id: currentUser.id,
              user_name: currentUser.fullName || 'Anggota',
              role: 'Anggota',
              room_number: 'Kamar Baru'
            }])
          }
        }
      } catch (err) {
        console.warn("Supabase join room fallback:", err)
      }
    }

    if (typeof window !== "undefined") {
      const key = getUserStorageKey(BASE_STORAGE_KEYS.ROOM)
      localStorage.setItem(key, JSON.stringify(joinedRoom))
      window.dispatchEvent(new Event("room-updated"))
    }
    return joinedRoom
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

    if (isSupabaseConfigured && supabase && roomId && roomId.includes('-')) {
      try {
        const { data, error } = await supabase
          .from('room_members')
          .select('*')
          .eq('room_id', roomId)
        if (!error && data && data.length > 0) {
          return data.map((m: any) => ({
            id: m.id || m.user_id,
            name: m.user_id === currentUser?.id ? `${m.user_name} (Saya)` : m.user_name,
            role: m.role || "Anggota",
            roomNumber: m.room_number || "Kamar 01",
            avatar: (m.user_name || "US").slice(0, 2).toUpperCase(),
            netBalance: 0,
            status: "clear",
          }))
        }
      } catch (err) {
        console.warn("Supabase room members query fallback:", err)
      }
    }

    return [
      {
        id: currentUser?.id || "M-1",
        name: `${myName} (Saya)`,
        role: "Ketua Kos",
        roomNumber: "Kamar 01",
        avatar: myName.slice(0, 2).toUpperCase(),
        netBalance: 0,
        status: "clear",
      },
    ]
  },

  async getDebtSummary(): Promise<DebtSummaryRecord[]> {
    const txs = await this.getSharedTransactions()
    if (txs.length === 0) return []

    const debts: DebtSummaryRecord[] = []
    for (const t of txs) {
      if (t.status === "pending" && t.myShare !== 0) {
        if (t.myShare > 0) {
          debts.push({
            from: "Saya",
            to: t.paidBy,
            amount: t.myShare,
            note: t.title,
          })
        } else {
          debts.push({
            from: "Anggota Kos",
            to: "Saya",
            amount: Math.abs(t.myShare),
            note: t.title,
          })
        }
      }
    }
    return debts
  },

  async getSharedTransactions(): Promise<SharedTransactionRecord[]> {
    const room = this.getUserRoom()
    if (isSupabaseConfigured && supabase && room?.id && room.id.includes('-')) {
      try {
        const { data, error } = await supabase
          .from('room_transactions')
          .select('*')
          .eq('room_id', room.id)
          .order('created_at', { ascending: false })

        if (!error && data && data.length > 0) {
          const currentUser = authService.getCurrentUser()
          return data.map((t: any) => ({
            id: t.id,
            title: t.title,
            category: t.category,
            totalAmount: Number(t.total_amount),
            paidBy: t.paid_by_name || "Saya",
            splitBetween: t.split_between || [],
            perPersonAmount: Number(t.per_person_amount || 0),
            myShare: t.paid_by_user_id === currentUser?.id ? -(Number(t.total_amount) - Number(t.per_person_amount)) : Number(t.per_person_amount),
            status: t.status as "settled" | "pending",
            date: t.date,
            formattedDate: new Date(t.date).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }),
          }))
        }
      } catch (err) {
        console.warn("Supabase room transactions query fallback:", err)
      }
    }

    if (typeof window === "undefined") return []
    const key = getUserStorageKey(BASE_STORAGE_KEYS.SHARED_TX)
    const stored = localStorage.getItem(key)
    if (!stored) return []
    try {
      return JSON.parse(stored)
    } catch {
      return []
    }
  },

  async addSharedTransaction(item: Omit<SharedTransactionRecord, "id" | "date" | "formattedDate">): Promise<SharedTransactionRecord> {
    const room = this.getUserRoom()
    const currentUser = authService.getCurrentUser()
    let newTx: SharedTransactionRecord = {
      ...item,
      id: `STX-${Date.now().toString().slice(-4)}`,
      splitBetween: item.splitBetween || [],
      perPersonAmount: item.perPersonAmount || 0,
      date: new Date().toISOString().split("T")[0],
      formattedDate: new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }),
    }

    if (isSupabaseConfigured && supabase && room?.id && room.id.includes('-') && currentUser?.id && currentUser.id.includes('-')) {
      try {
        const { data, error } = await supabase.from('room_transactions').insert([{
          room_id: room.id,
          created_by: currentUser.id,
          paid_by_user_id: currentUser.id,
          paid_by_name: item.paidBy || currentUser.fullName || "Saya",
          title: item.title,
          category: item.category,
          total_amount: item.totalAmount,
          per_person_amount: item.perPersonAmount || Math.abs(item.myShare),
          date: new Date().toISOString().split("T")[0],
          status: item.status || "pending",
        }]).select().single()

        if (!error && data) {
          newTx = {
            id: data.id,
            title: data.title,
            category: data.category,
            totalAmount: Number(data.total_amount),
            paidBy: data.paid_by_name || item.paidBy,
            splitBetween: item.splitBetween || [],
            perPersonAmount: Number(data.per_person_amount || item.perPersonAmount || 0),
            myShare: item.myShare,
            status: data.status as "settled" | "pending",
            date: data.date,
            formattedDate: new Date(data.date).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }),
          }
        } else if (error) {
          console.error("Supabase addSharedTransaction error:", error)
        }
      } catch (err) {
        console.warn("Supabase addSharedTransaction exception:", err)
      }
    }

    const list = await this.getSharedTransactions()
    const updated = [newTx, ...list.filter(t => t.id !== newTx.id)]
    if (typeof window !== "undefined") {
      const key = getUserStorageKey(BASE_STORAGE_KEYS.SHARED_TX)
      localStorage.setItem(key, JSON.stringify(updated))
    }
    return newTx
  },

  async getRequirements(): Promise<RequirementRecord[]> {
    const room = this.getUserRoom()
    if (isSupabaseConfigured && supabase && room?.id && room.id.includes('-')) {
      try {
        const { data, error } = await supabase
          .from('room_requirements')
          .select('*')
          .eq('room_id', room.id)
          .order('created_at', { ascending: false })

        if (!error && data && data.length > 0) {
          return data.map((r: any) => ({
            id: r.id,
            title: r.title,
            category: r.category,
            totalPrice: Number(r.total_price),
            splitPeopleCount: r.split_people_count,
            perPersonPrice: Number(r.per_person_price),
            dueDate: new Date(r.due_date).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }),
            responsiblePerson: r.responsible_name || "Ketua Kos",
            isPaidByMe: false,
          }))
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

  async payRequirement(reqId: string): Promise<void> {
    const list = await this.getRequirements()
    const req = list.find((r) => r.id === reqId)
    if (!req) return

    const updated = list.map((r) => (r.id === reqId ? { ...r, isPaidByMe: true } : r))
    if (typeof window !== "undefined") {
      const key = getUserStorageKey(BASE_STORAGE_KEYS.REQUIREMENTS)
      localStorage.setItem(key, JSON.stringify(updated))
    }

    // Auto-deduct to personal transactions for this user
    await transactionService.add({
      title: `Iuran Bulanan Kos: ${req.title}`,
      category: "Kamar Kos",
      type: "out",
      amount: req.perPersonPrice,
      account: "Bank BCA",
      date: new Date().toISOString().split("T")[0],
      formattedDate: new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }),
      notes: `Potongan otomatis setoran kebutuhan kos`,
    })
  },
}
