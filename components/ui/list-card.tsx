"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Pengganti baris tabel untuk layar sempit (mobile). Setiap "baris" jadi kartu
 * ringkas. Dipakai berdampingan dengan `<Table>` biasa: tabel `hidden md:block`,
 * daftar kartu `md:hidden`.
 */
export function ListCard({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-xl border border-border bg-card p-3.5 text-sm", className)}
      {...props}
    >
      {children}
    </div>
  )
}

/** Baris judul kartu: keterangan di kiri, nominal di kanan. */
export function ListCardHead({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex items-start justify-between gap-3", className)}
      {...props}
    >
      {children}
    </div>
  )
}

/** Baris metadata kecil (tanggal · kategori · akun ...). */
export function ListCardMeta({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
