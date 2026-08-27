import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
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
  icons: {
    icon: "/images/cloud-logo.png",
    shortcut: "/images/cloud-logo.png",
    apple: "/images/cloud-logo.png",
  },
  openGraph: {
    type: "website",
    locale: "th_TH",
    siteName: "Isan Air Intelligence",
    title: "Isan Air Intelligence — คุณภาพอากาศภาคอีสาน",
    description:
      "ติดตาม PM2.5 / AQI แบบเรียลไทม์ 20 จังหวัดภาคอีสาน พร้อมพยากรณ์ 7 วันและวิเคราะห์ย้อนหลัง",
    images: [{ url: "/images/cloud-logo.png", width: 512, height: 512, alt: "Isan Air Intelligence Logo" }],
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
          <footer className="mx-auto flex max-w-7xl flex-col items-center justify-center gap-2.5 px-4 pb-24 pt-8 text-center text-xs text-zinc-500 dark:text-zinc-400 md:pb-8">
            <div className="flex items-center gap-2">
              <Image src="/images/cloud-logo.png" alt="Logo" width={24} height={24} className="h-6 w-6 object-contain" />
              <span className="font-bold text-zinc-800 dark:text-zinc-200">Isan Air Intelligence</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11.5px]">
              <span>ข้อมูลคุณภาพอากาศ 20 จังหวัดภาคอีสาน · © 2026</span>
              <span className="text-zinc-300 dark:text-zinc-700">·</span>
              <Link
                href="/system"
                className="inline-flex items-center gap-1.5 font-semibold text-zinc-600 dark:text-zinc-300 hover:text-teal-600 dark:hover:text-teal-400 transition"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>ตรวจสอบสถานะระบบ (System Status) ↗</span>
              </Link>
            </div>
          </footer>
          <MobileNav />
        </AppProviders>
      </body>
    </html>
  );
}
