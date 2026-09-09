"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Progress } from "@/components/ui/progress"

const toneClass = {
  default: "text-foreground",
  positive: "text-emerald-600 dark:text-emerald-400",
  negative: "text-rose-600 dark:text-rose-400",
  warning: "text-amber-600 dark:text-amber-400",
} as const

/**
 * Kartu ringkasan angka yang seragam dipakai di semua halaman: label kecil,
 * satu angka besar, satu baris konteks opsional. Warna hanya di angka & hanya
 * kalau bermakna (mis. pemasukan hijau) — bukan kotak ikon warna-warni.
 */
export function MetricCard({
  label,
  value,
  hint,
  tone = "default",
  icon,
  progress,
  className,
}: {
  label: React.ReactNode
  value: React.ReactNode
  hint?: React.ReactNode
  tone?: keyof typeof toneClass
  icon?: React.ReactNode
  progress?: number
  className?: string
}) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-xs text-muted-foreground">{label}</span>
        {icon ? (
          <span className="shrink-0 text-muted-foreground [&_svg]:size-4">{icon}</span>
        ) : null}
      </div>
      <div className={cn("mt-2 truncate text-lg font-semibold sm:text-xl", toneClass[tone])}>
        {value}
      </div>
      {hint ? <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{hint}</p> : null}
      {progress !== undefined ? <Progress value={progress} className="mt-2.5 h-1.5" /> : null}
    </div>
  )
}
