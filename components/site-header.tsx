import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-sm font-bold tracking-wide text-sky-700 dark:text-sky-300">
          THAI AIR INTELLIGENCE
        </Link>
        <nav className="hidden gap-4 text-sm text-slate-600 dark:text-slate-300 md:flex">
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/map">Map</Link>
          <Link href="/compare">Compare</Link>
          <Link href="/analytics">Analytics</Link>
          <Link href="/settings">Settings</Link>
        </nav>
      </div>
    </header>
  );
}
