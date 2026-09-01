"use client"

import React from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-background p-6 text-center">
      <div className="max-w-md space-y-6">
        {/* Large Aesthetic 404 Number */}
        <h1 className="text-8xl md:text-9xl font-black tracking-tighter text-muted-foreground/30 select-none">
          404
        </h1>

        {/* Minimalist Text Content */}
        <div className="space-y-2">
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">
            Halaman Tidak Ditemukan
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
            Halaman yang Anda cari tidak ada, telah dipindahkan, atau alamat URL yang Anda masukkan salah.
          </p>
        </div>

        {/* Simple Link Button */}
        <div className="pt-2">
          <Button asChild size="default" className="text-sm font-semibold shadow-none rounded-xl px-6 h-10">
            <Link href="/dashboard">
              Kembali ke Beranda &rarr;
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
