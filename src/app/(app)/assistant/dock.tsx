"use client";

import { HistoryIcon, LoaderCircleIcon, Maximize2Icon, SparklesIcon, SquarePenIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { buttonVariants, Button } from "@/components/ui/button";
import { PAGE_LABELS, parsePagePath, suggestionsFor } from "@/lib/assistant/page";
import { cn } from "@/lib/utils";
import { ChatView } from "./chat-view";
import { ThreadList } from "./thread-list";
import { useAssistant } from "./use-assistant";

/**
 * The assistant floating over every page (D37), but the scanner and its own page. It lives in
 * the layout, so it stays open, and keeps answering, while the user moves around; each question
 * goes with the page on screen, so «este mazo» is the one they're looking at.
 */
export function AssistantDock({ userId }: { userId: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"chat" | "threads">("chat");
  const a = useAssistant(userId, { active: open });
  const page = parsePagePath(pathname);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (pathname.startsWith("/scan") || pathname.startsWith("/assistant")) return null;

  // On a phone the panel covers the page: following a link shows the page.
  const closeOnPhone = () => {
    if (!window.matchMedia("(min-width: 48rem)").matches) setOpen(false);
  };
  const iconButton = "text-muted-foreground hover:text-foreground";

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir el asistente"
        title="Asistente"
        // Quiet, not gold: on a phone it sat right over the scanner's gold button in the tab bar,
        // and two gold circles side by side asked which one was the main action.
        className="bg-card text-primary hover:border-primary/60 fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 flex size-10 items-center justify-center rounded-full border shadow-lg transition-colors md:right-6 md:bottom-6 md:size-12"
      >
        {a.busy ? <LoaderCircleIcon className="size-5 animate-spin" /> : <SparklesIcon className="size-5" />}
      </button>
    );
  }

  return (
    <section
      role="dialog"
      aria-label="Asistente"
      className="bg-background fixed inset-x-0 bottom-0 z-50 flex h-[85dvh] flex-col rounded-t-2xl border shadow-2xl md:inset-auto md:top-20 md:right-4 md:bottom-4 md:h-auto md:w-[26rem] md:rounded-2xl"
    >
      <header className="flex items-center gap-1 border-b py-2 pr-1.5 pl-3">
        <SparklesIcon className="text-primary size-4 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1 pl-1">
          <p className="truncate text-sm font-medium">{view === "threads" ? "Conversaciones" : (a.title ?? "Asistente")}</p>
          {page && view === "chat" && (
            <p className="text-muted-foreground truncate text-xs">Sabe que estás viendo {PAGE_LABELS[page.kind]}</p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className={iconButton}
          aria-label="Conversaciones"
          aria-pressed={view === "threads"}
          onClick={() => {
            if (view === "chat") void a.refreshThreads();
            setView(view === "chat" ? "threads" : "chat");
          }}
        >
          <HistoryIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className={iconButton}
          aria-label="Nueva conversación"
          onClick={() => {
            void a.open(null);
            setView("chat");
          }}
        >
          <SquarePenIcon />
        </Button>
        <Link
          href={a.threadId ? `/assistant?thread=${a.threadId}` : "/assistant"}
          className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), iconButton, "hidden md:inline-flex")}
          aria-label="Abrir en grande"
          onClick={() => setOpen(false)}
        >
          <Maximize2Icon />
        </Link>
        <Button variant="ghost" size="icon-sm" className={iconButton} aria-label="Cerrar" onClick={() => setOpen(false)}>
          <XIcon />
        </Button>
      </header>

      {view === "threads" ? (
        <ThreadList
          className="flex-1 p-3"
          threads={a.threads}
          currentId={a.threadId}
          onOpen={(id) => {
            void a.open(id);
            setView("chat");
          }}
          onNew={() => {
            void a.open(null);
            setView("chat");
          }}
          onRemove={(id) => void a.remove(id)}
        />
      ) : (
        <ChatView a={a} path={pathname} suggestions={suggestionsFor(page)} onLinkClick={closeOnPhone} autoFocus />
      )}
    </section>
  );
}
