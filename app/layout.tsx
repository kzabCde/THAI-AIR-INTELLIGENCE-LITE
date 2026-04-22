import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { MobileNav } from "@/components/mobile-nav";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Thai Air Intelligence",
  description: "Simple real-time PM2.5 dashboard for every province in Thailand.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen pb-20 md:pb-0">
        <ThemeProvider />
        <SiteHeader />
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <MobileNav />
      </body>
    </html>
  );
}
