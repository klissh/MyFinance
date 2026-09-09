// Jaringan / jenis kartu untuk sumber dana. Disimpan di kolom
// `accounts.card_network` (Supabase) — lihat migrasi `add_accounts_card_network`.

export type CardNetwork =
  | "visa"
  | "mastercard"
  | "amex"
  | "unionpay"
  | "jcb"
  | "other"
  | "none"

export const CARD_NETWORKS: { value: CardNetwork; label: string }[] = [
  { value: "visa", label: "Visa" },
  { value: "mastercard", label: "Mastercard" },
  { value: "amex", label: "American Express" },
  { value: "unionpay", label: "UnionPay" },
  { value: "jcb", label: "JCB" },
  { value: "other", label: "Lainnya / Kartu Umum" },
  { value: "none", label: "Tanpa Logo" },
]

const VALID = new Set<string>(CARD_NETWORKS.map((n) => n.value))

/** Normalisasi nilai bebas dari DB / cache lama → CardNetwork yang valid. */
export function normalizeCardNetwork(value: unknown): CardNetwork {
  return typeof value === "string" && VALID.has(value) ? (value as CardNetwork) : "mastercard"
}
