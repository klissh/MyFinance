"use client"

import React, { useState, useEffect } from "react"
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
import { CreditCard } from "@/components/shared-assets/credit-card/credit-card"
import {
  Wallet,
  Building2,
  CreditCard as CreditCardIcon,
  Plus,
  ArrowLeftRight,
  CheckCircle2,
} from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import {
  accountService,
  transactionService,
  authService,
  FinancialAccountRecord,
} from "@/lib/db"

interface AccountMutation {
  id: string
  accountName: string
  title: string
  type: "in" | "out" | "transfer"
  amount: number
  date: string
}

export default function FinancePage() {
  const [accounts, setAccounts] = useState<FinancialAccountRecord[]>([])
  const [mutations, setMutations] = useState<AccountMutation[]>([])

  useEffect(() => {
    async function loadFinanceData() {
      const [accs, txs] = await Promise.all([
        accountService.getAll(),
        transactionService.getAll(),
      ])
      setAccounts(accs)
      const formattedMutations: AccountMutation[] = txs.map((t) => ({
        id: t.id,
        accountName: t.account,
        title: t.title,
        type: t.type,
        amount: t.amount,
        date: t.formattedDate,
      }))
      setMutations(formattedMutations)
    }
    loadFinanceData()
  }, [])

  const [selectedAccountFilter, setSelectedAccountFilter] = useState<string>("all")

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [newAccName, setNewAccName] = useState("")
  const [newAccType, setNewAccType] = useState("Rekening Utama")
  const [newAccBalance, setNewAccBalance] = useState("")
  const [newAccNumber, setNewAccNumber] = useState("")
  const [newAccCardHolder, setNewAccCardHolder] = useState(
    () => authService.getCurrentUser()?.fullName ?? "",
  )
  const [newAccDesign, setNewAccDesign] = useState<FinancialAccountRecord["cardDesignType"]>("brand-dark")

  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false)
  const [transferFrom, setTransferFrom] = useState("")
  const [transferTo, setTransferTo] = useState("")
  const [transferAmount, setTransferAmount] = useState("")

  const [isSubmittingAcc, setIsSubmittingAcc] = useState(false)
  const [isSubmittingTransfer, setIsSubmittingTransfer] = useState(false)

  const formatNumberWithDots = (val: string): string => {
    const digits = val.replace(/\D/g, "")
    if (!digits) return ""
    return Number(digits).toLocaleString("id-ID")
  }

  const parseFormattedNumber = (val: string): number => {
    const digits = val.replace(/\D/g, "")
    return parseFloat(digits) || 0
  }

  const [notification, setNotification] = useState<string | null>(null)

  const showNotification = (msg: string) => {
    setNotification(msg)
    setTimeout(() => setNotification(null), 4000)
  }

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newAccName || !newAccBalance) return

    const parsedBalance = parseFormattedNumber(newAccBalance)
    if (isNaN(parsedBalance)) return

    setIsSubmittingAcc(true)
    const currentUser = authService.getCurrentUser()

    const newAccountObj = await accountService.add({
      name: newAccName,
      type: newAccType,
      accountCategory: newAccType.toLowerCase().includes("bank") ? "bank" : newAccType.toLowerCase().includes("wallet") ? "ewallet" : "cash",
      balance: parsedBalance,
      cardNumber: newAccNumber || "**** **** 0000",
      cardHolder: (newAccCardHolder || currentUser?.fullName || "USER").toUpperCase(),
      expiration: "12/29",
      cardDesignType: newAccDesign,
    })

    const updatedAccs = await accountService.getAll()
    setAccounts(updatedAccs)
    showNotification(`Sumber dana "${newAccountObj.name}" berhasil dibuat!`)

    setNewAccName("")
    setNewAccBalance("")
    setNewAccNumber("")
    setIsSubmittingAcc(false)
    setIsAddDialogOpen(false)
  }

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault()
    const amt = parseFormattedNumber(transferAmount)
    if (isNaN(amt) || amt <= 0 || transferFrom === transferTo) return

    setIsSubmittingTransfer(true)

    const fromAcc = accounts.find((a) => a.name === transferFrom)
    const toAcc = accounts.find((a) => a.name === transferTo)

    if (!fromAcc || !toAcc) {
      setIsSubmittingTransfer(false)
      return
    }

    const newFromBalance = Math.max(0, fromAcc.balance - amt)
    const newToBalance = toAcc.balance + amt

    // 1. Update account balances in Supabase & local storage
    await accountService.updateBalanceByName(transferFrom, newFromBalance)
    await accountService.updateBalanceByName(transferTo, newToBalance)

    const dateObj = new Date()
    const isoDate = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}-${String(dateObj.getDate()).padStart(2, "0")}`
    const formattedDate = dateObj.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })

    // 2. Record 2 transfer transactions (Outflow from source, Inflow to target).
    //    adjustBalance: false — saldo sudah diset absolut di langkah 1.
    await transactionService.add(
      {
        title: `Transfer ke ${transferTo}`,
        category: "Transfer",
        type: "out",
        amount: amt,
        account: transferFrom,
        date: isoDate,
        formattedDate: formattedDate,
        notes: `Transfer saldo ke ${transferTo}`,
      },
      { adjustBalance: false },
    )

    await transactionService.add(
      {
        title: `Transfer dari ${transferFrom}`,
        category: "Transfer",
        type: "in",
        amount: amt,
        account: transferTo,
        date: isoDate,
        formattedDate: formattedDate,
        notes: `Transfer saldo masuk dari ${transferFrom}`,
      },
      { adjustBalance: false },
    )

    // 3. Refresh accounts & mutations list
    const [updatedAccs, updatedTxs] = await Promise.all([
      accountService.getAll(),
      transactionService.getAll(),
    ])
    setAccounts(updatedAccs)

    const formattedMutations: AccountMutation[] = updatedTxs.map((t) => ({
      id: t.id,
      accountName: t.account,
      title: t.title,
      type: t.type,
      amount: t.amount,
      date: t.formattedDate,
    }))
    setMutations(formattedMutations)

    showNotification(
      `Transfer Rp ${amt.toLocaleString("id-ID")} dari "${transferFrom}" ke "${transferTo}" berhasil dicatat di mutasi!`
    )

    setTransferAmount("")
    setIsSubmittingTransfer(false)
    setIsTransferDialogOpen(false)
  }

  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0)
  const totalAccountsCount = accounts.length

  const topAccount = accounts.length > 0 ? [...accounts].sort((a, b) => b.balance - a.balance)[0] : null
  const topPct = (topAccount && totalBalance > 0) ? Math.round((topAccount.balance / totalBalance) * 100) : 0

  const filteredMutations = mutations.filter((m) => {
    if (selectedAccountFilter === "all") return true
    return m.accountName === selectedAccountFilter
  })

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
                  Sumber Dana & Target &gt; Sumber Dana (Akun Keuangan)
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        {/* Global Quick Action Buttons */}
        <div className="flex items-center gap-2">
          <Dialog open={isTransferDialogOpen} onOpenChange={setIsTransferDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="shadow-none text-xs border-border" disabled={accounts.length < 2}>
                <ArrowLeftRight className="size-3.5 mr-1.5" /> Transfer Antar Akun
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md shadow-none border">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base font-bold">
                  <ArrowLeftRight className="size-5 text-primary" />
                  Transfer Antar Akun Keuangan
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Pindahkan dana dari satu rekening/dompet ke rekening lainnya.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleTransfer} className="space-y-4 pt-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Dari Akun (Pengirim)</label>
                  <Select value={transferFrom} onValueChange={setTransferFrom}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Pilih Akun Pengirim" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((acc) => (
                        <SelectItem key={acc.id} value={acc.name}>
                          {acc.name} (Saldo: Rp {acc.balance.toLocaleString("id-ID")})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Ke Akun (Penerima)</label>
                  <Select value={transferTo} onValueChange={setTransferTo}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Pilih Akun Penerima" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((acc) => (
                        <SelectItem key={acc.id} value={acc.name}>
                          {acc.name} (Saldo: Rp {acc.balance.toLocaleString("id-ID")})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Nominal Transfer (Rp)</label>
                  <Input
                    type="text"
                    placeholder="0"
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(formatNumberWithDots(e.target.value))}
                    required
                  />
                </div>

                <DialogFooter className="pt-2">
                  <DialogClose asChild>
                    <Button type="button" variant="outline" className="shadow-none text-xs">
                      Batal
                    </Button>
                  </DialogClose>
                  <Button type="submit" disabled={isSubmittingTransfer} className="shadow-none text-xs">
                    {isSubmittingTransfer ? (
                      <div className="flex items-center gap-1.5">
                        <Spinner className="size-3.5" />
                        <span>Memproses...</span>
                      </div>
                    ) : (
                      "Kirim Transfer"
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="shadow-none text-xs">
                <Plus className="size-4 mr-1.5" /> Tambah Sumber Dana
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md shadow-none border">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base font-bold">
                  <Plus className="size-5 text-primary" />
                  Tambah Akun Sumber Dana Baru
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Daftarkan rekening bank, dompet tunai, atau e-wallet baru Anda.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleAddAccount} className="space-y-4 pt-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Nama Akun / Bank</label>
                  <Input
                    placeholder="Contoh: Bank BCA, Mandiri, Cash Wallet"
                    value={newAccName}
                    onChange={(e) => setNewAccName(e.target.value)}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Tipe Akun</label>
                    <Select value={newAccType} onValueChange={setNewAccType}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Tipe" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Rekening Utama">Rekening Bank</SelectItem>
                        <SelectItem value="Tabungan Target">Tabungan</SelectItem>
                        <SelectItem value="Dompet Fisik">Dompet Tunai</SelectItem>
                        <SelectItem value="E-Wallet Digital">E-Wallet</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Desain Kartu</label>
                    <Select value={newAccDesign} onValueChange={(val) => setNewAccDesign(val as FinancialAccountRecord["cardDesignType"])}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Warna Kartu" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="brand-dark">Dark Premium</SelectItem>
                        <SelectItem value="transparent-gradient">Gradient Glass</SelectItem>
                        <SelectItem value="salmon-strip">Salmon Peach</SelectItem>
                        <SelectItem value="gray-dark">Charcoal Dark</SelectItem>
                        <SelectItem value="brand-light">Classic Light</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Saldo Awal (Rp)</label>
                    <Input
                      type="text"
                      placeholder="0"
                      value={newAccBalance}
                      onChange={(e) => setNewAccBalance(formatNumberWithDots(e.target.value))}
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Nomor Kartu/Akun</label>
                    <Input
                      placeholder="**** **** 8829"
                      value={newAccNumber}
                      onChange={(e) => setNewAccNumber(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Nama Pemilik Kartu</label>
                  <Input
                    placeholder="NAMA LENGKAP"
                    value={newAccCardHolder}
                    onChange={(e) => setNewAccCardHolder(e.target.value)}
                  />
                </div>

                <DialogFooter className="pt-2">
                  <DialogClose asChild>
                    <Button type="button" variant="outline" className="shadow-none text-xs">
                      Batal
                    </Button>
                  </DialogClose>
                  <Button type="submit" disabled={isSubmittingAcc} className="shadow-none text-xs">
                    {isSubmittingAcc ? (
                      <div className="flex items-center gap-1.5">
                        <Spinner className="size-3.5" />
                        <span>Menyimpan...</span>
                      </div>
                    ) : (
                      "Simpan Akun"
                    )}
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

        {/* 1. Metric Summary Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="shadow-none border border-border p-5 gap-3 bg-card">
            <CardHeader className="p-0 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-semibold text-muted-foreground tracking-tight">
                Total Saldo Keseluruhan
              </CardTitle>
              <div className="p-2 rounded-xl bg-muted/60 text-foreground">
                <Wallet className="size-4" />
              </div>
            </CardHeader>
            <CardContent className="p-0 space-y-1">
              <div className="text-2xl font-bold tracking-tight">
                Rp {totalBalance.toLocaleString("id-ID")}
              </div>
              <p className="text-xs text-muted-foreground">Tersimpan di {totalAccountsCount} akun aktif</p>
            </CardContent>
          </Card>

          <Card className="shadow-none border border-border p-5 gap-3 bg-card">
            <CardHeader className="p-0 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-semibold text-muted-foreground tracking-tight">
                Jumlah Akun Terdaftar
              </CardTitle>
              <div className="p-2 rounded-xl bg-muted/60 text-foreground">
                <Building2 className="size-4" />
              </div>
            </CardHeader>
            <CardContent className="p-0 space-y-1">
              <div className="text-2xl font-bold tracking-tight">
                {totalAccountsCount} Akun Active
              </div>
              <p className="text-xs text-muted-foreground">Bank, Cash, dan E-Wallet</p>
            </CardContent>
          </Card>

          <Card className="shadow-none border border-border p-5 gap-3 bg-card">
            <CardHeader className="p-0 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-semibold text-muted-foreground tracking-tight">
                Alokasi Saldo Terbesar
              </CardTitle>
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600">
                <CreditCardIcon className="size-4" />
              </div>
            </CardHeader>
            <CardContent className="p-0 space-y-1">
              <div className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                {topAccount ? `${topAccount.name} (${topPct}%)` : "Belum ada"}
              </div>
              <p className="text-xs text-muted-foreground">
                {topAccount ? `Rp ${topAccount.balance.toLocaleString("id-ID")} saldo aktif` : "Belum ada akun"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* 2. Visual Credit Card Component Grid Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold tracking-tight">Kartu & Akun Sumber Dana</h2>
              <p className="text-xs text-muted-foreground">
                Daftar kartu digital dan dompet keuangan aktif Anda
              </p>
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {accounts.length === 0 ? (
              <div className="col-span-full border border-border rounded-2xl p-8 text-center bg-card space-y-3">
                <Wallet className="size-10 text-muted-foreground/50 mx-auto" />
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-foreground">Belum Ada Sumber Dana</h3>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    Daftarkan rekening bank, dompet digital, atau uang tunai Anda untuk mengelola keuangan.
                  </p>
                </div>
                <Button onClick={() => setIsAddDialogOpen(true)} size="sm" className="text-xs shadow-none">
                  <Plus className="size-3.5 mr-1.5" /> Tambah Sumber Dana Baru
                </Button>
              </div>
            ) : (
              accounts.map((acc) => (
                <Card key={acc.id} className="border border-border shadow-none p-4 flex flex-col justify-between gap-4 bg-card">
                  <div className="w-full flex justify-center">
                    <CreditCard
                      cardHolder={acc.cardHolder}
                      cardNumber={acc.cardNumber}
                      cardExpiration={acc.expiration}
                      type={acc.cardDesignType}
                      company={acc.name}
                    />
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-sm text-foreground">{acc.name}</div>
                      <div className="text-[11px] text-muted-foreground">Saldo Aktif</div>
                    </div>
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-[10px] font-normal border-border">
                        {acc.type}
                      </Badge>
                      <div className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
                        Rp {acc.balance.toLocaleString("id-ID")}
                      </div>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs text-muted-foreground hover:text-foreground h-8 border border-border/50"
                    onClick={() => {
                      setSelectedAccountFilter(acc.name)
                      showNotification(`Filter mutasi disesuaikan ke "${acc.name}"`)
                      document.getElementById("mutasi-section")?.scrollIntoView({ behavior: "smooth" })
                    }}
                  >
                    Mutasi Akun
                  </Button>
                </Card>
              ))
            )}
          </div>
        </div>

        {/* 3. Account Mutations Section */}
        <Card id="mutasi-section" className="border border-border shadow-none p-5 gap-4 bg-card">
          <CardHeader className="p-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <ArrowLeftRight className="size-5 text-primary" />
                Riwayat Mutasi & Arus Kas Sumber Dana
              </CardTitle>
              <CardDescription className="text-xs">
                Aktivitas pemasukan, pengeluaran, dan transfer per akun
              </CardDescription>
            </div>

            <Select value={selectedAccountFilter} onValueChange={setSelectedAccountFilter}>
              <SelectTrigger className="w-[180px] h-9 text-xs border-border">
                <SelectValue placeholder="Pilih Akun" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Sumber Dana</SelectItem>
                {accounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.name}>
                    {acc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>

          <CardContent className="p-0 -mx-5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-5 py-3 text-xs font-semibold text-muted-foreground">Sumber Dana</TableHead>
                  <TableHead className="px-5 py-3 text-xs font-semibold text-muted-foreground">Keterangan Mutasi</TableHead>
                  <TableHead className="px-5 py-3 text-xs font-semibold text-muted-foreground">Tipe</TableHead>
                  <TableHead className="px-5 py-3 text-xs font-semibold text-muted-foreground">Tanggal</TableHead>
                  <TableHead className="px-5 py-3 text-xs font-semibold text-muted-foreground text-right">Nominal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMutations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-xs text-muted-foreground">
                      Belum ada mutasi tercatat untuk sumber dana ini.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredMutations.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="px-5 py-3.5 font-bold text-xs">
                        {m.accountName}
                      </TableCell>
                      <TableCell className="px-5 py-3.5 text-xs text-foreground font-medium">
                        {m.title}
                      </TableCell>
                      <TableCell className="px-5 py-3.5">
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-semibold border-border ${
                            m.type === "in"
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                              : m.type === "out"
                              ? "bg-rose-500/10 text-rose-600 border-rose-500/30"
                              : "bg-amber-500/10 text-amber-600 border-amber-500/30"
                          }`}
                        >
                          {m.type === "in" ? "Pemasukan" : m.type === "out" ? "Pengeluaran" : "Transfer"}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-5 py-3.5 text-xs text-muted-foreground">
                        {m.date}
                      </TableCell>
                      <TableCell
                        className={`px-5 py-3.5 text-right font-extrabold text-xs ${
                          m.type === "in"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : m.type === "out"
                            ? "text-rose-600 dark:text-rose-400"
                            : "text-foreground"
                        }`}
                      >
                        {m.type === "in" ? "+" : m.type === "out" ? "-" : ""}Rp {m.amount.toLocaleString("id-ID")}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
