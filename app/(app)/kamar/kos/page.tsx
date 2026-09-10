"use client"

import { useMoney } from "@/lib/currency"
import { useRouter } from "next/navigation"
import React, { useState, useEffect, useCallback } from "react"
import { kamarService, accountService, KamarMemberRecord, FinancialAccountRecord } from "@/lib/db"
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
  CardTitle,
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
} from "@/components/ui/alert-dialog"
import { ListCard, ListCardHead, ListCardMeta } from "@/components/ui/list-card"
import { MetricCard } from "@/components/ui/metric-card"
import { Spinner } from "@/components/ui/spinner"
import {
  Plus,
  CheckCircle2,
  Receipt,
  Search,
  ArrowRight,
  Pencil,
  Trash2,
  ScanLine,
} from "lucide-react"

export interface SharedTransaction {
  id: string
  title: string
  category: string
  totalAmount: number
  paidBy: string // Who fronted the cash
  paidByUserId?: string
  createdByUserId?: string
  splitBetween: string[] // Who shares the bill
  splitUserIds?: string[]
  perPersonAmount: number
  myShare: number // How much active user (Abimanyu) owes or is owed (>0 = owes, <0 = is owed, 0 = settled)
  date: string
  formattedDate: string
  status: "settled" | "pending"
  isItemized?: boolean
}

export default function TransaksiKosPage() {
  const router = useRouter()
  const { fmt, formatInput, formatValue, parseInput, symbol, zero } = useMoney()
  // Anggota kamar diambil dari data kamar yang sebenarnya (tabel room_members).
  const [members, setMembers] = useState<KamarMemberRecord[]>([])
  const [accounts, setAccounts] = useState<FinancialAccountRecord[]>([])
  const [myUserId, setMyUserId] = useState("")

  // Notification Toast
  const [notification, setNotification] = useState<string | null>(null)
  const showNotification = (msg: string) => {
    setNotification(msg)
    setTimeout(() => setNotification(null), 4000)
  }

  // Shared Transactions & Room State
  const [transactions, setTransactions] = useState<SharedTransaction[]>([])

  // Filter & Search State
  const [searchQuery, setSearchQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")

  // Add Dialog State
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newCategory, setNewCategory] = useState("Konsumsi Kos")
  const [newTotalAmount, setNewTotalAmount] = useState("")
  const [newPaidById, setNewPaidById] = useState("")
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])
  const [newPayerAccount, setNewPayerAccount] = useState("")

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(6)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [settlingId, setSettlingId] = useState<string | null>(null)

  const reloadTransactions = useCallback(async () => {
    setTransactions(await kamarService.getSharedTransactions())
  }, [])

  useEffect(() => {
    let scanToast: ReturnType<typeof setTimeout> | undefined
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("scan") === "ok") {
      window.history.replaceState(null, "", "/kamar/kos")
      scanToast = setTimeout(
        () =>
          showNotification(
            "Split bill dari struk berhasil disimpan. Bagianmu otomatis tercatat di transaksi pribadi.",
          ),
        0,
      )
    }
    async function load() {
      const room = kamarService.getUserRoom()
      // Selaraskan dampak split bill ke transaksi pribadi lebih dulu.
      await kamarService.reconcileRoomLedger(room?.id)

      const [memberList, accList] = await Promise.all([
        kamarService.getRoomMembers(room?.id),
        accountService.getAll(),
      ])
      setMembers(memberList)
      setAccounts(accList)

      const meId = memberList.find((m) => m.isMe)?.userId || memberList[0]?.userId || ""
      setMyUserId(memberList.find((m) => m.isMe)?.userId || "")
      setNewPaidById(meId)
      setSelectedMemberIds(memberList.map((m) => m.userId || m.id))
      setNewPayerAccount(
        accList.find((a) => a.accountCategory === "bank")?.name || accList[0]?.name || "",
      )

      await reloadTransactions()
    }
    load()
    return () => {
      if (scanToast) clearTimeout(scanToast)
    }
  }, [reloadTransactions])

  const memberKey = (m: KamarMemberRecord) => m.userId || m.id

  const toggleMemberSelection = (id: string) => {
    setSelectedMemberIds((prev) => {
      if (prev.includes(id)) {
        return prev.length > 1 ? prev.filter((x) => x !== id) : prev
      }
      return [...prev, id]
    })
  }

  const formatNumberWithDots = formatInput
  const parseFormattedNumber = parseInput

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault()
    const total = parseFormattedNumber(newTotalAmount)
    if (!newTitle || isNaN(total) || total <= 0 || selectedMemberIds.length === 0) return

    setIsSubmitting(true)
    const selected = members.filter((m) => selectedMemberIds.includes(memberKey(m)))
    const payer = members.find((m) => memberKey(m) === newPaidById) || selected[0]
    const payerIsMe = !!payer?.isMe

    await kamarService.addSharedTransaction({
      title: newTitle,
      category: newCategory,
      totalAmount: total,
      paidByUserId: payer?.userId || payer?.id || "",
      paidByName: payer?.name || "Anggota",
      splitUserIds: selected.map((m) => m.userId || m.id),
      splitNames: selected.map((m) => m.name),
      payerAccount: payerIsMe ? newPayerAccount : undefined,
      status: "pending",
    })

    await reloadTransactions()
    const myShareRp = Math.ceil(total / Math.max(1, selectedMemberIds.length))
    showNotification(
      payerIsMe
        ? `Split bill "${newTitle}" (total ${fmt(total)}) dicatat. Bagian kamu ${fmt(myShareRp)} otomatis masuk sebagai pengeluaran di transaksi pribadi.`
        : `Split bill "${newTitle}" dicatat, dibayar oleh ${payer?.name}. Bagianmu ${fmt(myShareRp)} — bayar dari tabel untuk mencatatnya.`,
    )

    setNewTitle("")
    setNewTotalAmount("")
    setIsSubmitting(false)
    setIsAddDialogOpen(false)
  }

  // Pelunasan bagian saya langsung dari tabel.
  const handleSettleBill = async (txId: string) => {
    const targetTx = transactions.find((t) => t.id === txId)
    if (!targetTx || targetTx.myShare <= 0) return

    setSettlingId(txId)
    const amt = targetTx.myShare
    await kamarService.settleMyShare(txId)
    await reloadTransactions()
    setSettlingId(null)

    showNotification(
      `Bagianmu ${fmt(amt)} untuk "${targetTx.title}" ditandai lunas ke ${targetTx.paidBy} & tercatat sebagai pengeluaran di transaksi pribadi.`,
    )
  }

  // ---- Edit / Delete Split Bill (hanya pembuat) ----
  const [editTx, setEditTx] = useState<SharedTransaction | null>(null)
  const [editTitle, setEditTitle] = useState("")
  const [editCategory, setEditCategory] = useState("Konsumsi Kos")
  const [editTotal, setEditTotal] = useState("")
  const [editMemberIds, setEditMemberIds] = useState<string[]>([])
  const [editPayerAccount, setEditPayerAccount] = useState("")
  const [isEditing, setIsEditing] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<SharedTransaction | null>(null)

  const iCreated = (tx: SharedTransaction) =>
    !!myUserId && (tx.createdByUserId === myUserId || (!tx.createdByUserId && tx.paidByUserId === myUserId))

  const openEdit = (tx: SharedTransaction) => {
    setEditTx(tx)
    setEditTitle(tx.title)
    setEditCategory(tx.category)
    setEditTotal(formatValue(tx.totalAmount))
    setEditMemberIds(
      tx.splitUserIds && tx.splitUserIds.length > 0
        ? tx.splitUserIds
        : members.map((m) => memberKey(m)),
    )
    setEditPayerAccount(newPayerAccount)
  }

  const toggleEditMember = (id: string) => {
    setEditMemberIds((prev) =>
      prev.includes(id)
        ? prev.length > 1
          ? prev.filter((x) => x !== id)
          : prev
        : [...prev, id],
    )
  }

  const handleEditTransaction = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editTx || !editTitle) return
    const total = parseFormattedNumber(editTotal)
    if (isNaN(total) || total <= 0 || editMemberIds.length === 0) return

    setIsEditing(true)
    const payerIsMe = editTx.paidByUserId === myUserId
    const { error } = await kamarService.updateSharedTransaction(editTx.id, {
      title: editTitle,
      category: editCategory,
      totalAmount: total,
      splitUserIds: editMemberIds,
      payerAccount: payerIsMe ? editPayerAccount : undefined,
    })
    await kamarService.reconcileRoomLedger(kamarService.getUserRoom()?.id)
    await reloadTransactions()
    setIsEditing(false)
    if (error) {
      showNotification(`Gagal: ${error}`)
    } else {
      setEditTx(null)
      showNotification(`Split bill "${editTitle}" berhasil diperbarui.`)
    }
  }

  const handleDeleteTransaction = async (tx: SharedTransaction) => {
    setDeletingId(tx.id)
    setConfirmDelete(null)
    const { error } = await kamarService.deleteSharedTransaction(tx.id)
    await kamarService.reconcileRoomLedger(kamarService.getUserRoom()?.id)
    await reloadTransactions()
    setDeletingId(null)
    showNotification(
      error
        ? `Gagal: ${error}`
        : `Split bill "${tx.title}" dihapus. Pencatatan bagian tiap anggota ikut dibatalkan.`,
    )
  }

  // Kolom "Bagian Saya" + status, dipakai tabel & kartu mobile.
  const shareCell = (tx: SharedTransaction) => (
    <>
      <span className="font-bold text-foreground">{fmt(tx.perPersonAmount)}</span>
      {tx.myShare > 0 ? (
        <span className="block text-[10px] text-rose-600 dark:text-rose-400">belum dibayar</span>
      ) : tx.myShare < 0 ? (
        <span className="block text-[10px] text-emerald-600 dark:text-emerald-400">
          +{fmt(Math.abs(tx.myShare))} piutang
        </span>
      ) : (
        <span className="block text-[10px] text-muted-foreground">lunas</span>
      )}
    </>
  )

  const settleAction = (tx: SharedTransaction) =>
    tx.myShare > 0 ? (
      <Button
        size="sm"
        variant="outline"
        disabled={settlingId === tx.id}
        className="h-8 border-amber-500/40 px-2 text-xs font-semibold text-amber-600 shadow-none hover:bg-amber-500/10 dark:text-amber-400"
        onClick={() => handleSettleBill(tx.id)}
      >
        {settlingId === tx.id ? (
          <span className="flex items-center gap-1">
            <Spinner className="size-3" /> Memproses...
          </span>
        ) : (
          <>
            Bayar Ke {tx.paidBy.split(" ")[0]} <ArrowRight className="ml-1 size-3" />
          </>
        )}
      </Button>
    ) : tx.myShare < 0 ? (
      <Badge className="border-none bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 shadow-none dark:text-emerald-400">
        Piutang Saya
      </Badge>
    ) : (
      <Badge variant="outline" className="border-border px-2 py-0 text-[11px] font-normal text-muted-foreground">
        Lunas
      </Badge>
    )

  const manageAction = (tx: SharedTransaction) =>
    iCreated(tx) ? (
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-foreground"
          onClick={() => openEdit(tx)}
          title="Ubah split bill"
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-rose-600"
          disabled={deletingId === tx.id}
          onClick={() => setConfirmDelete(tx)}
          title="Hapus split bill"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    ) : (
      <span className="text-[11px] text-muted-foreground">—</span>
    )

  // Calculate Summary Metrics
  const totalMyOwed = transactions
    .filter((t) => t.myShare > 0)
    .reduce((sum, t) => sum + t.myShare, 0)
  const totalOthersOweMe = transactions
    .filter((t) => t.myShare < 0)
    .reduce((sum, t) => sum + Math.abs(t.myShare), 0)
  // Total belanja bersama (semua anggota), bukan bagian saya.
  const totalKosTransactionsMonth = transactions.reduce((sum, t) => sum + t.totalAmount, 0)
  // Total bagian SAYA dari semua split bill bulan ini.
  const totalMyShareMonth = transactions.reduce((sum, t) => sum + t.perPersonAmount, 0)

  // Filtered Transactions Logic
  const filteredTransactions = transactions.filter((t) => {
    const matchesSearch =
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.paidBy.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.category.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesCategory =
      categoryFilter === "all" || t.category.toLowerCase() === categoryFilter.toLowerCase()

    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "owes" && t.myShare > 0) ||
      (statusFilter === "piutang" && t.myShare < 0) ||
      (statusFilter === "settled" && t.myShare === 0)

    return matchesSearch && matchesCategory && matchesStatus
  })

  // Pagination Calculations
  const totalItems = filteredTransactions.length
  const totalPages = Math.ceil(totalItems / (pageSize || 6)) || 1
  const startIndex = (currentPage - 1) * pageSize
  const paginatedTransactions = filteredTransactions.slice(startIndex, startIndex + pageSize)

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
                  Transaksi & Split Bill
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 bg-background min-w-0 max-w-full">
        {/* Toast Notification Banner */}
        {notification && (
          <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3.5 py-3 text-xs text-foreground shadow-sm animate-in fade-in slide-in-from-top-2">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{notification}</span>
          </div>
        )}

        {/* 1. Summary Metric Cards */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
          <MetricCard
            label="Tunggakan saya"
            value={fmt(totalMyOwed)}
            tone={totalMyOwed > 0 ? "negative" : "default"}
            hint="ke penghuni lain"
          />
          <MetricCard
            label="Piutang saya"
            value={`+${fmt(totalOthersOweMe)}`}
            tone={totalOthersOweMe > 0 ? "positive" : "default"}
            hint="ditalangi saya"
          />
          <MetricCard
            label="Bagian saya bulan ini"
            value={fmt(totalMyShareMonth)}
            hint={`dari belanja bersama ${fmt(totalKosTransactionsMonth)}`}
            className="col-span-2 md:col-span-1"
          />
        </div>

        {/* 2. Main Shared Transactions Table Section (With Action Button, Filters & Pagination) */}
        <Card className="border border-border shadow-none p-4 md:p-5 gap-4 bg-card min-w-0 max-w-full">
          {/* Section Header with Action Button Moved into Section */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-border pb-4">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Receipt className="size-5 text-primary shrink-0" />
                Tabel Transaksi & Talangan Bersama Kos
              </CardTitle>
              <CardDescription className="text-xs">
                Semua penghuni kamar dapat mencatat transaksi talangan & melunasi tagihan langsung dari tabel
              </CardDescription>
            </div>

            {/* Aksi: cepat (rata) + scan struk (per item) */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="shadow-none text-xs"
              onClick={() => router.push("/kamar/kos/scan")}
            >
              <ScanLine className="size-4 mr-1.5" /> Scan Struk / Per Item
            </Button>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="shadow-none text-xs">
                  <Plus className="size-4 mr-1.5" /> Catat Cepat (Rata)
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md shadow-none border">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-base font-bold">
                    <Plus className="size-5 text-primary" />
                    Catat Transaksi / Talangan Bersama
                  </DialogTitle>
                  <DialogDescription className="text-xs">
                    Catat pengeluaran bersama kos. Pilihlah siapa yang menalangi & siapa saja yang menanggung.
                  </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleAddTransaction} className="space-y-4 pt-2">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Keterangan Transaksi / Barang</label>
                    <Input
                      placeholder="Contoh: Makan Malam Bersama, Beli Galon, Wifi"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground">Total Nominal Tagihan ({symbol})</label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        placeholder={zero}
                        value={newTotalAmount}
                        onChange={(e) => setNewTotalAmount(formatNumberWithDots(e.target.value))}
                        required
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground">Kategori Pengeluaran</label>
                      <Select value={newCategory} onValueChange={setNewCategory}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Kategori" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Konsumsi Kos">Konsumsi Bersama</SelectItem>
                          <SelectItem value="Kebersihan Kos">Galon & Kebersihan</SelectItem>
                          <SelectItem value="Utilitas Kos">Listrik & Wifi</SelectItem>
                          <SelectItem value="Dapur Kos">Gas & Dapur</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Dibayar / Ditalangi Oleh Siapa?</label>
                    <Select value={newPaidById} onValueChange={setNewPaidById}>
                      <SelectTrigger className="w-full font-semibold">
                        <SelectValue placeholder="Pilih Penalang" />
                      </SelectTrigger>
                      <SelectContent>
                        {members.map((m) => (
                          <SelectItem key={memberKey(m)} value={memberKey(m)}>
                            {m.name} {m.isMe ? "(Saya)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Akun sumber dana penalang — hanya muncul kalau SAYA yang menalangi.
                      Uang keluar dari akun ini, dan pengembalian dari anggota juga masuk ke sini. */}
                  {members.find((m) => memberKey(m) === newPaidById)?.isMe && (
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground">
                        Dibayar Pakai Akun (uang keluar dari sini)
                      </label>
                      {accounts.length > 0 ? (
                        <Select value={newPayerAccount} onValueChange={setNewPayerAccount}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Pilih akun" />
                          </SelectTrigger>
                          <SelectContent>
                            {accounts.map((a) => (
                              <SelectItem key={a.id} value={a.name}>
                                {a.name} ({fmt(a.balance)})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400">
                          Belum ada sumber dana — pengeluaran tetap tercatat tapi saldo tidak berubah.
                          Tambah akun di menu Sumber Dana.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Members Checklist */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Ditanggung Oleh (Beban Dibagi Ke):</label>
                    <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl border border-border bg-muted/30">
                      {members.map((m) => {
                        const id = memberKey(m)
                        const isSelected = selectedMemberIds.includes(id)
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => toggleMemberSelection(id)}
                            className={`py-1.5 px-2.5 rounded-lg text-xs font-semibold flex items-center justify-between border transition-all ${
                              isSelected
                                ? "bg-primary/10 border-primary/30 text-primary"
                                : "bg-card border-border text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            <span>{m.name}{m.isMe ? " (Saya)" : ""}</span>
                            {isSelected && <CheckCircle2 className="size-3.5 text-primary" />}
                          </button>
                        )
                      })}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Per orang menanggung:{" "}
                      <strong className="text-foreground">
                        {fmt(Math.ceil((parseFormattedNumber(newTotalAmount) || 0) / Math.max(1, selectedMemberIds.length)))}
                      </strong>
                    </div>
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
                        "Simpan Transaksi Talangan"
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
            </div>
          </div>

          {/* Table Filter Controls Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            {/* Search Input */}
            <div className="w-full sm:w-64 relative">
              <Search className="size-4 absolute left-3 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Cari transaksi / penalang..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setCurrentPage(1)
                }}
                className="pl-9 text-xs h-9 border-border"
              />
            </div>

            {/* Filter Dropdowns */}
            <div className="flex items-center gap-2">
              <Select
                value={categoryFilter}
                onValueChange={(val) => {
                  setCategoryFilter(val)
                  setCurrentPage(1)
                }}
              >
                <SelectTrigger className="w-[140px] h-9 text-xs border-border">
                  <SelectValue placeholder="Kategori" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Kategori</SelectItem>
                  <SelectItem value="Konsumsi Kos">Konsumsi Kos</SelectItem>
                  <SelectItem value="Kebersihan Kos">Kebersihan Kos</SelectItem>
                  <SelectItem value="Utilitas Kos">Utilitas Kos</SelectItem>
                  <SelectItem value="Dapur Kos">Dapur Kos</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={statusFilter}
                onValueChange={(val) => {
                  setStatusFilter(val)
                  setCurrentPage(1)
                }}
              >
                <SelectTrigger className="w-[130px] h-9 text-xs border-border">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Status</SelectItem>
                  <SelectItem value="owes">Utang Saya</SelectItem>
                  <SelectItem value="piutang">Piutang Saya</SelectItem>
                  <SelectItem value="settled">Lunas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Transaksi bersama — tabel di ≥md, kartu ringkas di mobile */}
          <CardContent className="p-0 overflow-hidden">
            {paginatedTransactions.length === 0 ? (
              <div className="py-10 text-center text-xs text-muted-foreground">
                Tidak ada transaksi kos yang sesuai dengan filter.
              </div>
            ) : (
              <>
                {/* Mobile: daftar kartu */}
                <div className="space-y-2.5 md:hidden">
                  {paginatedTransactions.map((tx) => {
                    const allMembers =
                      members.length > 0 && tx.splitBetween.length >= members.length
                        ? `Semua anggota (${members.length})`
                        : tx.splitBetween.join(", ")
                    return (
                      <ListCard key={tx.id}>
                        <ListCardHead>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">{tx.title}</div>
                            <div className="mt-0.5 text-[11px] text-muted-foreground">
                              Dibayar: <span className="font-medium text-foreground">{tx.paidBy}</span>
                              {members.find((m) => m.isMe)?.name === tx.paidBy ? " (Saya)" : ""}
                            </div>
                          </div>
                          <div className="shrink-0 text-right text-xs">{shareCell(tx)}</div>
                        </ListCardHead>
                        <ListCardMeta>
                          <span>{tx.formattedDate}</span>
                          <span aria-hidden>·</span>
                          <Badge variant="outline" className="border-border px-1.5 py-0 text-[10px] font-normal">
                            {tx.category}
                          </Badge>
                          <span aria-hidden>·</span>
                          <span>
                            {tx.isItemized
                              ? `${fmt(tx.totalAmount)} · per item`
                              : `${fmt(tx.totalAmount)} ÷ ${tx.splitBetween.length}`}
                          </span>
                        </ListCardMeta>
                        <div className="mt-1 truncate text-[11px] text-muted-foreground">{allMembers}</div>
                        <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border/60 pt-2">
                          {settleAction(tx)}
                          {manageAction(tx)}
                        </div>
                      </ListCard>
                    )
                  })}
                </div>

                {/* Desktop: tabel */}
                <div className="hidden w-full overflow-x-auto md:block">
                  <Table className="w-full min-w-[760px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="px-3.5 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap">Tanggal</TableHead>
                        <TableHead className="px-3.5 py-3 text-xs font-semibold text-muted-foreground">Keterangan Transaksi</TableHead>
                        <TableHead className="px-3.5 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap">Kategori</TableHead>
                        <TableHead className="px-3.5 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap">Dibayar Oleh</TableHead>
                        <TableHead className="px-3.5 py-3 text-xs font-semibold text-muted-foreground">Ditanggung Oleh</TableHead>
                        <TableHead className="px-3.5 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap">Total Nominal</TableHead>
                        <TableHead className="px-3.5 py-3 text-right text-xs font-semibold text-muted-foreground whitespace-nowrap">Bagian Saya</TableHead>
                        <TableHead className="px-3.5 py-3 text-right text-xs font-semibold text-muted-foreground whitespace-nowrap">Aksi Pelunasan</TableHead>
                        <TableHead className="px-3.5 py-3 text-right text-xs font-semibold text-muted-foreground whitespace-nowrap">Kelola</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedTransactions.map((tx) => (
                        <TableRow key={tx.id}>
                          <TableCell className="px-3.5 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">
                            {tx.formattedDate}
                          </TableCell>
                          <TableCell className="max-w-[200px] px-3.5 py-3 text-xs font-semibold">
                            <span className="block truncate">{tx.title}</span>
                            {tx.isItemized && (
                              <Badge className="mt-0.5 border-none bg-primary/10 px-1.5 py-0 text-[9px] font-semibold text-primary">
                                per item
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="px-3.5 py-3 whitespace-nowrap">
                            <Badge variant="outline" className="border-border px-2 py-0 text-[11px] font-normal">
                              {tx.category}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-3.5 py-3 text-xs font-bold text-foreground whitespace-nowrap">
                            {tx.paidBy}
                            {members.find((m) => m.isMe)?.name === tx.paidBy ? " (Saya)" : ""}
                          </TableCell>
                          <TableCell className="max-w-[160px] truncate px-3.5 py-3 text-xs text-muted-foreground">
                            {tx.isItemized
                              ? "Per item (beda kelompok)"
                              : members.length > 0 && tx.splitBetween.length >= members.length
                                ? `Semua Anggota (${members.length})`
                                : tx.splitBetween.join(", ")}
                          </TableCell>
                          <TableCell className="px-3.5 py-3 text-xs font-bold text-foreground whitespace-nowrap">
                            {fmt(tx.totalAmount)}
                            <span className="block text-[10px] font-normal text-muted-foreground">
                              {tx.isItemized ? "rincian per item" : `÷ ${tx.splitBetween.length} orang`}
                            </span>
                          </TableCell>
                          <TableCell className="px-3.5 py-3 text-right text-xs whitespace-nowrap">{shareCell(tx)}</TableCell>
                          <TableCell className="px-3.5 py-3 text-right whitespace-nowrap">{settleAction(tx)}</TableCell>
                          <TableCell className="px-3.5 py-3 text-right whitespace-nowrap">
                            <div className="flex justify-end">{manageAction(tx)}</div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
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

      {/* Edit Split Bill Dialog */}
      <Dialog open={!!editTx} onOpenChange={(open) => !open && setEditTx(null)}>
        <DialogContent className="sm:max-w-md shadow-none border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Pencil className="size-5 text-primary" />
              Ubah Split Bill Kos
            </DialogTitle>
            <DialogDescription className="text-xs">
              Total & peserta hanya bisa diubah selama belum ada anggota lain yang
              melunasi bagiannya.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEditTransaction} className="space-y-4 pt-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Keterangan Transaksi / Barang</label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Total Nominal ({symbol})</label>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder={zero}
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
                    <SelectItem value="Konsumsi Kos">Konsumsi Bersama</SelectItem>
                    <SelectItem value="Kebersihan Kos">Galon & Kebersihan</SelectItem>
                    <SelectItem value="Utilitas Kos">Listrik & Wifi</SelectItem>
                    <SelectItem value="Dapur Kos">Gas & Dapur</SelectItem>
                    {editCategory &&
                      !["Konsumsi Kos", "Kebersihan Kos", "Utilitas Kos", "Dapur Kos"].includes(editCategory) && (
                        <SelectItem value={editCategory}>{editCategory}</SelectItem>
                      )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {editTx?.paidByUserId === myUserId && accounts.length > 0 && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">
                  Dibayar Pakai Akun (uang keluar dari sini)
                </label>
                <Select value={editPayerAccount} onValueChange={setEditPayerAccount}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Pilih akun" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.name}>
                        {a.name} ({fmt(a.balance)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Ditanggung Oleh:</label>
              <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl border border-border bg-muted/30">
                {members.map((m) => {
                  const id = memberKey(m)
                  const isSelected = editMemberIds.includes(id)
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleEditMember(id)}
                      className={`py-1.5 px-2.5 rounded-lg text-xs font-semibold flex items-center justify-between border transition-all ${
                        isSelected
                          ? "bg-primary/10 border-primary/30 text-primary"
                          : "bg-card border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <span>{m.name}{m.isMe ? " (Saya)" : ""}</span>
                      {isSelected && <CheckCircle2 className="size-3.5 text-primary" />}
                    </button>
                  )
                })}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Per orang menanggung:{" "}
                <strong className="text-foreground">
                  {fmt(
                    Math.ceil(
                      (parseFormattedNumber(editTotal) || 0) / Math.max(1, editMemberIds.length),
                    ),
                  )}
                </strong>
              </div>
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

      {/* Konfirmasi Hapus Split Bill */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-rose-600 dark:text-rose-400">
              Hapus split bill &quot;{confirmDelete?.title}&quot;?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs leading-relaxed">
              Transaksi bersama ini dihapus untuk semua penghuni. Pencatatan pengeluaran
              &quot;bagian saya&quot; di log pribadi tiap anggota ikut dibatalkan &amp; saldo
              dikembalikan (berlaku saat mereka membuka aplikasi).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs">Batal</AlertDialogCancel>
            <AlertDialogAction
              className="text-xs bg-rose-600 hover:bg-rose-700 text-white"
              onClick={() => confirmDelete && handleDeleteTransaction(confirmDelete)}
            >
              Ya, Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
