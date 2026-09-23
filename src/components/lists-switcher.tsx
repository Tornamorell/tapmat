import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "collections", href: "/collections", label: "Colecciones" },
  { key: "wants", href: "/wants", label: "Wants" },
  { key: "decks", href: "/decks", label: "Mazos" },
] as const;

/** Collections, wants and decks are all lists of cards: one tab each, above any of them. */
export function ListsSwitcher({ current }: { current: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="Listas" className="bg-muted inline-flex rounded-lg p-0.5 text-sm">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={current === t.key ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1 transition-colors",
            current === t.key
              ? "bg-background font-medium shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
