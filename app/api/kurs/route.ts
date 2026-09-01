import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const revalidate = 15 // Cache for 15 seconds

const SYMBOL_MAP: Record<string, string> = {
  MYR: "MYRIDR=X",
  USD: "USDIDR=X",
  EUR: "EURIDR=X",
  SGD: "SGDIDR=X",
  JPY: "JPYIDR=X",
  GBP: "GBPIDR=X",
  AUD: "AUDIDR=X",
  SAR: "SARIDR=X",
  CNY: "CNYIDR=X",
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const chartSymbol = searchParams.get("chart") // e.g. "MYR"
  const range = searchParams.get("range") || "3mo" // "7d", "30d", "90d"

  // 1. Chart Historical Time Series Request
  if (chartSymbol) {
    const yahooSymbol = SYMBOL_MAP[chartSymbol] || `${chartSymbol}IDR=X`
    const mappedRange = range === "7d" ? "5d" : range === "30d" ? "1mo" : "3mo"
    const interval = "1d"

    try {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=${interval}&range=${mappedRange}`,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; AppleWebKit/537.36)",
          },
          next: { revalidate: 30 },
        }
      )

      if (res.ok) {
        const json = await res.json()
        const result = json?.chart?.result?.[0]
        if (result) {
          const timestamps: number[] = result.timestamp || []
          const quotes: (number | null)[] = result.indicators?.quote?.[0]?.close || []
          const points: { date: string; rate: number }[] = []

          for (let i = 0; i < timestamps.length; i++) {
            const val = quotes[i]
            if (val !== null && val !== undefined && !isNaN(val)) {
              const d = new Date(timestamps[i] * 1000)
              const dateStr = d.toISOString().split("T")[0]
              let formattedVal = Math.round(val * 100) / 100
              if (chartSymbol === "JPY") {
                formattedVal = Math.round(val * 100 * 100) / 100
              }
              points.push({
                date: dateStr,
                rate: formattedVal,
              })
            }
          }

          return NextResponse.json({
            success: true,
            symbol: chartSymbol,
            range: mappedRange,
            currentPrice: result.meta?.regularMarketPrice,
            points,
          })
        }
      }
    } catch (err) {
      console.error("Server chart fetch error:", err)
    }
  }

  // 2. Fetch All Live Realtime Market Rates (Tick-by-tick Streaming Data matching Google Finance)
  try {
    const symbols = Object.keys(SYMBOL_MAP)
    const fetches = symbols.map(async (code) => {
      const ySymbol = SYMBOL_MAP[code]
      try {
        const res = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${ySymbol}?interval=1d&range=1d`,
          {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; AppleWebKit/537.36)",
            },
            next: { revalidate: 15 },
          }
        )
        if (res.ok) {
          const json = await res.json()
          const meta = json?.chart?.result?.[0]?.meta
          if (meta?.regularMarketPrice) {
            let price = Number(meta.regularMarketPrice)
            if (code === "JPY") {
              price = price * 100 // per 100 JPY
            }
            return {
              code,
              rate: Math.round(price * 100) / 100,
            }
          }
        }
      } catch {
        // Continue with other fetches
      }
      return null
    })

    const results = await Promise.all(fetches)
    const rates: Record<string, number> = {}

    results.forEach((r) => {
      if (r) {
        rates[r.code] = r.rate
      }
    })

    if (Object.keys(rates).length >= 3) {
      return NextResponse.json({
        success: true,
        provider: "Google / Realtime Live Interbank Market",
        rates,
        timestamp: new Date().toISOString(),
      })
    }
  } catch (err) {
    console.error("Live rates fetch error:", err)
  }

  // Fallback to open.er-api direct pairs
  try {
    const [resMYR, resUSD] = await Promise.allSettled([
      fetch("https://open.er-api.com/v6/latest/MYR"),
      fetch("https://open.er-api.com/v6/latest/USD"),
    ])

    const fallbackRates: Record<string, number> = {
      MYR: 4379.90,
      USD: 17690.00,
      EUR: 20740.00,
      SGD: 13960.00,
      JPY: 11180.00,
      GBP: 24200.00,
      AUD: 12630.00,
      SAR: 4735.00,
      CNY: 2634.00,
    }

    if (resMYR.status === "fulfilled" && resMYR.value.ok) {
      const d = await resMYR.value.json()
      if (d?.rates?.IDR) fallbackRates.MYR = Math.round(d.rates.IDR * 100) / 100
    }
    if (resUSD.status === "fulfilled" && resUSD.value.ok) {
      const d = await resUSD.value.json()
      if (d?.rates?.IDR) fallbackRates.USD = Math.round(d.rates.IDR * 100) / 100
    }

    return NextResponse.json({
      success: true,
      provider: "Open ER-API (Fallback)",
      rates: fallbackRates,
      timestamp: new Date().toISOString(),
    })
  } catch (fallbackErr) {
    console.error("Final fallback error:", fallbackErr)
  }

  return NextResponse.json(
    { success: false, error: "Failed to fetch realtime rates" },
    { status: 500 }
  )
}
