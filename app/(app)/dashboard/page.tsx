"use client"

import { useMoney, formatMoney } from "@/lib/currency"
import React, { useState, useEffect } from "react"
import Link from "next/link"
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
import { Progress } from "@/components/ui/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import {
  transactionService,
  goalService,
  kamarService,
  accountService,
  TransactionRecord,
  GoalRecord,
  SharedTransactionRecord,
  FinancialAccountRecord,
} from "@/lib/db"
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  PiggyBank,
  ArrowUpRight,
  Plus,
  Users,
  CreditCard,
  ArrowLeftRight,
  Globe,
  Inbox,
} from "lucide-react"

export default function DashboardPage() {
  const { fmt, symbol, currency } = useMoney()
  // MYR to IDR Live Rate Converter State
  const [myrInput, setMyrInput] = useState<number | string>(100)
  const [rateMYRtoIDR, setRateMYRtoIDR] = useState<number>(4403.0) // fallback sampai API menjawab

  // Database States
  const [transactions, setTransactions] = useState<TransactionRecord[]>([])
  const [goals, setGoals] = useState<GoalRecord[]>([])
  const [sharedTx, setSharedTx] = useState<SharedTransactionRecord[]>([])
  const [accounts, setAccounts] = useState<FinancialAccountRecord[]>([])

  useEffect(() => {
    async function loadData() {
      // Selaraskan dampak split bill kos ke transaksi pribadi lebih dulu.
      await kamarService.reconcileRoomLedger()
      const [txList, goalList, sharedList, accList] = await Promise.all([
        transactionService.getAll(),
        goalService.getAll(),
        kamarService.getSharedTransactions(),
        accountService.getAll(),
      ])
      setTransactions(txList)
      setGoals(goalList)
      setSharedTx(sharedList)
      setAccounts(accList)
    }
    loadData()

    // Kurs MYR live dari API internal.
    fetch("/api/kurs")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const rate = d?.rates?.MYR
        if (typeof rate === "number" && rate > 0) setRateMYRtoIDR(rate)
      })
      .catch(() => {})
  }, [])

  // Calculate Dynamic Metrics from DB
  const totalIncome = transactions
    .filter((t) => t.type === "in")
    .reduce((sum, t) => sum + t.amount, 0)

  const totalExpense = transactions
    .filter((t) => t.type === "out")
    .reduce((sum, t) => sum + t.amount, 0)

  const totalSaved = goals.reduce((sum, g) => sum + g.currentAmount, 0)
  const totalGoalTarget = goals.reduce((sum, g) => sum + g.targetAmount, 0) || 0

  const remainingBudget = totalIncome > 0 ? Math.max(0, totalIncome - totalExpense) : 0
  const budgetProgress = totalIncome > 0 ? Math.min(100, Math.round((remainingBudget / totalIncome) * 100)) : 0
  const savedProgress = totalGoalTarget > 0 ? Math.min(100, Math.round((totalSaved / totalGoalTarget) * 100)) : 0

  // Calculate Kamar Kos Debts dynamically
  const myTunggakan = sharedTx
    .filter((st) => st.myShare > 0)
    .reduce((sum, st) => sum + st.myShare, 0)

  const myPiutang = Math.abs(
    sharedTx
      .filter((st) => st.myShare < 0)
      .reduce((sum, st) => sum + st.myShare, 0)
  )

  // Summary Metrics Data
  const metrics = [
    {
      title: "Sisa Anggaran Bulanan",
      amount: `${fmt(remainingBudget)}`,
      subtext: totalIncome > 0 ? `Bebas alokasi dari total ${fmt(totalIncome)}` : "Belum ada pemasukan / anggaran",
      progress: budgetProgress,
      icon: <Wallet className="size-4 text-foreground" />,
      badge: totalIncome > 0 ? `${budgetProgress}% Sisa` : `${symbol} 0`,
    },
    {
      title: "Pemasukan (Bulan Ini)",
      amount: `${fmt(totalIncome)}`,
      subtext: totalIncome > 0 ? "Total pemasukan tercatat" : "Belum ada pemasukan",
      icon: <TrendingUp className="size-4 text-emerald-600 dark:text-emerald-400" />,
      badge: totalIncome > 0 ? "Masuk" : `${symbol} 0`,
    },
    {
      title: "Pengeluaran (Bulan Ini)",
      amount: `${fmt(totalExpense)}`,
      subtext: totalExpense > 0 ? "Total pengeluaran tercatat" : "Belum ada pengeluaran",
      icon: <TrendingDown className="size-4 text-rose-600 dark:text-rose-400" />,
      badge: totalExpense > 0 ? "Tercatat" : `${symbol} 0`,
    },
    {
      title: "Total Uang Ketabung",
      amount: `${fmt(totalSaved)}`,
      subtext: totalGoalTarget > 0 ? `Target ${fmt(totalGoalTarget)}` : "Belum ada target",
      progress: savedProgress,
      icon: <PiggyBank className="size-4 text-foreground" />,
      badge: `${savedProgress}% Target`,
    },
  ]

  // Sumber Dana / Accounts Data
  return (
    <div className="flex flex-col min-w-0 max-w-full overflow-x-hidden">
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
                  Ringkasan Dashboard Keuangan
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 bg-background min-h-screen">
        {/* 1. Summary Metric Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {metrics.map((m, idx) => (
            <Card key={idx} className="shadow-none border border-border p-5 gap-3 bg-card">
              <CardHeader className="p-0 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-xs font-semibold text-muted-foreground tracking-tight">
                  {m.title}
                </CardTitle>
                <div className="p-2 rounded-xl bg-muted/60 flex items-center justify-center">
                  {m.icon}
                </div>
              </CardHeader>

              <CardContent className="p-0 space-y-1.5">
                <div className="flex items-baseline justify-between">
                  <div className="text-2xl font-bold tracking-tight text-foreground">{m.amount}</div>
                  <Badge variant="outline" className="text-[11px] font-normal border-border">
                    {m.badge}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{m.subtext}</p>
                {m.progress !== undefined && (
                  <Progress value={m.progress} className="h-1.5 mt-2" />
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* 2. Main Content Grid (Two Columns layout on desktop) */}
        <div className="grid gap-6 lg:grid-cols-12">
          {/* LEFT COLUMN (8 Cols): Recent Transactions & Kamar Kos Summary */}
          <div className="lg:col-span-8 space-y-6">
            {/* Recent Personal Transactions */}
            <Card className="border border-border shadow-none p-5 gap-4 bg-card">
              <CardHeader className="p-0 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <ArrowLeftRight className="size-5 text-primary" />
                    Transaksi Keuangan Terakhir
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Transaksi terbaru yang telah dicatat di database
                  </CardDescription>
                </div>
                <Button asChild variant="ghost" size="sm" className="text-xs font-semibold text-primary hover:bg-primary/10">
                  <Link href="/transaksi">
                    Catat / Lihat Semua <ArrowUpRight className="size-3.5 ml-1" />
                  </Link>
                </Button>
              </CardHeader>

              <CardContent className="p-0 -mx-5">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="px-5 py-3 text-xs font-semibold text-muted-foreground">Keterangan</TableHead>
                      <TableHead className="px-5 py-3 text-xs font-semibold text-muted-foreground">Kategori</TableHead>
                      <TableHead className="px-5 py-3 text-xs font-semibold text-muted-foreground">Sumber Dana</TableHead>
                      <TableHead className="px-5 py-3 text-xs font-semibold text-muted-foreground">Tanggal</TableHead>
                      <TableHead className="px-5 py-3 text-xs font-semibold text-muted-foreground text-right">Nominal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-xs text-muted-foreground">
                          <div className="flex flex-col items-center gap-1.5 justify-center">
                            <Inbox className="size-6 text-muted-foreground/60" />
                            <span>Belum ada transaksi.</span>
                            <Button asChild size="sm" variant="outline" className="text-xs h-7 mt-1 border-border shadow-none">
                              <Link href="/transaksi">+ Catat Transaksi Pertama</Link>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      transactions.slice(0, 4).map((tx) => (
                        <TableRow key={tx.id}>
                          <TableCell className="px-5 py-3.5 font-semibold text-sm">
                            {tx.title}
                          </TableCell>
                          <TableCell className="px-5 py-3.5">
                            <Badge variant="outline" className="text-xs font-normal border-border">
                              {tx.category}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-5 py-3.5 text-xs text-muted-foreground font-medium">
                            {tx.account}
                          </TableCell>
                          <TableCell className="px-5 py-3.5 text-xs text-muted-foreground">
                            {tx.formattedDate}
                          </TableCell>
                          <TableCell
                            className={`px-5 py-3.5 text-right font-bold text-sm ${
                              tx.type === "in"
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-foreground"
                            }`}
                          >
                            {tx.type === "in" ? "+" : "-"}{fmt(tx.amount)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Kamar Kos Bareng Overview Strip */}
            <Card className="border border-border shadow-none p-5 gap-4 bg-card">
              <CardHeader className="p-0 flex flex-row items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base font-semibold">Kamar Kos Bersama</CardTitle>
                    <Badge variant="outline" className="text-xs font-normal border-border">
                      Aktif
                    </Badge>
                  </div>
                  <CardDescription className="text-xs mt-0.5">
                    Grup Kas Bersama • Tagihan rutin & talangan kelompok
                  </CardDescription>
                </div>
                <Button asChild size="sm" variant="outline" className="text-xs shadow-none border-border">
                  <Link href="/kamar/kos">
                    <Users className="size-3.5 mr-1.5" /> Kelola Kamar
                  </Link>
                </Button>
              </CardHeader>

              <CardContent className="p-0 pt-2">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="p-3.5 rounded-xl border border-border bg-muted/30 space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">
                      Tunggakan / Tagihan Saya
                    </div>
                    <div className="text-lg font-bold text-rose-600 dark:text-rose-400">
                      {fmt(myTunggakan)}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {myTunggakan > 0 ? "Harus dibayar ke anggota kos" : "Tidak ada tunggakan"}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl border border-border bg-muted/30 space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">
                      Piutang Saya (Ditalangi)
                    </div>
                    <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                      +{fmt(myPiutang)}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {myPiutang > 0 ? "Penghuni lain utang ke Anda" : "Tidak ada piutang"}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* RIGHT COLUMN (4 Cols): Accounts, Live Converter & Goals */}
          <div className="lg:col-span-4 space-y-6">
            {/* Sumber Dana / Accounts Card */}
            <Card className="border border-border shadow-none p-5 gap-4 bg-card">
              <CardHeader className="p-0 flex flex-row items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <CreditCard className="size-5 text-primary" />
                  Sumber Dana / Dompet
                </CardTitle>
                <Button asChild variant="ghost" size="icon" className="size-7">
                  <Link href="/finance">
                    <Plus className="size-4" />
                  </Link>
                </Button>
              </CardHeader>

              <CardContent className="p-0 space-y-3">
                {accounts.length === 0 ? (
                  <div className="text-center py-5 text-xs text-muted-foreground space-y-2">
                    <p>Belum ada sumber dana.</p>
                    <Button asChild size="sm" variant="outline" className="text-xs border-border shadow-none">
                      <Link href="/finance">+ Tambah Sumber Dana</Link>
                    </Button>
                  </div>
                ) : (
                  accounts.map((acc) => (
                    <div
                      key={acc.id}
                      className="flex items-center justify-between p-3 rounded-xl border border-border bg-card"
                    >
                      <div className="space-y-0.5">
                        <div className="text-xs font-bold text-foreground">{acc.name}</div>
                        <div className="text-[11px] text-muted-foreground">{acc.type}</div>
                      </div>
                      <div className="text-xs font-extrabold text-foreground">
                        {fmt(acc.balance)}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Target Impian / Saving Goals Card */}
            <Card className="border border-border shadow-none p-5 gap-4 bg-card">
              <CardHeader className="p-0 flex flex-row items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <PiggyBank className="size-5 text-primary" />
                  Target Impian (Nabung)
                </CardTitle>
                <Button asChild variant="ghost" size="icon" className="size-7">
                  <Link href="/goals">
                    <Plus className="size-4" />
                  </Link>
                </Button>
              </CardHeader>

              <CardContent className="p-0 space-y-4">
                {goals.length === 0 ? (
                  <div className="text-center py-5 text-xs text-muted-foreground space-y-2">
                    <p>Belum ada target impian yang dibuat.</p>
                    <Button asChild size="sm" variant="outline" className="text-xs border-border shadow-none">
                      <Link href="/goals">+ Buat Target Baru</Link>
                    </Button>
                  </div>
                ) : (
                  goals.slice(0, 2).map((g) => {
                    const pct = Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100))
                    return (
                      <div key={g.id} className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-foreground">{g.title}</span>
                          <span className="text-muted-foreground font-medium">{pct}%</span>
                        </div>
                        <Progress value={pct} className="h-2" />
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>{fmt(g.currentAmount)}</span>
                          <span>Target: {fmt(g.targetAmount)}</span>
                        </div>
                      </div>
                    )
                  })
                )}
              </CardContent>
            </Card>

            {/* Konversi Ringgit ⇄ Rupiah (arah menyesuaikan mata uang aktif) */}
            <Card className="border border-border shadow-none p-5 gap-4 bg-card">
              <CardHeader className="p-0 flex flex-row items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Globe className="size-5 text-primary" />
                  {currency === "MYR" ? "Konversi Rupiah → Ringgit" : "Konversi Ringgit → Rupiah"}
                </CardTitle>
                <Badge variant="outline" className="text-[11px] font-normal border-border">
                  Live Rate
                </Badge>
              </CardHeader>

              <CardContent className="p-0 space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Jumlah {currency === "MYR" ? "Rupiah (Rp)" : "Ringgit (RM)"}
                  </label>
                  <div className="relative">
                    <Input
                      type="number"
                      value={myrInput}
                      onChange={(e) => setMyrInput(e.target.value)}
                      className="text-xs h-9"
                    />
                    <span className="absolute right-3 top-2 text-xs font-bold text-muted-foreground">
                      {currency === "MYR" ? "Rp" : "RM"}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-border bg-muted/40 space-y-1">
                  <div className="text-[11px] text-muted-foreground">Hasil Konversi:</div>
                  <div className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">
                    {currency === "MYR"
                      ? formatMoney((Number(myrInput) || 0) / (rateMYRtoIDR || 1), "MYR")
                      : formatMoney((Number(myrInput) || 0) * rateMYRtoIDR, "IDR")}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    1 RM = {formatMoney(rateMYRtoIDR, "IDR")}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}