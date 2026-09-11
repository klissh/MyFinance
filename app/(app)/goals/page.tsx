"use client"

import { useMoney } from "@/lib/currency"
import React, { useState, useEffect } from "react"
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
import { Progress } from "@/components/ui/progress"
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
  PiggyBank,
  Plus,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
} from "lucide-react"
import Link from "next/link"
import { MetricCard } from "@/components/ui/metric-card"
import {
  goalService,
  transactionService,
  accountService,
  resolvePersonalAccount,
  GoalRecord,
  TransactionRecord,
  FinancialAccountRecord,
} from "@/lib/db"

export default function GoalsPage() {
  const { fmt, formatInput, formatValue, parseInput, symbol, zero } = useMoney()
  const [goals, setGoals] = useState<GoalRecord[]>([])
  const [transactions, setTransactions] = useState<TransactionRecord[]>([])
  const [accounts, setAccounts] = useState<FinancialAccountRecord[]>([])

  useEffect(() => {
    async function loadData() {
      const [goalList, txList, accList] = await Promise.all([
        goalService.getAll(),
        transactionService.getAll(),
        accountService.getAll(),
      ])
      setGoals(goalList)
      setTransactions(txList)
      setAccounts(accList)
    }
    loadData()
  }, [])

  // Toast Notification State
  const [notification, setNotification] = useState<{ msg: string; error?: boolean } | null>(null)

  const showToastNotification = (message: string, error = false) => {
    setNotification({ msg: message, error })
    setTimeout(() => setNotification(null), 4000)
  }

  // Dialog State: Buat Target Baru
  const [isAddGoalOpen, setIsAddGoalOpen] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newCategory, setNewCategory] = useState("Gadget & Work")
  const [newTargetAmount, setNewTargetAmount] = useState("")
  const [newDeadline, setNewDeadline] = useState("Des 2026")
  const [newInitialDeposit, setNewInitialDeposit] = useState("")
  const [newAccount, setNewAccount] = useState("")

  // Dialog State: Setor Tabungan
  const [isDepositOpen, setIsDepositOpen] = useState(false)
  const [selectedGoalId, setSelectedGoalId] = useState<string>("")
  const [depositAmount, setDepositAmount] = useState("")
  const [depositAccount, setDepositAccount] = useState("")

  // Segarkan daftar sumber dana saat dialog buat target / setor tabungan dibuka.
  useEffect(() => {
    if (!isAddGoalOpen && !isDepositOpen) return
    accountService.getAll().then((accs) => {
      setAccounts(accs)
      const def = accs.length ? resolvePersonalAccount(accs) : ""
      setNewAccount((p) => (accs.some((a) => a.name === p) ? p : def))
      setDepositAccount((p) => (accs.some((a) => a.name === p) ? p : def))
    })
  }, [isAddGoalOpen, isDepositOpen])

  // Pagination State for Target Cards Grid
  const [goalCurrentPage, setGoalCurrentPage] = useState(1)
  const [goalPageSize, setGoalPageSize] = useState(6)

  const [isSubmittingGoal, setIsSubmittingGoal] = useState(false)
  const [isSubmittingDeposit, setIsSubmittingDeposit] = useState(false)

  const formatNumberWithDots = formatInput
  const parseFormattedNumber = parseInput

  // Handle Add New Goal
  const handleAddGoal = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle || !newTargetAmount) return

    const targetNum = parseFormattedNumber(newTargetAmount)
    const initDeposit = parseFormattedNumber(newInitialDeposit) || 0

    if (isNaN(targetNum) || targetNum <= 0) return

    setIsSubmittingGoal(true)
    try {
      const newGoalObj = await goalService.add({
        title: newTitle,
        category: newCategory,
        targetAmount: targetNum,
        deadline: newDeadline || "Des 2026",
      })

      if (initDeposit > 0) {
        await goalService.deposit(newGoalObj.id, initDeposit, newAccount)
      }

      const refreshed = await goalService.getAll()
      setGoals(refreshed)

      showToastNotification(`Target impian "${newTitle}" berhasil dibuat!`)

      setNewTitle("")
      setNewTargetAmount("")
      setNewInitialDeposit("")
      setIsAddGoalOpen(false)
    } catch (err) {
      showToastNotification(err instanceof Error ? err.message : "Gagal membuat target.", true)
    } finally {
      setIsSubmittingGoal(false)
    }
  }

  // Handle Deposit to Goal
  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault()
    const amt = parseFormattedNumber(depositAmount)
    if (isNaN(amt) || amt <= 0) return

    const targetGoal = goals.find((g) => g.id === selectedGoalId)
    if (!targetGoal) return

    setIsSubmittingDeposit(true)
    try {
      await goalService.deposit(selectedGoalId, amt, depositAccount)
      const refreshed = await goalService.getAll()
      setGoals(refreshed)

      showToastNotification(
        `Berhasil setor ${fmt(amt)} ke "${targetGoal.title}"!`
      )

      setDepositAmount("")
      setIsDepositOpen(false)
    } catch (err) {
      showToastNotification(err instanceof Error ? err.message : "Gagal mencatat setoran.", true)
    } finally {
      setIsSubmittingDeposit(false)
    }
  }

  // ---- Edit / Delete Target ----
  const [editGoal, setEditGoal] = useState<GoalRecord | null>(null)
  const [editTitle, setEditTitle] = useState("")
  const [editCategory, setEditCategory] = useState("Gadget & Work")
  const [editTarget, setEditTarget] = useState("")
  const [editDeadline, setEditDeadline] = useState("")
  const [isEditingGoal, setIsEditingGoal] = useState(false)
  const [deletingGoalId, setDeletingGoalId] = useState<string | null>(null)

  const openEditGoal = (g: GoalRecord) => {
    setEditGoal(g)
    setEditTitle(g.title)
    setEditCategory(g.category)
    setEditTarget(formatValue(g.targetAmount))
    setEditDeadline(g.deadline)
  }

  const handleEditGoal = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editGoal || !editTitle) return
    const targetNum = parseFormattedNumber(editTarget)
    if (isNaN(targetNum) || targetNum <= 0) return

    setIsEditingGoal(true)
    try {
      await goalService.update(editGoal.id, {
        title: editTitle,
        category: editCategory,
        targetAmount: targetNum,
        deadline: editDeadline || "Des 2026",
      })
      setGoals(await goalService.getAll())
      setEditGoal(null)
      showToastNotification(`Target "${editTitle}" berhasil diperbarui.`)
    } catch (err) {
      showToastNotification(err instanceof Error ? err.message : "Gagal memperbarui target.", true)
    } finally {
      setIsEditingGoal(false)
    }
  }

  const handleDeleteGoal = async (g: GoalRecord) => {
    setDeletingGoalId(g.id)
    try {
      await goalService.remove(g.id)
      setGoals(await goalService.getAll())
      showToastNotification(`Target "${g.title}" dihapus.`)
    } catch (err) {
      showToastNotification(err instanceof Error ? err.message : "Gagal menghapus target.", true)
    } finally {
      setDeletingGoalId(null)
    }
  }

  // Dynamic Calculations from Database
  const totalTargetAmount = goals.reduce((sum, g) => sum + g.targetAmount, 0)
  const totalSavedAmount = goals.reduce((sum, g) => sum + g.currentAmount, 0)
  const overallPercentage = Math.round((totalSavedAmount / (totalTargetAmount || 1)) * 100)

  const totalIncome = transactions.filter((t) => t.type === "in").reduce((sum, t) => sum + t.amount, 0)
  const totalExpense = transactions.filter((t) => t.type === "out").reduce((sum, t) => sum + t.amount, 0)
  const remainingBudget = totalIncome > 0 ? Math.max(0, totalIncome - totalExpense) : 0
  const expensePercentage = totalIncome > 0 ? Math.min(100, Math.round((totalExpense / totalIncome) * 100)) : 0

  // Target Cards Pagination Logic
  const totalGoalItems = goals.length
  const totalGoalPages = Math.ceil(totalGoalItems / (goalPageSize || 6)) || 1
  const goalStartIndex = (goalCurrentPage - 1) * goalPageSize
  const paginatedGoals = goals.slice(goalStartIndex, goalStartIndex + goalPageSize)

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
      </header>

      {/* Main Content */}
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

        {/* 1. Summary Metric Cards (Computed Dynamically from DB) */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <MetricCard
            label="Total uang ketabung"
            value={fmt(totalSavedAmount)}
            hint="untuk seluruh target"
            progress={overallPercentage}
          />
          <MetricCard
            label="Total alokasi target"
            value={fmt(totalTargetAmount)}
            hint={`${goals.length} target aktif`}
          />
          <MetricCard
            label="Sisa anggaran bulan ini"
            value={fmt(remainingBudget)}
            tone="positive"
            hint={totalIncome > 0 ? `dari pemasukan ${fmt(totalIncome)}` : "belum ada pemasukan"}
          />
          <MetricCard
            label="Uang kepake bulan ini"
            value={fmt(totalExpense)}
            tone="negative"
            hint={totalIncome > 0 ? `${expensePercentage}% dari pemasukan` : undefined}
          />
        </div>

        {/* 2. Target Impian Cards Section */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Daftar Target & Barang Impian</h2>
              <p className="text-xs text-muted-foreground">
                Setoran tabungan akan otomatis mengupdate progres target Anda
              </p>
            </div>

            {/* Action Dialog Triggers */}
            <div className="flex items-center gap-2">
              <Dialog open={isDepositOpen} onOpenChange={setIsDepositOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="shadow-none text-xs border-border" disabled={goals.length === 0}>
                    <Plus className="size-3.5 mr-1.5" /> Setor Tabungan
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md shadow-none border">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-base font-bold">
                      <PiggyBank className="size-5 text-primary" />
                      Setor Tabungan ke Target Impian
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                      Setoran akan menambah saldo tabungan target impian Anda.
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
                              {g.title} (Terkumpul: {fmt(g.currentAmount)})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground">Nominal Setoran ({symbol})</label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        placeholder={zero}
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(formatNumberWithDots(e.target.value))}
                        required
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground">Sumber Dana Setoran</label>
                      <Select value={depositAccount} onValueChange={setDepositAccount} disabled={accounts.length === 0}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={accounts.length ? "Pilih Sumber Dana" : "Belum ada sumber dana"} />
                        </SelectTrigger>
                        <SelectContent>
                          {accounts.map((a) => (
                            <SelectItem key={a.id} value={a.name}>{a.name}</SelectItem>
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

                    <DialogFooter className="pt-2">
                      <DialogClose asChild>
                        <Button type="button" variant="outline" className="shadow-none text-xs">
                          Batal
                        </Button>
                      </DialogClose>
                      <Button type="submit" disabled={isSubmittingDeposit} className="shadow-none text-xs">
                        {isSubmittingDeposit ? (
                          <div className="flex items-center gap-1.5">
                            <Spinner className="size-3.5" />
                            <span>Memproses...</span>
                          </div>
                        ) : (
                          "Konfirmasi Setor"
                        )}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>

              <Dialog open={isAddGoalOpen} onOpenChange={setIsAddGoalOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="shadow-none text-xs">
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
                      Tentukan nama barang, estimasi nominal target, dan tenggat waktu impian Anda.
                    </DialogDescription>
                  </DialogHeader>

                  <form onSubmit={handleAddGoal} className="space-y-4 pt-2">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground">Nama Barang / Target Impian</label>
                      <Input
                        placeholder="Contoh: Beli Laptop Macbook M3, Mudik Lebaran"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        required
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                      <label className="text-xs font-semibold text-muted-foreground">Nominal Target ({symbol})</label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        placeholder={zero}
                        value={newTargetAmount}
                        onChange={(e) => setNewTargetAmount(formatNumberWithDots(e.target.value))}
                        required
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-muted-foreground">Setoran Awal (Opsional)</label>
                        <Input
                          type="text"
                          inputMode="numeric"
                          placeholder={zero}
                          value={newInitialDeposit}
                          onChange={(e) => setNewInitialDeposit(formatNumberWithDots(e.target.value))}
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-muted-foreground">Sumber Dana Setoran</label>
                        <Select value={newAccount} onValueChange={setNewAccount} disabled={accounts.length === 0}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder={accounts.length ? "Sumber Dana" : "Belum ada"} />
                          </SelectTrigger>
                          <SelectContent>
                            {accounts.map((a) => (
                              <SelectItem key={a.id} value={a.name}>{a.name}</SelectItem>
                            ))}
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
                      <Button type="submit" disabled={isSubmittingGoal} className="shadow-none text-xs">
                        {isSubmittingGoal ? (
                          <div className="flex items-center gap-1.5">
                            <Spinner className="size-3.5" />
                            <span>Menyimpan...</span>
                          </div>
                        ) : (
                          "Simpan Target"
                        )}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Comfortable & Spacious Target Cards Grid (3 Columns on Desktop) */}
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {paginatedGoals.length === 0 ? (
              <div className="col-span-full border border-border rounded-2xl p-8 text-center bg-card space-y-3">
                <PiggyBank className="size-10 text-muted-foreground/50 mx-auto" />
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-foreground">Belum Ada Target Impian</h3>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    Buat target impian pertama Anda untuk mulai memantau dan menabung secara konsisten.
                  </p>
                </div>
                <Button onClick={() => setIsAddGoalOpen(true)} size="sm" className="text-xs shadow-none">
                  <Plus className="size-3.5 mr-1.5" /> Buat Target Impian Baru
                </Button>
              </div>
            ) : (
              paginatedGoals.map((g) => {
                const percentage = Math.round((g.currentAmount / g.targetAmount) * 100)
                const remaining = g.targetAmount - g.currentAmount

                return (
                  <Card key={g.id} className="border border-border shadow-none p-5 flex flex-col justify-between gap-4 bg-card">
                    <CardHeader className="p-0 flex flex-row items-start justify-between space-y-0 gap-2">
                      <div className="space-y-1">
                        <Badge variant="outline" className="text-[11px] font-normal border-border">
                          {g.category}
                        </Badge>
                        <CardTitle className="text-base font-bold leading-tight">{g.title}</CardTitle>
                        <CardDescription className="text-xs">Tempo: {g.deadline}</CardDescription>
                      </div>

                      {g.status === "completed" ? (
                        <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-none shadow-none text-xs font-semibold shrink-0">
                          Lunas
                        </Badge>
                      ) : g.status === "almost" ? (
                        <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-none shadow-none text-xs font-semibold shrink-0">
                          80%+
                        </Badge>
                      ) : (
                        <Badge className="bg-primary/10 text-primary border-none shadow-none text-xs font-semibold shrink-0">
                          Aktif
                        </Badge>
                      )}
                    </CardHeader>

                    <CardContent className="p-0 space-y-3">
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="text-muted-foreground">Terkumpul</span>
                        <span className="font-bold text-sm text-foreground">
                          {fmt(g.currentAmount)} / <span className="text-xs text-muted-foreground font-medium">{fmt(g.targetAmount)}</span>
                        </span>
                      </div>

                      <Progress value={percentage} className="h-2" />

                      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                        <span>Progres: <strong className="text-foreground">{percentage}%</strong></span>
                        <span>Sisa: <strong>{fmt(Math.max(0, remaining))}</strong></span>
                      </div>
                    </CardContent>

                    <CardFooter className="p-0 pt-3 border-t border-border flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs shadow-none border-border h-8 hover:bg-muted"
                        onClick={() => {
                          setSelectedGoalId(g.id)
                          setIsDepositOpen(true)
                        }}
                      >
                        <Plus className="size-3.5 mr-1.5" /> Setor Tabungan
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0 text-muted-foreground hover:text-foreground border border-border"
                        onClick={() => openEditGoal(g)}
                        title="Ubah target"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 shrink-0 text-muted-foreground hover:text-rose-600 border border-border"
                            disabled={deletingGoalId === g.id}
                            title="Hapus target"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle className="text-rose-600 dark:text-rose-400">
                              Hapus target &quot;{g.title}&quot;?
                            </AlertDialogTitle>
                            <AlertDialogDescription className="text-xs leading-relaxed">
                              Target dan riwayat setorannya dihapus permanen. Transaksi
                              &quot;Setoran Tabungan&quot; yang sudah tercatat di log keuangan
                              pribadi <strong>tetap ada</strong> (uang memang sudah berpindah).
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="text-xs">Batal</AlertDialogCancel>
                            <AlertDialogAction
                              className="text-xs bg-rose-600 hover:bg-rose-700 text-white"
                              onClick={() => handleDeleteGoal(g)}
                            >
                              Ya, Hapus
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </CardFooter>
                  </Card>
                )
              })
            )}
          </div>

          {/* Pagination Controls for Target Cards Grid */}
          {goals.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs pt-3 border-t border-border">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Items per page</span>
                <Select
                  value={String(goalPageSize)}
                  onValueChange={(val) => {
                    setGoalPageSize(Number(val))
                    setGoalCurrentPage(1)
                  }}
                >
                  <SelectTrigger className="w-[70px] h-8 text-xs font-semibold shadow-none border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">3</SelectItem>
                    <SelectItem value="6">6</SelectItem>
                    <SelectItem value="9">9</SelectItem>
                    <SelectItem value="12">12</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-muted-foreground ml-2">
                  Showing {goalStartIndex + 1}-{Math.min(goalStartIndex + goalPageSize, totalGoalItems)} of {totalGoalItems} items
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8 shadow-none border-border"
                  disabled={goalCurrentPage === 1}
                  onClick={() => setGoalCurrentPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="size-4" />
                </Button>

                <div className="text-xs font-semibold px-2">
                  Page {goalCurrentPage} of {totalGoalPages}
                </div>

                <Button
                  variant="outline"
                  size="icon"
                  className="size-8 shadow-none border-border"
                  disabled={goalCurrentPage >= totalGoalPages}
                  onClick={() => setGoalCurrentPage((p) => Math.min(totalGoalPages, p + 1))}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit Target Dialog */}
      <Dialog open={!!editGoal} onOpenChange={(open) => !open && setEditGoal(null)}>
        <DialogContent className="sm:max-w-md shadow-none border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Pencil className="size-5 text-primary" />
              Ubah Target Impian
            </DialogTitle>
            <DialogDescription className="text-xs">
              Jumlah yang sudah terkumpul tidak berubah — status progres dihitung ulang.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEditGoal} className="space-y-4 pt-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Nama Barang / Target Impian</label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Kategori Target</label>
                <Select value={editCategory} onValueChange={setEditCategory}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Kategori" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Gadget & Work">Gadget & Kerja</SelectItem>
                    <SelectItem value="Keuangan & Safe">Dana Darurat</SelectItem>
                    <SelectItem value="Travel & Leisure">Travel & Liburan</SelectItem>
                    <SelectItem value="Fashion & Hobby">Hobi & Fashion</SelectItem>
                    <SelectItem value="Lainnya">Lainnya</SelectItem>
                    {editCategory &&
                      !["Gadget & Work", "Keuangan & Safe", "Travel & Leisure", "Fashion & Hobby", "Lainnya"].includes(
                        editCategory,
                      ) && <SelectItem value={editCategory}>{editCategory}</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Target Deadline</label>
                <Input value={editDeadline} onChange={(e) => setEditDeadline(e.target.value)} required />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Nominal Target ({symbol})</label>
              <Input
                type="text"
                inputMode="numeric"
                placeholder={zero}
                value={editTarget}
                onChange={(e) => setEditTarget(formatNumberWithDots(e.target.value))}
                required
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                className="shadow-none text-xs"
                onClick={() => setEditGoal(null)}
              >
                Batal
              </Button>
              <Button type="submit" disabled={isEditingGoal} className="shadow-none text-xs">
                {isEditingGoal ? (
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
