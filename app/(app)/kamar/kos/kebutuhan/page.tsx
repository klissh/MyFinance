"use client"

import { useMoney } from "@/lib/currency"
import React, { useState, useEffect } from "react"
import { kamarService, KamarMemberRecord } from "@/lib/db"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbLink,
  BreadcrumbSeparator,
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
  Receipt,
  Plus,
  CheckCircle2,
  ArrowRight,
  Clock,
  Wallet,
  Check,
  Search,
  LayoutGrid,
  List,
  Pencil,
  Trash2,
} from "lucide-react"

interface KosRoutineRequirement {
  id: string
  title: string
  category: string
  totalPrice: number
  splitPeopleCount: number
  perPersonPrice: number
  dueDate: string
  responsiblePerson: string
  isPaidByMe: boolean
  icon: React.ReactNode
}

export default function KebutuhanBulananKosPage() {
  const { fmt, formatInput, formatValue, parseInput, symbol } = useMoney()
  // Notification Toast
  const [notification, setNotification] = useState<string | null>(null)
  const showNotification = (msg: string) => {
    setNotification(msg)
    setTimeout(() => setNotification(null), 4000)
  }

  // Routine Requirements & Room State
  const [requirements, setRequirements] = useState<KosRoutineRequirement[]>([])
  const [members, setMembers] = useState<KamarMemberRecord[]>([])

  const membersCount = members.length || 4

  const reloadRequirements = React.useCallback(async () => {
    const data = await kamarService.getRequirements()
    setRequirements(
      data.map((r) => ({ ...r, icon: <Receipt className="size-4 text-primary" /> })),
    )
  }, [])

  // View Mode State: 'table' (default) or 'grid'
  const [viewMode, setViewMode] = useState<"table" | "grid">("table")

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")

  // Form State: Add New Requirement
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newCategory, setNewCategory] = useState("Listrik & Utilitas")
  const [newTotalPrice, setNewTotalPrice] = useState("")
  const [newSplitCount, setNewSplitCount] = useState("4")
  const [newDueDate, setNewDueDate] = useState("")
  const [newResponsible, setNewResponsible] = useState("")

  useEffect(() => {
    async function load() {
      const room = kamarService.getUserRoom()
      const memberList = await kamarService.getRoomMembers(room?.id)
      setMembers(memberList)
      if (memberList.length > 0) {
        // Default split-count & penanggung jawab mengikuti anggota kamar yang sebenarnya.
        setNewSplitCount(String(memberList.length))
        setNewResponsible(
          memberList.find((m) => m.isMe)?.name || memberList[0].name,
        )
      }
      await reloadRequirements()
    }
    load()
  }, [reloadRequirements])

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(6)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [payingId, setPayingId] = useState<string | null>(null)

  const formatNumberWithDots = formatInput
  const parseFormattedNumber = parseInput

  // ---- Edit / Delete Kebutuhan ----
  const [editReq, setEditReq] = useState<KosRoutineRequirement | null>(null)
  const [editTitle, setEditTitle] = useState("")
  const [editCategory, setEditCategory] = useState("Listrik & Utilitas")
  const [editTotal, setEditTotal] = useState("")
  const [editSplitCount, setEditSplitCount] = useState("4")
  const [editDueDate, setEditDueDate] = useState("")
  const [editResponsible, setEditResponsible] = useState("")
  const [isEditing, setIsEditing] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const openEdit = (r: KosRoutineRequirement) => {
    setEditReq(r)
    setEditTitle(r.title)
    setEditCategory(r.category)
    setEditTotal(formatValue(r.totalPrice))
    setEditSplitCount(String(r.splitPeopleCount))
    setEditDueDate(r.dueDate)
    setEditResponsible(r.responsiblePerson)
  }

  const handleEditRequirement = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editReq || !editTitle) return
    const total = parseInput(editTotal)
    const count = parseInt(editSplitCount) || 1
    if (isNaN(total) || total <= 0) return

    setIsEditing(true)
    await kamarService.updateRequirement(editReq.id, {
      title: editTitle,
      category: editCategory,
      totalPrice: total,
      splitPeopleCount: count,
      dueDate: editDueDate,
      responsiblePerson: editResponsible,
    })
    await reloadRequirements()
    setIsEditing(false)
    setEditReq(null)
    showNotification(`Kebutuhan "${editTitle}" berhasil diperbarui.`)
  }

  const handleDeleteRequirement = async (r: KosRoutineRequirement) => {
    setDeletingId(r.id)
    await kamarService.deleteRequirement(r.id)
    await reloadRequirements()
    setDeletingId(null)
    showNotification(`Kebutuhan "${r.title}" dihapus.`)
  }

  const handleAddRequirement = async (e: React.FormEvent) => {
    e.preventDefault()
    const total = parseFormattedNumber(newTotalPrice)
    const count = parseInt(newSplitCount) || 1
    if (!newTitle || isNaN(total) || total <= 0) return

    setIsSubmitting(true)

    // Simpan lewat service (insert ke Supabase room_requirements + cache lokal ter-scope).
    await kamarService.addRequirement({
      title: newTitle,
      category: newCategory,
      totalPrice: total,
      splitPeopleCount: count,
      dueDate: newDueDate || new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }),
      responsiblePerson: newResponsible || "Ketua Kos",
    })

    await reloadRequirements()
    showNotification(
      `Kebutuhan bulanan "${newTitle}" (${fmt(total)}) berhasil disimpan!`,
    )

    setNewTitle("")
    setNewTotalPrice("")
    setNewDueDate("")
    setIsSubmitting(false)
    setIsAddOpen(false)
  }

  // Handle Pay My Share & Auto-Deduct to Personal Transaction Log
  const handlePayMyShare = async (id: string) => {
    const item = requirements.find((r) => r.id === id)
    if (!item || item.isPaidByMe) return

    setPayingId(id)
    await kamarService.payRequirement(id)
    await reloadRequirements()

    showNotification(
      `Setoran ${fmt(item.perPersonPrice)} untuk "${item.title}" berhasil dibayar & dicatat di database!`
    )
    setPayingId(null)
  }

  // Totals
  const totalKosRequirements = requirements.reduce((sum, r) => sum + r.totalPrice, 0)
  const totalMyMonthlyShare = requirements.reduce((sum, r) => sum + r.perPersonPrice, 0)
  const totalMyPaidShare = requirements
    .filter((r) => r.isPaidByMe)
    .reduce((sum, r) => sum + r.perPersonPrice, 0)
  const totalMyPendingShare = totalMyMonthlyShare - totalMyPaidShare

  // Filter Logic
  const filteredRequirements = requirements.filter((r) => {
    const matchesSearch =
      r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.responsiblePerson.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory =
      categoryFilter === "all" || r.category.toLowerCase() === categoryFilter.toLowerCase()

    return matchesSearch && matchesCategory
  })

  // Pagination Calculations
  const totalItems = filteredRequirements.length
  const totalPages = Math.ceil(totalItems / (pageSize || 6)) || 1
  const startIndex = (currentPage - 1) * pageSize
  const paginatedRequirements = filteredRequirements.slice(startIndex, startIndex + pageSize)

  return (
    <div className="flex flex-col min-w-0 max-w-full overflow-x-hidden">
      {/* Header Bar (CLEAN: No Action Buttons in Top Header) */}
      <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b px-4 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-2 data-vertical:h-4 data-vertical:self-auto"
          />
          <Breadcrumb className="truncate">
            <BreadcrumbList>
              <BreadcrumbItem className="hidden sm:inline-flex">
                <BreadcrumbLink href="#">Kamar Kos Bareng</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden sm:inline-flex" />
              <BreadcrumbItem>
                <BreadcrumbPage className="font-semibold text-base truncate">
                  Kebutuhan Bulanan
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 bg-background min-h-screen min-w-0 max-w-full">
        {/* Toast Notification Banner */}
        {notification && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs font-medium animate-in fade-in slide-in-from-top-2">
            <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{notification}</span>
          </div>
        )}

        {/* 1. Summary Metric Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="shadow-none border border-border p-5 gap-3 bg-card">
            <CardHeader className="p-0 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-semibold text-muted-foreground tracking-tight">
                Total Kebutuhan Kos (100%)
              </CardTitle>
              <div className="p-2 rounded-xl bg-muted/60 text-foreground">
                <Receipt className="size-4" />
              </div>
            </CardHeader>
            <CardContent className="p-0 space-y-1">
              <div className="text-2xl font-bold tracking-tight text-foreground">
                {fmt(totalKosRequirements)}
              </div>
              <p className="text-xs text-muted-foreground">Total pengeluaran rutin bersama</p>
            </CardContent>
          </Card>

          <Card className="shadow-none border border-border p-5 gap-3 bg-card">
            <CardHeader className="p-0 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-semibold text-muted-foreground tracking-tight">
                Total Beban Saya / Bulan
              </CardTitle>
              <div className="p-2 rounded-xl bg-primary/10 text-primary">
                <Wallet className="size-4" />
              </div>
            </CardHeader>
            <CardContent className="p-0 space-y-1">
              <div className="text-2xl font-bold tracking-tight text-foreground">
                {fmt(totalMyMonthlyShare)}
              </div>
              <p className="text-xs text-muted-foreground">Proporsi bagian Anda ({membersCount} orang)</p>
            </CardContent>
          </Card>

          <Card className="shadow-none border border-border p-5 gap-3 bg-card">
            <CardHeader className="p-0 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-semibold text-muted-foreground tracking-tight">
                Sudah Dibayar Saya
              </CardTitle>
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600">
                <Check className="size-4" />
              </div>
            </CardHeader>
            <CardContent className="p-0 space-y-1">
              <div className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                {fmt(totalMyPaidShare)}
              </div>
              <p className="text-xs text-muted-foreground">Telah terpotong di log pribadi</p>
            </CardContent>
          </Card>

          <Card className="shadow-none border border-border p-5 gap-3 bg-card">
            <CardHeader className="p-0 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-semibold text-muted-foreground tracking-tight">
                Sisa Bagian Belum Bayar
              </CardTitle>
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600">
                <Clock className="size-4" />
              </div>
            </CardHeader>
            <CardContent className="p-0 space-y-1">
              <div className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
                {fmt(totalMyPendingShare)}
              </div>
              <p className="text-xs text-muted-foreground">Sisa iuran rutin Anda bulan ini</p>
            </CardContent>
          </Card>
        </div>

        {/* 2. Main Section: Table / Grid View of Requirements */}
        <Card className="border border-border shadow-none p-4 md:p-5 gap-4 bg-card min-w-0 max-w-full">
          {/* Section Header with Action Button & View Toggle */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-border pb-4">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Receipt className="size-5 text-primary shrink-0" />
                Rincian Kebutuhan & Pembagian Per Orang
              </CardTitle>
              <CardDescription className="text-xs">
                Setoran bagian Anda akan otomatis memotong/mencatat transaksi di log keuangan pribadi
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              {/* View Toggle Buttons */}
              <div className="flex items-center p-1 rounded-lg bg-muted/60 border border-border">
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  className={`p-1.5 rounded-md text-xs font-semibold flex items-center gap-1 transition-all ${
                    viewMode === "table" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground"
                  }`}
                  title="Tampilan Tabel (Rekomendasi)"
                >
                  <List className="size-3.5" />
                  <span className="hidden sm:inline">Tabel</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  className={`p-1.5 rounded-md text-xs font-semibold flex items-center gap-1 transition-all ${
                    viewMode === "grid" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground"
                  }`}
                  title="Tampilan Kartu / Grid"
                >
                  <LayoutGrid className="size-3.5" />
                  <span className="hidden sm:inline">Kartu</span>
                </button>
              </div>

              {/* Action Dialog Trigger (MOVED FROM HEADER TO SECTION) */}
              <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="shadow-none text-xs shrink-0">
                    <Plus className="size-3.5 mr-1.5" /> Tambah Kebutuhan
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md shadow-none border">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-base font-bold">
                      <Plus className="size-5 text-primary" />
                      Tambah Kebutuhan Bulanan Kos
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                      Daftarkan tagihan rutin atau iuran bersama kos beserta perhitungan pembagiannya.
                    </DialogDescription>
                  </DialogHeader>

                  <form onSubmit={handleAddRequirement} className="space-y-4 pt-2">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground">Nama Kebutuhan / Tagihan</label>
                      <Input
                        placeholder="Contoh: Tagihan Wifi Indihome, Token Listrik Utama"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-muted-foreground">Total Harga ({symbol})</label>
                        <Input
                          type="text"
                          placeholder="0"
                          value={newTotalPrice}
                          onChange={(e) => setNewTotalPrice(formatNumberWithDots(e.target.value))}
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
                            <SelectItem value="Listrik & Utilitas">Listrik & Utilitas</SelectItem>
                            <SelectItem value="Internet & Wifi">Internet & Wifi</SelectItem>
                            <SelectItem value="Kebersihan & Air">Kebersihan & Air</SelectItem>
                            <SelectItem value="Dapur & Konsumsi">Gas & Dapur</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-muted-foreground">Dibagi Berapa Orang?</label>
                        <Select value={newSplitCount} onValueChange={setNewSplitCount}>
                          <SelectTrigger className="w-full font-semibold">
                            <SelectValue placeholder="Jumlah Orang" />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: Math.max(5, membersCount) }, (_, i) => i + 2).map((n) => (
                              <SelectItem key={n} value={String(n)}>
                                {n} Orang{n === membersCount ? " (Semua Penghuni)" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-muted-foreground">Jatuh Tempo</label>
                        <Input
                          placeholder="Contoh: 25 Aug 2026"
                          value={newDueDate}
                          onChange={(e) => setNewDueDate(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground">Penanggung Jawab Pembayaran</label>
                      <Select value={newResponsible} onValueChange={setNewResponsible}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Penanggung Jawab" />
                        </SelectTrigger>
                        <SelectContent>
                          {members.length > 0 ? (
                            members.map((m) => (
                              <SelectItem key={m.id} value={m.name}>
                                {m.name}
                                {m.role === "Ketua Kos" ? " (Ketua Kos)" : ""}
                                {m.isMe ? " — Saya" : ""}
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem value="Ketua Kos">Ketua Kos</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
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
                          "Simpan Kebutuhan Kos"
                        )}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="w-full sm:w-64 relative">
              <Search className="size-4 absolute left-3 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Cari kebutuhan / PJ..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setCurrentPage(1)
                }}
                className="pl-9 text-xs h-9 border-border"
              />
            </div>

            <Select
              value={categoryFilter}
              onValueChange={(val) => {
                setCategoryFilter(val)
                setCurrentPage(1)
              }}
            >
              <SelectTrigger className="w-[160px] h-9 text-xs border-border">
                <SelectValue placeholder="Semua Kategori" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Kategori</SelectItem>
                <SelectItem value="Listrik & Utilitas">Listrik & Utilitas</SelectItem>
                <SelectItem value="Internet & Wifi">Internet & Wifi</SelectItem>
                <SelectItem value="Kebersihan & Air">Kebersihan & Air</SelectItem>
                <SelectItem value="Dapur & Konsumsi">Gas & Dapur</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* VIEW MODE: TABLE VIEW (Default & Highly Recommended) */}
          {viewMode === "table" ? (
            <CardContent className="p-0 overflow-hidden">
              <div className="w-full overflow-x-auto">
                <Table className="w-full min-w-[700px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="px-3.5 py-3 text-xs font-semibold text-muted-foreground">Kebutuhan & Kategori</TableHead>
                      <TableHead className="px-3.5 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap">Jatuh Tempo & PJ</TableHead>
                      <TableHead className="px-3.5 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap">Total Harga (100%)</TableHead>
                      <TableHead className="px-3.5 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap">Pembagi</TableHead>
                      <TableHead className="px-3.5 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap">Beban Saya</TableHead>
                      <TableHead className="px-3.5 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap">Status Saya</TableHead>
                      <TableHead className="px-3.5 py-3 text-xs font-semibold text-muted-foreground text-right whitespace-nowrap">Aksi Pelunasan</TableHead>
                      <TableHead className="px-3.5 py-3 text-xs font-semibold text-muted-foreground text-right whitespace-nowrap">Kelola</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedRequirements.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-xs text-muted-foreground">
                          Tidak ada kebutuhan bulanan yang sesuai.
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedRequirements.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="px-3.5 py-3">
                            <div className="font-bold text-xs text-foreground max-w-[200px] truncate">{r.title}</div>
                            <Badge variant="outline" className="text-[10px] font-normal border-border py-0 px-1.5 mt-0.5">
                              {r.category}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-3.5 py-3 text-xs text-muted-foreground whitespace-nowrap">
                            <div>{r.dueDate}</div>
                            <div className="text-[11px] text-muted-foreground">PJ: <strong>{r.responsiblePerson}</strong></div>
                          </TableCell>
                          <TableCell className="px-3.5 py-3 font-bold text-xs text-foreground whitespace-nowrap">
                            {fmt(r.totalPrice)}
                          </TableCell>
                          <TableCell className="px-3.5 py-3 text-xs text-muted-foreground whitespace-nowrap">
                            {r.splitPeopleCount} Orang
                          </TableCell>
                          <TableCell className="px-3.5 py-3 font-extrabold text-xs text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                            {fmt(r.perPersonPrice)}
                          </TableCell>
                          <TableCell className="px-3.5 py-3 whitespace-nowrap">
                            {r.isPaidByMe ? (
                              <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-none shadow-none text-[11px] font-semibold px-2 py-0.5">
                                Lunas
                              </Badge>
                            ) : (
                              <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-none shadow-none text-[11px] font-semibold px-2 py-0.5">
                                Belum Bayar
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="px-3.5 py-3 text-right whitespace-nowrap">
                            {r.isPaidByMe ? (
                              <Badge variant="outline" className="text-[11px] font-normal border-border text-muted-foreground py-0 px-2">
                                Terpotong di Log
                              </Badge>
                            ) : (
                              <Button
                                size="sm"
                                className="h-7 text-xs shadow-none px-2.5"
                                disabled={payingId === r.id}
                                onClick={() => handlePayMyShare(r.id)}
                              >
                                {payingId === r.id ? (
                                  <div className="flex items-center gap-1">
                                    <Spinner className="size-3" />
                                    <span>Memproses...</span>
                                  </div>
                                ) : (
                                  <>
                                    Bayar ({fmt(r.perPersonPrice)}) <ArrowRight className="size-3 ml-1" />
                                  </>
                                )}
                              </Button>
                            )}
                          </TableCell>
                          <TableCell className="px-3.5 py-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7 text-muted-foreground hover:text-foreground"
                                onClick={() => openEdit(r)}
                                title="Ubah kebutuhan"
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-7 text-muted-foreground hover:text-rose-600"
                                    disabled={deletingId === r.id}
                                    title="Hapus kebutuhan"
                                  >
                                    <Trash2 className="size-3.5" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle className="text-rose-600 dark:text-rose-400">
                                      Hapus kebutuhan &quot;{r.title}&quot;?
                                    </AlertDialogTitle>
                                    <AlertDialogDescription className="text-xs leading-relaxed">
                                      Kebutuhan ini & catatan pembayaran anggota untuknya dihapus
                                      untuk semua penghuni. Transaksi &quot;Iuran Bulanan Kos&quot;
                                      yang sudah tercatat di log pribadi tetap ada.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel className="text-xs">Batal</AlertDialogCancel>
                                    <AlertDialogAction
                                      className="text-xs bg-rose-600 hover:bg-rose-700 text-white"
                                      onClick={() => handleDeleteRequirement(r)}
                                    >
                                      Ya, Hapus
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          ) : (
            /* VIEW MODE: GRID CARDS VIEW */
            <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {paginatedRequirements.map((r) => (
                <Card key={r.id} className="border border-border shadow-none p-3.5 flex flex-col justify-between gap-2.5 bg-card">
                  <CardHeader className="p-0 flex flex-row items-start justify-between space-y-0">
                    <div className="space-y-0.5">
                      <Badge variant="outline" className="text-[10px] font-normal py-0 px-1.5 border-border">
                        {r.category}
                      </Badge>
                      <CardTitle className="text-sm font-bold truncate max-w-[150px]">{r.title}</CardTitle>
                      <CardDescription className="text-[11px]">
                        Tempo: {r.dueDate} • PJ: <strong>{r.responsiblePerson.split(" ")[0]}</strong>
                      </CardDescription>
                    </div>

                    {r.isPaidByMe ? (
                      <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-none shadow-none text-[10px] font-semibold px-1.5 py-0.5 shrink-0">
                        Lunas
                      </Badge>
                    ) : (
                      <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-none shadow-none text-[10px] font-semibold px-1.5 py-0.5 shrink-0">
                        Belum Bayar
                      </Badge>
                    )}
                  </CardHeader>

                  <CardContent className="p-0 space-y-2">
                    <div className="p-2 rounded-lg bg-muted/40 border border-border text-[11px] space-y-1">
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>Total Tagihan:</span>
                        <span className="font-semibold text-foreground">{fmt(r.totalPrice)}</span>
                      </div>
                      <div className="flex items-center justify-between font-bold pt-0.5 border-t border-border/50">
                        <span>Beban Saya ({r.splitPeopleCount} Pghn):</span>
                        <span className="text-emerald-600 dark:text-emerald-400">
                          {fmt(r.perPersonPrice)}
                        </span>
                      </div>
                    </div>
                  </CardContent>

                  <CardFooter className="p-0 pt-2 border-t border-border flex items-center gap-1.5">
                    {r.isPaidByMe ? (
                      <Button variant="outline" size="sm" className="flex-1 text-xs shadow-none border-border h-7" disabled>
                        <CheckCircle2 className="size-3 mr-1 text-emerald-600" /> Terpotong di Log
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="flex-1 text-xs shadow-none h-7"
                        onClick={() => handlePayMyShare(r.id)}
                      >
                        Bayar Bagian Saya <ArrowRight className="size-3 ml-1" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0 text-muted-foreground hover:text-foreground border border-border"
                      onClick={() => openEdit(r)}
                      title="Ubah kebutuhan"
                    >
                      <Pencil className="size-3" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 shrink-0 text-muted-foreground hover:text-rose-600 border border-border"
                          disabled={deletingId === r.id}
                          title="Hapus kebutuhan"
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle className="text-rose-600 dark:text-rose-400">
                            Hapus kebutuhan &quot;{r.title}&quot;?
                          </AlertDialogTitle>
                          <AlertDialogDescription className="text-xs leading-relaxed">
                            Kebutuhan ini & catatan pembayaran anggota untuknya dihapus untuk
                            semua penghuni. Transaksi &quot;Iuran Bulanan Kos&quot; yang sudah
                            tercatat di log pribadi tetap ada.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="text-xs">Batal</AlertDialogCancel>
                          <AlertDialogAction
                            className="text-xs bg-rose-600 hover:bg-rose-700 text-white"
                            onClick={() => handleDeleteRequirement(r)}
                          >
                            Ya, Hapus
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}

          {/* Pagination Controls for Requirements */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs pt-2 border-t border-border">
            {/* Rows / Items Per Page Selector */}
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

      {/* Edit Kebutuhan Dialog */}
      <Dialog open={!!editReq} onOpenChange={(open) => !open && setEditReq(null)}>
        <DialogContent className="sm:max-w-md shadow-none border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Pencil className="size-5 text-primary" />
              Ubah Kebutuhan Bulanan Kos
            </DialogTitle>
            <DialogDescription className="text-xs">
              Nominal per orang dihitung ulang otomatis. Anggota yang sudah bayar tidak
              ditarik ulang.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEditRequirement} className="space-y-4 pt-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Nama Kebutuhan / Tagihan</label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Total Harga ({symbol})</label>
                <Input
                  type="text"
                  value={editTotal}
                  onChange={(e) => setEditTotal(formatNumberWithDots(e.target.value))}
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
                    <SelectItem value="Listrik & Utilitas">Listrik & Utilitas</SelectItem>
                    <SelectItem value="Internet & Wifi">Internet & Wifi</SelectItem>
                    <SelectItem value="Kebersihan & Air">Kebersihan & Air</SelectItem>
                    <SelectItem value="Dapur & Konsumsi">Gas & Dapur</SelectItem>
                    {editCategory &&
                      !["Listrik & Utilitas", "Internet & Wifi", "Kebersihan & Air", "Dapur & Konsumsi"].includes(
                        editCategory,
                      ) && <SelectItem value={editCategory}>{editCategory}</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Dibagi Berapa Orang?</label>
                <Select value={editSplitCount} onValueChange={setEditSplitCount}>
                  <SelectTrigger className="w-full font-semibold">
                    <SelectValue placeholder="Jumlah Orang" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: Math.max(5, membersCount) }, (_, i) => i + 2).map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n} Orang{n === membersCount ? " (Semua Penghuni)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Jatuh Tempo</label>
                <Input
                  placeholder="Contoh: 25 Aug 2026"
                  value={editDueDate}
                  onChange={(e) => setEditDueDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Penanggung Jawab Pembayaran</label>
              <Select value={editResponsible} onValueChange={setEditResponsible}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Penanggung Jawab" />
                </SelectTrigger>
                <SelectContent>
                  {members.length > 0 ? (
                    members.map((m) => (
                      <SelectItem key={m.id} value={m.name}>
                        {m.name}
                        {m.role === "Ketua Kos" ? " (Ketua Kos)" : ""}
                        {m.isMe ? " — Saya" : ""}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="Ketua Kos">Ketua Kos</SelectItem>
                  )}
                  {editResponsible && !members.some((m) => m.name === editResponsible) && (
                    <SelectItem value={editResponsible}>{editResponsible}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                className="shadow-none text-xs"
                onClick={() => setEditReq(null)}
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
    </div>
  )
}
