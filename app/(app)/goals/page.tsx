"use client"

import React, { useState } from "react"
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
import { Progress } from "@/components/ui/progress"
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
  PiggyBank,
  Plus,
  TrendingUp,
  TrendingDown,
  Wallet,
  CheckCircle2,
  Clock,
  Sparkles,
} from "lucide-react"

export interface SavingGoal {
  id: string
  title: string
  category: string
  targetAmount: number
  currentAmount: number
  deadline: string
  status: "active" | "almost" | "completed"
}

export interface SavingLog {
  id: string
  goalTitle: string
  amount: number
  account: string
  date: string
  autoLoggedToTransactions: boolean
}

export default function GoalsPage() {
  // Goals State
  const [goals, setGoals] = useState<SavingGoal[]>([
    {
      id: "G-101",
      title: "Beli Laptop M3",
      category: "Gadget & Work",
      targetAmount: 12000000,
      currentAmount: 8000000,
      deadline: "Okt 2026",
      status: "active",
    },
    {
      id: "G-102",
      title: "Dana Darurat (3 Bulan)",
      category: "Keuangan & Safe",
      targetAmount: 15000000,
      currentAmount: 9500000,
      deadline: "Des 2026",
      status: "active",
    },
    {
      id: "G-103",
      title: "Tiket Liburan Ke KL",
      category: "Travel & Leisure",
      targetAmount: 3000000,
      currentAmount: 1800000,
      deadline: "Nov 2026",
      status: "almost",
    },
  ])

  // Saving Logs State
  const [savingLogs, setSavingLogs] = useState<SavingLog[]>([
    {
      id: "LOG-1",
      goalTitle: "Beli Laptop M3",
      amount: 1000000,
      account: "Bank Mandiri",
      date: "16 Aug 2026",
      autoLoggedToTransactions: true,
    },
    {
      id: "LOG-2",
      goalTitle: "Dana Darurat (3 Bulan)",
      amount: 1500000,
      account: "Bank BCA",
      date: "10 Aug 2026",
      autoLoggedToTransactions: true,
    },
    {
      id: "LOG-3",
      goalTitle: "Tiket Liburan Ke KL",
      amount: 500000,
      account: "GoPay",
      date: "05 Aug 2026",
      autoLoggedToTransactions: true,
    },
  ])

  // Dialog State: Buat Target Baru
  const [isAddGoalOpen, setIsAddGoalOpen] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newCategory, setNewCategory] = useState("Gadget & Work")
  const [newTargetAmount, setNewTargetAmount] = useState("")
  const [newInitialDeposit, setNewInitialDeposit] = useState("")
  const [newDeadline, setNewDeadline] = useState("Des 2026")
  const [newAccount, setNewAccount] = useState("Bank BCA")

  // Dialog State: Setor Tabungan
  const [isDepositOpen, setIsDepositOpen] = useState(false)
  const [selectedGoalId, setSelectedGoalId] = useState<string>("G-101")
  const [depositAmount, setDepositAmount] = useState("")
  const [depositAccount, setDepositAccount] = useState("Bank BCA")

  // Feedback Notification Message
  const [notification, setNotification] = useState<string | null>(null)

  const showToastNotification = (msg: string) => {
    setNotification(msg)
    setTimeout(() => {
      setNotification(null)
    }, 4000)
  }

  // Handle Create Goal
  const handleCreateGoal = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle || !newTargetAmount) return

    const parsedTarget = parseFloat(newTargetAmount)
    const parsedInitial = parseFloat(newInitialDeposit) || 0

    if (isNaN(parsedTarget) || parsedTarget <= 0) return

    const newGoalObj: SavingGoal = {
      id: `G-${Date.now().toString().slice(-4)}`,
      title: newTitle,
      category: newCategory,
      targetAmount: parsedTarget,
      currentAmount: parsedInitial,
      deadline: newDeadline,
      status: parsedInitial >= parsedTarget ? "completed" : "active",
    }

    setGoals([...goals, newGoalObj])

    if (parsedInitial > 0) {
      const newLog: SavingLog = {
        id: `LOG-${Date.now().toString().slice(-4)}`,
        goalTitle: newTitle,
        amount: parsedInitial,
        account: newAccount,
        date: new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }),
        autoLoggedToTransactions: true,
      }
      setSavingLogs([newLog, ...savingLogs])

      showToastNotification(
        `Target "${newTitle}" dibuat & setoran awal Rp ${parsedInitial.toLocaleString("id-ID")} otomatis dicatat ke transaksi!`
      )
    } else {
      showToastNotification(`Target impian "${newTitle}" berhasil ditambahkan!`)
    }

    setNewTitle("")
    setNewTargetAmount("")
    setNewInitialDeposit("")
    setIsAddGoalOpen(false)
  }

  // Handle Deposit to Goal
  const handleDeposit = (e: React.FormEvent) => {
    e.preventDefault()
    const amt = parseFloat(depositAmount)
    if (isNaN(amt) || amt <= 0) return

    const targetGoal = goals.find((g) => g.id === selectedGoalId)
    if (!targetGoal) return

    const updatedGoals = goals.map((g) => {
      if (g.id === selectedGoalId) {
        const newCurrent = g.currentAmount + amt
        const newStatus: SavingGoal["status"] =
          newCurrent >= g.targetAmount
            ? "completed"
            : newCurrent / g.targetAmount >= 0.75
            ? "almost"
            : "active"
        return { ...g, currentAmount: newCurrent, status: newStatus }
      }
      return g
    })

    setGoals(updatedGoals)

    const newLog: SavingLog = {
      id: `LOG-${Date.now().toString().slice(-4)}`,
      goalTitle: targetGoal.title,
      amount: amt,
      account: depositAccount,
      date: new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }),
      autoLoggedToTransactions: true,
    }

    setSavingLogs([newLog, ...savingLogs])

    showToastNotification(
      `Setoran Rp ${amt.toLocaleString("id-ID")} ke "${targetGoal.title}" berhasil & otomatis masuk ke log transaksi!`
    )

    setDepositAmount("")
    setIsDepositOpen(false)
  }

  // Totals Calculations
  const totalTargetAmount = goals.reduce((sum, g) => sum + g.targetAmount, 0)
  const totalSavedAmount = goals.reduce((sum, g) => sum + g.currentAmount, 0)
  const overallPercentage = Math.round((totalSavedAmount / (totalTargetAmount || 1)) * 100)

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
                <BreadcrumbLink href="#">Sumber Dana & Target</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage className="font-semibold text-base">
                  Nabung & Target
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex items-center gap-2">
          <Dialog open={isDepositOpen} onOpenChange={setIsDepositOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="hidden sm:inline-flex shadow-none">
                <Plus className="size-4 mr-1.5" /> Setor Tabungan
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md shadow-none border">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base font-bold">
                  <PiggyBank className="size-5 text-primary" />
                  Setor Tabungan ke Target Impian
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Setoran akan menambah saldo tabungan & otomatis dicatat di log transaksi.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleDeposit} className="space-y-4 pt-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Pilih Target Tabungan</label>
                  <Select value={selectedGoalId} onValueChange={setSelectedGoalId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Pilih Target" />
                    </SelectTrigger>
                    <SelectContent>
                      {goals.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.title} (Terkumpul: Rp {g.currentAmount.toLocaleString("id-ID")})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Nominal Setoran (Rp)</label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Sumber Dana Setoran</label>
                  <Select value={depositAccount} onValueChange={setDepositAccount}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Pilih Akun Sumber" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Bank BCA">Bank BCA</SelectItem>
                      <SelectItem value="Bank Mandiri">Bank Mandiri</SelectItem>
                      <SelectItem value="Tunai">Tunai / Cash</SelectItem>
                      <SelectItem value="GoPay">GoPay / E-Wallet</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="p-3 rounded-xl bg-muted/60 border border-border flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-foreground font-medium">
                    <Sparkles className="size-4 text-primary shrink-0" />
                    <span>Otomatis catat transaksi di log arus kas</span>
                  </div>
                  <Badge className="bg-primary text-primary-foreground border-none text-[10px]">Aktif</Badge>
                </div>

                <DialogFooter className="pt-2">
                  <DialogClose asChild>
                    <Button type="button" variant="outline" className="shadow-none text-xs">
                      Batal
                    </Button>
                  </DialogClose>
                  <Button type="submit" className="shadow-none text-xs">
                    Setor Sekarang
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={isAddGoalOpen} onOpenChange={setIsAddGoalOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="shadow-none">
                <Plus className="size-4 mr-1.5" /> Buat Target Baru
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md shadow-none border">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base font-bold">
                  <Plus className="size-5 text-primary" />
                  Buat Target Impian Baru
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Rencanakan alokasi tabungan untuk barang atau impian baru Anda.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleCreateGoal} className="space-y-4 pt-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Nama Target / Barang Impian</label>
                  <Input
                    placeholder="Contoh: Beli Laptop M3, Liburan Ke Bali"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Kategori Target</label>
                    <Select value={newCategory} onValueChange={setNewCategory}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Kategori" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Gadget & Work">Gadget & Kerja</SelectItem>
                        <SelectItem value="Keuangan & Safe">Dana Darurat</SelectItem>
                        <SelectItem value="Travel & Leisure">Travel & Liburan</SelectItem>
                        <SelectItem value="Fashion & Hobby">Hobi & Fashion</SelectItem>
                        <SelectItem value="Lainnya">Lainnya</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Target Deadline</label>
                    <Input
                      placeholder="Contoh: Des 2026"
                      value={newDeadline}
                      onChange={(e) => setNewDeadline(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Nominal Target (Rp)</label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={newTargetAmount}
                    onChange={(e) => setNewTargetAmount(e.target.value)}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Setoran Awal (Opsional)</label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={newInitialDeposit}
                      onChange={(e) => setNewInitialDeposit(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Sumber Dana Setoran</label>
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

                <DialogFooter className="pt-2">
                  <DialogClose asChild>
                    <Button type="button" variant="outline" className="shadow-none text-xs">
                      Batal
                    </Button>
                  </DialogClose>
                  <Button type="submit" className="shadow-none text-xs">
                    Simpan Target
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="shadow-none border border-border p-5 gap-3 bg-card">
            <CardHeader className="p-0 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Uang Ketabung
              </CardTitle>
              <div className="p-2 rounded-xl bg-muted/60 text-foreground">
                <PiggyBank className="size-5" />
              </div>
            </CardHeader>
            <CardContent className="p-0 space-y-1">
              <div className="text-2xl font-bold tracking-tight text-foreground">
                Rp {totalSavedAmount.toLocaleString("id-ID")}
              </div>
              <p className="text-xs text-muted-foreground">Terkumpul untuk seluruh target</p>
              <div className="pt-2">
                <Progress value={overallPercentage} className="h-1.5" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-none border border-border p-5 gap-3 bg-card">
            <CardHeader className="p-0 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Alokasi Target
              </CardTitle>
              <div className="p-2 rounded-xl bg-muted/60 text-foreground">
                <Wallet className="size-5" />
              </div>
            </CardHeader>
            <CardContent className="p-0 space-y-1">
              <div className="text-2xl font-bold tracking-tight">
                Rp {totalTargetAmount.toLocaleString("id-ID")}
              </div>
              <p className="text-xs text-muted-foreground">{goals.length} barang & target impian aktif</p>
            </CardContent>
          </Card>

          <Card className="shadow-none border border-border p-5 gap-3 bg-card">
            <CardHeader className="p-0 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Sisa Anggaran Bulanan
              </CardTitle>
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600">
                <TrendingUp className="size-5" />
              </div>
            </CardHeader>
            <CardContent className="p-0 space-y-1">
              <div className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                Rp 5.950.000
              </div>
              <p className="text-xs text-muted-foreground">Bebas alokasi dari batas Rp 10.000.000</p>
            </CardContent>
          </Card>

          <Card className="shadow-none border border-border p-5 gap-3 bg-card">
            <CardHeader className="p-0 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Uang Kepake (Bulan Ini)
              </CardTitle>
              <div className="p-2 rounded-xl bg-rose-500/10 text-rose-600">
                <TrendingDown className="size-5" />
              </div>
            </CardHeader>
            <CardContent className="p-0 space-y-1">
              <div className="text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400">
                Rp 4.050.000
              </div>
              <p className="text-xs text-muted-foreground">40.5% pengeluaran rutinitas</p>
            </CardContent>
          </Card>
        </div>

        {/* 2. Target Impian Cards Grid */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold tracking-tight">Daftar Target & Barang Impian</h2>
              <p className="text-xs text-muted-foreground">
                Setoran tabungan akan otomatis dicatat ke log transaksi
              </p>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {goals.map((g) => {
              const percentage = Math.round((g.currentAmount / g.targetAmount) * 100)
              const remaining = g.targetAmount - g.currentAmount

              return (
                <Card key={g.id} className="border border-border shadow-none p-5 flex flex-col justify-between gap-4 bg-card">
                  <CardHeader className="p-0 flex flex-row items-start justify-between space-y-0">
                    <div>
                      <Badge variant="outline" className="text-[11px] font-normal mb-1 border-border">
                        {g.category}
                      </Badge>
                      <CardTitle className="text-base font-bold">{g.title}</CardTitle>
                      <CardDescription className="text-xs mt-0.5">Target: {g.deadline}</CardDescription>
                    </div>

                    {g.status === "completed" ? (
                      <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-none shadow-none text-xs font-semibold">
                        Lunas / Selesai
                      </Badge>
                    ) : g.status === "almost" ? (
                      <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-none shadow-none text-xs font-semibold">
                        Hampir Tercapai
                      </Badge>
                    ) : (
                      <Badge className="bg-primary/10 text-primary border-none shadow-none text-xs font-semibold">
                        Aktif Menabung
                      </Badge>
                    )}
                  </CardHeader>

                  <CardContent className="p-0 space-y-3">
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="text-muted-foreground">Terkumpul</span>
                      <span className="font-bold text-sm text-foreground">
                        Rp {g.currentAmount.toLocaleString("id-ID")}{" "}
                        <span className="text-xs text-muted-foreground font-normal">
                          / Rp {g.targetAmount.toLocaleString("id-ID")}
                        </span>
                      </span>
                    </div>

                    <Progress value={percentage} className="h-2" />

                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                      <span>Progres: <strong className="text-foreground">{percentage}%</strong></span>
                      <span>Sisa: <strong>Rp {Math.max(0, remaining).toLocaleString("id-ID")}</strong></span>
                    </div>
                  </CardContent>

                  <CardFooter className="p-0 pt-2 border-t border-border">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs shadow-none border-border hover:bg-muted"
                      onClick={() => {
                        setSelectedGoalId(g.id)
                        setIsDepositOpen(true)
                      }}
                    >
                      <Plus className="size-3.5 mr-1.5" /> Setor Tabungan Lagi
                    </Button>
                  </CardFooter>
                </Card>
              )
            })}
          </div>
        </div>

        {/* 3. Log History Table */}
        <Card className="border border-border shadow-none p-5 gap-4 bg-card">
          <CardHeader className="p-0 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Clock className="size-5 text-primary" />
                Riwayat Log Setoran Tabungan & Transaksi Otomatis
              </CardTitle>
              <CardDescription className="text-sm">
                Log setoran yang tersambung langsung ke tabel transaksi keuangan Anda
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="p-0 -mx-5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-5 py-3 text-xs font-semibold text-muted-foreground">Tanggal</TableHead>
                  <TableHead className="px-5 py-3 text-xs font-semibold text-muted-foreground">Target Impian</TableHead>
                  <TableHead className="px-5 py-3 text-xs font-semibold text-muted-foreground">Sumber Dana</TableHead>
                  <TableHead className="px-5 py-3 text-xs font-semibold text-muted-foreground">Nominal Setoran</TableHead>
                  <TableHead className="px-5 py-3 text-xs font-semibold text-muted-foreground text-right">Status Log Transaksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {savingLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="px-5 py-3.5 text-xs text-muted-foreground font-medium">
                      {log.date}
                    </TableCell>
                    <TableCell className="px-5 py-3.5 font-semibold text-sm">
                      {log.goalTitle}
                    </TableCell>
                    <TableCell className="px-5 py-3.5 text-sm text-muted-foreground">
                      {log.account}
                    </TableCell>
                    <TableCell className="px-5 py-3.5 font-bold text-sm text-foreground">
                      +Rp {log.amount.toLocaleString("id-ID")}
                    </TableCell>
                    <TableCell className="px-5 py-3.5 text-right">
                      {log.autoLoggedToTransactions ? (
                        <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-none shadow-none text-xs font-semibold">
                          <Sparkles className="size-3 mr-1" /> Otomatis Masuk Transaksi
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          Manual
                        </Badge>
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
