import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // IP jaringan lokal yang boleh mengakses dev server (mis. akses dari HP di Wi-Fi yang sama).
  // Tambahkan IP lain bila perlu; lihat http://localhost:3000 di terminal saat `npm run dev`.
  allowedDevOrigins: ["169.254.118.90", "192.168.56.1"],
}

export default nextConfig
