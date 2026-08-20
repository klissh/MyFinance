"use client"

import React, { useState } from "react"
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
  Wallet,
  TrendingUp,
  TrendingDown,
  PiggyBank,
  ArrowUpRight,
  Plus,
  Users,
  Calendar as CalendarIcon,
  CreditCard,
  Building2,
  Clock,
  ArrowLeftRight,
  Globe,
} from "lucide-react"

export default function DashboardPage() {
  // MYR to IDR Live Rate Converter State
  const [myrInput, setMyrInput] = useState<number | string>(100)
  const rateMYRtoIDR = 4403.0 // Official spot rate benchmark

  // Summary Metrics Data
  const metrics = [
    {
      title: "Sisa Anggaran Bulanan",
      amount: "Rp 5.950.000",
      subtext: "Dari batas Rp 10.000.000",
      progress: 59.5,
      icon: <Wallet className="size-4 text-primary" />,
      badge: "60% Sisa",
    },
    {
      title: "Pemasukan (Bulan Ini)",
      amount: "Rp 12.500.000",
      subtext: "+15% vs bulan lalu",
      icon: <TrendingUp className="size-4 text-emerald-600 dark:text-emerald-400" />,
      badge: "+15%",
    },
    {
      title: "Pengeluaran (Bulan Ini)",
      amount: "Rp 4.050.000",
      subtext: "40.5% dari batas bulanan",
      icon: <TrendingDown className="size-4 text-rose-600 dark:text-rose-400" />,
      badge: "Efisien",
    },
    {
      title: "Total Uang Ketabung",
      amount: "Rp 19.300.000",
      subtext: "Target Rp 30.000.000",
      progress: 64.3,
      icon: <PiggyBank className="size-4 text-primary" />,
      badge: "64% Target",
    },
  ]

  // Sumber Dana / Accounts Data
  const accounts = [
    { name: "Bank BCA", type: "Rekening Utama", balance: "Rp 5.200.000" },
    { name: "Bank Mandiri", type: "Tabungan", balance: "Rp 2.000.000" },
    { name: "Tunai / Cash", type: "Dompet", balance: "Rp 750.000" },
    { name: "GoPay / E-Wallet", type: "Digital", balance: "Rp 500.000" },
  ]

  // Transaksi Terakhir Data
  const recentTransactions = [
    {
      id: "TX-106",
      title: "Transfer Bonus Freelance",
      category: "Pemasukan",
      type: "in",
      amount: 1750000,
      account: "Bank BCA",
      date: "19 Aug",
    },
    {
      id: "TX-105",
      title: "Beli Token Listrik Kamar",
      category: "Kamar Kos",
      type: "out",
      amount: 100000,
      account: "Bank BCA",
      date: "19 Aug",
    },
    {
      id: "TX-104",
      title: "Makan Malam & Belanja",
      category: "Konsumsi",
      type: "out",
      amount: 85000,
      account: "Tunai",
      date: "18 Aug",
    },
    {
      id: "TX-103",
      title: "Bayar Wifi Kamar Kos",
      category: "Kamar Kos",
      type: "out",
      amount: 150000,
      account: "GoPay",
      date: "17 Aug",
    },
  ]

  // Target Impian Data
  const savingGoals = [
    { title: "Beli Laptop M3", current: 8000000, target: 12000000, progress: 67, deadline: "Okt 2026" },
    { title: "Dana Darurat (3 Bulan)", current: 9500000, target: 15000000, progress: 63, deadline: "Des 2026" },
  ]

  // Scheduled Payments Data
  const scheduledPayments = [
    { title: "Sewa Kamar Kos", amount: "Rp 1.500.000", date: "25 Aug", category: "Kos" },
    { title: "Langganan Netflix", amount: "Rp 54.000", date: "28 Aug", category: "Hiburan" },
  ]

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
                  Dashboard Keuangan
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        {/* Header Quick Action Buttons */}
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="shadow-none text-xs hidden sm:inline-flex" asChild>
            <a href="/goals">
              <PiggyBank className="size-4 mr-1.5 text-muted-foreground" /> Setor Tabungan
            </a>
          </Button>
          <Button size="sm" className="shadow-none text-xs" asChild>
            <a href="/transaksi">
              <Plus className="size-4 mr-1.5" /> Catat Transaksi
            </a>
          </Button>
        </div>
      </header>

      {/* Main Content (Calm Shadcn UI Palette) */}
      <div className="flex flex-1 flex-col gap-5 p-4 md:p-6 bg-background min-h-screen">
        {/* Welcome Greeting Strip */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-4 rounded-xl border bg-card shadow-none">
          <div>
            <h1 className="text-base font-bold text-foreground">
              Halo, Abimanyu 👋
            </h1>
            <p className="text-xs text-muted-foreground">
              Ringkasan arus kas & alokasi anggaran bulanan Anda (Agustus 2026)
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="outline" className="text-xs font-normal border-border">
              Status: <span className="font-semibold text-emerald-600 dark:text-emerald-400 ml-1">Sehat & Stabil</span>
            </Badge>
          </div>
        </div>

        {/* 1. Top 4 High-Density Compact Metric Cards */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map((m, i) => (
            <Card key={i} className="shadow-none border border-border p-4 gap-2 flex flex-col justify-between bg-card">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">{m.title}</span>
                <div className="p-1.5 rounded-lg bg-muted/60">{m.icon}</div>
              </div>

              <div>
                <div className="text-xl font-bold tracking-tight text-foreground">{m.amount}</div>
                <div className="flex items-center justify-between mt-1 text-[11px] text-muted-foreground">
                  <span>{m.subtext}</span>
                  {m.badge && (
                    <span className="font-semibold text-primary">{m.badge}</span>
                  )}
                </div>
              </div>

              {m.progress !== undefined && (
                <Progress value={m.progress} className="h-1 mt-1" />
              )}
            </Card>
          ))}
        </div>

        {/* 2. Main 2-Column Balanced Layout (7:5 Ratio) */}
        <div className="grid gap-5 lg:grid-cols-12">
          {/* LEFT SIDE (7 Cols): Cashflow Activity & Goals */}
          <div className="lg:col-span-7 space-y-5">
            {/* Inline Sleek MYR/IDR Currency Converter Bar */}
            <Card className="border border-border shadow-none p-3.5 gap-3 bg-card">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-muted/60 text-muted-foreground">
                    <Globe className="size-4" />
                  </div>
                  <div>
                    <span className="font-bold text-foreground">Kurs Ringgit Realtime</span>
                    <span className="text-muted-foreground ml-1.5 text-[11px]">1 MYR = Rp {rateMYRtoIDR.toLocaleString("id-ID")}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-muted/50 border border-border rounded-lg px-2 py-1">
                    <span className="font-semibold text-xs text-muted-foreground">🇲🇾 MYR</span>
                    <Input
                      type="number"
                      value={myrInput}
                      onChange={(e) => setMyrInput(e.target.value)}
                      className="w-16 h-6 text-xs p-1 font-bold text-right border-none bg-transparent shadow-none"
                    />
                  </div>
                  <ArrowLeftRight className="size-3.5 text-muted-foreground" />
                  <div className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-bold px-2.5 py-1 rounded-lg border border-emerald-500/20">
                    Rp {((Number(myrInput) || 0) * rateMYRtoIDR).toLocaleString("id-ID", { maximumFractionDigits: 0 })}
                  </div>
                  <Button variant="ghost" size="icon-sm" className="h-7 w-7 shadow-none" asChild>
                    <a href="/kurs" title="Buka Halaman Kurs Lengkap">
                      <ArrowUpRight className="size-3.5 text-muted-foreground" />
                    </a>
                  </Button>
                </div>
              </div>
            </Card>

            {/* Transaksi Terakhir (Recent Activity Table) */}
            <Card className="border border-border shadow-none p-4 gap-3 bg-card">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div>
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <ArrowLeftRight className="size-4 text-primary" />
                    Transaksi Terakhir
                  </CardTitle>
                </div>
                <Button variant="ghost" size="sm" className="text-xs h-7 px-2 text-muted-foreground hover:text-foreground" asChild>
                  <a href="/transaksi">Lihat Semua <ArrowUpRight className="size-3 ml-1" /></a>
                </Button>
              </div>

              <div className="-mx-4 -mb-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="px-4 py-2 text-[11px] font-semibold text-muted-foreground">Tanggal</TableHead>
                      <TableHead className="px-4 py-2 text-[11px] font-semibold text-muted-foreground">Keterangan</TableHead>
                      <TableHead className="px-4 py-2 text-[11px] font-semibold text-muted-foreground">Kategori</TableHead>
                      <TableHead className="px-4 py-2 text-[11px] font-semibold text-muted-foreground text-right">Nominal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentTransactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell className="px-4 py-2.5 text-xs text-muted-foreground font-medium">
                          {tx.date}
                        </TableCell>
                        <TableCell className="px-4 py-2.5 font-semibold text-xs">
                          {tx.title}
                        </TableCell>
                        <TableCell className="px-4 py-2.5">
                          <Badge variant="outline" className="text-[10px] font-normal py-0 border-border">
                            {tx.category}
                          </Badge>
                        </TableCell>
                        <TableCell className={`px-4 py-2.5 text-right font-bold text-xs ${
                          tx.type === 'in' ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'
                        }`}>
                          {tx.type === 'in' ? '+' : '-'}Rp {tx.amount.toLocaleString("id-ID")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>

            {/* Target Tabungan & Impian Cards */}
            <Card className="border border-border shadow-none p-4 gap-3 bg-card">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <PiggyBank className="size-4 text-primary" />
                  Target Tabungan & Impian Aktif
                </CardTitle>
                <Button variant="ghost" size="sm" className="text-xs h-7 px-2 text-muted-foreground hover:text-foreground" asChild>
                  <a href="/goals">Kelola Target <ArrowUpRight className="size-3 ml-1" /></a>
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {savingGoals.map((g, idx) => (
                  <div key={idx} className="p-3 rounded-xl border border-border bg-muted/30 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-foreground">{g.title}</span>
                      <span className="text-muted-foreground text-[11px]">{g.deadline}</span>
                    </div>
                    <Progress value={g.progress} className="h-1.5" />
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Rp {g.current.toLocaleString("id-ID")}</span>
                      <span className="font-semibold text-primary">{g.progress}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* RIGHT SIDE (5 Cols): Accounts, Kos & Scheduled */}
          <div className="lg:col-span-5 space-y-5">
            {/* Sumber Dana Quick Balance */}
            <Card className="border border-border shadow-none p-4 gap-3 bg-card">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Wallet className="size-4 text-primary" />
                  Saldo Sumber Dana
                </CardTitle>
                <Button variant="ghost" size="sm" className="text-xs h-7 px-2 text-muted-foreground hover:text-foreground" asChild>
                  <a href="/finance">Atur Akun <ArrowUpRight className="size-3 ml-1" /></a>
                </Button>
              </div>

              <div className="space-y-2">
                {accounts.map((acc, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl border border-border bg-card">
                    <div>
                      <div className="text-xs font-bold">{acc.name}</div>
                      <div className="text-[10px] text-muted-foreground">{acc.type}</div>
                    </div>
                    <div className="text-xs font-bold text-foreground">
                      {acc.balance}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Keuangan Kamar Kos Summary */}
            <Card className="border border-border shadow-none p-4 gap-3 bg-card">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Users className="size-4 text-primary" />
                  Kas Kamar Kos Bersama
                </CardTitle>
                <Badge variant="outline" className="text-[10px] border-border">Kamar #102</Badge>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-muted/40 border border-border">
                  <div className="text-muted-foreground text-[11px]">Total Kas Terkumpul</div>
                  <div className="font-bold text-sm text-foreground mt-0.5">Rp 1.850.000</div>
                </div>
                <div className="p-2.5 rounded-xl bg-muted/40 border border-border">
                  <div className="text-muted-foreground text-[11px]">Iuran Belum Bayar</div>
                  <div className="font-bold text-sm text-rose-600 dark:text-rose-400 mt-0.5">2 Anggota</div>
                </div>
              </div>
            </Card>

            {/* Tagihan Mendatang Checklist */}
            <Card className="border border-border shadow-none p-4 gap-3 bg-card">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Clock className="size-4 text-rose-600" />
                  Tagihan Mendatang
                </CardTitle>
                <Button variant="ghost" size="sm" className="text-xs h-7 px-2 text-muted-foreground hover:text-foreground" asChild>
                  <a href="/scheduled">Lihat Kalender <ArrowUpRight className="size-3 ml-1" /></a>
                </Button>
              </div>

              <div className="space-y-2">
                {scheduledPayments.map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl border border-border bg-card text-xs">
                    <div>
                      <div className="font-semibold">{p.title}</div>
                      <div className="text-[10px] text-muted-foreground">Tempo: {p.date}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-rose-600 dark:text-rose-400">{p.amount}</div>
                      <Button variant="outline" size="sm" className="h-6 text-[10px] px-2 mt-1 shadow-none" asChild>
                        <a href="/scheduled">Bayar</a>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </>
  )
}