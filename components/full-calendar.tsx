"use client"

import { useMoney } from "@/lib/currency"
import React, { useState } from "react"
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  ChevronDown,
  ArrowUpRight,
  ArrowDownRight,
  Calendar as CalendarIcon,
  Check,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { stripLedgerRef } from "@/lib/db"

export interface CalendarTransaction {
  id: string
  title: string
  category: string
  type: "in" | "out"
  amount: number
  account: string
  date: string // YYYY-MM-DD format
  formattedDate: string
  notes?: string
  hour?: number // 0 - 23 (optional hour slot for week view)
  timeLabel?: string // e.g. "5:00 PM"
}

interface FullCalendarProps {
  transactions: CalendarTransaction[]
  onAddTransaction?: (dateStr?: string) => void
}

export function FullCalendar({
  transactions,
  onAddTransaction,
}: FullCalendarProps) {
  const { fmt, fmtShort } = useMoney()
  const [currentDate, setCurrentDate] = useState<Date>(new Date())
  const [selectedDayDate, setSelectedDayDate] = useState<Date | null>(null)
  const [viewMode, setViewMode] = useState<"month" | "week">("week")

  // Current year & month
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  // Navigation handlers
  const handlePrev = () => {
    if (viewMode === "month") {
      setCurrentDate(new Date(year, month - 1, 1))
    } else {
      const d = new Date(currentDate)
      d.setDate(d.getDate() - 7)
      setCurrentDate(d)
    }
  }

  const handleNext = () => {
    if (viewMode === "month") {
      setCurrentDate(new Date(year, month + 1, 1))
    } else {
      const d = new Date(currentDate)
      d.setDate(d.getDate() + 7)
      setCurrentDate(d)
    }
  }

  const handleToday = () => {
    setCurrentDate(new Date())
  }

  // Calculate calendar grid cells for MONTH VIEW
  const firstDayOfMonth = new Date(year, month, 1)
  const startDayOfWeek = firstDayOfMonth.getDay() // 0 = Sun, 1 = Mon, ...
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrevMonth = new Date(year, month, 0).getDate()

  const monthCalendarDays = []

  // Prev month padding
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const dayNum = daysInPrevMonth - i
    const d = new Date(year, month - 1, dayNum)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, "0")
    const dd = String(d.getDate()).padStart(2, "0")
    monthCalendarDays.push({
      date: d,
      dateStr: `${yyyy}-${mm}-${dd}`,
      dayNumber: dayNum,
      isCurrentMonth: false,
      isToday: false,
    })
  }

  // Current month days
  const todayObj = new Date()
  const todayYYYY = todayObj.getFullYear()
  const todayMM = String(todayObj.getMonth() + 1).padStart(2, "0")
  const todayDD = String(todayObj.getDate()).padStart(2, "0")
  const todayStr = `${todayYYYY}-${todayMM}-${todayDD}`

  for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
    const d = new Date(year, month, dayNum)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, "0")
    const dd = String(d.getDate()).padStart(2, "0")
    const dateStr = `${yyyy}-${mm}-${dd}`

    monthCalendarDays.push({
      date: d,
      dateStr,
      dayNumber: dayNum,
      isCurrentMonth: true,
      isToday: dateStr === todayStr,
    })
  }

  // Next month padding
  const remainingCells = (7 - (monthCalendarDays.length % 7)) % 7
  for (let dayNum = 1; dayNum <= remainingCells; dayNum++) {
    const d = new Date(year, month + 1, dayNum)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, "0")
    const dd = String(d.getDate()).padStart(2, "0")
    monthCalendarDays.push({
      date: d,
      dateStr: `${yyyy}-${mm}-${dd}`,
      dayNumber: dayNum,
      isCurrentMonth: false,
      isToday: false,
    })
  }

  // --- WEEK VIEW LOGIC ---
  const currentDayOfWeek = currentDate.getDay() // 0 = Sun, ...
  const weekStartDate = new Date(currentDate)
  weekStartDate.setDate(currentDate.getDate() - currentDayOfWeek)

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStartDate)
    d.setDate(weekStartDate.getDate() + i)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, "0")
    const dd = String(d.getDate()).padStart(2, "0")
    return {
      date: d,
      dateStr: `${yyyy}-${mm}-${dd}`,
      dayName: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][i],
      dayNumber: d.getDate(),
      isToday: `${yyyy}-${mm}-${dd}` === todayStr,
    }
  })

  // Week range label
  const weekStartStr = weekDays[0].date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  const weekEndStr = weekDays[6].date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  const weekRangeLabel = `${weekStartStr} – ${weekEndStr}`

  // Format month name for header
  const monthNameEn = currentDate.toLocaleDateString("en-US", { month: "long" })
  const monthShortEn = currentDate.toLocaleDateString("en-US", { month: "short" }).toUpperCase()
  const activeDayNum = currentDate.getDate()

  // Selected Day Transactions for Modal
  const selectedDateStr = selectedDayDate
    ? `${selectedDayDate.getFullYear()}-${String(selectedDayDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDayDate.getDate()).padStart(2, "0")}`
    : ""

  const selectedDayTransactions = transactions.filter(
    (tx) => tx.date === selectedDateStr
  )

  const selectedDayIncome = selectedDayTransactions
    .filter((tx) => tx.type === "in")
    .reduce((sum, tx) => sum + tx.amount, 0)

  const selectedDayExpense = selectedDayTransactions
    .filter((tx) => tx.type === "out")
    .reduce((sum, tx) => sum + tx.amount, 0)

  // Chip & Event Block Colors (Adaptive to Light and Dark Mode)
  const getChipStyle = (tx: CalendarTransaction) => {
    if (tx.type === "in") {
      return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 dark:bg-emerald-950/80 border-emerald-500/30 dark:border-emerald-800/80 hover:bg-emerald-500/20"
    }
    if (tx.category === "Kamar Kos") {
      return "bg-blue-500/10 text-blue-700 dark:text-blue-300 dark:bg-blue-950/80 border-blue-500/30 dark:border-blue-800/80 hover:bg-blue-500/20"
    }
    if (tx.category === "Tabungan & Target") {
      return "bg-purple-500/10 text-purple-700 dark:text-purple-300 dark:bg-purple-950/80 border-purple-500/30 dark:border-purple-800/80 hover:bg-purple-500/20"
    }
    if (tx.category === "Konsumsi") {
      return "bg-rose-500/10 text-rose-700 dark:text-rose-300 dark:bg-rose-950/80 border-rose-500/30 dark:border-rose-800/80 hover:bg-rose-500/20"
    }
    return "bg-amber-500/10 text-amber-700 dark:text-amber-300 dark:bg-amber-950/80 border-amber-500/30 dark:border-amber-800/80 hover:bg-amber-500/20"
  }

  // Week Event Block Style (Larger Cards in Hourly Grid)
  const getWeekBlockStyle = (tx: CalendarTransaction) => {
    if (tx.type === "in") {
      return "bg-emerald-500/15 dark:bg-[#0b2918] border-emerald-500/40 dark:border-emerald-700/80 text-emerald-800 dark:text-emerald-200"
    }
    if (tx.category === "Kamar Kos") {
      return "bg-blue-500/15 dark:bg-[#0d2138] border-blue-500/40 dark:border-blue-700/80 text-blue-800 dark:text-blue-200"
    }
    if (tx.category === "Tabungan & Target") {
      return "bg-purple-500/15 dark:bg-[#2d0e3a] border-purple-500/40 dark:border-purple-700/80 text-purple-800 dark:text-purple-200"
    }
    if (tx.category === "Konsumsi") {
      return "bg-pink-500/15 dark:bg-[#330f1d] border-pink-500/40 dark:border-pink-700/80 text-pink-800 dark:text-pink-200"
    }
    return "bg-amber-500/15 dark:bg-[#2d1b08] border-amber-500/40 dark:border-amber-700/80 text-amber-800 dark:text-amber-200"
  }

  // Hours for Week View Grid (12 AM to 11 PM)
  const hoursList = Array.from({ length: 24 }, (_, i) => i)

  const formatHourLabel = (hour: number) => {
    if (hour === 0) return "12 AM"
    if (hour === 12) return "12 PM"
    return hour > 12 ? `${hour - 12} PM` : `${hour} AM`
  }

  // Assign mock hours to transactions for Week View grid if not present
  const getTransactionHour = (tx: CalendarTransaction, idx: number) => {
    if (tx.hour !== undefined) return tx.hour
    const sampleHours: Record<string, number> = {
      "TX-101": 15, // 3 PM
      "TX-102": 16, // 4 PM
      "TX-103": 17, // 5 PM
      "TX-104": 20, // 8 PM
      "TX-105": 19, // 7 PM
      "TX-106": 22, // 10 PM
    }
    return sampleHours[tx.id] ?? (16 + (idx % 6))
  }

  return (
    <div className="w-full rounded-2xl border border-border bg-card text-card-foreground shadow-none overflow-hidden flex flex-col font-sans">
      {/* 1. HEADER BAR (Adaptive Theme) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 md:px-6 border-b border-border bg-card">
        {/* Left Section */}
        <div className="flex items-center gap-3">
          {/* Square Date Badge */}
          <div className="flex flex-col items-center justify-center size-11 rounded-lg bg-zinc-900 text-white font-bold shrink-0 shadow-none">
            <span className="text-[9px] uppercase tracking-wider opacity-80">{monthShortEn}</span>
            <span className="text-base leading-tight font-extrabold">{activeDayNum}</span>
          </div>

          {/* Title & Metadata */}
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-foreground tracking-tight">
                {monthNameEn} {year}
              </h2>
              <span className="bg-muted text-muted-foreground text-xs px-2 py-0.5 rounded-full font-medium">
                Week {Math.ceil(activeDayNum / 7)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {viewMode === "month"
                ? `${monthNameEn.slice(0, 3)} 1, ${year} – ${monthNameEn.slice(0, 3)} ${daysInMonth}, ${year}`
                : weekRangeLabel}
            </p>
          </div>
        </div>

        {/* Right Section Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search Button */}
          <button className="p-2 rounded-lg bg-muted/60 hover:bg-muted border border-border text-muted-foreground hover:text-foreground transition-colors">
            <Search className="size-4" />
          </button>

          {/* Prev/Next Navigation Group */}
          <div className="flex items-center border border-border rounded-lg bg-muted/40 p-0.5">
            <button
              onClick={handlePrev}
              className="p-1 px-2 text-muted-foreground hover:text-foreground transition-colors rounded"
              title="Previous"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              onClick={handleToday}
              className="text-xs font-semibold text-foreground hover:text-primary px-2.5 py-1 transition-colors"
            >
              Today
            </button>
            <button
              onClick={handleNext}
              className="p-1 px-2 text-muted-foreground hover:text-foreground transition-colors rounded"
              title="Next"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          {/* View Mode Selector Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1.5 bg-muted/60 border border-border text-foreground text-xs px-3 py-1.5 rounded-lg font-medium hover:bg-muted transition-colors">
                <span>{viewMode === "month" ? "Month view" : "Week view"}</span>
                <ChevronDown className="size-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-popover border-border text-popover-foreground shadow-lg">
              <DropdownMenuItem
                className="text-xs flex items-center justify-between cursor-pointer focus:bg-accent focus:text-accent-foreground"
                onClick={() => setViewMode("month")}
              >
                <span>Month view</span>
                {viewMode === "month" && <Check className="size-3.5 text-primary" />}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-xs flex items-center justify-between cursor-pointer focus:bg-accent focus:text-accent-foreground"
                onClick={() => setViewMode("week")}
              >
                <span>Week view</span>
                {viewMode === "week" && <Check className="size-3.5 text-primary" />}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Add Event Button */}
          {onAddTransaction && (
            <button
              onClick={() => onAddTransaction()}
              className="bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors shadow-none"
            >
              <Plus className="size-4" />
              <span>Add event</span>
            </button>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* MODE 1: MONTH VIEW */}
      {/* ------------------------------------------------------------- */}
      {viewMode === "month" && (
        <>
          {/* Weekday Header Row */}
          <div
            className="grid border-b border-border bg-muted/30 text-center font-medium text-xs text-muted-foreground"
            style={{ gridTemplateColumns: "repeat(7, 1fr)" }}
          >
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, idx) => (
              <div
                key={idx}
                className="py-2.5 border-r border-border last:border-r-0"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Month Matrix Grid */}
          <div
            className="grid bg-card"
            style={{ gridTemplateColumns: "repeat(7, 1fr)" }}
          >
            {monthCalendarDays.map((cell, idx) => {
              const dayTxs = transactions.filter((tx) => tx.date === cell.dateStr)
              const maxVisible = 3
              const visibleTxs = dayTxs.slice(0, maxVisible)
              const hiddenCount = dayTxs.length - maxVisible

              return (
                <div
                  key={idx}
                  onClick={() => setSelectedDayDate(cell.date)}
                  className={`min-h-[120px] md:min-h-[135px] p-2 border-r border-b border-border flex flex-col justify-start gap-1 transition-colors cursor-pointer ${
                    !cell.isCurrentMonth
                      ? "bg-muted/20 text-muted-foreground/40"
                      : "bg-card hover:bg-muted/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-semibold ${
                        cell.isToday
                          ? "size-6 rounded-full bg-purple-600 text-white font-bold flex items-center justify-center"
                          : cell.isCurrentMonth
                          ? "text-foreground font-semibold"
                          : "text-muted-foreground/60"
                      }`}
                    >
                      {cell.dayNumber}
                    </span>

                    {dayTxs.length > 0 && (
                      <span className="text-[10px] text-muted-foreground font-semibold">
                        {dayTxs.length} tx
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 mt-1 flex-1">
                    {visibleTxs.map((tx) => (
                      <div
                        key={tx.id}
                        className={`px-2 py-1 rounded-md border text-[11px] font-semibold truncate flex items-center justify-between gap-1 transition-colors ${getChipStyle(
                          tx
                        )}`}
                        title={`${tx.title} - ${tx.type === "in" ? "+" : "-"}${fmt(tx.amount)}`}
                      >
                        <span className="truncate">{tx.title}</span>
                        <span className="shrink-0 font-bold">
                          {tx.type === "in" ? "+" : "-"}{fmtShort(tx.amount)}
                        </span>
                      </div>
                    ))}

                    {hiddenCount > 0 && (
                      <div className="text-[10px] font-bold text-muted-foreground hover:text-foreground px-1 pt-0.5">
                        +{hiddenCount} more...
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODE 2: WEEK VIEW (Adaptive Theme & Custom Scrollbar) */}
      {/* ------------------------------------------------------------- */}
      {viewMode === "week" && (
        <div className="flex flex-col bg-card overflow-hidden">
          {/* Weekday Columns Header */}
          <div
            className="grid border-b border-border bg-card text-xs font-medium text-muted-foreground sticky top-0 z-10"
            style={{ gridTemplateColumns: "70px repeat(7, 1fr)" }}
          >
            {/* Empty corner cell */}
            <div className="border-r border-border py-2.5 px-2 text-center text-muted-foreground/60 font-semibold">
              GMT
            </div>

            {/* 7 Days of the Week */}
            {weekDays.map((wd, idx) => (
              <div
                key={idx}
                className="py-2.5 px-2 border-r border-border last:border-r-0 flex items-center justify-center gap-1.5"
              >
                <span>{wd.dayName}</span>
                <span
                  className={`font-semibold ${
                    wd.isToday
                      ? "size-6 rounded-full bg-purple-600 text-white font-bold flex items-center justify-center"
                      : "text-foreground"
                  }`}
                >
                  {wd.dayNumber}
                </span>
              </div>
            ))}
          </div>

          {/* Hourly Matrix Scrollable Grid with Custom Scrollbar */}
          <div className="max-h-[620px] overflow-y-auto relative custom-scrollbar">
            <div
              className="grid bg-card relative"
              style={{ gridTemplateColumns: "70px repeat(7, 1fr)" }}
            >
              {hoursList.map((hour) => (
                <React.Fragment key={hour}>
                  {/* Left Hour Label Column */}
                  <div className="h-16 border-r border-b border-border p-2 text-right text-xs text-muted-foreground font-medium shrink-0 bg-muted/10">
                    {formatHourLabel(hour)}
                  </div>

                  {/* 7 Day Column Slots for this hour */}
                  {weekDays.map((wd, dayIdx) => {
                    const dayHourTxs = transactions.filter((tx, tIdx) => {
                      const txHour = getTransactionHour(tx, tIdx)
                      return tx.date === wd.dateStr && txHour === hour
                    })

                    return (
                      <div
                        key={dayIdx}
                        onClick={() => setSelectedDayDate(wd.date)}
                        className="h-16 border-r border-b border-border p-1 relative hover:bg-muted/30 transition-colors cursor-pointer group"
                      >
                        {/* Render Event/Transaction Card Blocks */}
                        {dayHourTxs.map((tx) => (
                          <div
                            key={tx.id}
                            className={`p-2 rounded-lg border text-xs font-semibold shadow-none space-y-0.5 transition-all hover:scale-[1.02] z-10 ${getWeekBlockStyle(
                              tx
                            )}`}
                            title={`${tx.title} - ${tx.type === "in" ? "+" : "-"}${fmt(tx.amount)}`}
                          >
                            <div className="font-bold text-xs truncate">{tx.title}</div>
                            <div className="text-[11px] opacity-90 flex items-center justify-between">
                              <span>{tx.timeLabel || `${formatHourLabel(hour)}`}</span>
                              <span className="font-extrabold">
                                {tx.type === "in" ? "+" : "-"}{fmtShort(tx.amount)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </React.Fragment>
              ))}
            </div>

            {/* Current Timeline Indicator Bar */}
            <div className="absolute bottom-4 inset-x-0 flex items-center pointer-events-none z-20 pl-2 pr-4">
              <span className="text-[11px] font-bold text-foreground bg-popover px-1.5 py-0.5 rounded border border-border shrink-0 shadow-sm">
                11:45 PM
              </span>
              <span className="size-2 rounded-full bg-purple-600 ring-2 ring-purple-400 shrink-0 mx-1"></span>
              <span className="w-full border-t-2 border-dashed border-purple-500/80"></span>
            </div>
          </div>
        </div>
      )}

      {/* 4. DAY DETAILS DIALOG */}
      <Dialog
        open={selectedDayDate !== null}
        onOpenChange={(open) => !open && setSelectedDayDate(null)}
      >
        <DialogContent className="sm:max-w-lg bg-popover text-popover-foreground border-border shadow-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
              <CalendarIcon className="size-5 text-purple-600 dark:text-purple-400" />
              Transaksi:{" "}
              {selectedDayDate
                ? selectedDayDate.toLocaleDateString("id-ID", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })
                : ""}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Rincian arus kas pada tanggal yang dipilih.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-muted/60 border border-border">
              <div>
                <div className="text-xs text-muted-foreground">Total Pemasukan</div>
                <div className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                  +{fmt(selectedDayIncome)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Total Pengeluaran</div>
                <div className="text-base font-bold text-rose-600 dark:text-rose-400">
                  -{fmt(selectedDayExpense)}
                </div>
              </div>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-1">
              {selectedDayTransactions.length === 0 ? (
                <div className="text-center py-8 text-xs text-muted-foreground border border-border rounded-xl p-4">
                  Belum ada transaksi pada tanggal ini.
                </div>
              ) : (
                selectedDayTransactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between p-3 rounded-xl border border-border bg-card"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2 rounded-xl ${
                          tx.type === "in"
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                            : "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                        }`}
                      >
                        {tx.type === "in" ? (
                          <ArrowUpRight className="size-4" />
                        ) : (
                          <ArrowDownRight className="size-4" />
                        )}
                      </div>
                      <div>
                        <div className="font-semibold text-sm text-foreground">{tx.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {tx.account} • <span className="text-foreground">{tx.category}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className={`font-bold text-sm ${
                          tx.type === "in" ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"
                        }`}
                      >
                        {tx.type === "in" ? "+" : "-"}{fmt(tx.amount)}
                      </div>
                      {stripLedgerRef(tx.notes) && (
                        <div className="text-xs text-muted-foreground">{stripLedgerRef(tx.notes)}</div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {onAddTransaction && selectedDayDate && (
              <button
                onClick={() => {
                  const yyyy = selectedDayDate.getFullYear()
                  const mm = String(selectedDayDate.getMonth() + 1).padStart(2, "0")
                  const dd = String(selectedDayDate.getDate()).padStart(2, "0")
                  setSelectedDayDate(null)
                  onAddTransaction(`${yyyy}-${mm}-${dd}`)
                }}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs py-2 rounded-xl flex items-center justify-center gap-1.5 transition-colors shadow-none"
              >
                <Plus className="size-4" />
                Catat Transaksi di Tanggal Ini
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
