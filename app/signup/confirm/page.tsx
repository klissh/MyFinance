"use client"

import React, { useState, Suspense } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Wallet,
  MailCheck,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
} from "lucide-react"

function EmailConfirmContent() {
  const searchParams = useSearchParams()
  const email = searchParams.get("email") || "email@anda.com"
  const [isResending, setIsResending] = useState(false)
  const [notification, setNotification] = useState<string | null>(null)

  const handleResendEmail = () => {
    setIsResending(true)
    setTimeout(() => {
      setIsResending(false)
      setNotification(`Email konfirmasi telah dikirim ulang ke ${email}!`)
      setTimeout(() => setNotification(null), 4000)
    }, 800)
  }

  return (
    <div className="w-full max-w-md space-y-5">
      {/* Brand Header */}
      <div className="flex flex-col items-center text-center space-y-2">
        <div className="flex aspect-square size-13 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-xs">
          <Wallet className="size-7" />
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground">MyFinance</h1>
        <p className="text-sm text-muted-foreground font-medium">
          Manajemen Keuangan Pribadi & Kas Kamar Kos
        </p>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-sm font-medium animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{notification}</span>
        </div>
      )}

      {/* Confirm Email Card */}
      <Card className="border border-border shadow-none p-6 md:p-7 bg-card rounded-2xl space-y-1">
        {/* Header Content */}
        <div className="flex flex-col items-center text-center w-full space-y-3">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 shrink-0">
            <MailCheck className="size-7" />
          </div>

          <div className="space-y-1.5 w-full">
            <h2 className="text-xl md:text-2xl font-extrabold text-foreground tracking-tight">
              Cek Email Anda
            </h2>
            <p className="text-sm text-muted-foreground w-full max-w-sm mx-auto leading-relaxed">
              Kami telah mengirimkan tautan konfirmasi pendaftaran ke:
            </p>
          </div>
        </div>

        {/* Card Body */}
        <CardContent className="p-0 space-y-5 w-full">
          {/* Email Address Highlight Box */}
          <div className="p-3.5 rounded-xl bg-muted/60 border border-border text-center w-full">
            <span className="text-sm md:text-base font-bold text-foreground break-all">
              {email}
            </span>
          </div>

          <p className="text-xs md:text-sm text-muted-foreground text-center leading-relaxed">
            Silakan buka kotak masuk email Anda dan klik tautan <strong className="text-foreground font-semibold">"Konfirmasi Email Sekarang"</strong> untuk mengaktifkan akun Anda. Setelah itu, Anda dapat masuk ke aplikasi.
          </p>

          <div className="pt-2 space-y-3 w-full">
            <Button asChild size="default" className="w-full text-sm font-semibold shadow-none h-11 rounded-xl">
              <Link href="/login">
                Lanjut ke Halaman Login <ArrowRight className="size-4 ml-1.5" />
              </Link>
            </Button>

            <Button
              variant="outline"
              size="default"
              className="w-full text-sm font-medium shadow-none border-border h-11 rounded-xl"
              onClick={handleResendEmail}
              disabled={isResending}
            >
              <RefreshCw className={`size-4 mr-2 ${isResending ? "animate-spin" : ""}`} />
              {isResending ? "Mengirim Ulang..." : "Kirim Ulang Email Konfirmasi"}
            </Button>
          </div>
        </CardContent>

        <CardFooter className="p-0 pt-2 justify-center text-xs text-muted-foreground">
          Salah mengetik alamat email?{" "}
          <Link href="/signup" className="text-primary font-semibold ml-1 hover:underline">
            Daftar ulang
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}

export default function ConfirmEmailPage() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-4 md:p-6">
      <Suspense fallback={<div className="text-sm text-muted-foreground">Loading...</div>}>
        <EmailConfirmContent />
      </Suspense>
    </div>
  )
}
