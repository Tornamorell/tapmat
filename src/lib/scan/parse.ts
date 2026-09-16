/**
 * Parsing of what the scanner OCRs on a card. Pure functions; the catalog lookups that
 * validate the result live in src/lib/queries/scan.ts.
 *
 * The info strip in the bottom-left corner (see docs/scanner.md):
 *   Magic 2023+    "U 0001"     / "MKM • EN  ✎ Artist"
 *   Magic 2014-22  "001/280 C"  / "M20 • EN  ✎ Artist"
 *   Pokémon SV+    "G [PAL EN] 001/193 ●"
 *   Pokémon older  "F 001/195 ●"            (no set code: resolved via the printed total)
 * When it can't be read, the title is the fallback (parseTitle).
 */

const LANGS: Record<string, string> = {
  EN: "en",
  ES: "es",
  SP: "es",
  FR: "fr",
  DE: "de",
  IT: "it",
  PT: "pt",
  JA: "ja",
  JP: "ja",
  KO: "ko",
  KR: "ko",
  RU: "ru",
  ZHS: "zhs",
  ZHT: "zht",
  CS: "zhs",
  CT: "zht",
};

export interface CollectorLine {
  /** As printed: "0001", "107", "001". */
  number: string;
  /** The total after the slash, when printed. */
  total: string | null;
  /** Possible set codes, most likely first. Validated against the catalog. */
  setCodes: string[];
  /** Our language code, when the card prints one ("EN", "ES"…). */
  lang: string | null;
}

const isCode = (t: string) => /^[A-Z0-9]{3,5}$/.test(t) && /[A-Z]/.test(t);

// Letters OCR mistakes for digits.
const DIGIT_FIX: Record<string, string> = { O: "0", D: "0", Q: "0", I: "1", L: "1", S: "5", B: "8", Z: "2" };

/** "0O1" → "001", "I93" → "193"; a 4-char "L001" is a stray glyph + "001". */
function fixDigits(s: string): string {
  const trimmed = s.length === 4 && /^[A-Z]/.test(s) ? s.slice(1) : s;
  return trimmed.replace(/[ODQILSBZ]/g, (c) => DIGIT_FIX[c]);
}

export function parseCollectorLine(raw: string): CollectorLine | null {
  const text = raw
    .toUpperCase()
    .replace(/[•·∙●*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    // Repair number/total shapes with letters in them, if they're mostly digits already.
    .replace(/\b([0-9ODQILSBZ]{1,4}) ?\/ ?([0-9ODQILSBZ]{2,4})\b/g, (match, a: string, b: string) =>
      (a + b).replace(/\D/g, "").length >= 2 ? `${fixDigits(a)}/${fixDigits(b)}` : match,
    );
  const tokens = text.split(" ");

  const codes: string[] = [];
  let lang: string | null = null;

  // "MKM EN", "PAL EN": a code right before a language code.
  for (let i = 1; i < tokens.length; i++) {
    if (LANGS[tokens[i]] && isCode(tokens[i - 1])) {
      lang ??= LANGS[tokens[i]];
      codes.push(tokens[i - 1]);
    }
  }

  let number: string | null = null;
  let total: string | null = null;
  const withTotal = /(\d{1,4}) ?\/ ?(\d{2,4})/.exec(text);
  if (withTotal) {
    number = withTotal[1];
    total = withTotal[2];
    // "PAL 001/193": a code right before the number.
    const before = text.slice(0, withTotal.index).trim().split(" ").pop();
    if (before && isCode(before)) codes.push(before);
  } else if (codes.length) {
    // "U 0001" (Magic 2023+) only counts when a set code was read too — a lone number is noise.
    number = /\b(\d{3,4})\b/.exec(text)?.[1] ?? null;
  }
  if (!number) return null;

  // OCR glues stray glyphs in front of codes ("BPAL" for "PAL") and swaps O/0 ("M2O"):
  // try the tails and both spellings. The catalog decides which one exists.
  const setCodes = [
    ...new Set(
      codes
        .flatMap((c) => [c, c.slice(-4), c.slice(-3)])
        .flatMap((c) => [c, c.replace(/O/g, "0"), c.replace(/0/g, "O")]),
    ),
  ].filter(isCode);

  return { number, total, setCodes, lang };
}

/** Collector-number spellings to try: "0001" → "0001", "1", "001". */
export function numberVariants(number: string): string[] {
  const stripped = number.replace(/^0+(?=\d)/, "");
  return [...new Set([number, stripped, stripped.padStart(3, "0")])];
}

/**
 * The one spelling that identifies a number, for comparing two reads: "0001", "001" and "1" are
 * the same card. Not `numberVariants()[1]`, which is undefined for a number without leading
 * zeros ("107", "285"), so every such read compared equal to every other one.
 */
export function canonicalNumber(number: string): string {
  return number.replace(/^0+(?=\d)/, "");
}

/** Two reads describe the same card. */
export function sameLine(a: CollectorLine | null, b: CollectorLine | null): boolean {
  return (
    !!a &&
    !!b &&
    canonicalNumber(a.number) === canonicalNumber(b.number) &&
    a.total === b.total &&
    a.setCodes[0] === b.setCodes[0]
  );
}

// Words printed around a card's name that aren't part of it (Pokémon stage badges, HP).
const TITLE_NOISE = new Set([
  "BASIC",
  "STAGE",
  "STAGE1",
  "STAGE2",
  "EVOLVES",
  "FROM",
  "HP",
  "PS",
  "PV",
  "BASICO",
  "FASE",
  "TRAINER",
  "ENERGY",
]);

/**
 * Cleans an OCR'd title line into a searchable name, or null if there's too little of it.
 * The catalog lookup is fuzzy (trigrams), so small OCR errors are fine.
 */
export function parseTitle(raw: string): string | null {
  const words = raw
    .split(/\s+/)
    // Trailing commas are part of Magic names ("Sheoldred, the Apocalypse"); stray leading
    // punctuation isn't.
    .map((w) => w.replace(/[^A-Za-zÀ-ÿ'’,-]/g, "").replace(/^[,'’-]+|['’-]+$/g, ""))
    .filter((w) => w.length >= 2 && !TITLE_NOISE.has(w.toUpperCase()));
  const name = words.join(" ");
  return name.replace(/[^A-Za-zÀ-ÿ]/g, "").length >= 4 ? name : null;
}
