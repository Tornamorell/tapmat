"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/admin", label: "Panel" },
  { href: "/admin/fotos", label: "Fotos" },
  { href: "/admin/cuentas", label: "Cuentas" },
];

/** The admin's areas. «Fotos» carries what's waiting for review, wherever you are. */
export function AdminNav({ pending }: { pending: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Administración" className="flex gap-1 border-b text-sm">
      {LINKS.map(({ href, label }) => {
        const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 transition-colors",
              active
                ? "border-primary text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {label}
            {href === "/admin/fotos" && pending > 0 && (
              <span className="bg-primary text-primary-foreground rounded-full px-1.5 text-xs font-semibold tabular-nums">
                {pending}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
