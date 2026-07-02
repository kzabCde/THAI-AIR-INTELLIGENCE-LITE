import type { Metadata } from "next";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import { Header } from "@/components/layout/header";
import { MobileNav } from "@/components/layout/mobile-nav";
import { themeInitScript } from "@/components/theme/theme-toggle";
import { AppProviders } from "@/components/providers/app-providers";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  openGraph: {
    type: "website",
    locale: "th_TH",
    siteName: "Isan Air Intelligence",
    title: "Isan Air Intelligence — คุณภาพอากาศภาคอีสาน",
    description:
      "ติดตาม PM2.5 / AQI แบบเรียลไทม์ 20 จังหวัดภาคอีสาน พร้อมพยากรณ์ 7 วันและวิเคราะห์ย้อนหลัง",
  },
  title: {
    default: "Isan Air Intelligence — คุณภาพอากาศภาคอีสาน",
    template: "%s · Isan Air Intelligence",
  },
  description:
    "แพลตฟอร์มติดตามคุณภาพอากาศ PM2.5 / AQI แบบเรียลไทม์ ครอบคลุม 20 จังหวัดภาคตะวันออกเฉียงเหนือ (อีสาน) พร้อมพยากรณ์และวิเคราะห์ย้อนหลัง",
  keywords: ["PM2.5 อีสาน", "ค่าฝุ่นภาคอีสาน", "AQI Isan", "Northeastern Thailand air quality"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen pb-24 md:pb-0">
        <AppProviders>
          <Header />
          <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
          <footer className="mx-auto max-w-7xl px-4 pb-24 pt-8 text-center text-xs muted md:pb-8">
            ข้อมูลเชิงสาธิตจาก Supabase · Isan Air Intelligence · © 2026
          </footer>
          <MobileNav />
        </AppProviders>
      </body>
    </html>
  );
}
