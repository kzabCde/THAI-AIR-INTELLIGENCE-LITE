import type { Metadata } from "next";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import { Header } from "@/components/layout/header";
import { MobileNav } from "@/components/layout/mobile-nav";
import { themeInitScript } from "@/components/theme/theme-toggle";

export const metadata: Metadata = {
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
        <Header />
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-7xl px-4 pb-24 pt-8 text-center text-xs muted md:pb-8">
          ข้อมูลเชิงสาธิตจาก Supabase · Isan Air Intelligence · © 2026
        </footer>
        <MobileNav />
      </body>
    </html>
  );
}
