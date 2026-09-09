"use client"

import React, { useState, useEffect } from "react"
import {
  transactionService,
  kamarService,
  accountService,
  stripLedgerRef,
  isSystemTransaction,
  FinancialAccountRecord,
} from "@/lib/db"
import { useMoney } from "@/lib/currency"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/components/ui/pagination"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Spinner } from "@/components/ui/spinner"
import {
  Plus,
  Search,
  CheckCircle2,
  Calendar as CalendarIcon,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  Pencil,
  Trash2,
  Lock,
} from "lucide-react"

export interface TransactionItem {
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

export default function TransaksiPage() {
  const { fmt, formatInput, formatValue, parseInput, symbol, zero } = useMoney()
  // Mock Initial Transactions State
  const [transactions, setTransactions] = useState<TransactionItem[]>([])
  const [accounts, setAccounts] = useState<FinancialAccountRecord[]>([])

  const refreshTransactions = React.useCallback(async () => {
    const data = await transactionService.getAll()
    setTransactions(data)
  }, [])

  useEffect(() => {
    async function loadTransactions() {
      // Selaraskan dampak split bill kos (talangan / pengembalian) lebih dulu.
      await kamarService.reconcileRoomLedger()
      const [data, accs] = await Promise.all([
        transactionService.getAll(),
        accountService.getAll(),
      ])
      setTransactions(data)
      setAccounts(accs)
    }
    loadTransactions()
  }, [])

  // Filter & Search State
  const [searchQuery, setSearchQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [typeFilter, setTypeFilter] = useState("all")

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(6)

  // New Transaction Form State
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newAmount, setNewAmount] = useState("")
  const [newType, setNewType] = useState<"in" | "out">("out")
  const [newCategory, setNewCategory] = useState("Konsumsi")
  const [newAccount, setNewAccount] = useState("Bank BCA")
  const [newSelectedDate, setNewSelectedDate] = useState<Date>(new Date())
  const [newNotes, setNewNotes] = useState("")
  const [notification, setNotification] = useState<string | null>(null)

  const showNotification = (msg: string) => {
    setNotification(msg)
    setTimeout(() => setNotification(null), 4000)
  }

  // Filter Transactions
  const filteredTransactions = transactions.filter((tx) => {
    const matchesSearch =
      tx.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.account.toLowerCase().includes(searchQuery.toLowerCase()) ||
      stripLedgerRef(tx.notes).toLowerCase().includes(searchQuery.toLowerCase())

    const matchesCategory = categoryFilter === "all" || tx.category === categoryFilter
    const matchesType = typeFilter === "all" || tx.type === typeFilter

    return matchesSearch && matchesCategory && matchesType
  })

  // Pagination Calculation
  const totalItems = filteredTransactions.length
  const totalPages = Math.ceil(totalItems / (pageSize || 6)) || 1
  const startIndex = (currentPage - 1) * pageSize
  const paginatedTransactions = filteredTransactions.slice(startIndex, startIndex + pageSize)

  // Totals
  const totalIncome = filteredTransactions
    .filter((t) => t.type === "in")
    .reduce((sum, t) => sum + t.amount, 0)
  const totalExpense = filteredTransactions
    .filter((t) => t.type === "out")
    .reduce((sum, t) => sum + t.amount, 0)

  const [isSubmitting, setIsSubmitting] = useState(false)

  const formatNumberWithDots = formatInput
  const parseFormattedNumber = parseInput

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle || !newAmount) return

    const parsedAmount = parseFormattedNumber(newAmount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) return

    setIsSubmitting(true)
    const dateObj = newSelectedDate || new Date()
    // Tanggal lokal (bukan UTC) supaya tidak mundur 1 hari di UTC+8.
    const isoDate = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}-${String(dateObj.getDate()).padStart(2, "0")}`
    const formatted = dateObj.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })

    await transactionService.add({
      title: newTitle,
      category: newCategory,
      type: newType,
      amount: parsedAmount,
      account: newAccount,
      date: isoDate,
      formattedDate: formatted,
      notes: newNotes,
    })

    const refreshedList = await transactionService.getAll()
    setTransactions(refreshedList)
    showNotification(`Transaksi "${newTitle}" berhasil dicatat ke database!`)

    setNewTitle("")
    setNewAmount("")
    setNewNotes("")
    setIsSubmitting(false)
    setIsAddDialogOpen(false)
  }

  // ---- Edit / Delete state ----
  const [editTx, setEditTx] = useState<TransactionItem | null>(null)
  const [editTitle, setEditTitle] = useState("")
  const [editAmount, setEditAmount] = useState("")
  const [editType, setEditType] = useState<"in" | "out">("out")
  const [editCategory, setEditCategory] = useState("Konsumsi")
  const [editAccount, setEditAccount] = useState("")
  const [editNotes, setEditNotes] = useState("")
  const [isEditing, setIsEditing] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const openEdit = (tx: TransactionItem) => {
    setEditTx(tx)
    setEditTitle(tx.title)
    setEditAmount(formatValue(tx.amount))
    setEditType(tx.type)
    setEditCategory(tx.category)
    setEditAccount(tx.account)
    setEditNotes(stripLedgerRef(tx.notes))
  }

  const handleEditTransaction = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editTx || !editTitle) return
    const amt = parseInput(editAmount)
    if (isNaN(amt) || amt <= 0) return

    setIsEditing(true)
    await transactionService.update(editTx.id, {
      title: editTitle,
      category: editCategory,
      type: editType,
      amount: amt,
      account: editAccount,
      notes: editNotes,
    })
    await refreshTransactions()
    setIsEditing(false)
    setEditTx(null)
    showNotification(`Transaksi "${editTitle}" berhasil diperbarui.`)
  }

  const handleDeleteTransaction = async (tx: TransactionItem) => {
    setDeletingId(tx.id)
    await transactionService.remove(tx.id)
    await refreshTransactions()
    setDeletingId(null)
    showNotification(`Transaksi "${tx.title}" dihapus & saldo dikembalikan.`)
  }

  return (
    <>
      {/* Header Bar (CLEAN: No Action Buttons in Top Header) */}
      <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b px-4">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-2 data-vertical:h-4 data-vertical:self-auto"
          />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage className="font-semibold text-base">
                  Catatan Transaksi & Arus Kas
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 bg-background min-h-screen">
        {/* Toast Notification Banner */}
        {notification && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs font-medium animate-in fade-in slide-in-from-top-2">
            <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{notification}</span>
          </div>
        )}

        {/* 1. Summary Metric Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="shadow-none border border-border p-5 gap-3 bg-card">
            <CardHeader className="p-0 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-semibold text-muted-foreground tracking-tight">
                Total Pemasukan (Filter)
              </CardTitle>
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600">
                <ArrowDownLeft className="size-4" />
              </div>
            </CardHeader>
            <CardContent className="p-0 space-y-1">
              <div className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                +{fmt(totalIncome)}
              </div>
              <p className="text-xs text-muted-foreground">Total pemasukan tercatat</p>
            </CardContent>
          </Card>

          <Card className="shadow-none border border-border p-5 gap-3 bg-card">
            <CardHeader className="p-0 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-semibold text-muted-foreground tracking-tight">
                Total Pengeluaran (Filter)
              </CardTitle>
              <div className="p-2 rounded-xl bg-rose-500/10 text-rose-600">
                <ArrowUpRight className="size-4" />
              </div>
            </CardHeader>
            <CardContent className="p-0 space-y-1">
              <div className="text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400">
                -{fmt(totalExpense)}
              </div>
              <p className="text-xs text-muted-foreground">Total pengeluaran tercatat</p>
            </CardContent>
          </Card>

          <Card className="shadow-none border border-border p-5 gap-3 bg-card">
            <CardHeader className="p-0 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-semibold text-muted-foreground tracking-tight">
                Bersih Arus Kas (Net)
              </CardTitle>
              <div className="p-2 rounded-xl bg-muted/60 text-foreground">
                <Wallet className="size-4" />
              </div>
            </CardHeader>
            <CardContent className="p-0 space-y-1">
              <div className={`text-2xl font-bold tracking-tight ${
                totalIncome - totalExpense >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
              }`}>
                {fmt(totalIncome - totalExpense)}
              </div>
              <p className="text-xs text-muted-foreground">Arus kas bersih periode ini</p>
            </CardContent>
          </Card>
        </div>

        {/* 2. Filter Controls Card */}
        <Card className="border border-border shadow-none p-4 gap-4 bg-card">
          <div className="grid gap-3 sm:grid-cols-12 items-center">
            {/* Search Input */}
            <div className="sm:col-span-6 relative">
              <Search className="size-4 absolute left-3 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Cari transaksi, akun, atau catatan..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setCurrentPage(1)
                }}
                className="pl-9 text-xs border-border"
              />
            </div>

            {/* Category Filter */}
            <div className="sm:col-span-3">
              <Select value={categoryFilter} onValueChange={(val) => {
                setCategoryFilter(val)
                setCurrentPage(1)
              }}>
                <SelectTrigger className="w-full text-xs border-border">
                  <SelectValue placeholder="Kategori" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Kategori</SelectItem>
                  <SelectItem value="Konsumsi">Konsumsi</SelectItem>
                  <SelectItem value="Kamar Kos">Kamar Kos</SelectItem>
                  <SelectItem value="Tabungan & Target">Tabungan & Target</SelectItem>
                  <SelectItem value="Pemasukan">Pemasukan</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Type Filter */}
            <div className="sm:col-span-3">
              <Select value={typeFilter} onValueChange={(val) => {
                setTypeFilter(val)
                setCurrentPage(1)
              }}>
                <SelectTrigger className="w-full text-xs border-border">
                  <SelectValue placeholder="Tipe Transaksi" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Tipe (Masuk & Keluar)</SelectItem>
                  <SelectItem value="in">🟢 Pemasukan Sahaja</SelectItem>
                  <SelectItem value="out">🔴 Pengeluaran Sahaja</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        {/* 3. Main Transactions Table Section (With Catat Transaksi Button Moved Here) */}
        <Card className="border border-border shadow-none p-5 gap-4 bg-card">
          <CardHeader className="p-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                Daftar Riwayat Transaksi
              </CardTitle>
              <CardDescription className="text-xs">
                Menampilkan {paginatedTransactions.length} dari {filteredTransactions.length} total transaksi
              </CardDescription>
            </div>

            {/* Catat Transaksi Button (MOVED FROM TOP HEADER BAR TO SECTION HEADER) */}
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="shadow-none text-xs shrink-0">
                  <Plus className="size-4 mr-1.5" /> Catat Transaksi Baru
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md shadow-none border">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-base font-bold">
                    <Plus className="size-5 text-primary" />
                    Catat Transaksi Keuangan Baru
                  </DialogTitle>
                  <DialogDescription className="text-xs">
                    Masukkan rincian pemasukan atau pengeluaran baru Anda.
                  </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleAddTransaction} className="space-y-4 pt-2">
                  <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-muted/60 text-xs">
                    <button
                      type="button"
                      onClick={() => setNewType("out")}
                      className={`py-1.5 px-3 rounded-lg font-semibold transition-all ${
                        newType === "out" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground"
                      }`}
                    >
                      🔴 Pengeluaran
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewType("in")}
                      className={`py-1.5 px-3 rounded-lg font-semibold transition-all ${
                        newType === "in" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground"
                      }`}
                    >
                      🟢 Pemasukan
                    </button>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Keterangan Transaksi</label>
                    <Input
                      placeholder="Contoh: Belanja Bulanan, Gaji Proyek"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground">Nominal ({symbol})</label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        placeholder={zero}
                        value={newAmount}
                        onChange={(e) => setNewAmount(formatNumberWithDots(e.target.value))}
                        required
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground">Kategori</label>
                      <Select value={newCategory} onValueChange={setNewCategory}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Kategori" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Konsumsi">Konsumsi</SelectItem>
                          <SelectItem value="Kamar Kos">Kamar Kos</SelectItem>
                          <SelectItem value="Tabungan & Target">Tabungan & Target</SelectItem>
                          <SelectItem value="Pemasukan">Pemasukan Gaji/Bonus</SelectItem>
                          <SelectItem value="Transportasi">Transportasi</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {/* SHADCN POPOVER CALENDAR DATE PICKER */}
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground">Tanggal</label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-medium h-9 text-xs border-border shadow-none bg-background",
                              !newSelectedDate && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 size-4 text-muted-foreground" />
                            {newSelectedDate ? (
                              format(newSelectedDate, "dd/MM/yyyy")
                            ) : (
                              <span>Pilih Tanggal</span>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 border border-border shadow-md" align="start">
                          <Calendar
                            mode="single"
                            selected={newSelectedDate}
                            onSelect={(date) => date && setNewSelectedDate(date)}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground">Sumber Dana</label>
                      <Select value={newAccount} onValueChange={setNewAccount}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Sumber Dana" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Bank BCA">Bank BCA</SelectItem>
                          <SelectItem value="Bank Mandiri">Bank Mandiri</SelectItem>
                          <SelectItem value="Tunai">Tunai / Cash</SelectItem>
                          <SelectItem value="GoPay">GoPay</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Catatan Tambahan (Opsional)</label>
                    <Textarea
                      placeholder="Catatan rincian..."
                      value={newNotes}
                      onChange={(e) => setNewNotes(e.target.value)}
                    />
                  </div>

                  <DialogFooter className="pt-2">
                    <DialogClose asChild>
                      <Button type="button" variant="outline" className="shadow-none text-xs">
                        Batal
                      </Button>
                    </DialogClose>
                    <Button type="submit" disabled={isSubmitting} className="shadow-none text-xs">
                      {isSubmitting ? (
                        <div className="flex items-center gap-1.5">
                          <Spinner className="size-3.5" />
                          <span>Menyimpan...</span>
                        </div>
                      ) : (
                        "Simpan Transaksi"
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </CardHeader>

          {/* Table */}
          <CardContent className="p-0 -mx-5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-5 py-3 text-xs font-semibold text-muted-foreground">Tanggal</TableHead>
                  <TableHead className="px-5 py-3 text-xs font-semibold text-muted-foreground">Tipe</TableHead>
                  <TableHead className="px-5 py-3 text-xs font-semibold text-muted-foreground">Keterangan</TableHead>
                  <TableHead className="px-5 py-3 text-xs font-semibold text-muted-foreground">Kategori</TableHead>
                  <TableHead className="px-5 py-3 text-xs font-semibold text-muted-foreground">Sumber Dana</TableHead>
                  <TableHead className="px-5 py-3 text-xs font-semibold text-muted-foreground text-right">Nominal</TableHead>
                  <TableHead className="px-5 py-3 text-xs font-semibold text-muted-foreground text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedTransactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-xs text-muted-foreground">
                      Tidak ada transaksi yang ditemukan.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedTransactions.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="px-5 py-3.5 text-xs text-muted-foreground font-medium">
                        {tx.formattedDate}
                      </TableCell>
                      <TableCell className="px-5 py-3.5">
                        {tx.type === "in" ? (
                          <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-none shadow-none text-xs font-semibold">
                            Pemasukan
                          </Badge>
                        ) : (
                          <Badge className="bg-rose-500/15 text-rose-600 dark:text-rose-400 border-none shadow-none text-xs font-semibold">
                            Pengeluaran
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="px-5 py-3.5">
                        <div className="font-semibold text-sm">{tx.title}</div>
                        {stripLedgerRef(tx.notes) && (
                          <div className="text-xs text-muted-foreground">{stripLedgerRef(tx.notes)}</div>
                        )}
                      </TableCell>
                      <TableCell className="px-5 py-3.5">
                        <Badge variant="outline" className="text-xs font-normal border-border">
                          {tx.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-5 py-3.5 text-xs text-muted-foreground font-medium">
                        {tx.account}
                      </TableCell>
                      <TableCell className={`px-5 py-3.5 text-right font-bold text-sm ${
                        tx.type === 'in' ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'
                      }`}>
                        {tx.type === "in" ? "+" : "-"}{fmt(tx.amount)}
                      </TableCell>
                      <TableCell className="px-5 py-3.5 text-right whitespace-nowrap">
                        {isSystemTransaction(tx.notes) ? (
                          <span
                            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
                            title="Transaksi otomatis — ubah dari fitur sumbernya (split bill kos / target tabungan / iuran)"
                          >
                            <Lock className="size-3" /> Terkunci
                          </span>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-muted-foreground hover:text-foreground"
                              onClick={() => openEdit(tx)}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 text-muted-foreground hover:text-rose-600"
                                  disabled={deletingId === tx.id}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="text-rose-600 dark:text-rose-400">
                                    Hapus transaksi ini?
                                  </AlertDialogTitle>
                                  <AlertDialogDescription className="text-xs leading-relaxed">
                                    &quot;{tx.title}&quot; ({tx.type === "in" ? "+" : "-"}{fmt(tx.amount)}) akan
                                    dihapus permanen. Saldo akun <strong>{tx.account}</strong> akan
                                    dikembalikan seperti sebelum transaksi ini.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="text-xs">Batal</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="text-xs bg-rose-600 hover:bg-rose-700 text-white"
                                    onClick={() => handleDeleteTransaction(tx)}
                                  >
                                    Ya, Hapus
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>

          {/* Pagination Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs pt-3 border-t border-border">
            {/* Rows Per Page Selector */}
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Items per page</span>
              <Select
                value={String(pageSize)}
                onValueChange={(val) => {
                  setPageSize(Number(val))
                  setCurrentPage(1)
                }}
              >
                <SelectTrigger className="w-[70px] h-8 text-xs font-semibold shadow-none border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3</SelectItem>
                  <SelectItem value="6">6</SelectItem>
                  <SelectItem value="12">12</SelectItem>
                  <SelectItem value="24">24</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Page Info & Prev/Next Buttons */}
            <div className="flex items-center gap-4">
              <span className="text-muted-foreground">
                Page {currentPage} of {totalPages} ({totalItems} items)
              </span>

              <Pagination className="w-auto">
                <PaginationContent>
                  <PaginationItem>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs shadow-none border-border"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                  </PaginationItem>

                  <PaginationItem>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs shadow-none border-border"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Next
                    </Button>
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          </div>
        </Card>
      </div>

      {/* Edit Transaction Dialog */}
      <Dialog open={!!editTx} onOpenChange={(open) => !open && setEditTx(null)}>
        <DialogContent className="sm:max-w-md shadow-none border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Pencil className="size-5 text-primary" />
              Ubah Transaksi
            </DialogTitle>
            <DialogDescription className="text-xs">
              Perubahan nominal / tipe otomatis menyesuaikan saldo sumber dana.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEditTransaction} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-muted/60 text-xs">
              <button
                type="button"
                onClick={() => setEditType("out")}
                className={`py-1.5 px-3 rounded-lg font-semibold transition-all ${
                  editType === "out" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground"
                }`}
              >
                🔴 Pengeluaran
              </button>
              <button
                type="button"
                onClick={() => setEditType("in")}
                className={`py-1.5 px-3 rounded-lg font-semibold transition-all ${
                  editType === "in" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground"
                }`}
              >
                🟢 Pemasukan
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Keterangan Transaksi</label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Nominal ({symbol})</label>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder={zero}
                  value={editAmount}
                  onChange={(e) => setEditAmount(formatInput(e.target.value))}
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Kategori</label>
                <Select value={editCategory} onValueChange={setEditCategory}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Kategori" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Konsumsi">Konsumsi</SelectItem>
                    <SelectItem value="Kamar Kos">Kamar Kos</SelectItem>
                    <SelectItem value="Tabungan & Target">Tabungan & Target</SelectItem>
                    <SelectItem value="Pemasukan">Pemasukan Gaji/Bonus</SelectItem>
                    <SelectItem value="Transportasi">Transportasi</SelectItem>
                    <SelectItem value="Transfer">Transfer</SelectItem>
                    {editCategory &&
                      !["Konsumsi", "Kamar Kos", "Tabungan & Target", "Pemasukan", "Transportasi", "Transfer"].includes(
                        editCategory,
                      ) && <SelectItem value={editCategory}>{editCategory}</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Sumber Dana</label>
              <Select value={editAccount} onValueChange={setEditAccount}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sumber Dana" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.name}>
                      {a.name}
                    </SelectItem>
                  ))}
                  {editAccount && !accounts.some((a) => a.name === editAccount) && (
                    <SelectItem value={editAccount}>{editAccount}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Catatan Tambahan (Opsional)</label>
              <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                className="shadow-none text-xs"
                onClick={() => setEditTx(null)}
              >
                Batal
              </Button>
              <Button type="submit" disabled={isEditing} className="shadow-none text-xs">
                {isEditing ? (
                  <div className="flex items-center gap-1.5">
                    <Spinner className="size-3.5" />
                    <span>Menyimpan...</span>
                  </div>
                ) : (
                  "Simpan Perubahan"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
