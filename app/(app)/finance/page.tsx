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
} from "lucide-react"

interface FinancialAccount {
  id: string
  name: string
  type: string
  accountCategory: "bank" | "cash" | "ewallet"
  balance: number
  cardNumber: string
  cardHolder: string
  expiration: string
  cardDesignType:
    | "brand-dark"
    | "transparent-gradient"
    | "salmon-strip"
    | "gray-dark"
    | "brand-light"
    | "gray-light"
}

interface AccountMutation {
  id: string
  accountName: string
  title: string
  type: "in" | "out" | "transfer"
  amount: number
  date: string
}

export default function FinancePage() {
  const [accounts, setAccounts] = useState<FinancialAccount[]>([
    {
      id: "ACC-01",
      name: "Bank BCA",
      type: "Rekening Utama",
      accountCategory: "bank",
      balance: 5200000,
      cardNumber: "**** **** 8829",
      cardHolder: "ABIMANYU",
      expiration: "12/28",
      cardDesignType: "brand-dark",
    },
    {
      id: "ACC-02",
      name: "Bank Mandiri",
      type: "Tabungan Target",
      accountCategory: "bank",
      balance: 2000000,
      cardNumber: "**** **** 1042",
      cardHolder: "ABIMANYU",
      expiration: "09/27",
      cardDesignType: "transparent-gradient",
    },
    {
      id: "ACC-03",
      name: "Tunai / Cash",
      type: "Dompet Fisik",
      accountCategory: "cash",
      balance: 750000,
      cardNumber: "CASH - WALLET",
      cardHolder: "ABIMANYU",
      expiration: "N/A",
      cardDesignType: "salmon-strip",
    },
    {
      id: "ACC-04",
      name: "GoPay",
      type: "E-Wallet Digital",
      accountCategory: "ewallet",
      balance: 500000,
      cardNumber: "0812 **** 9912",
      cardHolder: "ABIMANYU",
      expiration: "06/29",
      cardDesignType: "gray-dark",
    },
  ])

  const mutations: AccountMutation[] = [
    { id: "M-1", accountName: "Bank BCA", title: "Gaji Bulanan", type: "in", amount: 12500000, date: "15 Aug 2026" },
    { id: "M-2", accountName: "Bank Mandiri", title: "Nabung Laptop Baru", type: "in", amount: 1000000, date: "16 Aug 2026" },
    { id: "M-3", accountName: "GoPay", title: "Bayar Wifi Kamar Kos", type: "out", amount: 150000, date: "17 Aug 2026" },
    { id: "M-4", accountName: "Tunai / Cash", title: "Makan Malam & Belanja", type: "out", amount: 85000, date: "18 Aug 2026" },
    { id: "M-5", accountName: "Bank BCA", title: "Beli Token Listrik Kamar", type: "out", amount: 100000, date: "19 Aug 2026" },
    { id: "M-6", accountName: "Bank BCA", title: "Transfer Ke GoPay", type: "transfer", amount: 200000, date: "19 Aug 2026" },
  ]

  const [selectedAccountFilter, setSelectedAccountFilter] = useState<string>("all")

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [newAccName, setNewAccName] = useState("")
  const [newAccType, setNewAccType] = useState("Rekening Utama")
  const [newAccBalance, setNewAccBalance] = useState("")
  const [newAccNumber, setNewAccNumber] = useState("")
  const [newAccCardHolder, setNewAccCardHolder] = useState("ABIMANYU")
  const [newAccDesign, setNewAccDesign] = useState<FinancialAccount["cardDesignType"]>("brand-dark")

  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false)
  const [transferFrom, setTransferFrom] = useState("Bank BCA")
  const [transferTo, setTransferTo] = useState("GoPay")
  const [transferAmount, setTransferAmount] = useState("")

  const handleAddAccount = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newAccName || !newAccBalance) return

    const parsedBalance = parseFloat(newAccBalance)
    if (isNaN(parsedBalance)) return

    const newAccountObj: FinancialAccount = {
      id: `ACC-0${accounts.length + 1}`,
      name: newAccName,
      type: newAccType,
      accountCategory: newAccType.toLowerCase().includes("bank") ? "bank" : newAccType.toLowerCase().includes("wallet") ? "ewallet" : "cash",
      balance: parsedBalance,
      cardNumber: newAccNumber || "**** **** 0000",
      cardHolder: newAccCardHolder.toUpperCase() || "USER",
      expiration: "12/29",
      cardDesignType: newAccDesign,
    }

    setAccounts([...accounts, newAccountObj])
    setNewAccName("")
    setNewAccBalance("")
    setNewAccNumber("")
    setIsAddDialogOpen(false)
  }

  const handleTransfer = (e: React.FormEvent) => {
    e.preventDefault()
    const amt = parseFloat(transferAmount)
    if (isNaN(amt) || amt <= 0 || transferFrom === transferTo) return

    setAccounts(
      accounts.map((acc) => {
        if (acc.name === transferFrom) {
          return { ...acc, balance: Math.max(0, acc.balance - amt) }
        }
        if (acc.name === transferTo) {
          return { ...acc, balance: acc.balance + amt }
        }
        return acc
      })
    )

    setTransferAmount("")
    setIsTransferDialogOpen(false)
  }

  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0)
  const totalAccountsCount = accounts.length

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
                <BreadcrumbLink href="#">Sumber Dana & Target</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage className="font-semibold text-base">
                  Sumber Dana (Akun Keuangan)
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex items-center gap-2">
          <Dialog open={isTransferDialogOpen} onOpenChange={setIsTransferDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="hidden sm:inline-flex shadow-none">
                <ArrowLeftRight className="size-4 mr-1.5" /> Transfer Antar Akun
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md shadow-none border">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base font-bold">
                  <ArrowLeftRight className="size-5 text-primary" />
                  Transfer Antar Akun Sumber Dana
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Pindahkan saldo dari satu akun ke akun sumber dana lain.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleTransfer} className="space-y-4 pt-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Dari Akun Asal</label>
                  <Select value={transferFrom} onValueChange={setTransferFrom}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Pilih Akun Asal" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.name}>
                          {a.name} (Saldo: Rp {a.balance.toLocaleString("id-ID")})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Ke Akun Tujuan</label>
                  <Select value={transferTo} onValueChange={setTransferTo}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Pilih Akun Tujuan" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.name}>
                          {a.name} (Saldo: Rp {a.balance.toLocaleString("id-ID")})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Nominal Transfer (Rp)</label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(e.target.value)}
                    required
                  />
                </div>

                <DialogFooter className="pt-2">
                  <DialogClose asChild>
                    <Button type="button" variant="outline" className="shadow-none text-xs">
                      Batal
                    </Button>
                  </DialogClose>
                  <Button type="submit" className="shadow-none text-xs">
                    Proses Transfer
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="shadow-none">
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
                    <Select value={newAccDesign} onValueChange={(val) => setNewAccDesign(val as any)}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Tema Kartu" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="brand-dark">Dark Premium</SelectItem>
                        <SelectItem value="transparent-gradient">Gradient Hologram</SelectItem>
                        <SelectItem value="salmon-strip">Salmon Strip</SelectItem>
                        <SelectItem value="gray-dark">Classic Charcoal</SelectItem>
                        <SelectItem value="brand-light">Light Silver</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Saldo Awal (Rp)</label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={newAccBalance}
                    onChange={(e) => setNewAccBalance(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Nomor Kartu / Rekening (Opsional)</label>
                  <Input
                    placeholder="**** **** 1234"
                    value={newAccNumber}
                    onChange={(e) => setNewAccNumber(e.target.value)}
                  />
                </div>

                <DialogFooter className="pt-2">
                  <DialogClose asChild>
                    <Button type="button" variant="outline" className="shadow-none text-xs">
                      Batal
                    </Button>
                  </DialogClose>
                  <Button type="submit" className="shadow-none text-xs">
                    Simpan Akun
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 bg-background min-h-screen">
        {/* Metric Summary Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="shadow-none border border-border p-5 gap-3 bg-card">
            <CardHeader className="p-0 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Saldo Keseluruhan
              </CardTitle>
              <div className="p-2 rounded-xl bg-muted/60 text-foreground">
                <Wallet className="size-5" />
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
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Jumlah Akun Terdaftar
              </CardTitle>
              <div className="p-2 rounded-xl bg-muted/60 text-foreground">
                <Building2 className="size-5" />
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
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Alokasi Saldo Terbesar
              </CardTitle>
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600">
                <CreditCardIcon className="size-5" />
              </div>
            </CardHeader>
            <CardContent className="p-0 space-y-1">
              <div className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                Bank BCA (61.5%)
              </div>
              <p className="text-xs text-muted-foreground">Rp 5.200.000 saldo aktif</p>
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
            {accounts.map((acc) => (
              <Card key={acc.id} className="border border-border shadow-none p-4 flex flex-col justify-between gap-4 bg-card">
                <div className="flex justify-center w-full py-1">
                  <CreditCard
                    company={acc.name}
                    cardNumber={acc.cardNumber}
                    cardHolder={acc.cardHolder}
                    cardExpiration={acc.expiration}
                    type={acc.cardDesignType}
                    width={280}
                  />
                </div>

                <div className="space-y-3 pt-2 border-t border-border">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold">{acc.name}</div>
                      <Badge variant="outline" className="text-[10px] font-normal py-0 mt-0.5 border-border">
                        {acc.type}
                      </Badge>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Saldo Aktif</div>
                      <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                        Rp {acc.balance.toLocaleString("id-ID")}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="w-full text-xs shadow-none h-8 border-border" asChild>
                      <a href="/transaksi">Mutasi Akun</a>
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* 3. Mutations History Table Per Account */}
        <Card className="border border-border shadow-none p-5 gap-4 bg-card">
          <CardHeader className="p-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <ArrowLeftRight className="size-5 text-primary" />
                Riwayat Mutasi & Arus Kas Sumber Dana
              </CardTitle>
              <CardDescription className="text-sm">
                Aktivitas pemasukan, pengeluaran, dan transfer per akun
              </CardDescription>
            </div>

            <div className="w-full sm:w-48 shrink-0">
              <Select value={selectedAccountFilter} onValueChange={setSelectedAccountFilter}>
                <SelectTrigger className="w-full text-xs">
                  <SelectValue placeholder="Pilih Sumber Dana" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Sumber Dana</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.name}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>

          <CardContent className="p-0 -mx-5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-5 py-3 text-xs font-semibold text-muted-foreground">Tanggal</TableHead>
                  <TableHead className="px-5 py-3 text-xs font-semibold text-muted-foreground">Sumber Dana</TableHead>
                  <TableHead className="px-5 py-3 text-xs font-semibold text-muted-foreground">Keterangan Transaksi</TableHead>
                  <TableHead className="px-5 py-3 text-xs font-semibold text-muted-foreground">Tipe</TableHead>
                  <TableHead className="px-5 py-3 text-xs font-semibold text-muted-foreground text-right">Jumlah</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMutations.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="px-5 py-3.5 text-xs text-muted-foreground font-medium">
                      {m.date}
                    </TableCell>
                    <TableCell className="px-5 py-3.5 text-sm font-semibold">
                      {m.accountName}
                    </TableCell>
                    <TableCell className="px-5 py-3.5 font-medium text-sm">
                      {m.title}
                    </TableCell>
                    <TableCell className="px-5 py-3.5">
                      {m.type === "in" ? (
                        <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-none shadow-none text-xs font-semibold">
                          Uang Masuk
                        </Badge>
                      ) : m.type === "out" ? (
                        <Badge className="bg-rose-500/15 text-rose-600 dark:text-rose-400 border-none shadow-none text-xs font-semibold">
                          Uang Keluar
                        </Badge>
                      ) : (
                        <Badge className="bg-primary/10 text-primary border-none shadow-none text-xs font-semibold">
                          Transfer
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className={`px-5 py-3.5 text-right font-bold text-sm ${
                      m.type === 'in' ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'
                    }`}>
                      {m.type === 'in' ? '+' : m.type === 'out' ? '-' : ''}Rp {m.amount.toLocaleString("id-ID")}
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
