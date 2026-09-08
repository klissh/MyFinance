"use client"

import React, { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { authService } from "@/lib/db"
import { Spinner } from "@/components/ui/spinner"
import { Wallet, Eye, EyeOff, CheckCircle2, Circle } from "lucide-react"

export function SignupForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter()
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Password Requirement Checks
  const hasUppercase = /[A-Z]/.test(password)
  const hasMinLength = password.length >= 8

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    if (!fullName || !email || !password || !confirmPassword) return

    if (!hasUppercase) {
      setErrorMessage("Kata sandi harus mengandung minimal 1 huruf kapital (A-Z)!")
      return
    }

    if (!hasMinLength) {
      setErrorMessage("Kata sandi harus terdiri dari minimal 8 karakter!")
      return
    }

    if (password !== confirmPassword) {
      setErrorMessage("Konfirmasi kata sandi tidak cocok!")
      return
    }

    setIsLoading(true)
    const { user, needsConfirmation, error } = await authService.signup(
      fullName,
      email,
      password,
    )
    setIsLoading(false)

    if (error) {
      setErrorMessage(error)
      return
    }

    if (user && !needsConfirmation) {
      // Konfirmasi email dimatikan → sudah login, langsung ke dashboard.
      router.push("/dashboard")
      router.refresh()
      return
    }

    if (user) {
      // Perlu konfirmasi email dulu.
      router.push(`/signup/confirm?email=${encodeURIComponent(email)}`)
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <form onSubmit={handleSubmit}>
        <FieldGroup className="gap-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <Link
              href="/"
              className="flex flex-col items-center gap-2 font-medium"
            >
              <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Wallet className="size-6" />
              </div>
              <span className="sr-only">MyFinance</span>
            </Link>
            <h1 className="text-xl font-bold text-foreground">Create an Account</h1>
            <FieldDescription>
              Already have an account? <Link href="/login">Login</Link>
            </FieldDescription>
          </div>

          {errorMessage && (
            <div className="p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-semibold text-center">
              {errorMessage}
            </div>
          )}

          {/* Row 1: Full Name & Email (Side-by-Side) */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field className="flex flex-col gap-2">
              <FieldLabel htmlFor="fullName" className="text-sm font-semibold">
                Full Name
              </FieldLabel>
              <Input
                id="fullName"
                type="text"
                placeholder="John Doe"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </Field>
            <Field className="flex flex-col gap-2">
              <FieldLabel htmlFor="email" className="text-sm font-semibold">
                Email
              </FieldLabel>
              <Input
                id="email"
                type="email"
                placeholder="m@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
          </div>

          {/* Row 2: Password & Confirm Password (Side-by-Side with Independent Eye Toggles) */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field className="flex flex-col gap-2">
              <FieldLabel htmlFor="password" className="text-sm font-semibold">
                Password
              </FieldLabel>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>

            <Field className="flex flex-col gap-2">
              <FieldLabel htmlFor="confirmPassword" className="text-sm font-semibold">
                Confirm Password
              </FieldLabel>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  {showConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>
          </div>

          {/* Live Password Requirements Indicator */}
          <div className="p-3 rounded-xl bg-muted/40 border border-border space-y-1.5">
            <div className="text-xs font-semibold text-foreground mb-1">Syarat Kata Sandi:</div>
            <div className={`flex items-center gap-1.5 text-xs transition-all ${hasUppercase ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-muted-foreground"}`}>
              {hasUppercase ? (
                <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <Circle className="size-3.5 text-muted-foreground shrink-0" />
              )}
              <span>Minimal 1 huruf kapital (A-Z)</span>
            </div>
            <div className={`flex items-center gap-1.5 text-xs transition-all ${hasMinLength ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-muted-foreground"}`}>
              {hasMinLength ? (
                <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <Circle className="size-3.5 text-muted-foreground shrink-0" />
              )}
              <span>Minimal 8 karakter</span>
            </div>
          </div>

          <Field>
            <Button type="submit" disabled={isLoading} className="w-full">
              {isLoading ? (
                <div className="flex items-center justify-center gap-2">
                  <Spinner className="size-4 text-primary-foreground" />
                  <span>Membuat Akun Baru...</span>
                </div>
              ) : (
                "Create Account"
              )}
            </Button>
          </Field>

          <FieldSeparator>Or</FieldSeparator>

          <Field className="grid gap-4 sm:grid-cols-2">
            <Button variant="outline" type="button" onClick={handleSubmit}>
              <svg className="size-4 mr-2" viewBox="0 0 24 24">
                <path
                  d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"
                  fill="currentColor"
                />
              </svg>
              Continue with Apple
            </Button>
            <Button variant="outline" type="button" onClick={handleSubmit}>
              <svg className="size-4 mr-2" viewBox="0 0 24 24">
                <path
                  d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                  fill="currentColor"
                />
              </svg>
              Continue with Google
            </Button>
          </Field>
        </FieldGroup>
      </form>
      <FieldDescription className="px-6 text-center text-xs">
        By clicking continue, you agree to our <a href="#">Terms of Service</a>{" "}
        and <a href="#">Privacy Policy</a>.
      </FieldDescription>
    </div>
  )
}
