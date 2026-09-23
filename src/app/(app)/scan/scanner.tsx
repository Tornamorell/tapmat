"use client";

import {
  ClockIcon,
  FlashlightIcon,
  ImageUpIcon,
  LoaderCircleIcon,
  MinusIcon,
  MoveIcon,
  PlusIcon,
  ScanLineIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AddFilteredToCollection } from "@/components/add-filtered-to-collection";
import { LanguageFlag } from "@/components/card-attributes";
import { CardThumb } from "@/components/card-thumb";
import type { CollectionOption } from "@/components/collection-picker";
import { EntryTarget, targetFor, useEntryResult } from "@/components/entry-target";
import type { LocationOption } from "@/components/location-picker";
import { MoveDialog } from "@/components/move-dialog";
import { QuickAdd } from "@/components/quick-add";
import { NextSectionButton, sectionFill } from "@/components/section-picker";
import {
  ConditionSelect,
  FinishSelect,
  LanguageSelect,
  finishFor,
} from "@/components/stack-fields";
import { Button } from "@/components/ui/button";
import { FINISH_LABELS, formatEur, placeLabel } from "@/lib/format";
import { SetPicker, type SetOption } from "@/components/set-picker";
import { gameById, rarityLabel, rarityRank } from "@/lib/games";
import type { ScanMatch } from "@/lib/queries/scan";
import {
  DEFAULT_GUIDE,
  FOUND_INFO_STRIPS,
  GUIDE_FILL,
  INFO_STRIP,
  NAME_LAYOUTS,
  TITLE_STRIP,
  clampGuideScale,
  coverTransform,
  fromVideo,
  guideRect,
  pickFoundStrip,
  placeGuide,
  stripRect,
  stripUnion,
  toVideo,
  type FoundStrip,
  type GuidePlace,
  type NameLayout,
  type Rect,
} from "@/lib/scan/geometry";
import {
  canonicalNumber,
  parseCollectorLine,
  parseTitle,
  type CollectorLine,
} from "@/lib/scan/parse";
import { entryUnitPrice, sessionTotals, type Finish, type SessionEntry } from "@/lib/scan/session";
import { normalizeForSearch } from "@/lib/search/normalize";
import { useStickyDefaults } from "@/lib/use-sticky-defaults";
import { cn } from "@/lib/utils";
import { addItem, changeFinish, changeQuantity } from "../inventory/actions";
import { savePendingScan } from "../review/actions";
import { saveCardPhoto } from "../cards/photo-actions";
import { cardInGuideBlob, cardInGuidePixels, findCardIn } from "@/lib/card-photo";
import type { Pt, Quad } from "@/lib/scan/card-quad";
import { quadBounds, quadsAgree } from "@/lib/scan/find-card";
import { bestMatch, cardHash } from "@/lib/scan/card-hash";
import { useScanSession } from "./scan-session";

type OcrWorker = import("tesseract.js").Worker;
type Psm = import("tesseract.js").PSM;
type FixedSet = { game: string; code: string };
type Entry = SessionEntry;

// Tuning knobs (docs/scanner.md).
const INFO_HEIGHT = 140; // px of the info strip fed to Tesseract
const TITLE_HEIGHT = 90; // px of the title strip
const NAME_HEIGHT = 120; // px of an album's sideways name, once upright
const TICK_MS = 250; // pause between reads
const VOTES_NEEDED = 2; // a read must repeat this many times…
const VOTE_WINDOW = 6; // …among the last reads (not necessarily consecutive)
const EMPTY_READS_TO_RELEASE = 3; // reads without text before the same card can be added again
const STUCK_MS = 6000; // a card in view this long, recognised by nothing: point at the AI (or «Para luego»)
const PHOTO_HEIGHT = 560; // px of the «Para luego» photo: enough to read the name and number

const INFO_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/•. ";
const TITLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',- ";
const FINISH_ORDER: Finish[] = ["nonfoil", "foil", "etched"];

const describe = (line: CollectorLine) =>
  [
    line.setCodes[0],
    line.total ? `${line.number}/${line.total}` : line.number,
    line.lang?.toUpperCase(),
  ]
    .filter(Boolean)
    .join(" ");

const clock = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" });

/** How long each step of a read takes, for «Ver lo que lee»: "buscar 80 · número 420 ms". */
function stopwatch() {
  let last = performance.now();
  const laps: string[] = [];
  return {
    lap(step: string) {
      const now = performance.now();
      laps.push(`${step} ${Math.round(now - last)}`);
      last = now;
    },
    toString: () => (laps.length ? `${laps.join(" · ")} ms` : ""),
  };
}

/** Crops `rect` of `source` into `canvas` at `height` px, as contrast-stretched grayscale. */
function captureRegion(
  source: CanvasImageSource,
  r: Rect,
  canvas: HTMLCanvasElement,
  height: number,
) {
  // A strip can reach past the edge of the frame: the one below a found card, when the card sits
  // low in the view. Outside the source, drawImage paints transparent black, and that false
  // minimum flattens the contrast stretch below and washes the text out. Read only what's there.
  const sw = source instanceof HTMLVideoElement ? source.videoWidth : (source as ImageBitmap).width;
  const sh =
    source instanceof HTMLVideoElement ? source.videoHeight : (source as ImageBitmap).height;
  const x = Math.min(Math.max(0, r.x), Math.max(0, sw - 1));
  const y = Math.min(Math.max(0, r.y), Math.max(0, sh - 1));
  const w = Math.max(1, Math.min(r.w, sw - x));
  const h = Math.max(1, Math.min(r.h, sh - y));
  canvas.width = Math.max(1, Math.round((w * height) / h));
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  ctx.drawImage(source, x, y, w, h, 0, 0, canvas.width, canvas.height);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  let min = 255;
  let max = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const range = Math.max(1, max - min);
  for (let i = 0; i < d.length; i += 4) {
    const v = ((d[i] - min) * 255) / range;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Crops `r` of `source` for a name printed sideways (Megacracks): turned upright by `rotate`
 * degrees clockwise, `height` px tall, grey and contrast-stretched, and inverted for light text
 * on a dark band (NameLayout).
 */
function captureName(
  source: CanvasImageSource,
  r: Rect,
  canvas: HTMLCanvasElement,
  height: number,
  rotate: 0 | 90 | -90,
  invert: boolean,
) {
  const turned = rotate !== 0;
  const scale = height / (turned ? r.w : r.h);
  canvas.width = Math.max(1, Math.round((turned ? r.h : r.w) * scale));
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotate * Math.PI) / 180);
  ctx.drawImage(
    source,
    r.x,
    r.y,
    r.w,
    r.h,
    (-r.w * scale) / 2,
    (-r.h * scale) / 2,
    r.w * scale,
    r.h * scale,
  );
  ctx.restore();
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  let min = 255;
  let max = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const range = Math.max(1, max - min);
  for (let i = 0; i < d.length; i += 4) {
    const v = ((d[i] - min) * 255) / range;
    d[i] = d[i + 1] = d[i + 2] = invert ? 255 - v : v;
  }
  ctx.putImageData(img, 0, 0);
}

/** A choice's caption: the series for football cards (Élite, Power…), else the set's name. */
function choiceCaption(m: ScanMatch) {
  const game = gameById(m.game);
  return game && !game.hasMarketPrices && m.rarity ? rarityLabel(game, m.rarity) : m.setName;
}

/** Several cards of one player (football albums): the plainest first, as rarities rank them. */
function byRarity(matches: ScanMatch[]) {
  return [...matches].sort((a, b) => {
    const game = gameById(a.game);
    return game ? rarityRank(game, a.rarity) - rarityRank(game, b.rarity) : 0;
  });
}

let audio: AudioContext | null = null;
function beep() {
  try {
    if (!audio) return;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 0.08);
  } catch {
    // Sound is a nicety.
  }
}

/**
 * Continuous scanner. Full screen while running: the camera fills the screen, the card goes in
 * the guide, and a bottom panel shows the last card added with quick finish/quantity controls.
 * Each read tries the info strip (number, set code) and, when that fails, the title. A read is
 * accepted when it repeats among the last few (votes). See docs/scanner.md.
 */
export function Scanner({
  collections,
  locations,
  sets,
  initialFixedSet,
  initialPending,
  aiEnabled,
}: {
  collections: CollectionOption[];
  locations: LocationOption[];
  sets: SetOption[];
  initialFixedSet: FixedSet | null;
  /** Cards already waiting in /review. */
  initialPending: number;
  /** «Identificar con IA» is configured (ANTHROPIC_API_KEY, D31). */
  aiEnabled: boolean;
}) {
  const [defaults, setDefaults] = useStickyDefaults();
  // Both optional: scanning just fills the inventory (D23).
  const collectionName = collections.find((c) => c.id === defaults.entryCollectionId)?.name ?? null;
  const location = locations.find((l) => l.id === defaults.lastLocationId) ?? null;
  const locationName = location?.name ?? null;
  const target = targetFor(defaults, locations);
  const section = location?.sections?.find((s) => s.id === target.sectionId) ?? null;
  const follow = useEntryResult();

  const [fixedSet, setFixedSet] = useState<FixedSet | null>(initialFixedSet);
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [stage, setStage] = useState<{ w: number; h: number } | null>(null);
  const [status, setStatus] = useState("Encaja la carta en el recuadro.");
  const [lastText, setLastText] = useState("");
  // How long the last read's steps took, for «Ver lo que lee».
  const [timing, setTiming] = useState("");
  // A card has been in view a while and nothing recognised it (STUCK_MS): the AI lights up.
  const [stuck, setStuck] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  // The card found in the view (D36), on the stage: its outline, and the box that's read.
  const [found, setFound] = useState<{ points: string; box: Rect } | null>(null);
  // Which strip reads the found card: on it, or below its inner frame. Null until one reads.
  const [lockedStrip, setLockedStrip] = useState<FoundStrip | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  // «Ajustar recuadro»: the guide being moved and resized, saved on «Listo».
  const [adjusting, setAdjusting] = useState(false);
  const [draftPlace, setDraftPlace] = useState<GuidePlace | null>(null);
  const dragRef = useRef<{
    mode: "move" | "resize";
    x: number;
    y: number;
    start: GuidePlace;
  } | null>(null);
  const [choices, setChoices] = useState<{ matches: ScanMatch[]; lang: string | null } | null>(
    null,
  );
  // The session survives reloads and closing the camera (scan-session.ts).
  const [entries, setEntries] = useScanSession();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [movingSession, setMovingSession] = useState(false);
  const [busy, setBusy] = useState(false);
  const [identifying, setIdentifying] = useState(false);
  const [torch, setTorch] = useState({ supported: false, on: false });
  const [pendingCount, setPendingCount] = useState(initialPending);
  const [saving, setSaving] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const photoCanvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<OcrWorker | null>(null);
  const psmRef = useRef<{ info: Psm; title: Psm } | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const runningRef = useRef(false);
  /** Catalog card id → hash of its shared photo (D33), of the fixed set or of all. */
  const photoHashesRef = useRef(new Map<string, string>());
  /** The card found in the view (D36), in video pixels: reads in a row that saw it there, and that missed it. */
  const foundRef = useRef<{ quad: Quad; seen: number; missed: number } | null>(null);
  const readState = useRef({
    votes: [] as Array<string | null>,
    empty: 0,
    holdId: null as string | null,
    tick: 0,
    choicesKey: "",
    /** Candidates already answered by picking one, so the chooser doesn't come back while the
     * card is still in view. Cleared when it leaves (noRead), as `holdId` is. */
    resolvedChoices: "",
    /** The AI already tried this card on its own («IA automática», D31): don't spend another
     * call on it while it stays in view. Cleared when it leaves, as `holdId` is. */
    autoTried: false,
    mode: "",
    /** The strip that read a found card the catalog knows (D36), kept for the session. */
    foundStrip: null as FoundStrip | null,
    /** Until then, both take turns; after, the reads in a row without a line (pickFoundStrip). */
    stripTurn: 0,
    stripMisses: 0,
    /** The card just added went unread a while but was kept, still being in view (noRead). */
    heldBack: false,
    /** When something last happened with the card in view (added, read again, offered): for `stuck`. */
    progressAt: 0,
    /** The last name read from the title of the card in the guide: the hint for «Para luego». */
    lastTitle: null as string | null,
    cache: new Map<string, ScanMatch[]>(),
  });
  // The read loop is async and long-lived: it reads the latest settings from here.
  // Albums that print the name sideways and no number on the front (Megacracks): read that.
  const fixedSetType = fixedSet
    ? sets.find((s) => s.game === fixedSet.game && s.code === fixedSet.code)?.setType
    : null;
  const nameLayout: NameLayout | null = (fixedSetType && NAME_LAYOUTS[fixedSetType]) || null;

  // Where the guide is: as the owner placed it, or as it's being adjusted.
  const place: GuidePlace = draftPlace ?? {
    scale: defaults.guideScale ?? DEFAULT_GUIDE.scale,
    dx: defaults.guideDx ?? DEFAULT_GUIDE.dx,
    dy: defaults.guideDy ?? DEFAULT_GUIDE.dy,
  };
  // Paused while the history is open, the AI is identifying or the guide is being adjusted:
  // nothing added behind the user's back.
  const paused = historyOpen || identifying || adjusting;
  const settings = useRef({ defaults, fixedSet, locations, paused, nameLayout, place });
  useEffect(() => {
    settings.current = { defaults, fixedSet, locations, paused, nameLayout, place };
  });

  useEffect(
    () => () => {
      runningRef.current = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      void workerRef.current?.terminate();
    },
    [],
  );

  // Size of the area between the top bar and the bottom panel, where the guide goes.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setStage({ w: entry.contentRect.width, h: entry.contentRect.height }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Full screen: no page scroll underneath.
  useEffect(() => {
    if (!running) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [running]);

  // --- OCR ------------------------------------------------------------------

  async function getWorker() {
    if (workerRef.current) return workerRef.current;
    const { createWorker, PSM } = await import("tesseract.js");
    // The info strip is read as sparse text, not as one block: the artist's name sits in its own
    // column beside the number, and as a block Tesseract runs the two together ("285 C" + the
    // artist came out "RE EN ANTHONY PALUMBO"). Measured 2026-09-16, docs/scanner.md.
    psmRef.current = { info: PSM.SPARSE_TEXT, title: PSM.SINGLE_LINE };
    workerRef.current = await createWorker("eng");
    return workerRef.current;
  }

  async function ocr(canvas: HTMLCanvasElement, mode: "info" | "title") {
    const worker = await getWorker();
    const psm = psmRef.current!;
    if (readState.current.mode !== mode) {
      await worker.setParameters(
        mode === "info"
          ? { tessedit_char_whitelist: INFO_CHARS, tessedit_pageseg_mode: psm.info }
          : { tessedit_char_whitelist: TITLE_CHARS, tessedit_pageseg_mode: psm.title },
      );
      readState.current.mode = mode;
    }
    const { data } = await worker.recognize(canvas);
    return data.text;
  }

  /** The video, how it's shown, and the space between the bars (on screen, relative to the video). */
  function view() {
    const video = videoRef.current;
    const stageEl = stageRef.current;
    if (!video?.videoWidth || !stageEl) return null;
    const vr = video.getBoundingClientRect();
    const sr = stageEl.getBoundingClientRect();
    const t = coverTransform(video.videoWidth, video.videoHeight, vr.width, vr.height);
    return {
      video,
      t,
      area: { x: sr.left - vr.left, y: sr.top - vr.top, w: sr.width, h: sr.height },
    };
  }

  /** The guide, in video pixels. */
  function cardInVideo(): Rect | null {
    const v = view();
    return v && toVideo(placeGuide(v.area, settings.current.place), v.t);
  }

  /** Something happened with the card in view, or there's none: it isn't stuck (STUCK_MS). */
  function progress() {
    readState.current.progressAt = performance.now();
    setStuck(false);
  }

  /** Keeps the strip that reads found cards, for the session; null forgets it («Buscar la carta» off). */
  function keepStrip(strip: FoundStrip | null) {
    if (readState.current.foundStrip === strip) return;
    readState.current.foundStrip = strip;
    setLockedStrip(strip);
  }

  /**
   * Looks for the card in everything shown between the bars (D36). It counts once found in two
   * reads in a row in about the same place, and is dropped when missed in two. The card in video
   * pixels, or null: read the guide.
   */
  function locateCard(): Quad | null {
    const v = view();
    if (!v || !settings.current.defaults.findCard) {
      foundRef.current = null;
      keepStrip(null);
      setFound(null);
      return null;
    }
    const { video, t, area } = v;
    const shown = toVideo(area, t);
    const x = Math.max(0, shown.x);
    const y = Math.max(0, shown.y);
    const search = {
      x,
      y,
      w: Math.min(video.videoWidth, shown.x + shown.w) - x,
      h: Math.min(video.videoHeight, shown.y + shown.h) - y,
    };
    let quad: Quad | null = null;
    try {
      quad = findCardIn(video, search);
    } catch {
      // Not found this time.
    }
    const last = foundRef.current;
    if (quad) {
      foundRef.current = {
        quad,
        seen: last && quadsAgree(last.quad, quad) ? last.seen + 1 : 1,
        missed: 0,
      };
    } else if (last && ++last.missed >= 2) {
      foundRef.current = null;
    }
    const kept = foundRef.current && foundRef.current.seen >= 2 ? foundRef.current.quad : null;
    if (!kept) {
      setFound(null);
      return null;
    }
    const onStage = (p: Pt) => {
      const s = fromVideo(p, t);
      return { x: s.x - area.x, y: s.y - area.y };
    };
    const q = {
      tl: onStage(kept.tl),
      tr: onStage(kept.tr),
      br: onStage(kept.br),
      bl: onStage(kept.bl),
    };
    const points = [q.tl, q.tr, q.br, q.bl]
      .map((p) => `${Math.round(p.x)},${Math.round(p.y)}`)
      .join(" ");
    setFound((prev) => (prev?.points === points ? prev : { points, box: quadBounds(q) }));
    return kept;
  }

  /** The card found in the view (D36), or the guide: for the photos. */
  function readRect(): Rect | null {
    const f = foundRef.current;
    return f && f.seen >= 2 ? quadBounds(f.quad) : cardInVideo();
  }

  // --- Catalog lookups ------------------------------------------------------

  async function post(url: string, body: object, cacheKey: string): Promise<ScanMatch[]> {
    const cache = readState.current.cache;
    const hit = cache.get(cacheKey);
    if (hit) return hit;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const matches: ScanMatch[] = res.ok ? (await res.json()).matches : [];
    cache.set(cacheKey, matches);
    return matches;
  }

  /**
   * The deck being filled, when the session's location is its box (D35). Its list then breaks
   * the ties: scanning a deck that's already written down, nearly every card is on it.
   */
  function currentDeckId(): string | null {
    const { defaults, locations } = settings.current;
    return locations.find((l) => l.id === defaults.lastLocationId)?.deckId ?? null;
  }

  function lookupLine(line: CollectorLine) {
    const { fixedSet } = settings.current;
    const deckId = currentDeckId();
    // The deck goes in the key too: changing where the session saves changes the answer.
    return post(
      "/api/scan/lookup",
      { line, fixedSet, deckId },
      JSON.stringify(["line", line, fixedSet, deckId]),
    );
  }

  function lookupName(name: string) {
    const { fixedSet } = settings.current;
    const deckId = currentDeckId();
    return post(
      "/api/scan/name",
      { name, fixedSet, deckId },
      JSON.stringify(["name", normalizeForSearch(name), fixedSet, deckId]),
    );
  }

  // --- Read loop -------------------------------------------------------------

  /** Records a read; returns how many times it appears among the last VOTE_WINDOW reads. */
  function vote(key: string | null) {
    const s = readState.current;
    s.votes.push(key);
    if (s.votes.length > VOTE_WINDOW) s.votes.shift();
    return key ? s.votes.filter((k) => k === key).length : 0;
  }

  function noRead() {
    const s = readState.current;
    vote(null);
    // The card left the frame: the same card may be added again, and its title no longer applies.
    // Not while a card is still found in the view (D36): one moving or catching the light reads
    // nothing for a moment, and was being added twice.
    if (++s.empty >= EMPTY_READS_TO_RELEASE) {
      if (foundRef.current) {
        s.heldBack = true;
      } else {
        s.holdId = null;
        s.lastTitle = null;
        // The card is gone: if it comes back and is ambiguous again, ask again.
        s.resolvedChoices = "";
        // Another card may be next: the AI gets one go at that one too.
        s.autoTried = false;
      }
    }
  }

  async function resolve(matches: ScanMatch[], lang: string | null, label: string) {
    const s = readState.current;
    if (!matches.length) {
      setStatus(`${label}, pero no encaja con ninguna carta.`);
      return;
    }
    if (matches.length > 1) {
      const key = matches.map((m) => m.id).join();
      // Already answered for this card, and it hasn't left the view yet: don't ask again. The
      // chooser used to come straight back after picking, because the next read finds the very
      // same candidates, and it looked as though the pick hadn't counted.
      if (key === s.resolvedChoices) {
        progress();
        return;
      }
      if (key !== s.choicesKey) {
        s.choicesKey = key;
        setChoices({ matches, lang });
        navigator.vibrate?.(30);
        setStatus("Varias cartas encajan: elige cuál es.");
      }
      return;
    }
    const match = matches[0];
    if (s.holdId === match.id) {
      // Still the card just added. Read again after going unread with the card still in view —
      // when it used to be added twice — say how to add another copy.
      progress();
      if (s.heldBack) setStatus(`«${match.name}» ya está añadida: si es otra copia, pulsa +.`);
      return;
    }
    s.holdId = match.id;
    s.votes = [];
    await add(match, lang);
  }

  /**
   * For albums with the name, not a number, on the front (D29): read the name where the album
   * prints it and offer the player's cards in the album, the plainest first.
   */
  async function readPrintedName(
    video: HTMLVideoElement,
    card: Rect,
    canvas: HTMLCanvasElement,
    layout: NameLayout,
  ) {
    const s = readState.current;
    captureName(
      video,
      stripRect(card, layout.strip),
      canvas,
      NAME_HEIGHT,
      layout.rotate,
      layout.invert,
    );
    const text = await ocr(canvas, "title");
    setLastText(`nombre: ${text.trim() || "—"}`);
    const name = parseTitle(text);
    if (name) s.lastTitle = name;
    const matches = name ? await lookupName(name) : [];
    if (name && matches.length) {
      s.empty = 0;
      setStatus(`Leyendo «${name}»…`);
      if (
        vote(
          `n:${matches
            .map((m) => m.id)
            .sort()
            .join()}`,
        ) >= VOTES_NEEDED
      ) {
        await resolve(byRarity(matches), null, `Leído «${name}»`);
      }
    } else {
      noRead();
    }
  }

  /** The shared photos' hashes (D33): of the fixed set, or of all. */
  async function loadPhotoHashes() {
    const { fixedSet } = settings.current;
    try {
      const query = fixedSet
        ? `?set=${encodeURIComponent(`${fixedSet.game}:${fixedSet.code}`)}`
        : "";
      const res = await fetch(`/api/scan/hashes${query}`);
      if (!res.ok) return;
      const { hashes } = (await res.json()) as { hashes: { id: string; hash: string }[] };
      photoHashesRef.current = new Map(hashes.map((p) => [p.id, p.hash]));
    } catch {
      // No recognition by photo this session; reading text still works.
    }
  }

  function lookupIds(ids: string[]) {
    return post("/api/scan/cards", { ids }, JSON.stringify(["ids", ids]));
  }

  /**
   * Recognises the card by its photo (D33): straightened, hashed and compared with the shared
   * photos. Any design, once someone has photographed the card. True if a photo matched.
   */
  async function readByImage(video: HTMLVideoElement, card: Rect) {
    const photos = photoHashesRef.current;
    if (!photos.size) return false;
    const pixels = cardInGuidePixels(video, card);
    if (!pixels) return false;
    const hash = cardHash(pixels.data, pixels.width, pixels.height);
    const match = bestMatch(
      hash,
      Array.from(photos, ([id, h]) => ({ id, hash: h })),
    );
    if (!match) return false;
    readState.current.empty = 0;
    setLastText(`foto: a ${match.distance} bits`);
    setStatus("Reconociendo por la foto…");
    if (vote(`img:${match.id}`) >= VOTES_NEEDED) {
      await resolve(await lookupIds([match.id]), null, "Reconocida por la foto");
    }
    return true;
  }

  async function tick() {
    if (!runningRef.current) return;
    // Looking at the history: don't add cards behind the user's back.
    if (settings.current.paused) {
      setTimeout(tick, TICK_MS);
      return;
    }
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const s = readState.current;
    const watch = stopwatch();
    const located = video && canvas && workerRef.current ? locateCard() : null;
    if (settings.current.defaults.findCard) watch.lap("buscar");
    // The «stuck» clock only runs while a card is found in view and no choices are on screen.
    if (!(foundRef.current && foundRef.current.seen >= 2) || s.choicesKey) progress();
    else if (performance.now() - s.progressAt > STUCK_MS) {
      setStuck(true);
      // «IA automática» (D31): the very moment that lights up the button, done for you instead.
      // identifyWithAi keeps the one-call-per-card flag and the rest of the guards.
      if (aiEnabled && settings.current.defaults.autoIdentify) void identifyWithAi({ auto: true });
    }
    // A found card that doesn't read may not be the card: then every other read is of the guide.
    const onCard = located && !(s.empty >= 3 && s.tick % 2 === 1) ? located : null;
    const card = onCard ? quadBounds(onCard) : cardInVideo();
    if (video && canvas && card && workerRef.current) {
      s.tick++;
      try {
        // Every third read, by the photo; the rest, by the text.
        const byImage = s.tick % 3 === 0 && (await readByImage(video, card));
        if (s.tick % 3 === 0) watch.lap("foto");
        if (byImage) {
          if (runningRef.current) setTimeout(tick, TICK_MS);
          return;
        }
        if (settings.current.nameLayout) {
          await readPrintedName(video, card, canvas, settings.current.nameLayout);
          if (runningRef.current) setTimeout(tick, TICK_MS);
          return;
        }
        // On a found card (D36) the number is on it, where the guide has it, or below it when
        // only its inner frame was found (a slinger): the strip that has read cards this
        // session, else each in turn.
        const foundStrip = onCard
          ? pickFoundStrip(s.foundStrip, s.stripMisses, s.stripTurn++)
          : null;
        const infoStrip = foundStrip ? FOUND_INFO_STRIPS[foundStrip] : INFO_STRIP;
        captureRegion(video, stripRect(card, infoStrip), canvas, INFO_HEIGHT);
        const text = await ocr(canvas, "info");
        watch.lap("número");
        const line = parseCollectorLine(text);
        if (foundStrip) s.stripMisses = line ? 0 : s.stripMisses + 1;
        if (line) {
          setLastText(text.trim());
          s.empty = 0;
          setStatus(`Leyendo ${describe(line)}…`);
          const key = `c:${canonicalNumber(line.number)}/${line.total ?? ""}/${line.setCodes[0] ?? ""}`;
          if (vote(key) >= VOTES_NEEDED) {
            const matches = await lookupLine(line);
            watch.lap("catálogo");
            // A line the catalog knows: this strip is where the cards' number is, for the session.
            if (foundStrip && matches.length) keepStrip(foundStrip);
            await resolve(matches, line.lang, `Leído ${describe(line)}`);
            watch.lap("añadir");
          }
        } else if (s.tick % 2 === 0) {
          // No collector line: try the title (old Magic frames, full arts, glare on the corner).
          captureRegion(video, stripRect(card, TITLE_STRIP), canvas, TITLE_HEIGHT);
          const titleText = await ocr(canvas, "title");
          watch.lap("título");
          setLastText(`${text.trim() || "—"}\ntítulo: ${titleText.trim() || "—"}`);
          const name = parseTitle(titleText);
          if (name) s.lastTitle = name;
          const matches = name ? await lookupName(name) : [];
          if (name) watch.lap("catálogo");
          if (name && matches.length) {
            s.empty = 0;
            setStatus(`Leyendo «${name}»…`);
            if (vote(`n:${matches.map((m) => m.id).join()}`) >= VOTES_NEEDED) {
              await resolve(matches, null, `Leído «${name}»`);
              watch.lap("añadir");
            }
          } else {
            noRead();
          }
        } else {
          setLastText(text.trim());
          noRead();
        }
      } catch (error) {
        console.error("[scan]", error);
      } finally {
        setTiming(watch.toString());
      }
    }
    if (runningRef.current) setTimeout(tick, TICK_MS);
  }

  // --- Adding and adjusting --------------------------------------------------

  async function add(match: ScanMatch, lang: string | null) {
    const { defaults, locations } = settings.current;
    const finish = finishFor(defaults.finish, match.finishes) as Finish;
    try {
      const r = await addItem({
        catalogCardId: match.id,
        quantity: 1,
        finish,
        condition: defaults.condition,
        // The card's own language code, when printed, beats the session default.
        language: lang ?? defaults.language,
        ...targetFor(defaults, locations),
        source: "scan",
      });
      // Forgets a deleted target; on a full divider, tells the user to put the next one in.
      if (!follow(r)) return;
      // A card without a catalog image: the one in the guide becomes everyone's (D30).
      if (!match.imageSmall) void contributePhoto(match.id);
      beep();
      navigator.vibrate?.(60);
      setChoices(null);
      readState.current.choicesKey = "";
      readState.current.lastTitle = null;
      readState.current.heldBack = false;
      progress();
      setEntries((list) => {
        const [top, ...rest] = list;
        if (top?.itemId === r.itemId) return [{ ...top, count: top.count + 1 }, ...rest];
        return [
          {
            key: crypto.randomUUID(),
            itemId: r.itemId,
            match,
            lang,
            count: 1,
            finish,
            addedAt: Date.now(),
          },
          ...list,
        ];
      });
      setStatus(
        r.advancedFrom && r.section
          ? `Separador «${r.advancedFrom}» lleno: pon el «${r.section.name}»`
          : `✓ ${match.name}`,
      );
    } catch {
      toast.error("No se ha podido añadir la carta.");
    }
  }

  /**
   * Saves a change to the session's copies. `show` puts it on screen at once, before the server
   * answers, and `undo` takes it back if saving fails: a tap that shows nothing gets tapped again.
   */
  async function mutate(fn: () => Promise<void>, show?: () => void, undo?: () => void) {
    show?.();
    setBusy(true);
    try {
      await fn();
    } catch {
      undo?.();
      toast.error("No se ha podido guardar el cambio.");
    } finally {
      setBusy(false);
    }
  }

  /** A session line's copies, `delta` more or fewer. */
  const shift = (key: string, delta: number) =>
    setEntries((list) => list.map((x) => (x.key === key ? { ...x, count: x.count + delta } : x)));

  const plusOne = (e: Entry) =>
    mutate(
      async () => {
        const { defaults, locations } = settings.current;
        const r = await addItem({
          catalogCardId: e.match.id,
          quantity: 1,
          finish: e.finish,
          condition: defaults.condition,
          language: e.lang ?? defaults.language,
          ...targetFor(defaults, locations),
          source: "scan",
        });
        if (!follow(r)) {
          shift(e.key, -1);
          return;
        }
        setEntries((list) => list.map((x) => (x.key === e.key ? { ...x, itemId: r.itemId } : x)));
      },
      () => shift(e.key, 1),
      () => shift(e.key, -1),
    );

  const minusOne = (e: Entry) =>
    mutate(
      async () => {
        await changeQuantity(e.itemId, -1);
        // The last copy of a line takes the line away: only once the server has done it.
        if (e.count <= 1) setEntries((list) => list.filter((x) => x.key !== e.key));
        if (readState.current.holdId === e.match.id) readState.current.holdId = null;
      },
      e.count > 1 ? () => shift(e.key, -1) : undefined,
      e.count > 1 ? () => shift(e.key, 1) : undefined,
    );

  const setFinish = (e: Entry, finish: Finish) =>
    mutate(async () => {
      if (e.finish === finish) return;
      const r = await changeFinish(e.itemId, e.count, finish);
      setEntries((list) =>
        list.map((x) => (x.key === e.key ? { ...x, itemId: r.itemId, finish } : x)),
      );
    });

  function choose(match: ScanMatch) {
    const lang = choices?.lang ?? null;
    // Remember that these candidates have been answered. The card is still in front of the
    // camera, so the next read turns up the same ones; `add` clears `choicesKey`, so that alone
    // wouldn't hold the chooser back. Forgotten when the card leaves the view (noRead), as
    // `holdId` is.
    readState.current.resolvedChoices = choices?.matches.map((m) => m.id).join() ?? "";
    setChoices(null);
    readState.current.holdId = match.id;
    readState.current.choicesKey = "";
    void add(match, lang);
  }

  /**
   * Shares a photo of the card in the guide for a card the catalog has no image for, unless
   * someone already did (D30). Runs in the background: a failure only means no photo yet.
   */
  async function contributePhoto(catalogCardId: string) {
    try {
      const video = videoRef.current;
      const card = readRect();
      if (!video || !card) return;
      const blob = await cardInGuideBlob(video, card);
      if (!blob) return;
      const form = new FormData();
      form.set("image", blob, "carta.jpg");
      form.set("catalogCardId", catalogCardId);
      form.set("source", "scan");
      form.set("onlyIfMissing", "1");
      const r = await saveCardPhoto(form);
      if (!r.saved || !r.url) return;
      // Recognised by this photo from the next card on (D33).
      if (r.hash) photoHashesRef.current.set(catalogCardId, r.hash);
      const url = r.url;
      // The session and the lookup cache show it from now on.
      setEntries((list) =>
        list.map((e) =>
          e.match.id === catalogCardId ? { ...e, match: { ...e.match, imageSmall: url } } : e,
        ),
      );
      for (const matches of readState.current.cache.values()) {
        for (const m of matches) if (m.id === catalogCardId) m.imageSmall = url;
      }
      toast.success("Foto guardada para esta carta: la verán todos.");
    } catch {
      // No photo this time; the next scan of this card will try again.
    }
  }

  /** The card in the guide, straightened (D32), PHOTO_HEIGHT px tall: for «Para luego» and the AI. */
  async function guidePhoto(): Promise<Blob | null> {
    const video = videoRef.current;
    const card = readRect();
    if (!video || !card) return null;
    return cardInGuideBlob(video, card, PHOTO_HEIGHT, 0.8);
  }

  /**
   * «Identificar con IA» (D31): the photo in the guide goes to Claude, and what it reads is
   * matched against the catalog. One match is added; several are offered, the likeliest first.
   */
  async function identifyWithAi({ auto = false } = {}) {
    if (identifying || !cardInVideo()) return;
    // An automatic call spends money without anyone asking for it: at most one per card, and
    // never on top of a choice already on screen. The flag is a ref, set before the first await,
    // because `identifying` is state and the read loop may hold a stale copy of it.
    if (auto && (readState.current.autoTried || readState.current.choicesKey)) return;
    readState.current.autoTried = true;
    setIdentifying(true);
    progress();
    setChoices(null);
    setStatus("Identificando con IA…");
    try {
      const blob = await guidePhoto();
      if (!blob) throw new Error("No photo");
      const form = new FormData();
      form.set("image", blob, "carta.jpg");
      form.set("fixedSet", JSON.stringify(settings.current.fixedSet));
      const res = await fetch("/api/scan/identify", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = body.error ?? "No se ha podido identificar la carta.";
        // Out of calls for today: stop asking on its own, or it retries on every card.
        if (res.status === 429 && settings.current.defaults.autoIdentify) {
          setDefaults({ autoIdentify: false });
          toast.error(`${message} He desactivado la IA automática.`);
        } else {
          toast.error(message);
        }
        setStatus(message);
        return;
      }
      const { reading, matches, remaining } = body as {
        reading: { isCard: boolean; name: string } | null;
        matches: ScanMatch[];
        remaining: number;
      };
      // Running out without noticing is worse in automatic mode: nobody is pressing anything.
      if (auto && remaining <= 10) toast(`Quedan ${remaining} identificaciones con IA hoy.`);
      const s = readState.current;
      if (!reading?.isCard) {
        setStatus("La IA no ve ninguna carta en el recuadro.");
        return;
      }
      s.lastTitle = reading.name;
      if (!matches.length) {
        setStatus(
          `La IA lee «${reading.name}», pero no está en el catálogo${settings.current.fixedSet ? " de esta expansión" : ""}.`,
        );
        return;
      }
      if (matches.length === 1) {
        // The card just added, identified again (a second tap): not a second copy.
        if (s.holdId === matches[0].id) {
          setStatus(`«${matches[0].name}» ya está añadida: si es otra copia, pulsa +.`);
          return;
        }
        s.holdId = matches[0].id;
        s.votes = [];
        await add(matches[0], null);
        return;
      }
      s.choicesKey = matches.map((m) => m.id).join();
      setChoices({ matches, lang: null });
      navigator.vibrate?.(30);
      setStatus(`La IA lee «${reading.name}». Elige cuál es: la más probable va primero.`);
    } catch {
      toast.error("No se ha podido identificar la carta.");
      setStatus("No se ha podido identificar la carta.");
    } finally {
      setIdentifying(false);
    }
  }

  /** «Para luego»: a photo of what's in the guide goes to the review queue (/review, D25). */
  async function saveForLater() {
    if (!cardInVideo()) return;
    setSaving(true);
    progress();
    try {
      const blob = await guidePhoto();
      if (!blob) throw new Error("No photo");

      const { defaults } = settings.current;
      const form = new FormData();
      form.set("image", blob, "carta.jpg");
      form.set("readText", lastText);
      form.set("guess", readState.current.lastTitle ?? "");
      form.set("finish", defaults.finish);
      form.set("condition", defaults.condition);
      form.set("language", defaults.language);
      const target = targetFor(defaults, settings.current.locations);
      form.set("locationId", target.locationId ?? "");
      form.set("sectionId", target.sectionId ?? "");
      form.set("collectionId", target.collectionId ?? "");
      const r = await savePendingScan(form);
      setPendingCount(r.pending);
      beep();
      navigator.vibrate?.(60);
      setStatus("Guardada para luego. Siguiente carta.");
    } catch {
      toast.error("No se ha podido guardar la foto.");
    } finally {
      setSaving(false);
    }
  }

  /**
   * Ends the session without doing anything else with it: clears the history and the running
   * total. The cards stay where they were added. Undoable.
   */
  function endSession() {
    const previous = entries;
    setEntries([]);
    setHistoryOpen(false);
    readState.current.holdId = null;
    toast("Sesión terminada. Las cartas siguen en Mis cartas, donde las añadiste.", {
      action: { label: "Deshacer", onClick: () => setEntries(previous) },
    });
  }

  /** After moving the session, its lines point at the stacks their copies ended up in. */
  function followMove(destinations: Record<string, string>) {
    setEntries((list) => list.map((e) => ({ ...e, itemId: destinations[e.itemId] ?? e.itemId })));
  }

  // --- Camera ---------------------------------------------------------------

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("La cámara solo funciona con HTTPS (o en localhost).");
      return;
    }
    setStarting(true);
    try {
      audio ??= new AudioContext();
      void audio.resume();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 3840 },
          height: { ideal: 2160 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      track
        ?.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] })
        .catch(() => {});
      const capabilities = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & {
        torch?: boolean;
      };
      setTorch({ supported: !!capabilities.torch, on: false });

      runningRef.current = true;
      setRunning(true);
      setStatus("Cargando el lector de texto…");
      await new Promise((r) => requestAnimationFrame(r));
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      await getWorker();
      void loadPhotoHashes();
      readState.current = {
        ...readState.current,
        votes: [],
        empty: 0,
        holdId: null,
        choicesKey: "",
        resolvedChoices: "",
        lastTitle: null,
        foundStrip: null,
      };
      setLockedStrip(null);
      setStatus("Encaja la carta en el recuadro, con buena luz.");
      void tick();
    } catch (error) {
      runningRef.current = false;
      setRunning(false);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const name = error instanceof DOMException ? error.name : "";
      toast.error(
        name === "NotAllowedError"
          ? "No hay permiso para usar la cámara."
          : name === "NotFoundError"
            ? "No se ha encontrado ninguna cámara."
            : "No se ha podido abrir la cámara.",
      );
    } finally {
      setStarting(false);
    }
  }

  function stop() {
    runningRef.current = false;
    setRunning(false);
    setChoices(null);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus("En pausa.");
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const on = !torch.on;
    try {
      await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
      setTorch((t) => ({ ...t, on }));
    } catch {
      toast.error("No se ha podido encender la linterna.");
    }
  }

  async function scanPhoto(file: File) {
    try {
      setStatus("Leyendo la foto…");
      const bitmap = await createImageBitmap(file);
      const canvas = photoCanvasRef.current!;
      // A photo of one card, cropped to it: the whole image is the card.
      const card = { x: 0, y: 0, w: bitmap.width, h: bitmap.height };
      const layout = settings.current.nameLayout;
      if (layout) {
        captureName(
          bitmap,
          stripRect(card, layout.strip),
          canvas,
          NAME_HEIGHT,
          layout.rotate,
          layout.invert,
        );
        const read = await ocr(canvas, "title");
        setLastText(`nombre: ${read.trim() || "—"}`);
        const name = parseTitle(read);
        const found = name ? await lookupName(name) : [];
        if (!found.length) {
          setStatus(
            "No he podido leer el nombre. Recorta la foto a la carta, por delante, y prueba otra vez.",
          );
          return;
        }
        setChoices({ matches: byRarity(found), lang: null });
        setStatus(`Leído «${name}»: confirma la carta.`);
        return;
      }
      captureRegion(bitmap, stripRect(card, INFO_STRIP), canvas, INFO_HEIGHT);
      const text = await ocr(canvas, "info");
      const line = parseCollectorLine(text);
      let matches: ScanMatch[] = [];
      let label = "";
      if (line) {
        matches = await lookupLine(line);
        label = describe(line);
      }
      if (!matches.length) {
        captureRegion(bitmap, stripRect(card, TITLE_STRIP), canvas, TITLE_HEIGHT);
        const name = parseTitle(await ocr(canvas, "title"));
        if (name) {
          matches = await lookupName(name);
          label = `«${name}»`;
        }
      }
      setLastText(text.trim());
      if (!matches.length) {
        setStatus(
          "No he podido identificar la carta. Recorta la foto a la carta y prueba otra vez.",
        );
        return;
      }
      setChoices({ matches, lang: line?.lang ?? null });
      setStatus(`Leído ${label}: confirma la carta.`);
    } catch {
      toast.error("No se ha podido leer la foto.");
    }
  }

  // --- Render ---------------------------------------------------------------

  const totals = sessionTotals(entries);
  const totalsText =
    `${totals.cards} ${totals.cards === 1 ? "carta" : "cartas"}, ${formatEur(totals.valueEur)}` +
    (totals.unpriced ? ` (${totals.unpriced} sin precio)` : "");
  // The session's own copies per stack: moving the session moves these, never older copies a
  // stack already had when a scan joined it.
  const sessionStacks = [
    ...entries.reduce(
      (acc, e) => acc.set(e.itemId, (acc.get(e.itemId) ?? 0) + e.count),
      new Map<string, number>(),
    ),
  ].map(([itemId, count]) => ({ itemId, count }));

  /** What to do with the session at the end: list it, store it somewhere, or just end it. */
  const sessionActions = (tone: "page" | "overlay") => (
    <div className="flex flex-wrap items-center gap-2">
      <AddFilteredToCollection
        collections={collections}
        filter={{ itemIds: sessionStacks.map((s) => s.itemId) }}
        label="A una colección"
      />
      <Button
        variant={tone === "overlay" ? "secondary" : "outline"}
        size="sm"
        onClick={() => setMovingSession(true)}
      >
        <MoveIcon />A una ubicación
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={tone === "overlay" ? "text-white hover:bg-white/15 hover:text-white" : undefined}
        onClick={endSession}
      >
        Terminar sesión
      </Button>
    </div>
  );
  const current = entries[0] ?? null;
  const guide = stage ? placeGuide({ x: 0, y: 0, w: stage.w, h: stage.h }, place) : null;

  // «Ajustar recuadro»: drag the guide to the card, pull its corner to size it, «Listo» saves.
  function startAdjust() {
    setToolsOpen(false);
    setDraftPlace(place);
    setAdjusting(true);
  }
  function cancelAdjust() {
    setAdjusting(false);
    setDraftPlace(null);
  }
  /** Saves the guide where it's drawn: kept inside the screen, whatever the finger did. */
  function finishAdjust() {
    if (guide && stage) {
      setDefaults({
        guideScale: clampGuideScale(place.scale),
        guideDx: (guide.x + guide.w / 2 - stage.w / 2) / stage.w,
        guideDy: (guide.y + guide.h / 2 - stage.h / 2) / stage.h,
      });
    }
    cancelAdjust();
  }
  function startDrag(e: React.PointerEvent, mode: "move" | "resize") {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { mode, x: e.clientX, y: e.clientY, start: place };
  }
  function dragGuide(e: React.PointerEvent) {
    const drag = dragRef.current;
    const el = stageRef.current;
    if (!drag || !stage || !el) return;
    if (drag.mode === "move") {
      setDraftPlace({
        ...drag.start,
        dx: drag.start.dx + (e.clientX - drag.x) / stage.w,
        dy: drag.start.dy + (e.clientY - drag.y) / stage.h,
      });
      return;
    }
    // Resizing from the corner, around the centre: as big as the finger is far from it.
    const g = placeGuide({ x: 0, y: 0, w: stage.w, h: stage.h }, drag.start);
    const full = guideRect(stage.w, stage.h, GUIDE_FILL);
    const r = el.getBoundingClientRect();
    const scale = Math.max(
      Math.abs(e.clientX - r.left - (g.x + g.w / 2)) / (full.w / 2),
      Math.abs(e.clientY - r.top - (g.y + g.h / 2)) / (full.h / 2),
    );
    setDraftPlace({ ...drag.start, scale: clampGuideScale(scale) });
  }
  function endDrag() {
    dragRef.current = null;
  }
  // The yellow strip marks what's read: on the card found in the view (D36), the strip that
  // reads it or, until one does, both; else on the guide.
  const onFound = !adjusting && found ? found.box : null;
  const readBox = onFound ?? guide;
  const foundInfo = lockedStrip
    ? FOUND_INFO_STRIPS[lockedStrip]
    : stripUnion(FOUND_INFO_STRIPS.card, FOUND_INFO_STRIPS.frame);
  const strip = readBox
    ? stripRect(readBox, nameLayout?.strip ?? (onFound ? foundInfo : INFO_STRIP))
    : null;
  const fixedCode = fixedSet?.code.toUpperCase();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Escanear</h1>

      <section className="bg-muted/40 space-y-3 rounded-lg border p-3" aria-label="Sesión">
        <EntryTarget collections={collections} locations={locations} />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Por defecto</span>
          <FinishSelect value={defaults.finish} onChange={(v) => setDefaults({ finish: v })} />
          <ConditionSelect
            value={defaults.condition}
            onChange={(v) => setDefaults({ condition: v })}
          />
          <LanguageSelect
            value={defaults.language}
            onChange={(v) => setDefaults({ language: v })}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Expansión fija</span>
          <SetPicker sets={sets} value={fixedSet} onChange={setFixedSet} />
        </div>
        <p className="text-muted-foreground text-xs">
          Con una expansión fija basta con leer el número o el nombre: ideal para una caja de la
          misma expansión o cartas sin código impreso (Magic anterior a 2014).
        </p>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="lg" onClick={start} disabled={starting}>
          <ScanLineIcon />
          {starting ? "Abriendo cámara…" : "Empezar a escanear"}
        </Button>
        <label className="hover:bg-muted inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-sm">
          <ImageUpIcon className="size-4" />
          Foto
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void scanPhoto(file);
              e.target.value = "";
            }}
          />
        </label>
        {!running && status && (
          <p className="text-muted-foreground text-sm" role="status">
            {status}
          </p>
        )}
        {pendingCount > 0 && (
          <Link href="/review" className="text-sm underline underline-offset-2">
            {pendingCount} por revisar
          </Link>
        )}
      </div>
      <canvas ref={photoCanvasRef} className="hidden" />

      {movingSession && (
        <MoveDialog
          stacks={sessionStacks}
          title="Guardar la sesión en una ubicación"
          description={`Se mueven solo las ${totals.cards} ${totals.cards === 1 ? "carta" : "cartas"} de esta sesión. Si en el destino ya hay copias iguales, se juntan.`}
          locations={locations}
          onClose={() => setMovingSession(false)}
          onMoved={followMove}
        />
      )}

      {!running && choices && (
        <ChoicesGrid
          matches={choices.matches}
          onChoose={choose}
          onDismiss={() => setChoices(null)}
        />
      )}

      {entries.length > 0 && (
        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-medium">En esta sesión: {totalsText}</h2>
              <p className="text-muted-foreground text-xs">
                Ya están en Mis cartas. Al acabar, añádelas a una colección, guárdalas en una
                ubicación o termina sin más.
              </p>
            </div>
            {sessionActions("page")}
          </div>
          <SessionList
            entries={entries}
            busy={busy}
            onMinus={minusOne}
            onPlus={plusOne}
            tone="page"
          />
        </section>
      )}

      <details className="rounded-lg border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          ¿No la reconoce? Búscala a mano
        </summary>
        <div className="pt-3">
          <QuickAdd locations={locations} collections={collections} />
        </div>
      </details>

      {/* Full-screen scanner, ManaBox-style: the camera fills the screen and every control floats
          over it, so nothing takes room from the guide or moves it. Always mounted: the read
          loop needs the video, stage and canvas refs. */}
      <div
        className={cn(
          "fixed inset-0 z-50 overflow-hidden bg-black text-white",
          !running && "hidden",
        )}
        role="dialog"
        aria-label="Escáner"
      >
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover"
        />

        {/* Where the guide goes: the whole screen but a band top and bottom for the floating
            bars, so it stays centred where the camera looks. */}
        <div
          ref={stageRef}
          className={cn(
            "pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)+4rem)] bottom-[calc(env(safe-area-inset-bottom)+4rem)]",
            // While adjusting, the guide and its handles go over everything but the adjust panel.
            adjusting && "z-20",
          )}
        >
          {guide && strip && (
            <>
              <div
                className={cn(
                  "absolute rounded-[4.5%] border-2",
                  adjusting
                    ? "border-primary pointer-events-auto cursor-move touch-none border-dashed shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
                    : found
                      ? "border-white/35" // the card is outlined where it is: the guide steps back
                      : "border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]",
                )}
                style={{ left: guide.x, top: guide.y, width: guide.w, height: guide.h }}
                onPointerDown={adjusting ? (e) => startDrag(e, "move") : undefined}
                onPointerMove={adjusting ? dragGuide : undefined}
                onPointerUp={adjusting ? endDrag : undefined}
                onPointerCancel={adjusting ? endDrag : undefined}
              >
                {/* A handle on each corner: whichever is free of the bars. Each sizes around the centre. */}
                {adjusting &&
                  [
                    "-left-4 -top-4 cursor-nwse-resize",
                    "-right-4 -top-4 cursor-nesw-resize",
                    "-left-4 -bottom-4 cursor-nesw-resize",
                    "-right-4 -bottom-4 cursor-nwse-resize",
                  ].map((corner) => (
                    <span
                      key={corner}
                      aria-hidden
                      className={cn(
                        "bg-primary absolute size-8 touch-none rounded-full ring-4 ring-black/40",
                        corner,
                      )}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        startDrag(e, "resize");
                      }}
                      onPointerMove={dragGuide}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                    />
                  ))}
              </div>
              <div
                className="border-primary absolute rounded border-2"
                style={{ left: strip.x, top: strip.y, width: strip.w, height: strip.h }}
              />
              {found && !adjusting && (
                <svg className="absolute inset-0 size-full overflow-visible" aria-hidden>
                  <polygon
                    points={found.points}
                    className="fill-emerald-400/10 stroke-emerald-400"
                    strokeWidth={3}
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </>
          )}
        </div>

        {/* Top: close, where the cards go, and the session. */}
        <div
          className={cn(
            "absolute inset-x-0 top-0 z-10 flex items-center gap-2 bg-gradient-to-b from-black/70 to-transparent px-3 pt-[max(env(safe-area-inset-top),0.75rem)] pb-4",
            adjusting && "hidden",
          )}
        >
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/15 hover:text-white"
            onClick={stop}
            aria-label="Cerrar escáner"
          >
            <XIcon />
          </Button>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium">
              {placeLabel(locationName, section && `${section.name} (${sectionFill(section)})`) ??
                "Sin ubicación"}
            </p>
            <p className="truncate text-xs text-white/70">
              {collectionName ? `y en «${collectionName}»` : "Sin colección"}
              {fixedCode && `, solo ${fixedCode}`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setHistoryOpen((open) => !open)}
            aria-expanded={historyOpen}
            aria-label={`Esta sesión: ${totalsText}. Ver el historial`}
            className="rounded-full bg-black/55 px-3 py-1 text-sm tabular-nums backdrop-blur hover:bg-black/70"
          >
            {totals.cards} ·{" "}
            <span className="text-primary font-semibold">{formatEur(totals.valueEur)}</span>
          </button>
        </div>

        {/* What the reader is doing, under the top bar. */}
        <p
          className={cn(
            "absolute top-[calc(max(env(safe-area-inset-top),0.75rem)+3.25rem)] left-1/2 z-10 max-w-[65%] -translate-x-1/2 truncate rounded-full bg-black/60 px-3 py-1 text-center text-xs",
            adjusting && "hidden",
          )}
          role="status"
          aria-live="polite"
        >
          {status}
        </p>

        {/* Right: the tools, one tap each. */}
        <div
          className={cn(
            "absolute top-[calc(max(env(safe-area-inset-top),0.75rem)+3.5rem)] right-3 z-10 flex flex-col items-center gap-1 rounded-full bg-black/55 p-1 backdrop-blur",
            adjusting && "hidden",
          )}
        >
          {torch.supported && (
            <ToolButton
              label={torch.on ? "Apagar linterna" : "Encender linterna"}
              pressed={torch.on}
              onClick={toggleTorch}
            >
              <FlashlightIcon />
            </ToolButton>
          )}
          {aiEnabled && (
            <ToolButton
              label={identifying ? "Identificando con IA…" : "Identificar con IA"}
              onClick={identifyWithAi}
              disabled={identifying}
              highlight={stuck}
            >
              {identifying ? <LoaderCircleIcon className="animate-spin" /> : <SparklesIcon />}
            </ToolButton>
          )}
          <ToolButton
            label={pendingCount ? `Para luego (${pendingCount} por revisar)` : "Para luego"}
            onClick={saveForLater}
            disabled={saving}
            badge={pendingCount}
            highlight={stuck && !aiEnabled}
          >
            {saving ? <LoaderCircleIcon className="animate-spin" /> : <ClockIcon />}
          </ToolButton>
          <ToolButton
            label="Ajustes del escáner"
            pressed={toolsOpen}
            onClick={() => setToolsOpen((open) => !open)}
          >
            <SlidersHorizontalIcon />
          </ToolButton>
        </div>

        {/* Stuck on a card: says which of the lit-up tools to try. It never calls the AI itself. */}
        {stuck && !toolsOpen && !adjusting && (
          <p
            role="status"
            className="absolute top-[calc(max(env(safe-area-inset-top),0.75rem)+3.5rem)] right-17 z-10 max-w-48 rounded-xl bg-black/80 px-3 py-2 text-sm backdrop-blur"
          >
            {!aiEnabled
              ? "¿No la reconoce? Guárdala para luego."
              : defaults.autoIdentify
                ? "No la reconoce: la está mirando la IA."
                : "¿No la reconoce? Pruébala con la IA."}
          </p>
        )}

        {toolsOpen && (
          <div className="absolute top-[calc(max(env(safe-area-inset-top),0.75rem)+3.5rem)] right-17 z-10 w-60 space-y-2.5 rounded-2xl bg-black/80 p-3 text-sm backdrop-blur">
            <button
              type="button"
              className="w-full rounded-lg bg-white/10 px-3 py-1.5 text-left hover:bg-white/20"
              onClick={startAdjust}
            >
              Ajustar recuadro
            </button>
            <p className="text-xs text-white/60">
              Muévelo y cámbialo de tamaño hasta que coincida con la carta, por ejemplo en un card
              slinger. Se recuerda en este móvil.
            </p>
            <button
              type="button"
              role="switch"
              aria-checked={defaults.findCard}
              className="flex w-full items-center justify-between rounded-lg bg-white/10 px-3 py-1.5 text-left hover:bg-white/20"
              onClick={() => setDefaults({ findCard: !defaults.findCard })}
            >
              Buscar la carta
              <span
                className={cn("text-xs", defaults.findCard ? "text-emerald-400" : "text-white/50")}
              >
                {defaults.findCard ? "Sí" : "No"}
              </span>
            </button>
            <p className="text-xs text-white/60">
              La busca en toda la imagen y la marca en verde. Si no la encuentra, lee el recuadro.
            </p>
            {aiEnabled && (
              <>
                <button
                  type="button"
                  role="switch"
                  aria-checked={defaults.autoIdentify}
                  className="flex w-full items-center justify-between rounded-lg bg-white/10 px-3 py-1.5 text-left hover:bg-white/20"
                  onClick={() => setDefaults({ autoIdentify: !defaults.autoIdentify })}
                >
                  IA automática
                  <span
                    className={cn(
                      "text-xs",
                      defaults.autoIdentify ? "text-emerald-400" : "text-white/50",
                    )}
                  >
                    {defaults.autoIdentify ? "Sí" : "No"}
                  </span>
                </button>
                <p className="text-xs text-white/60">
                  Cuando el lector se atasque con una carta, la manda sola a la IA en vez de esperar
                  a que pulses. Una vez por carta, y cuesta dinero: hay un límite de 150 al día.
                </p>
              </>
            )}
            <button
              type="button"
              className="w-full rounded-lg bg-white/10 px-3 py-1.5 text-left hover:bg-white/20"
              onClick={() => setShowDebug((v) => !v)}
            >
              {showDebug ? "Ocultar lo que lee" : "Ver lo que lee"}
            </button>
          </div>
        )}

        {showDebug && (
          <div className="absolute top-[calc(max(env(safe-area-inset-top),0.75rem)+5.5rem)] left-3 z-10 max-w-[55%] space-y-1 rounded-lg bg-black/70 p-2">
            <canvas ref={canvasRef} className="max-h-16 max-w-full rounded bg-white" />
            <pre className="max-h-24 overflow-auto text-[10px] text-white/80">
              {lastText || "—"}
            </pre>
            {timing && <p className="text-[10px] text-white/60 tabular-nums">{timing}</p>}
          </div>
        )}
        {/* The read loop needs the canvas even when the debug view is hidden. */}
        {!showDebug && <canvas ref={canvasRef} className="hidden" />}

        {adjusting && (
          <div className="absolute inset-x-3 top-[max(env(safe-area-inset-top),0.75rem)] z-30 space-y-2 rounded-2xl bg-black/80 p-3 backdrop-blur">
            <p className="text-sm">
              Arrastra el recuadro hasta la carta y tira de cualquier esquina para cambiar su
              tamaño. La lectura está en pausa.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={finishAdjust}>
                Listo
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-white hover:bg-white/15 hover:text-white"
                onClick={() => setDraftPlace(DEFAULT_GUIDE)}
              >
                Restablecer
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-white hover:bg-white/15 hover:text-white"
                onClick={cancelAdjust}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {/* Bottom, floating: the choices when a read is ambiguous, and the last card added. */}
        <div
          className={cn(
            "absolute inset-x-3 bottom-[max(env(safe-area-inset-bottom),0.75rem)] z-10 space-y-2",
            adjusting && "hidden",
          )}
        >
          {choices && (
            <div className="space-y-1.5 rounded-2xl bg-black/75 p-2 backdrop-blur">
              <div className="flex items-center justify-between px-1">
                <p className="text-sm font-medium">¿Cuál es?</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-white hover:bg-white/15 hover:text-white"
                  onClick={() => setChoices(null)}
                >
                  Ninguna
                </Button>
              </div>
              <ul className="flex gap-2 overflow-x-auto pb-1">
                {choices.matches.map((m) => (
                  <li key={m.id} className="w-14 shrink-0">
                    <button
                      type="button"
                      onClick={() => choose(m)}
                      className="w-full text-left text-[10px]"
                    >
                      <CardThumb
                        src={m.imageSmall}
                        alt={m.name}
                        label={`#${m.collectorNumber}`}
                        size="sm"
                        className="w-full!"
                      />
                      <p className="mt-1 truncate text-white/80">
                        {gameById(m.game)?.hasMarketPrices === false
                          ? choiceCaption(m)
                          : `${m.setCode.toUpperCase()} #${m.collectorNumber}`}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {location && section && (
            <NextSectionButton locationId={location.id} sectionId={section.id} className="w-full" />
          )}
          <div className="rounded-2xl bg-black/65 px-3 py-2 backdrop-blur">
            {current ? (
              <CurrentCard
                entry={current}
                busy={busy}
                onFinish={(f) => setFinish(current, f)}
                onPlus={() => plusOne(current)}
                onMinus={() => minusOne(current)}
              />
            ) : (
              <p className="py-1 text-center text-sm text-white/80">
                {nameLayout
                  ? "El nombre del jugador, por delante, dentro del marco amarillo."
                  : "El número, abajo a la izquierda, dentro del marco amarillo."}
              </p>
            )}
          </div>
        </div>

        {historyOpen && (
          <div className="absolute inset-0 z-20 flex flex-col bg-neutral-950/95 pt-[max(env(safe-area-inset-top),0.75rem)] pb-[max(env(safe-area-inset-bottom),0.75rem)]">
            <div className="flex items-start justify-between gap-3 px-4 pt-3 pb-2">
              <div className="min-w-0">
                <p className="font-semibold">Esta sesión</p>
                <p className="text-sm text-white/70">{totalsText}</p>
                <p className="text-xs text-white/50">La lectura está en pausa mientras miras.</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setHistoryOpen(false)}>
                Seguir escaneando
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {entries.length ? (
                <SessionList
                  entries={entries}
                  busy={busy}
                  onMinus={minusOne}
                  onPlus={plusOne}
                  tone="overlay"
                />
              ) : (
                <p className="px-4 py-8 text-center text-sm text-white/60">
                  Aún no has añadido nada en esta sesión.
                </p>
              )}
            </div>
            {entries.length > 0 && (
              <div className="border-t border-white/10 px-4 py-3">{sessionActions("overlay")}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** The last card added, in one floating row: its finish in one tap (it cycles), and −/+ copies. */
function CurrentCard({
  entry,
  busy,
  onFinish,
  onPlus,
  onMinus,
}: {
  entry: Entry;
  busy: boolean;
  onFinish: (finish: Finish) => void;
  onPlus: () => void;
  onMinus: () => void;
}) {
  const { match } = entry;
  const labels = gameById(match.game)?.finishLabels ?? FINISH_LABELS;
  const finishes = FINISH_ORDER.filter((f) => match.finishes.includes(f));
  const nextFinish = finishes[(finishes.indexOf(entry.finish) + 1) % finishes.length];
  const price = entryUnitPrice(entry);

  return (
    <div className="flex items-center gap-2.5">
      <CardThumb
        src={match.imageSmall}
        alt={match.name}
        size="xs"
        foil={entry.finish !== "nonfoil"}
      />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-sm font-semibold">{match.name}</p>
        <p className="truncate text-xs text-white/70">
          {match.setCode.toUpperCase()} #{match.collectorNumber}
          {entry.lang && (
            <>
              {" · "}
              <LanguageFlag code={entry.lang} />
            </>
          )}
          {" · "}
          <span className="text-primary tabular-nums">{formatEur(price)}</span>
        </p>
      </div>
      {finishes.length > 1 && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onFinish(nextFinish)}
          className="shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium hover:bg-white/25 disabled:opacity-50"
          aria-label={`Acabado: ${labels[entry.finish]}. Cambiar a ${labels[nextFinish]}`}
        >
          {labels[entry.finish]}
        </button>
      )}
      <div className="flex shrink-0 items-center">
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-white hover:bg-white/15 hover:text-white"
          disabled={busy}
          onClick={onMinus}
          aria-label="Una copia menos"
        >
          <MinusIcon />
        </Button>
        <span className="w-6 text-center font-semibold tabular-nums">{entry.count}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-white hover:bg-white/15 hover:text-white"
          disabled={busy}
          onClick={onPlus}
          aria-label="Una copia más"
        >
          <PlusIcon />
        </Button>
      </div>
    </div>
  );
}

/** The session's history, newest first: when, what, its value, and −/+ to fix counts. */
function SessionList({
  entries,
  busy,
  onMinus,
  onPlus,
  tone,
}: {
  entries: Entry[];
  busy: boolean;
  onMinus: (e: Entry) => void;
  onPlus: (e: Entry) => void;
  /** "overlay" inside the full-screen camera, "page" on the scan page. */
  tone: "page" | "overlay";
}) {
  const overlay = tone === "overlay";
  const muted = overlay ? "text-white/60" : "text-muted-foreground";
  const buttonClass = overlay ? "text-white hover:bg-white/15 hover:text-white" : undefined;
  return (
    <ul className={cn("divide-y", overlay ? "divide-white/10" : "rounded-md border")}>
      {entries.map((e) => {
        const unit = entryUnitPrice(e);
        return (
          <li key={e.key} className="flex items-center gap-3 px-3 py-2">
            <CardThumb src={e.match.imageSmall} alt="" size="xs" foil={e.finish !== "nonfoil"} />
            <div className="min-w-0 flex-1 text-sm">
              <p className="truncate font-medium">{e.match.name}</p>
              <p className={cn("truncate text-xs", muted)}>
                {e.addedAt ? `${clock.format(e.addedAt)} · ` : ""}
                {e.match.setCode.toUpperCase()} #{e.match.collectorNumber} ·{" "}
                {(gameById(e.match.game)?.finishLabels ?? FINISH_LABELS)[e.finish]}
                {e.lang && (
                  <>
                    {" · "}
                    <LanguageFlag code={e.lang} />
                  </>
                )}
              </p>
            </div>
            <span className="text-right text-sm tabular-nums">
              <span className="text-primary block font-semibold">
                {unit == null ? "—" : formatEur(unit * e.count)}
              </span>
              {e.count > 1 && <span className={cn("block text-xs", muted)}>×{e.count}</span>}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              className={buttonClass}
              disabled={busy}
              onClick={() => onMinus(e)}
              aria-label="Quitar una"
            >
              <MinusIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className={buttonClass}
              disabled={busy}
              onClick={() => onPlus(e)}
              aria-label="Otra copia"
            >
              <PlusIcon />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

function ChoicesGrid({
  matches,
  onChoose,
  onDismiss,
}: {
  matches: ScanMatch[];
  onChoose: (m: ScanMatch) => void;
  onDismiss: () => void;
}) {
  return (
    <section className="border-primary space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">¿Cuál es?</h2>
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Ninguna
        </Button>
      </div>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {matches.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => onChoose(m)}
              className="hover:bg-muted w-full space-y-1 rounded-md p-1 text-left text-xs"
            >
              <CardThumb
                src={m.imageSmall}
                alt={m.name}
                label={`#${m.collectorNumber}`}
                size="md"
                className="w-full!"
              />
              <p className="truncate font-medium">{m.name}</p>
              <p className="text-muted-foreground truncate">
                {choiceCaption(m)} · #{m.collectorNumber}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A round button of the scanner's right column; `badge` counts something (cards to review). */
function ToolButton({
  label,
  onClick,
  disabled,
  pressed,
  badge,
  highlight,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** For toggles (torch, settings): whether it's on. */
  pressed?: boolean;
  badge?: number;
  /** The one to try now (a card the reader is stuck on): ringed in gold, pulsing. */
  highlight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={cn(
        "relative flex size-11 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15 disabled:opacity-50 [&_svg]:size-5",
        pressed && "bg-white/25",
        highlight && "bg-primary/25 ring-primary ring-2 motion-safe:animate-pulse",
      )}
    >
      {children}
      {!!badge && (
        <span className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 min-w-4 rounded-full px-1 text-center text-[10px] leading-4 tabular-nums">
          {badge}
        </span>
      )}
    </button>
  );
}
