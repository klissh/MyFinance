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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { FullCalendar, CalendarTransaction } from "@/components/full-calendar"
import {
  Calendar as CalendarIcon,
  Clock,
  Plus,
  CheckCircle2,
  TrendingDown,
  Sparkles,
  ArrowRight,
} from "lucide-react"

interface ScheduledBill {
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

export default function ScheduledPage() {
  const [calendarTransactions, setCalendarTransactions] = useState<CalendarTransaction[]>([
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
      hour: 9,
      timeLabel: "9:00 AM",
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
      hour: 16,
      timeLabel: "4:00 PM",
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
      hour: 17,
      timeLabel: "5:00 PM",
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
      hour: 20,
      timeLabel: "8:00 PM",
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
      hour: 19,
      timeLabel: "7:00 PM",
    },
    {
      id: "TX-106",
      title: "Transfer Bonus Freelance",
      category: "Pemasukan",
      type: "in",
      amount: 1750000,
      account: "Bank BCA",
      date: "2026-08-19",
      formattedDate: "19 Aug 2026",
      notes: "Proyek desain landing page",
      hour: 22,
      timeLabel: "10:00 PM",
    },
    {
      id: "SCH-01",
      title: "Sewa Kamar Kos",
      category: "Kamar Kos",
      type: "out",
      amount: 1500000,
      account: "Bank BCA",
      date: "2026-08-25",
      formattedDate: "25 Aug 2026",
      notes: "Tagihan sewa bulanan kos",
      hour: 10,
      timeLabel: "10:00 AM",
    },
    {
      id: "SCH-02",
      title: "Langganan Netflix",
      category: "Konsumsi",
      type: "out",
      amount: 54000,
      account: "Bank BCA",
      date: "2026-08-28",
      formattedDate: "28 Aug 2026",
      notes: "Autodebit hiburan",
      hour: 14,
      timeLabel: "2:00 PM",
    },
    {
      id: "SCH-03",
      title: "Patungan Galon & Kebersihan",
      category: "Kamar Kos",
      type: "out",
      amount: 35000,
      account: "Tunai",
      date: "2026-09-01",
      formattedDate: "01 Sep 2026",
      notes: "Kas bulanan kos",
      hour: 8,
      timeLabel: "8:00 AM",
    },
  ])

  const [scheduledBills, setScheduledBills] = useState<ScheduledBill[]>([
    {
      id: "SCH-01",
      title: "Sewa Kamar Kos",
      amount: 1500000,
      date: "2026-08-25",
      formattedDate: "25 Aug 2026",
      category: "Kamar Kos",
      account: "Bank BCA",
      status: "pending",
      notes: "Tagihan sewa bulanan kos",
    },
    {
      id: "SCH-02",
      title: "Langganan Netflix",
      amount: 54000,
      date: "2026-08-28",
      formattedDate: "28 Aug 2026",
      category: "Konsumsi",
      account: "Bank BCA",
      status: "pending",
      notes: "Autodebit hiburan",
    },
    {
      id: "SCH-03",
      title: "Patungan Galon & Kebersihan",
      amount: 35000,
      date: "2026-09-01",
      formattedDate: "01 Sep 2026",
      category: "Kamar Kos",
      account: "Tunai",
      status: "pending",
      notes: "Kas bulanan kos bersama",
    },
  ])

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newAmount, setNewAmount] = useState("")
  const [newCategory, setNewCategory] = useState("Kamar Kos")
  const [newAccount, setNewAccount] = useState("Bank BCA")
  const [newSelectedDate, setNewSelectedDate] = useState<Date>(new Date(2026, 7, 25)) // Aug 25, 2026
  const [newNotes, setNewNotes] = useState("")

  const [notification, setNotification] = useState<string | null>(null)

  const showNotification = (msg: string) => {
    setNotification(msg)
    setTimeout(() => setNotification(null), 4000)
  }

  const handleAddScheduledItem = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle) return

    const parsedAmount = parseFloat(newAmount) || 0
    const dateObj = newSelectedDate || new Date()
    const isoDate = dateObj.toISOString().split("T")[0]
    const formatted = dateObj.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })

    const newId = `SCH-${Date.now().toString().slice(-4)}`

    if (parsedAmount > 0) {
      const newBill: ScheduledBill = {
        id: newId,
        title: newTitle,
        amount: parsedAmount,
        date: isoDate,
        formattedDate: formatted,
        category: newCategory,
        account: newAccount,
        status: "pending",
        notes: newNotes,
      }
      setScheduledBills([...scheduledBills, newBill])
    }

    const newCalTx: CalendarTransaction = {
      id: newId,
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
  }

  const handlePayBill = (id: string) => {
    const bill = scheduledBills.find((b) => b.id === id)
    if (!bill) return

    setScheduledBills(
      scheduledBills.map((b) => (b.id === id ? { ...b, status: "paid" } : b))
    )

    showNotification(
      `Pembayaran "${bill.title}" sebesar Rp ${bill.amount.toLocaleString("id-ID")} berhasil & otomatis dicatat ke log Transaksi!`
    )
  }

  const pendingBills = scheduledBills.filter((b) => b.status === "pending")
  const totalPendingAmount = pendingBills.reduce((sum, b) => sum + b.amount, 0)
  const nextClosestBill = pendingBills[0]

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
                  Jadwal & Kalender Keuangan
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="shadow-none">
              <Plus className="size-4 mr-1.5" /> Tambah Event / Tagihan
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md shadow-none border">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base font-bold">
                <CalendarIcon className="size-5 text-primary" />
                Tambah Event & Tagihan Terjadwal
              </DialogTitle>
              <DialogDescription className="text-xs">
                Jadwalkan tagihan rutin atau acara penting. Otomatis masuk ke kalender.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleAddScheduledItem} className="space-y-4 pt-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Nama Tagihan / Event</label>
                <Input
                  placeholder="Contoh: Sewa Kamar Kos, Netflix, Rapat Kos"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Estimasi Nominal (Rp)</label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Kategori</label>
                  <Select value={newCategory} onValueChange={setNewCategory}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Kategori" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Kamar Kos">Kamar Kos</SelectItem>
                      <SelectItem value="Konsumsi">Konsumsi / Hiburan</SelectItem>
                      <SelectItem value="Tabungan & Target">Tabungan & Target</SelectItem>
                      <SelectItem value="Event & Acara">Event & Acara</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* --- SHADCN POPOVER CALENDAR DATE PICKER --- */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Tanggal Jatuh Tempo</label>
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
                  placeholder="Catatan nomor rekening atau rincian..."
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
                  Simpan ke Kalender
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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="shadow-none border border-border p-5 gap-3 bg-card">
            <CardHeader className="p-0 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Tagihan Mendatang Bulan Ini
              </CardTitle>
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600">
                <Clock className="size-5" />
              </div>
            </CardHeader>
            <CardContent className="p-0 space-y-1">
              <div className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
                {pendingBills.length} Tagihan
              </div>
              <p className="text-xs text-muted-foreground">Perlu dibayarkan bulan ini</p>
            </CardContent>
          </Card>

          <Card className="shadow-none border border-border p-5 gap-3 bg-card">
            <CardHeader className="p-0 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Estimasi Total Nominal Terjadwal
              </CardTitle>
              <div className="p-2 rounded-xl bg-rose-500/10 text-rose-600">
                <TrendingDown className="size-5" />
              </div>
            </CardHeader>
            <CardContent className="p-0 space-y-1">
              <div className="text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400">
                Rp {totalPendingAmount.toLocaleString("id-ID")}
              </div>
              <p className="text-xs text-muted-foreground">Total alokasi tagihan terjadwal</p>
            </CardContent>
          </Card>

          <Card className="shadow-none border border-border p-5 gap-3 bg-card">
            <CardHeader className="p-0 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Tagihan Terdekat
              </CardTitle>
              <div className="p-2 rounded-xl bg-muted/60 text-foreground">
                <CalendarIcon className="size-5" />
              </div>
            </CardHeader>
            <CardContent className="p-0 space-y-1">
              <div className="text-lg font-bold tracking-tight truncate">
                {nextClosestBill ? nextClosestBill.title : "Tidak ada"}
              </div>
              <p className="text-xs text-muted-foreground">
                {nextClosestBill ? `${nextClosestBill.formattedDate} • Rp ${nextClosestBill.amount.toLocaleString("id-ID")}` : "Semua lunas"}
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-none border border-border p-5 gap-3 bg-card">
            <CardHeader className="p-0 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Auto-Sync Transaksi
              </CardTitle>
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600">
                <Sparkles className="size-5" />
              </div>
            </CardHeader>
            <CardContent className="p-0 space-y-1">
              <div className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                Tersambung
              </div>
              <p className="text-xs text-muted-foreground">Otomatis masuk ke kalender & log transaksi</p>
            </CardContent>
          </Card>
        </div>

        {/* 2. Custom FullCalendar Component Integration */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold tracking-tight">Kalender Acara & Tagihan Terjadwal</h2>
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
                Klik "Bayar Sekarang" untuk memproses tagihan & mencatat otomatis ke log transaksi
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="p-0 -mx-5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-5 py-3 text-xs font-semibold text-muted-foreground">Tanggal Tempo</TableHead>
                  <TableHead className="px-5 py-3 text-xs font-semibold text-muted-foreground">Nama Tagihan</TableHead>
                  <TableHead className="px-5 py-3 text-xs font-semibold text-muted-foreground">Kategori</TableHead>
                  <TableHead className="px-5 py-3 text-xs font-semibold text-muted-foreground">Sumber Dana</TableHead>
                  <TableHead className="px-5 py-3 text-xs font-semibold text-muted-foreground">Jumlah Tagihan</TableHead>
                  <TableHead className="px-5 py-3 text-xs font-semibold text-muted-foreground text-center">Aksi Pembayaran</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scheduledBills.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="px-5 py-3.5 text-xs text-muted-foreground font-medium">
                      {b.formattedDate}
                    </TableCell>
                    <TableCell className="px-5 py-3.5 font-semibold text-sm">
                      <div>{b.title}</div>
                      {b.notes && <div className="text-xs text-muted-foreground font-normal">{b.notes}</div>}
                    </TableCell>
                    <TableCell className="px-5 py-3.5">
                      <Badge variant="outline" className="text-xs font-normal border-border">
                        {b.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-5 py-3.5 text-sm text-muted-foreground">
                      {b.account}
                    </TableCell>
                    <TableCell className="px-5 py-3.5 font-bold text-sm text-rose-600 dark:text-rose-400">
                      -Rp {b.amount.toLocaleString("id-ID")}
                    </TableCell>
                    <TableCell className="px-5 py-3.5 text-center">
                      {b.status === "paid" ? (
                        <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-none shadow-none text-xs font-semibold">
                          <CheckCircle2 className="size-3.5 mr-1" /> Lunas
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          className="shadow-none text-xs"
                          onClick={() => handlePayBill(b.id)}
                        >
                          Bayar Sekarang <ArrowRight className="size-3.5 ml-1" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
