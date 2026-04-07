"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Navbar() {
  const pathname = usePathname();
  const isHome = pathname === "/threads";
  const isSearch = pathname.startsWith("/search");

  return (
    <header className="border-b px-4 py-2 flex items-center gap-4">
      {/* Left: app name */}
      <Link href="/" className="font-bold">
        Tieba Viewer
      </Link>

      {/* Middle: normal nav on non-thread pages */}
      {
        <nav className="flex gap-3 text-sm">
          <Link
            href="/threads"
            className={isHome ? "font-semibold underline" : ""}
          >
            Home
          </Link>
          <Link
            href="/search"
            className={isSearch ? "font-semibold underline" : ""}
          >
            Search
          </Link>
        </nav>
      }

      {/* Right side reserved for future stuff */}
      <div className="ml-auto text-xs text-neutral-500">
        {/* e.g. Settings, theme toggle, etc. */}
      </div>
    </header>
  );
}
