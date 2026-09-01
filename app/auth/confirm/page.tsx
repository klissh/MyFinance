"use client"

import React, { Suspense } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Wallet,
  CheckCircle2,
  XCircle,
  ArrowRight,
  RefreshCw,
  LogIn,
} from "lucide-react"

function AuthConfirmContent() {
  const searchParams = useSearchParams()
  const errorParam = searchParams.get("error") || searchParams.get("error_code")
  const errorDescription = searchParams.get("error_description")
  
  // Determine success vs failure state
  const isError = Boolean(errorParam)

  return (
    <div className="w-full max-w-md space-y-5">
      {/* Confirmation Result Card */}
      <Card className="border border-border shadow-none p-6 md:p-7 bg-card rounded-2xl space-y-0 text-center">
        {!isError ? (
          /* SUCCESS STATE */
          <div className="flex flex-col items-center text-center w-full space-y-4 pt-1">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shrink-0">
              <CheckCircle2 className="size-7" />
            </div>

            <div className="space-y-1.5 w-full">
              <div className="flex justify-center">
              </div>
              <h2 className="text-xl md:text-2xl font-extrabold text-foreground tracking-tight pt-0.5">
                Email Berhasil Dikonfirmasi!
              </h2>
              <p className="text-xs md:text-sm text-muted-foreground w-full max-w-xs mx-auto leading-relaxed pt-0.5">
                Selamat! Akun MyFinance Anda telah aktif. Silakan masuk sekarang untuk mengakses dashboard keuangan Anda.
              </p>
            </div>

            <CardContent className="p-0 pt-2 w-full">
              <Button asChild size="default" className="w-full text-sm font-semibold shadow-none h-11 rounded-xl">
                <Link href="/login">
                  Masuk ke Akun Anda <ArrowRight className="size-4 ml-1.5" />
                </Link>
              </Button>
            </CardContent>
          </div>
        ) : (
          /* FAILURE / ERROR STATE */
          <div className="flex flex-col items-center text-center w-full space-y-4 pt-1">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 shrink-0">
              <XCircle className="size-7" />
            </div>

            <div className="space-y-1.5 w-full">
              <div className="flex justify-center">
                <Badge variant="outline" className="text-[11px] font-semibold border-rose-500/30 text-rose-600 dark:text-rose-400 px-2.5 py-0.5 bg-rose-500/10">
                  Konfirmasi Gagal
                </Badge>
              </div>
              <h2 className="text-xl md:text-2xl font-extrabold text-foreground tracking-tight pt-0.5">
                Tautan Tidak Valid / Kadaluarsa
              </h2>
              <p className="text-xs md:text-sm text-muted-foreground w-full max-w-xs mx-auto leading-relaxed pt-0.5">
                {errorDescription || "Maaf, tautan konfirmasi email ini sudah pernah digunakan atau telah melewati batas waktu berlaku."}
              </p>
            </div>

            <CardContent className="p-0 pt-2 space-y-2.5 w-full">
              <Button asChild size="default" className="w-full text-sm font-semibold shadow-none h-11 rounded-xl">
                <Link href="/signup">
                  <RefreshCw className="size-4 mr-2" /> Daftar Ulang / Kirim Email Baru
                </Link>
              </Button>

              <Button
                asChild
                variant="outline"
                size="default"
                className="w-full text-sm font-medium shadow-none border-border h-11 rounded-xl"
              >
                <Link href="/login">
                  <LogIn className="size-4 mr-2" /> Kembali ke Halaman Login
                </Link>
              </Button>
            </CardContent>
          </div>
        )}

        <CardFooter className="p-0 pt-3 justify-center text-xs text-muted-foreground border-t border-border/60 mt-2">
          Butuh bantuan?{" "}
          <Link href="/login" className="text-primary font-semibold ml-1 hover:underline">
            Pusat Bantuan MyFinance
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}

export default function AuthConfirmPage() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-4 md:p-6">
      <Suspense fallback={<div className="text-sm text-muted-foreground">Loading...</div>}>
        <AuthConfirmContent />
      </Suspense>
    </div>
  )
}
