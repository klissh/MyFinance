"use client"

import { useMoney } from "@/lib/currency"
import React, { useState, useEffect } from "react"
import Link from "next/link"
import {
  transactionService,
  scheduledService,
  accountService,
  resolvePersonalAccount,
  ScheduledBillRecord,
  FinancialAccountRecord,
} from "@/lib/db"
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { FullCalendar, CalendarTransaction } from "@/components/full-calendar"
import { ListCard, ListCardHead, ListCardMeta } from "@/components/ui/list-card"
import { MetricCard } from "@/components/ui/metric-card"
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
import { Spinner } from "@/components/ui/spinner"
import {
  Calendar as CalendarIcon,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Pencil,
  Trash2,
} from "lucide-react"

export default function ScheduledPage() {
  const { fmt, formatInput, formatValue, parseInput, symbol, zero } = useMoney()
  const [calendarTransactions, setCalendarTransactions] = useState<CalendarTransaction[]>([])
  const [scheduledBills, setScheduledBills] = useState<ScheduledBillRecord[]>([])
  const [accounts, setAccounts] = useState<FinancialAccountRecord[]>([])

  const refreshBills = React.useCallback(async () => {
    setScheduledBills(await scheduledService.getAll())
  }, [])

  useEffect(() => {
    async function loadData() {
      const [txs, bills, accs] = await Promise.all([
        transactionService.getAll(),
        scheduledService.getAll(),
        accountService.getAll(),
      ])
      setAccounts(accs)
      const formatted = txs.map((tx, idx) => ({
        ...tx,
        hour: 9 + (idx % 10),
        timeLabel: `${9 + (idx % 10)}:00 AM`,
      }))
      setCalendarTransactions(formatted)
      setScheduledBills(bills)
    }
    loadData()
  }, [])

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newAmount, setNewAmount] = useState("")
  const [newCategory, setNewCategory] = useState("Kamar Kos")
  const [newAccount, setNewAccount] = useState("")
  const [newSelectedDate, setNewSelectedDate] = useState<Date>(new Date())
  const [newNotes, setNewNotes] = useState("")

  const [notification, setNotification] = useState<{ msg: string; error?: boolean } | null>(null)

  // Segarkan daftar sumber dana saat dialog "Tambah Jadwal" dibuka.
  useEffect(() => {
    if (!isAddDialogOpen) return
    accountService.getAll().then((accs) => {
      setAccounts(accs)
      const def = accs.length ? resolvePersonalAccount(accs) : ""
      setNewAccount((p) => (accs.some((a) => a.name === p) ? p : def))
    })
  }, [isAddDialogOpen])

  const showNotification = (msg: string, error = false) => {
    setNotification({ msg, error })
    setTimeout(() => setNotification(null), 4000)
  }

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [payingId, setPayingId] = useState<string | null>(null)

  const formatNumberWithDots = formatInput
  const parseFormattedNumber = parseInput

  const handleAddScheduledItem = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle) return

    const parsedAmount = parseFormattedNumber(newAmount)
    const dateObj = newSelectedDate || new Date()
    // Tanggal lokal (bukan UTC) supaya tidak mundur 1 hari di UTC+8.
    const isoDate = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}-${String(dateObj.getDate()).padStart(2, "0")}`
    const formatted = dateObj.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })

    if (parsedAmount > 0) {
      setIsSubmitting(true)
      try {
        const newBill = await scheduledService.add({
          title: newTitle,
          amount: parsedAmount,
          date: isoDate,
          formattedDate: formatted,
          category: newCategory,
          account: newAccount,
          status: "pending",
          notes: newNotes,
        })
        setScheduledBills([newBill, ...scheduledBills])

        const newCalTx: CalendarTransaction = {
          id: newBill.id,
          title: newTitle,
          category: newCategory,
          type: "out",
          amount: parsedAmount,
          account: newAccount,
          date: isoDate,
          formattedDate: formatted,
          notes: newNotes,
          hour: 10,
          timeLabel: "10:00 AM",
        }

        setCalendarTransactions([newCalTx, ...calendarTransactions])
        showNotification(`Jadwal/Tagihan "${newTitle}" berhasil didaftarkan & otomatis tampil di kalender!`)
        setNewTitle("")
        setNewAmount("")
        setNewNotes("")
        setIsAddDialogOpen(false)
      } catch (err) {
        showNotification(err instanceof Error ? err.message : "Gagal mendaftarkan jadwal.", true)
      } finally {
        setIsSubmitting(false)
      }
      return
    }

    setNewTitle("")
    setNewAmount("")
    setNewNotes("")
    setIsAddDialogOpen(false)
  }

  const handlePayBill = async (id: string) => {
    const bill = scheduledBills.find((b) => b.id === id)
    if (!bill) return

    setPayingId(id)
    try {
      await scheduledService.pay(id)
      setScheduledBills(
        scheduledBills.map((b) => (b.id === id ? { ...b, status: "paid" } : b))
      )
      showNotification(
        `Pembayaran "${bill.title}" sebesar ${fmt(bill.amount)} berhasil & otomatis dicatat ke log Transaksi!`
      )
    } catch (err) {
      showNotification(err instanceof Error ? err.message : "Gagal mencatat pembayaran.", true)
    } finally {
      setPayingId(null)
    }
  }

  // ---- Edit / Delete Jadwal ----
  const [editBill, setEditBill] = useState<ScheduledBillRecord | null>(null)
  const [editTitle, setEditTitle] = useState("")
  const [editAmount, setEditAmount] = useState("")
  const [editCategory, setEditCategory] = useState("Kamar Kos")
  const [editAccount, setEditAccount] = useState("")
  const [editDate, setEditDate] = useState<Date>(new Date())
  const [editNotes, setEditNotes] = useState("")
  const [isEditing, setIsEditing] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<ScheduledBillRecord | null>(null)

  const openEdit = (b: ScheduledBillRecord) => {
    setEditBill(b)
    setEditTitle(b.title)
    setEditAmount(formatValue(b.amount))
    setEditCategory(b.category)
    setEditAccount(b.account)
    const d = new Date(b.date)
    setEditDate(isNaN(d.getTime()) ? new Date() : d)
    setEditNotes(b.notes || "")
  }

  const handleEditBill = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editBill || !editTitle) return
    const amt = parseInput(editAmount)
    if (isNaN(amt) || amt <= 0) return

    setIsEditing(true)
    const iso = `${editDate.getFullYear()}-${String(editDate.getMonth() + 1).padStart(2, "0")}-${String(editDate.getDate()).padStart(2, "0")}`
    try {
      await scheduledService.update(editBill.id, {
        title: editTitle,
        amount: amt,
        category: editCategory,
        account: editAccount,
        date: iso,
        notes: editNotes,
      })
      await refreshBills()
      setEditBill(null)
      showNotification(`Jadwal "${editTitle}" berhasil diperbarui.`)
    } catch (err) {
      showNotification(err instanceof Error ? err.message : "Gagal memperbarui jadwal.", true)
    } finally {
      setIsEditing(false)
    }
  }

  const handleDeleteBill = async (b: ScheduledBillRecord) => {
    setDeletingId(b.id)
    setConfirmDelete(null)
    try {
      await scheduledService.remove(b.id)
      await refreshBills()
      setCalendarTransactions((prev) => prev.filter((t) => t.id !== b.id))
      showNotification(`Jadwal "${b.title}" dihapus.`)
    } catch (err) {
      showNotification(err instanceof Error ? err.message : "Gagal menghapus jadwal.", true)
    } finally {
      setDeletingId(null)
    }
  }

  // Aksi bayar + kelola, dipakai tabel desktop & kartu mobile.
  const billPayAction = (b: ScheduledBillRecord) =>
    b.status === "paid" ? (
      <Badge className="border-none bg-emerald-500/15 text-xs font-semibold text-emerald-600 shadow-none dark:text-emerald-400">
        <CheckCircle2 className="mr-1 size-3.5" /> Lunas
      </Badge>
    ) : (
      <Button
        size="sm"
        className="h-8 shadow-none text-xs"
        disabled={payingId === b.id}
        onClick={() => handlePayBill(b.id)}
      >
        {payingId === b.id ? (
          <span className="flex items-center gap-1">
            <Spinner className="size-3" /> Memproses...
          </span>
        ) : (
          <>
            Bayar Sekarang <ArrowRight className="ml-1 size-3.5" />
          </>
        )}
      </Button>
    )

  const billManageAction = (b: ScheduledBillRecord) => (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="size-7 text-muted-foreground hover:text-foreground"
        onClick={() => openEdit(b)}
        title="Ubah jadwal"
      >
        <Pencil className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-7 text-muted-foreground hover:text-rose-600"
        disabled={deletingId === b.id}
        onClick={() => setConfirmDelete(b)}
        title="Hapus jadwal"
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  )

  const pendingBills = scheduledBills.filter((b) => b.status === "pending")
  const totalPendingAmount = pendingBills.reduce((sum, b) => sum + b.amount, 0)
  const nextClosestBill = pendingBills[0]

  return (
    <>
      {/* 1. Header Navigation Bar */}
      <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b px-4 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-2 data-vertical:h-4 data-vertical:self-auto"
          />
          <Breadcrumb className="truncate">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage className="font-semibold text-base truncate">
                  Jadwal & Tagihan Terjadwal
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        {/* Quick Add Button & Modal */}
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogContent className="sm:max-w-md shadow-none border">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base font-bold">
                <Clock className="size-5 text-amber-600" />
                Tambah Jadwal Pembayaran Rutin
              </DialogTitle>
              <DialogDescription className="text-xs">
                Daftarkan tagihan rutin (Sewa Kos, Utilitas, Subskripsi) agar muncul otomatis di kalender.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleAddScheduledItem} className="space-y-4 py-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Nama Tagihan / Acara</label>
                <Input
                  placeholder="Misal: Sewa Kamar Kos Bulanan"
                  className="text-xs shadow-none"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Jumlah Tagihan ({symbol})</label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder={zero}
                    className="text-xs shadow-none"
                    value={newAmount}
                    onChange={(e) => setNewAmount(formatNumberWithDots(e.target.value))}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Kategori</label>
                  <Select value={newCategory} onValueChange={setNewCategory}>
                    <SelectTrigger className="text-xs shadow-none">
                      <SelectValue placeholder="Pilih Kategori" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Kamar Kos" className="text-xs">Kamar Kos</SelectItem>
                      <SelectItem value="Konsumsi" className="text-xs">Konsumsi</SelectItem>
                      <SelectItem value="Transportasi" className="text-xs">Transportasi</SelectItem>
                      <SelectItem value="Utilitas" className="text-xs">Utilitas & Listrik</SelectItem>
                      <SelectItem value="Hiburan" className="text-xs">Hiburan & Subskripsi</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Sumber Dana Default</label>
                  <Select value={newAccount} onValueChange={setNewAccount} disabled={accounts.length === 0}>
                    <SelectTrigger className="text-xs shadow-none">
                      <SelectValue placeholder={accounts.length ? "Pilih Akun" : "Belum ada sumber dana"} />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.name} className="text-xs">{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {accounts.length === 0 && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400">
                      Buat sumber dana dulu di menu{" "}
                      <Link href="/finance" className="underline">Sumber Dana</Link>.
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Tanggal Jatuh Tempo</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal text-xs shadow-none",
                          !newSelectedDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 size-3.5" />
                        {newSelectedDate
                          ? newSelectedDate.toLocaleDateString("id-ID", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })
                          : "Pilih Tanggal"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 shadow-none border" align="start">
                      <Calendar
                        mode="single"
                        selected={newSelectedDate}
                        onSelect={(date) => date && setNewSelectedDate(date)}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Catatan Tambahan (Opsional)</label>
                <Textarea
                  placeholder="Catatan kecil pengingat..."
                  className="text-xs shadow-none resize-none h-16"
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
                    "Simpan Jadwal"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </header>

      {/* Main Container */}
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 bg-background">
        {/* Toast Notification Banner */}
        {notification && (
          <div
            className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-3 text-xs shadow-sm animate-in fade-in slide-in-from-top-2 ${
              notification.error
                ? "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400"
                : "border-border bg-card text-foreground"
            }`}
          >
            {notification.error ? (
              <AlertTriangle className="size-4 shrink-0" />
            ) : (
              <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            )}
            <span>{notification.msg}</span>
          </div>
        )}

        {/* 1. Summary Metric Strip */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
          <MetricCard
            label="Tagihan belum dibayar"
            value={`${pendingBills.length}`}
            tone={pendingBills.length > 0 ? "warning" : "default"}
            hint="bulan ini"
          />
          <MetricCard
            label="Total nominal terjadwal"
            value={fmt(totalPendingAmount)}
            tone="negative"
          />
          <MetricCard
            label="Tagihan terdekat"
            value={nextClosestBill ? nextClosestBill.title : "Tidak ada"}
            hint={
              nextClosestBill
                ? `${nextClosestBill.formattedDate} · ${fmt(nextClosestBill.amount)}`
                : "semua lunas"
            }
            className="col-span-2 md:col-span-1"
          />
        </div>

        {/* 2. Custom FullCalendar Component Integration */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">Kalender Acara & Tagihan Terjadwal</h2>
              <p className="text-xs text-muted-foreground">
                Gunakan switcher untuk beralih antara Tampilan Bulanan (Month View) dan Mingguan (Week View)
              </p>
            </div>
          </div>

          <FullCalendar
            transactions={calendarTransactions}
            onAddTransaction={(dateStr) => {
              if (dateStr) {
                const parts = dateStr.split("-")
                if (parts.length === 3) {
                  setNewSelectedDate(new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])))
                }
              }
              setIsAddDialogOpen(true)
            }}
          />
        </div>

        {/* 3. Upcoming Scheduled Bills Section & Quick Pay */}
        <Card className="border border-border shadow-none p-5 gap-4 bg-card">
          <CardHeader className="p-0 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Clock className="size-5 text-amber-600" />
                Daftar Tagihan & Pembayaran Rutin Mendatang
              </CardTitle>
              <CardDescription className="text-sm">
                Klik &quot;Bayar Sekarang&quot; untuk memproses tagihan &amp; mencatat otomatis ke log transaksi
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {scheduledBills.length === 0 ? (
              <div className="py-10 text-center text-xs text-muted-foreground">
                Belum ada jadwal tagihan atau pembayaran rutin yang dicatat.
              </div>
            ) : (
              <>
                {/* Mobile: daftar kartu */}
                <div className="space-y-2.5 md:hidden">
                  {scheduledBills.map((b) => (
                    <ListCard key={b.id}>
                      <ListCardHead>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">{b.title}</div>
                          {b.notes && (
                            <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{b.notes}</div>
                          )}
                        </div>
                        <div className="shrink-0 text-sm font-bold text-rose-600 dark:text-rose-400">
                          -{fmt(b.amount)}
                        </div>
                      </ListCardHead>
                      <ListCardMeta>
                        <span>{b.formattedDate}</span>
                        <span aria-hidden>·</span>
                        <Badge variant="outline" className="border-border px-1.5 py-0 text-[10px] font-normal">
                          {b.category}
                        </Badge>
                        <span aria-hidden>·</span>
                        <span>{b.account}</span>
                      </ListCardMeta>
                      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border/60 pt-2">
                        {billPayAction(b)}
                        {billManageAction(b)}
                      </div>
                    </ListCard>
                  ))}
                </div>

                {/* Desktop: tabel */}
                <div className="-mx-5 hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="px-5 py-3 text-xs font-semibold text-muted-foreground">Tanggal Tempo</TableHead>
                        <TableHead className="px-5 py-3 text-xs font-semibold text-muted-foreground">Nama Tagihan</TableHead>
                        <TableHead className="px-5 py-3 text-xs font-semibold text-muted-foreground">Kategori</TableHead>
                        <TableHead className="px-5 py-3 text-xs font-semibold text-muted-foreground">Sumber Dana</TableHead>
                        <TableHead className="px-5 py-3 text-xs font-semibold text-muted-foreground">Jumlah Tagihan</TableHead>
                        <TableHead className="px-5 py-3 text-center text-xs font-semibold text-muted-foreground">Aksi Pembayaran</TableHead>
                        <TableHead className="px-5 py-3 text-right text-xs font-semibold text-muted-foreground">Kelola</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {scheduledBills.map((b) => (
                        <TableRow key={b.id}>
                          <TableCell className="px-5 py-3.5 text-xs font-medium text-muted-foreground">
                            {b.formattedDate}
                          </TableCell>
                          <TableCell className="px-5 py-3.5 text-sm font-semibold">
                            <div>{b.title}</div>
                            {b.notes && <div className="text-xs font-normal text-muted-foreground">{b.notes}</div>}
                          </TableCell>
                          <TableCell className="px-5 py-3.5">
                            <Badge variant="outline" className="border-border text-xs font-normal">
                              {b.category}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-5 py-3.5 text-sm text-muted-foreground">{b.account}</TableCell>
                          <TableCell className="px-5 py-3.5 text-sm font-bold text-rose-600 dark:text-rose-400">
                            -{fmt(b.amount)}
                          </TableCell>
                          <TableCell className="px-5 py-3.5 text-center">{billPayAction(b)}</TableCell>
                          <TableCell className="px-5 py-3.5 text-right whitespace-nowrap">
                            <div className="flex justify-end">{billManageAction(b)}</div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Jadwal Dialog */}
      <Dialog open={!!editBill} onOpenChange={(open) => !open && setEditBill(null)}>
        <DialogContent className="sm:max-w-md shadow-none border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Pencil className="size-5 text-primary" />
              Ubah Jadwal Tagihan
            </DialogTitle>
            <DialogDescription className="text-xs">
              Untuk tagihan yang belum dibayar. Yang sudah lunas: ubah di sini tidak
              mengubah transaksi yang sudah tercatat.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEditBill} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Nama Tagihan / Acara</label>
              <Input
                className="text-xs shadow-none"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Jumlah Tagihan ({symbol})</label>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder={zero}
                  className="text-xs shadow-none"
                  value={editAmount}
                  onChange={(e) => setEditAmount(formatNumberWithDots(e.target.value))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Kategori</label>
                <Select value={editCategory} onValueChange={setEditCategory}>
                  <SelectTrigger className="text-xs shadow-none">
                    <SelectValue placeholder="Pilih Kategori" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Kamar Kos" className="text-xs">Kamar Kos</SelectItem>
                    <SelectItem value="Konsumsi" className="text-xs">Konsumsi</SelectItem>
                    <SelectItem value="Transportasi" className="text-xs">Transportasi</SelectItem>
                    <SelectItem value="Utilitas" className="text-xs">Utilitas & Listrik</SelectItem>
                    <SelectItem value="Hiburan" className="text-xs">Hiburan & Subskripsi</SelectItem>
                    {editCategory &&
                      !["Kamar Kos", "Konsumsi", "Transportasi", "Utilitas", "Hiburan"].includes(editCategory) && (
                        <SelectItem value={editCategory} className="text-xs">{editCategory}</SelectItem>
                      )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Sumber Dana Default</label>
                <Select value={editAccount} onValueChange={setEditAccount}>
                  <SelectTrigger className="text-xs shadow-none">
                    <SelectValue placeholder="Pilih Akun" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.name} className="text-xs">
                        {a.name}
                      </SelectItem>
                    ))}
                    {editAccount && !accounts.some((a) => a.name === editAccount) && (
                      <SelectItem value={editAccount} className="text-xs">{editAccount}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Tanggal Jatuh Tempo</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal text-xs shadow-none"
                    >
                      <CalendarIcon className="mr-2 size-3.5" />
                      {editDate.toLocaleDateString("id-ID", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 shadow-none border" align="start">
                    <Calendar
                      mode="single"
                      selected={editDate}
                      onSelect={(date) => date && setEditDate(date)}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Catatan Tambahan (Opsional)</label>
              <Textarea
                className="text-xs shadow-none resize-none h-16"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                className="shadow-none text-xs"
                onClick={() => setEditBill(null)}
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

      {/* Konfirmasi Hapus Jadwal */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-rose-600 dark:text-rose-400">
              Hapus jadwal &quot;{confirmDelete?.title}&quot;?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs leading-relaxed">
              Jadwal tagihan ini dihapus permanen.
              {confirmDelete?.status === "paid" && (
                <> Transaksi pembayaran yang sudah tercatat di log tetap ada.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs">Batal</AlertDialogCancel>
            <AlertDialogAction
              className="text-xs bg-rose-600 hover:bg-rose-700 text-white"
              onClick={() => confirmDelete && handleDeleteBill(confirmDelete)}
            >
              Ya, Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
