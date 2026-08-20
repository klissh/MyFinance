"use client"

import React, { useState } from "react"
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
  CardFooter,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { Textarea } from "@/components/ui/textarea"
import {
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  Search,
  Filter,
  CheckCircle2,
  Calendar as CalendarIcon,
  Wallet,
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
  const [transactions, setTransactions] = useState<TransactionItem[]>([
    {
      id: "TX-106",
      title: "Transfer Bonus Freelance",
      category: "Pemasukan",
      type: "in",
      amount: 1750000,
      account: "Bank BCA",
      date: "2026-08-19",
      formattedDate: "19 Aug 2026",
      notes: "Proyek desain landing page client",
    },
    {
      id: "TX-105",
      title: "Beli Token Listrik Kamar",
      category: "Kamar Kos",
      type: "out",
      amount: 100000,
      account: "Bank BCA",
      date: "2026-08-19",
      formattedDate: "19 Aug 2026",
      notes: "Listrik 100rb kamar bersama",
    },
    {
      id: "TX-104",
      title: "Makan Malam & Belanja",
      category: "Konsumsi",
      type: "out",
      amount: 85000,
      account: "Tunai",
      date: "2026-08-18",
      formattedDate: "18 Aug 2026",
      notes: "Makan malam Nasi Goreng",
    },
    {
      id: "TX-103",
      title: "Bayar Wifi Kamar Kos",
      category: "Kamar Kos",
      type: "out",
      amount: 150000,
      account: "GoPay",
      date: "2026-08-17",
      formattedDate: "17 Aug 2026",
      notes: "Talangan wifi bersama anggota kamar",
    },
    {
      id: "TX-102",
      title: "Nabung Laptop Baru",
      category: "Tabungan & Target",
      type: "out",
      amount: 1000000,
      account: "Bank Mandiri",
      date: "2026-08-16",
      formattedDate: "16 Aug 2026",
      notes: "Alokasi target tabungan laptop M3",
    },
    {
      id: "TX-101",
      title: "Gaji Bulanan",
      category: "Pemasukan",
      type: "in",
      amount: 12500000,
      account: "Bank BCA",
      date: "2026-08-15",
      formattedDate: "15 Aug 2026",
      notes: "Gaji pokok bulan Agustus 2026",
    },
  ])

  // Filter & Search State
  const [searchQuery, setSearchQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [typeFilter, setTypeFilter] = useState("all")

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(5)

  // New Transaction Form State
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newAmount, setNewAmount] = useState("")
  const [newType, setNewType] = useState<"in" | "out">("out")
  const [newCategory, setNewCategory] = useState("Konsumsi")
  const [newAccount, setNewAccount] = useState("Bank BCA")
  const [newSelectedDate, setNewSelectedDate] = useState<Date>(new Date(2026, 7, 20)) // Aug 20, 2026
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
      (tx.notes && tx.notes.toLowerCase().includes(searchQuery.toLowerCase()))

    const matchesCategory = categoryFilter === "all" || tx.category === categoryFilter
    const matchesType = typeFilter === "all" || tx.type === typeFilter

    return matchesSearch && matchesCategory && matchesType
  })

  // Pagination Calculation
  const totalItems = filteredTransactions.length
  const totalPages = Math.ceil(totalItems / (pageSize || 5)) || 1
  const startIndex = (currentPage - 1) * pageSize
  const paginatedTransactions = filteredTransactions.slice(startIndex, startIndex + pageSize)

  // Totals
  const totalIncome = filteredTransactions
    .filter((t) => t.type === "in")
    .reduce((sum, t) => sum + t.amount, 0)
  const totalExpense = filteredTransactions
    .filter((t) => t.type === "out")
    .reduce((sum, t) => sum + t.amount, 0)

  const handleAddTransaction = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle || !newAmount) return

    const parsedAmount = parseFloat(newAmount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) return

    const dateObj = newSelectedDate || new Date()
    const isoDate = dateObj.toISOString().split("T")[0]
    const formatted = dateObj.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })

    const newTx: TransactionItem = {
      id: `TX-${Date.now().toString().slice(-4)}`,
      title: newTitle,
      category: newCategory,
      type: newType,
      amount: parsedAmount,
      account: newAccount,
      date: isoDate,
      formattedDate: formatted,
      notes: newNotes,
    }

    setTransactions([newTx, ...transactions])
    showNotification(`Transaksi "${newTitle}" berhasil dicatat!`)

    setNewTitle("")
    setNewAmount("")
    setNewNotes("")
    setIsAddDialogOpen(false)
  }

  return (
    <>
      {/* Header Bar */}
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

        {/* Quick Action Button */}
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="shadow-none">
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
                  <label className="text-xs font-semibold text-muted-foreground">Nominal (Rp)</label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
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
                {/* --- SHADCN POPOVER CALENDAR DATE PICKER --- */}
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
                <Button type="submit" className="shadow-none text-xs">
                  Simpan Transaksi
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
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
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Pemasukan (Filter)
              </CardTitle>
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600">
                <ArrowDownLeft className="size-5" />
              </div>
            </CardHeader>
            <CardContent className="p-0 space-y-1">
              <div className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                +Rp {totalIncome.toLocaleString("id-ID")}
              </div>
              <p className="text-xs text-muted-foreground">Total pemasukan tercatat</p>
            </CardContent>
          </Card>

          <Card className="shadow-none border border-border p-5 gap-3 bg-card">
            <CardHeader className="p-0 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Pengeluaran (Filter)
              </CardTitle>
              <div className="p-2 rounded-xl bg-rose-500/10 text-rose-600">
                <ArrowUpRight className="size-5" />
              </div>
            </CardHeader>
            <CardContent className="p-0 space-y-1">
              <div className="text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400">
                -Rp {totalExpense.toLocaleString("id-ID")}
              </div>
              <p className="text-xs text-muted-foreground">Total pengeluaran tercatat</p>
            </CardContent>
          </Card>

          <Card className="shadow-none border border-border p-5 gap-3 bg-card">
            <CardHeader className="p-0 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Bersih Arus Kas (Net)
              </CardTitle>
              <div className="p-2 rounded-xl bg-muted/60 text-foreground">
                <Wallet className="size-5" />
              </div>
            </CardHeader>
            <CardContent className="p-0 space-y-1">
              <div className={`text-2xl font-bold tracking-tight ${
                totalIncome - totalExpense >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
              }`}>
                Rp {(totalIncome - totalExpense).toLocaleString("id-ID")}
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
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-xs"
              />
            </div>

            {/* Category Filter */}
            <div className="sm:col-span-3">
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-full text-xs">
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
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full text-xs">
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

        {/* 3. Main Transactions Table */}
        <Card className="border border-border shadow-none p-5 gap-4 bg-card">
          <CardHeader className="p-0 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                Daftar Riwayat Transaksi
              </CardTitle>
              <CardDescription className="text-xs">
                Menampilkan {paginatedTransactions.length} dari {filteredTransactions.length} total transaksi
              </CardDescription>
            </div>
          </CardHeader>

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
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedTransactions.length > 0 ? (
                  paginatedTransactions.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="px-5 py-3.5 text-xs text-muted-foreground font-medium">
                        {tx.formattedDate}
                      </TableCell>
                      <TableCell className="px-5 py-3.5">
                        {tx.type === "in" ? (
                          <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-none shadow-none text-xs font-semibold">
                            Uang Masuk
                          </Badge>
                        ) : (
                          <Badge className="bg-rose-500/15 text-rose-600 dark:text-rose-400 border-none shadow-none text-xs font-semibold">
                            Uang Keluar
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="px-5 py-3.5">
                        <div className="font-semibold text-sm">{tx.title}</div>
                        {tx.notes && <div className="text-xs text-muted-foreground font-normal">{tx.notes}</div>}
                      </TableCell>
                      <TableCell className="px-5 py-3.5">
                        <Badge variant="outline" className="text-xs font-normal border-border">
                          {tx.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-5 py-3.5 text-sm text-muted-foreground font-medium">
                        {tx.account}
                      </TableCell>
                      <TableCell className={`px-5 py-3.5 text-right font-bold text-sm ${
                        tx.type === 'in' ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'
                      }`}>
                        {tx.type === 'in' ? '+' : '-'}Rp {tx.amount.toLocaleString("id-ID")}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-xs text-muted-foreground">
                      Tidak ada transaksi yang cocok dengan filter.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>

          {/* Footer Pagination Controls */}
          <CardFooter className="p-0 pt-4 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            {/* Rows Per Page Selector */}
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Rows per page</span>
              <Select
                value={String(pageSize)}
                onValueChange={(val) => {
                  setPageSize(Number(val))
                  setCurrentPage(1)
                }}
              >
                <SelectTrigger className="w-[70px] h-8 text-xs font-semibold shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Page info & Prev/Next */}
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
          </CardFooter>
        </Card>
      </div>
    </>
  )
}
