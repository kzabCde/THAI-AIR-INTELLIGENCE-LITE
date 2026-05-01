import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { MobileNav } from "@/components/mobile-nav";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "ประเทศไทย AI คุณภาพอากาศอัจฉริยะ (Thailand Air Intelligence)",
  description: "แดชบอร์ด PM2.5 วันนี้ ค่าฝุ่นประเทศไทย เช็คค่าฝุ่นจังหวัดทั้ง 77 จังหวัดแบบเรียลไทม์ พร้อมคาดการณ์พรุ่งนี้",
  keywords: ["PM2.5 วันนี้", "ค่าฝุ่นประเทศไทย", "เช็คค่าฝุ่นจังหวัด", "AQI ไทย", "Thailand Air Intelligence"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className="min-h-screen pb-20 font-sans md:pb-0">
        <ThemeProvider />
        <SiteHeader />
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-7xl px-4 pb-24 text-center text-xs text-slate-500 md:pb-6">
          © 2026 NOWHEREDEV · {" "}
          <a
            href="https://nowheredev.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-slate-300 underline-offset-2 transition hover:text-slate-700"
          >
            nowheredev.vercel.app
          </a>
        </footer>
        <MobileNav />
      </body>
    </html>
  );
}
