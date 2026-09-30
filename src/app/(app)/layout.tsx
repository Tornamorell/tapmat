import { SearchIcon, ShieldIcon } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import { isAdmin, requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { AssistantDock } from "./assistant/dock";
import { DesktopNav, DesktopScanButton, HeaderSearch, MobileTabBar } from "./nav-links";
import { SignOutButton } from "./sign-out-button";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-40 border-b pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <Link href="/" className="shrink-0">
            <Logo />
          </Link>
          <DesktopNav />
          <div className="ml-auto flex items-center gap-1">
            <HeaderSearch />
            <Link
              href="/search"
              className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "lg:hidden")}
              aria-label="Buscar"
            >
              <SearchIcon />
            </Link>
            <DesktopScanButton />
            {isAdmin(user) && (
              <Link
                href="/admin"
                className={buttonVariants({ variant: "ghost", size: "icon" })}
                aria-label="Administración"
                title="Administración"
              >
                <ShieldIcon />
              </Link>
            )}
            <SignOutButton />
          </div>
        </div>
      </header>
      {/* Bottom padding on phones so content clears the tab bar. */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-6">
        {children}
      </main>
      <MobileTabBar />
      {/* The assistant, floating over every page, open or not, as the user moves around (D37). */}
      {process.env.ANTHROPIC_API_KEY ? <AssistantDock userId={user.id} /> : null}
    </div>
  );
}
