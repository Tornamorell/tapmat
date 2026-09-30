"use client";

import {
  HouseIcon,
  SearchIcon,
  LayersIcon,
  LibraryBigIcon,
  ListChecksIcon,
  ScanLineIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The same sections on every screen size. The desktop bar used to list nine — decks, locations,
// the assistant and search among them — though each is already reached from somewhere else:
// decks and wants from the switcher at the top of Colecciones, locations from Mis cartas, the
// assistant from its floating button, and search from the box in the bar.
const LINKS: Array<{ href: string; label: string; also?: string[] }> = [
  { href: "/", label: "Resumen" },
  { href: "/catalog", label: "Catálogo" },
  { href: "/inventory", label: "Mis cartas", also: ["/locations"] },
  { href: "/collections", label: "Colecciones", also: ["/decks", "/wants"] },
];

// Phones: the same four, with the scanner in the middle. Search lives in the top bar.
const TABS: Array<{ href: string; label: string; icon: LucideIcon; primary?: boolean; also?: string[] }> = [
  { href: "/", label: "Resumen", icon: HouseIcon },
  { href: "/catalog", label: "Catálogo", icon: LibraryBigIcon },
  { href: "/scan", label: "Escanear", icon: ScanLineIcon, primary: true },
  { href: "/inventory", label: "Mis cartas", icon: LayersIcon, also: ["/locations"] },
  // Decks are reached from here too (the switcher at the top of both pages).
  { href: "/collections", label: "Colecciones", icon: ListChecksIcon, also: ["/decks", "/wants"] },
];

const isActive = (pathname: string, href: string, also: string[] = []) =>
  href === "/" ? pathname === "/" : [href, ...also].some((h) => pathname.startsWith(h));

/** Text links in the top bar, from tablet width up. */
export function DesktopNav() {
  const pathname = usePathname();
  return (
    <nav className="hidden items-center gap-1 text-sm md:flex" aria-label="Principal">
      {LINKS.map(({ href, label, also }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(pathname, href, also) ? "page" : undefined}
          className={cn(
            "rounded-md px-2.5 py-1.5 transition-colors",
            isActive(pathname, href, also)
              ? "bg-primary/12 text-primary font-medium"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

/** Bottom tab bar on phones. The full-screen scanner (z-50) covers it while scanning. */
export function MobileTabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Principal"
      className="bg-background/95 supports-[backdrop-filter]:bg-background/85 fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {TABS.map(({ href, label, icon: Icon, primary, also }) => {
          const active = isActive(pathname, href, also);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-[11px] transition-colors",
                  active ? "text-primary font-medium" : "text-muted-foreground",
                )}
              >
                {primary ? (
                  <span
                    className={cn(
                      "bg-primary text-primary-foreground -mt-6 flex size-12 items-center justify-center rounded-full shadow-md ring-4 ring-background",
                      active && "ring-primary/25",
                    )}
                  >
                    <Icon className="size-6" />
                  </span>
                ) : (
                  <Icon className="size-5" strokeWidth={active ? 2.25 : 1.75} />
                )}
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** «Escanear» in the desktop bar: the main thing to do, gold like the phone's middle tab. */
export function DesktopScanButton() {
  const pathname = usePathname();
  return (
    <Link
      href="/scan"
      aria-current={pathname.startsWith("/scan") ? "page" : undefined}
      className={cn(buttonVariants({ size: "default" }), "hidden md:inline-flex")}
    >
      <ScanLineIcon />
      Escanear
    </Link>
  );
}

/**
 * The search box in the desktop bar, for any card by name (a GET to /search). «/» focuses it
 * from anywhere but a field. Below `lg` there's no room for it, and the magnifier links to the
 * page instead, as on phones.
 */
export function HeaderSearch() {
  const ref = useRef<HTMLInputElement>(null);
  const router = useRouter();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      e.preventDefault();
      ref.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <form
      role="search"
      className="relative hidden lg:block"
      onSubmit={(e) => {
        e.preventDefault();
        const q = ref.current?.value.trim();
        if (!q) return;
        router.push(`/search?q=${encodeURIComponent(q)}`);
        ref.current?.blur();
      }}
    >
      <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
      <input
        ref={ref}
        name="q"
        type="search"
        placeholder="Buscar carta"
        aria-label="Buscar carta"
        aria-keyshortcuts="/"
        autoComplete="off"
        className="border-input bg-muted/50 focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-52 rounded-md border pr-7 pl-8 text-sm outline-none focus-visible:ring-[3px]"
      />
      <kbd className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs">
        /
      </kbd>
    </form>
  );
}
