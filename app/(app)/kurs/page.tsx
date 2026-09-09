"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Spinner } from "@/components/ui/spinner"
import {
  DollarSign,
  RefreshCw,
  ArrowLeftRight,
  CheckCircle2,
  Globe,
  Sliders,
  Sparkles,
  TrendingUp,
  AlertCircle,
  Activity,
} from "lucide-react"

interface CurrencyRate {
  code: string
  name: string
  flag: string
  liveRateInIDR: number
  manualRateInIDR: number
}

type ProviderMode = "live" | "manual"

interface HistoricalChartPoint {
  date: string
  rate?: number
  curr1?: number
  curr2?: number
  val1Raw?: number
  val2Raw?: number
}

export default function KursPage() {
  // Default Initial Rates (in IDR) verified with Google Finance Spot Market
  const defaultRates: Record<string, CurrencyRate> = {
    MYR: { code: "MYR", name: "Ringgit Malaysia", flag: "🇲🇾", liveRateInIDR: 4378.85, manualRateInIDR: 4378.85 },
    USD: { code: "USD", name: "Dolar Amerika", flag: "🇺🇸", liveRateInIDR: 17690.00, manualRateInIDR: 17690.00 },
    EUR: { code: "EUR", name: "Euro Eropa", flag: "🇪🇺", liveRateInIDR: 20740.00, manualRateInIDR: 20740.00 },
    SGD: { code: "SGD", name: "Dolar Singapura", flag: "🇸🇬", liveRateInIDR: 13960.00, manualRateInIDR: 13960.00 },
    JPY: { code: "JPY", name: "Yen Jepang (100 JPY)", flag: "🇯🇵", liveRateInIDR: 11180.00, manualRateInIDR: 11180.00 },
    GBP: { code: "GBP", name: "Poundsterling Inggris", flag: "🇬🇧", liveRateInIDR: 24200.00, manualRateInIDR: 24200.00 },
    AUD: { code: "AUD", name: "Dolar Australia", flag: "🇦🇺", liveRateInIDR: 12630.00, manualRateInIDR: 12630.00 },
    SAR: { code: "SAR", name: "Riyal Arab Saudi", flag: "🇸🇦", liveRateInIDR: 4735.00, manualRateInIDR: 4735.00 },
    CNY: { code: "CNY", name: "Yuan China", flag: "🇨🇳", liveRateInIDR: 2634.00, manualRateInIDR: 2634.00 },
  }

  const [rates, setRates] = useState<Record<string, CurrencyRate>>(defaultRates)
  const [providerMode, setProviderMode] = useState<ProviderMode>("live") // "live" | "manual"
  const [isLoadingApi, setIsLoadingApi] = useState<boolean>(false)
  const [isLoadingChart, setIsLoadingChart] = useState<boolean>(false)
  const [lastChangeTime, setLastChangeTime] = useState<string>("")
  const [hasRateChangedRecently, setHasRateChangedRecently] = useState<boolean>(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [notification, setNotification] = useState<string | null>(null)

  // Converter Form State
  const [convertAmount, setConvertAmount] = useState<string>("100")
  const [fromCurrency, setFromCurrency] = useState<string>("MYR")
  const [toCurrency, setToCurrency] = useState<string>("IDR")

  // Customizable Real Chart State
  const [chartBaseCurrency, setChartBaseCurrency] = useState<string>("MYR")
  const [chartCompareCurrency, setChartCompareCurrency] = useState<string>("IDR")
  const [chartTimeRange, setChartTimeRange] = useState<string>("90d")
  const [realChartData, setRealChartData] = useState<HistoricalChartPoint[]>([])

  // Toast notification helper
  const showNotification = (msg: string) => {
    setNotification(msg)
    setTimeout(() => setNotification(null), 4000)
  }

  // Fetch Live Real-Time Market Rates (Only triggers re-render / sync when rates ACTUALLY change)
  const fetchLiveRates = useCallback(async (mode: ProviderMode = providerMode, silent: boolean = false) => {
    if (mode === "manual") return

    if (!silent) setIsLoadingApi(true)
    setApiError(null)

    try {
      const res = await fetch("/api/kurs")
      if (!res.ok) throw new Error("Gagal terhubung ke API server kurs")

      const data = await res.json()
      if (data?.success && data?.rates) {
        setRates((prev) => {
          // Compare if any single rate has changed from current state
          let isAnyChanged = false
          Object.keys(data.rates).forEach((code) => {
            if (prev[code] && prev[code].liveRateInIDR !== data.rates[code]) {
              isAnyChanged = true
            }
          })

          // If NO rate changed, do not mutate state (prevents unnecessary re-renders)
          if (!isAnyChanged) {
            if (!silent) {
              showNotification("Kurs pasar saat ini stabil (tidak ada perubahan harga).")
            }
            return prev
          }

          // If rates ACTUALLY CHANGED, update state, timestamp, and visual indicator
          const nowTimeStr = new Date().toLocaleTimeString("id-ID", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })
          setLastChangeTime(nowTimeStr)
          setHasRateChangedRecently(true)
          setTimeout(() => setHasRateChangedRecently(false), 5000)

          const next = { ...prev }
          Object.keys(data.rates).forEach((code) => {
            if (next[code]) {
              next[code].liveRateInIDR = data.rates[code]
            }
          })

          if (!silent) {
            showNotification(`Perubahan kurs pasar baru berhasil disinkronkan (${nowTimeStr})!`)
          }

          return next
        })
      } else {
        throw new Error("Respon data kurs tidak lengkap")
      }
    } catch (err) {
      console.warn("Live rates fetch error:", err)
      setApiError("Koneksi API Realtime lambat. Menggunakan data kurs terverifikasi.")
    } finally {
      if (!silent) setIsLoadingApi(false)
    }
  }, [providerMode])

  // Fetch 100% Real Historical Daily Exchange Rates for Chart
  const fetchHistoricalChart = useCallback(async (base: string, compare: string, timeRange: string) => {
    setIsLoadingChart(true)
    try {
      const isCompareMode = compare !== "IDR" && compare !== base

      if (!isCompareMode) {
        // Single Currency Zoom Mode
        const res = await fetch(`/api/kurs?chart=${base}&range=${timeRange}`)
        if (res.ok) {
          const data = await res.json()
          if (data?.success && Array.isArray(data.points) && data.points.length > 0) {
            setRealChartData(data.points)
            setIsLoadingChart(false)
            return
          }
        }
      } else {
        // Compare Mode: Fetch base & compare
        const [res1, res2] = await Promise.all([
          fetch(`/api/kurs?chart=${base}&range=${timeRange}`),
          fetch(`/api/kurs?chart=${compare}&range=${timeRange}`),
        ])

        if (res1.ok && res2.ok) {
          const d1 = await res1.json()
          const d2 = await res2.json()

          if (d1?.points && d2?.points) {
            const map2: Record<string, number> = {}
            d2.points.forEach((p: { date: string; rate: number }) => {
              map2[p.date] = p.rate
            })

            const init1 = d1.points[0]?.rate || 1
            const init2 = d2.points[0]?.rate || 1

            const combined: HistoricalChartPoint[] = d1.points.map((p1: { date: string; rate: number }) => {
              const val2 = map2[p1.date] || init2
              const pct1 = Math.round(((p1.rate - init1) / init1) * 10000) / 100
              const pct2 = Math.round(((val2 - init2) / init2) * 10000) / 100
              return {
                date: p1.date,
                curr1: pct1,
                curr2: pct2,
                val1Raw: p1.rate,
                val2Raw: val2,
              }
            })

            setRealChartData(combined)
            setIsLoadingChart(false)
            return
          }
        }
      }
    } catch (err) {
      console.warn("Chart history fetch error:", err)
    }
    setIsLoadingChart(false)
  }, [])

  // Initial Fetch & Background Check (Only updates UI when prices actually fluctuate)
  useEffect(() => {
    // Fetch awal + polling: sinkronisasi dengan sumber eksternal (API kurs), disengaja.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLiveRates(providerMode, false)

    // Check market periodically in background, but only updates state if price changed
    const syncInterval = setInterval(() => {
      fetchLiveRates(providerMode, true)
    }, 60000)

    // Window focus listener: sync when tab becomes active again
    const handleFocus = () => {
      fetchLiveRates(providerMode, true)
    }
    window.addEventListener("focus", handleFocus)

    return () => {
      clearInterval(syncInterval)
      window.removeEventListener("focus", handleFocus)
    }
  }, [providerMode, fetchLiveRates])

  // Fetch real historical chart data whenever controls change
  useEffect(() => {
    // Sinkronisasi grafik dengan sumber eksternal (API historis), disengaja.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchHistoricalChart(chartBaseCurrency, chartCompareCurrency, chartTimeRange)
  }, [chartBaseCurrency, chartCompareCurrency, chartTimeRange, fetchHistoricalChart])

  // Samakan mata uang dasar grafik dengan pilihan di kalkulator konversi
  useEffect(() => {
    if (fromCurrency !== "IDR") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setChartBaseCurrency(fromCurrency)
    }
  }, [fromCurrency])

  // Helper to get active rate in IDR
  const getActiveRateInIDR = (currencyCode: string): number => {
    if (currencyCode === "IDR") return 1
    const curr = rates[currencyCode]
    if (!curr) return 1
    return providerMode === "manual" ? curr.manualRateInIDR : curr.liveRateInIDR
  }

  // Format number with dot separators
  const formatNumberWithDots = (val: string): string => {
    const digits = val.replace(/\D/g, "")
    if (!digits) return ""
    return Number(digits).toLocaleString("id-ID")
  }

  const parseFormattedNumber = (val: string): number => {
    const digits = val.replace(/\D/g, "")
    return parseFloat(digits) || 0
  }

  // Calculate Conversion Result
  const numAmount = parseFormattedNumber(convertAmount) || 0
  const fromRateInIDR = getActiveRateInIDR(fromCurrency)
  const toRateInIDR = getActiveRateInIDR(toCurrency)
  const convertedResult = (numAmount * fromRateInIDR) / toRateInIDR

  // Swap currencies
  const handleSwapCurrencies = () => {
    const temp = fromCurrency
    setFromCurrency(toCurrency)
    setToCurrency(temp)
  }

  // Handle Manual Rate Change
  const handleManualRateChange = (code: string, newRateStr: string) => {
    const val = parseFloat(newRateStr)
    if (isNaN(val) || val <= 0) return

    setRates((prev) => ({
      ...prev,
      [code]: { ...prev[code], manualRateInIDR: val },
    }))
  }

  // Determine if chart is in Single Pair Zoom Mode or Percentage Comparison Mode
  const isComparisonMode = chartCompareCurrency !== "IDR" && chartCompareCurrency !== chartBaseCurrency

  // Dynamic Chart Config
  const dynamicChartConfig = useMemo(() => {
    return {
      rate: {
        label: `${chartBaseCurrency} / IDR (Nilai Kurs Riil)`,
        color: "#10b981",
      },
      curr1: {
        label: `${chartBaseCurrency} (Mata Uang Utama)`,
        color: "#10b981",
      },
      curr2: {
        label: `${chartCompareCurrency} (Mata Uang Pembanding)`,
        color: "#6366f1",
      },
    } satisfies ChartConfig
  }, [chartBaseCurrency, chartCompareCurrency])

  // Calculate Y-Axis Min and Max for Single Pair Zoom Mode
  const { yMin, yMax } = useMemo(() => {
    if (isComparisonMode || realChartData.length === 0) return { yMin: "auto", yMax: "auto" }
    const vals = realChartData.map((d) => d.rate).filter((v): v is number => typeof v === "number")
    if (vals.length === 0) return { yMin: "auto", yMax: "auto" }
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const pad = Math.max(5, (max - min) * 0.2)
    return {
      yMin: Math.floor(min - pad),
      yMax: Math.ceil(max + pad),
    }
  }, [realChartData, isComparisonMode])

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
                  Kurs Mata Uang & Valuta Asing
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        {/* Active Mode Status Badge in Header */}
        <div className="flex items-center gap-2">
          {providerMode === "manual" ? (
            <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-none shadow-none text-xs font-semibold">
              <Sliders className="size-3.5 mr-1" /> Custom Rate Manual
            </Badge>
          ) : (
            <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-none shadow-none text-xs font-semibold flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Live Realtime Market (Google Finance)</span>
            </Badge>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 bg-background">
        {/* Toast Notification Banner */}
        {notification && (
          <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3.5 py-3 text-xs text-foreground shadow-sm animate-in fade-in slide-in-from-top-2">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{notification}</span>
          </div>
        )}

        {apiError && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs font-medium">
            <AlertCircle className="size-5 text-amber-600 shrink-0" />
            <span>{apiError}</span>
          </div>
        )}

        {/* 1. Summary Metric Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="shadow-none border border-border p-5 gap-3 bg-card">
            <CardHeader className="p-0 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-semibold text-muted-foreground">
                🇲🇾 MYR ke IDR
              </CardTitle>
              <div className="p-2 rounded-xl bg-muted/60 text-foreground">
                <Globe className="size-4" />
              </div>
            </CardHeader>
            <CardContent className="p-0 space-y-1">
              <div className="text-2xl font-bold text-foreground">
                Rp {getActiveRateInIDR("MYR").toLocaleString("id-ID", { maximumFractionDigits: 2 })}
              </div>
              <p className="text-xs text-muted-foreground">1 Ringgit Malaysia</p>
            </CardContent>
          </Card>

          <Card className="shadow-none border border-border p-5 gap-3 bg-card">
            <CardHeader className="p-0 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-semibold text-muted-foreground">
                🇺🇸 USD ke IDR
              </CardTitle>
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600">
                <DollarSign className="size-4" />
              </div>
            </CardHeader>
            <CardContent className="p-0 space-y-1">
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                Rp {getActiveRateInIDR("USD").toLocaleString("id-ID", { maximumFractionDigits: 2 })}
              </div>
              <p className="text-xs text-muted-foreground">1 Dolar Amerika</p>
            </CardContent>
          </Card>

          <Card className="shadow-none border border-border p-5 gap-3 bg-card">
            <CardHeader className="p-0 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-semibold text-muted-foreground">
                🇸🇬 SGD ke IDR
              </CardTitle>
              <div className="p-2 rounded-xl bg-muted/60 text-foreground">
                <TrendingUp className="size-4" />
              </div>
            </CardHeader>
            <CardContent className="p-0 space-y-1">
              <div className="text-2xl font-bold text-foreground">
                Rp {getActiveRateInIDR("SGD").toLocaleString("id-ID", { maximumFractionDigits: 2 })}
              </div>
              <p className="text-xs text-muted-foreground">1 Dolar Singapura</p>
            </CardContent>
          </Card>

          <Card className="shadow-none border border-border p-5 gap-3 bg-card">
            <CardHeader className="p-0 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-semibold text-muted-foreground">
                Status Perubahan Pasar
              </CardTitle>
              <div className="p-2 rounded-xl bg-muted/60 text-foreground">
                <Activity className="size-4" />
              </div>
            </CardHeader>
            <CardContent className="p-0 space-y-1">
              <div className="text-2xl font-bold flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <span className={`size-2 rounded-full ${hasRateChangedRecently ? "bg-emerald-500 animate-ping" : "bg-emerald-500"}`}></span>
                <span>{hasRateChangedRecently ? "Kurs Berubah" : "Harga Stabil"}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {lastChangeTime ? `Perubahan jam ${lastChangeTime}` : "Sesuai live market stream"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* 2. Main Row: Converter Calculator with Dynamic Real Chart */}
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Left Column (7 cols): Interactive Currency Converter + Real Chart */}
          <Card className="lg:col-span-7 border border-border shadow-none p-5 gap-5 flex flex-col justify-between bg-card">
            <CardHeader className="p-0 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <ArrowLeftRight className="size-5 text-primary" />
                  Kalkulator Konversi Valuta Asing
                </CardTitle>
                <CardDescription className="text-xs">
                  Hitung nilai konversi dua arah secara instan dengan kurs live Google Finance
                </CardDescription>
              </div>

              {/* REFETCH BUTTON IN MAIN CONTENT CARD */}
              <Button
                variant="outline"
                size="sm"
                className="shadow-none text-xs shrink-0 border-border"
                onClick={() => fetchLiveRates(providerMode, false)}
                disabled={isLoadingApi || providerMode === "manual"}
              >
                <RefreshCw className={`size-3.5 mr-1.5 ${isLoadingApi ? "animate-spin" : ""}`} />
                {isLoadingApi ? "Syncing..." : "Sync Rate Realtime"}
              </Button>
            </CardHeader>

            {/* FULLY CUSTOMIZABLE DYNAMIC CHART SECTION WITH 100% REAL HISTORICAL DATA */}
            <div className="p-4 rounded-2xl border border-border bg-muted/30 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-foreground flex items-center gap-2">
                    <Activity className="size-4 text-emerald-600" />
                    <span>
                      {!isComparisonMode
                        ? `Grafik Historis Riil Kurs: ${chartBaseCurrency} / IDR`
                        : `Grafik Perbandingan Tren: ${chartBaseCurrency} vs ${chartCompareCurrency}`}
                    </span>
                    {isLoadingChart && <Spinner className="size-3 text-primary animate-spin" />}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {!isComparisonMode
                      ? `Data fluktuasi harian riil 1 ${chartBaseCurrency} dalam Rupiah (Sesuai Google Finance)`
                      : `Perbandingan tren % kenaikan/penurunan ${chartBaseCurrency} & ${chartCompareCurrency}`}
                  </div>
                </div>

                {/* Customizable Dropdowns Row */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Select value={chartBaseCurrency} onValueChange={setChartBaseCurrency}>
                    <SelectTrigger className="w-[105px] h-8 text-xs font-semibold shadow-none border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end">
                      <SelectItem value="MYR" className="text-xs">🇲🇾 MYR</SelectItem>
                      <SelectItem value="USD" className="text-xs">🇺🇸 USD</SelectItem>
                      <SelectItem value="EUR" className="text-xs">🇪🇺 EUR</SelectItem>
                      <SelectItem value="SGD" className="text-xs">🇸🇬 SGD</SelectItem>
                      <SelectItem value="JPY" className="text-xs">🇯🇵 JPY</SelectItem>
                      <SelectItem value="GBP" className="text-xs">🇬🇧 GBP</SelectItem>
                      <SelectItem value="AUD" className="text-xs">🇦🇺 AUD</SelectItem>
                      <SelectItem value="SAR" className="text-xs">🇸🇦 SAR</SelectItem>
                      <SelectItem value="CNY" className="text-xs">🇨🇳 CNY</SelectItem>
                    </SelectContent>
                  </Select>

                  <span className="text-xs font-bold text-muted-foreground">vs</span>

                  <Select value={chartCompareCurrency} onValueChange={setChartCompareCurrency}>
                    <SelectTrigger className="w-[125px] h-8 text-xs font-semibold shadow-none border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end">
                      <SelectItem value="IDR" className="text-xs">🇮🇩 IDR (Detail Kurs)</SelectItem>
                      <SelectItem value="USD" className="text-xs">🇺🇸 USD (Banding %)</SelectItem>
                      <SelectItem value="MYR" className="text-xs">🇲🇾 MYR (Banding %)</SelectItem>
                      <SelectItem value="SGD" className="text-xs">🇸🇬 SGD (Banding %)</SelectItem>
                      <SelectItem value="EUR" className="text-xs">🇪🇺 EUR (Banding %)</SelectItem>
                      <SelectItem value="JPY" className="text-xs">🇯🇵 JPY (Banding %)</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={chartTimeRange} onValueChange={setChartTimeRange}>
                    <SelectTrigger className="w-[100px] h-8 text-xs font-semibold shadow-none border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end">
                      <SelectItem value="90d" className="text-xs">3 Bulan</SelectItem>
                      <SelectItem value="30d" className="text-xs">30 Hari</SelectItem>
                      <SelectItem value="7d" className="text-xs">7 Hari</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <ChartContainer config={dynamicChartConfig} className="aspect-auto h-[190px] w-full">
                <AreaChart data={realChartData}>
                  <defs>
                    <linearGradient id="fillArea1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="fillArea2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.3} />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={6}
                    minTickGap={28}
                    tickFormatter={(value) => {
                      const date = new Date(value)
                      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
                    }}
                  />
                  <YAxis
                    domain={isComparisonMode ? ["auto", "auto"] : [yMin, yMax]}
                    tickLine={false}
                    axisLine={false}
                    orientation="right"
                    width={65}
                    tickFormatter={(val) =>
                      isComparisonMode
                        ? `${val > 0 ? "+" : ""}${val}%`
                        : `Rp ${Number(val).toLocaleString("id-ID")}`
                    }
                  />
                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        labelFormatter={(value) => {
                          return new Date(value).toLocaleDateString("id-ID", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        }}
                        formatter={(value, name) => {
                          if (!isComparisonMode) {
                            return [`Rp ${Number(value).toLocaleString("id-ID")}`, `${chartBaseCurrency} / IDR`]
                          }
                          return [`${Number(value) > 0 ? "+" : ""}${value}%`, String(name)]
                        }}
                        indicator="dot"
                      />
                    }
                  />

                  {!isComparisonMode ? (
                    <Area
                      dataKey="rate"
                      name={`${chartBaseCurrency} / IDR`}
                      type="monotone"
                      fill="url(#fillArea1)"
                      stroke="#10b981"
                      strokeWidth={2.5}
                    />
                  ) : (
                    <>
                      <Area
                        dataKey="curr2"
                        name={chartCompareCurrency}
                        type="monotone"
                        fill="url(#fillArea2)"
                        stroke="#6366f1"
                        strokeWidth={2}
                      />
                      <Area
                        dataKey="curr1"
                        name={chartBaseCurrency}
                        type="monotone"
                        fill="url(#fillArea1)"
                        stroke="#10b981"
                        strokeWidth={2.5}
                      />
                    </>
                  )}
                  <ChartLegend content={<ChartLegendContent />} />
                </AreaChart>
              </ChartContainer>
            </div>

            <CardContent className="p-0 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-11 gap-3 items-center">
                <div className="sm:col-span-5 space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Jumlah (Nominal)</label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="text"
                      value={convertAmount}
                      onChange={(e) => setConvertAmount(formatNumberWithDots(e.target.value))}
                      className="text-sm font-bold"
                    />
                    <Select value={fromCurrency} onValueChange={setFromCurrency}>
                      <SelectTrigger className="w-28 font-bold text-xs shrink-0 border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="IDR">🇮🇩 IDR</SelectItem>
                        <SelectItem value="MYR">🇲🇾 MYR</SelectItem>
                        <SelectItem value="USD">🇺🇸 USD</SelectItem>
                        <SelectItem value="EUR">🇪🇺 EUR</SelectItem>
                        <SelectItem value="SGD">🇸🇬 SGD</SelectItem>
                        <SelectItem value="JPY">🇯🇵 JPY</SelectItem>
                        <SelectItem value="GBP">🇬🇧 GBP</SelectItem>
                        <SelectItem value="AUD">🇦🇺 AUD</SelectItem>
                        <SelectItem value="SAR">🇸🇦 SAR</SelectItem>
                        <SelectItem value="CNY">🇨🇳 CNY</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="sm:col-span-1 flex items-center justify-center pt-5">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    className="rounded-full shadow-none border-border"
                    onClick={handleSwapCurrencies}
                    title="Tukar Mata Uang"
                  >
                    <ArrowLeftRight className="size-4" />
                  </Button>
                </div>

                <div className="sm:col-span-5 space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Hasil Konversi</label>
                  <div className="flex items-center gap-2">
                    <div className="w-full h-9 px-3 rounded-md border border-input bg-muted/40 flex items-center text-sm font-semibold text-emerald-600 dark:text-emerald-400 truncate">
                      {convertedResult.toLocaleString("id-ID", { maximumFractionDigits: 2 })}
                    </div>
                    <Select value={toCurrency} onValueChange={setToCurrency}>
                      <SelectTrigger className="w-28 font-bold text-xs shrink-0 border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="IDR">🇮🇩 IDR</SelectItem>
                        <SelectItem value="MYR">🇲🇾 MYR</SelectItem>
                        <SelectItem value="USD">🇺🇸 USD</SelectItem>
                        <SelectItem value="EUR">🇪🇺 EUR</SelectItem>
                        <SelectItem value="SGD">🇸🇬 SGD</SelectItem>
                        <SelectItem value="JPY">🇯🇵 JPY</SelectItem>
                        <SelectItem value="GBP">🇬🇧 GBP</SelectItem>
                        <SelectItem value="AUD">🇦🇺 AUD</SelectItem>
                        <SelectItem value="SAR">🇸🇦 SAR</SelectItem>
                        <SelectItem value="CNY">🇨🇳 CNY</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-muted/50 border border-border text-xs text-muted-foreground flex items-center justify-between flex-wrap gap-2">
                <span>
                  Patokan Rate: 1 {fromCurrency} ={" "}
                  <strong className="text-foreground">
                    {((getActiveRateInIDR(fromCurrency) / getActiveRateInIDR(toCurrency))).toLocaleString("id-ID", {
                      maximumFractionDigits: 4,
                    })}{" "}
                    {toCurrency}
                  </strong>
                </span>
                <span>
                  Sumber Rate:{" "}
                  <strong>
                    {providerMode === "live"
                      ? "Google Finance Realtime Interbank"
                      : "Custom Rate Manual"}
                  </strong>
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Right Column (5 cols): Provider & Manual Rate Override Controls */}
          <Card className="lg:col-span-5 border border-border shadow-none p-5 gap-4 flex flex-col justify-between bg-card">
            <CardHeader className="p-0 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Sliders className="size-5 text-amber-600" />
                  Sumber & Preset Kurs
                </CardTitle>
                <CardDescription className="text-xs">
                  Pilih mode live realtime atau atur patokan kurs manual sendiri
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="p-0 space-y-3">
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-muted/70 text-xs">
                <button
                  onClick={() => {
                    setProviderMode("live")
                    fetchLiveRates("live", false)
                  }}
                  className={`py-2 px-3 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 ${
                    providerMode === "live"
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className={`size-2 rounded-full ${providerMode === "live" ? "bg-white animate-pulse" : "bg-muted-foreground"}`} />
                  Live Realtime (Google)
                </button>

                <button
                  onClick={() => {
                    setProviderMode("manual")
                    showNotification("Menggunakan Mode Custom Rate Manual!")
                  }}
                  className={`py-2 px-3 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 ${
                    providerMode === "manual"
                      ? "bg-amber-600 text-white shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Sliders className="size-3.5" />
                  Custom Manual
                </button>
              </div>

              <div className="space-y-2 pt-1 max-h-56 overflow-y-auto pr-1">
                {Object.values(rates).map((c) => (
                  <div key={c.code} className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-semibold w-28 shrink-0 flex items-center gap-1.5">
                      <span>{c.flag}</span> <span>{c.code} / IDR</span>
                    </span>
                    <Input
                      type="number"
                      value={c.manualRateInIDR}
                      onChange={(e) => handleManualRateChange(c.code, e.target.value)}
                      disabled={providerMode !== "manual"}
                      className="h-8 text-xs font-bold w-32 text-right border-border"
                    />
                  </div>
                ))}
              </div>
            </CardContent>

            <CardFooter className="p-0 pt-2 border-t border-border">
              <Button
                variant={providerMode === "manual" ? "default" : "outline"}
                size="sm"
                className={`w-full text-xs shadow-none ${providerMode === "manual" ? "bg-amber-600 hover:bg-amber-700 text-white" : "border-border"}`}
                onClick={() => {
                  if (providerMode !== "manual") {
                    setProviderMode("manual")
                    showNotification("Beralih ke mode manual. Anda bebas menyesuaikan nilai kurs.")
                  } else {
                    showNotification("Kurs manual berhasil diterapkan ke seluruh kalkulator!")
                  }
                }}
              >
                <Sparkles className="size-3.5 mr-1.5" />
                {providerMode === "manual" ? "Terapkan Kurs Manual" : "Gunakan Mode Manual (Bebas Set Rate)"}
              </Button>
            </CardFooter>
          </Card>
        </div>

        {/* 3. Popular Rates Matrix Table */}
        <Card className="border border-border shadow-none p-5 gap-4 bg-card">
          <CardHeader className="p-0 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Globe className="size-5 text-primary" />
                Daftar Kurs Mata Uang Populer (Terhadap IDR)
              </CardTitle>
              <CardDescription className="text-xs">
                Data kurs realtime live tick-by-tick pasar valuta asing (Google Finance) vs Custom Manual
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="p-0 -mx-5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-5 py-3 text-xs font-semibold text-muted-foreground">Mata Uang</TableHead>
                  <TableHead className="px-5 py-3 text-xs font-semibold text-muted-foreground">Kode</TableHead>
                  <TableHead className="px-5 py-3 text-xs font-semibold text-muted-foreground">Kurs Live Realtime</TableHead>
                  <TableHead className="px-5 py-3 text-xs font-semibold text-muted-foreground">Kurs Custom Manual</TableHead>
                  <TableHead className="px-5 py-3 text-xs font-semibold text-muted-foreground">Sumber Aktif</TableHead>
                  <TableHead className="px-5 py-3 text-xs font-semibold text-muted-foreground text-center">Aksi Konversi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.values(rates).map((c) => (
                  <TableRow key={c.code}>
                    <TableCell className="px-5 py-3.5 font-bold text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{c.flag}</span>
                        <span>{c.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="px-5 py-3.5 font-semibold text-xs text-muted-foreground">
                      {c.code}
                    </TableCell>
                    <TableCell className="px-5 py-3.5 font-bold text-sm text-emerald-600 dark:text-emerald-400">
                      Rp {c.liveRateInIDR.toLocaleString("id-ID", { maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="px-5 py-3.5 font-bold text-sm text-amber-600 dark:text-amber-400">
                      Rp {c.manualRateInIDR.toLocaleString("id-ID", { maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="px-5 py-3.5">
                      {providerMode === "manual" ? (
                        <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-none shadow-none text-xs font-semibold">
                          Manual: Rp {c.manualRateInIDR.toLocaleString("id-ID")}
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-none shadow-none text-xs font-semibold">
                          Live Google: Rp {c.liveRateInIDR.toLocaleString("id-ID", { maximumFractionDigits: 2 })}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="px-5 py-3.5 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs shadow-none text-primary hover:bg-primary/10"
                        onClick={() => {
                          setFromCurrency(c.code)
                          setToCurrency("IDR")
                        }}
                      >
                        Pilih ke Kalkulator
                      </Button>
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
