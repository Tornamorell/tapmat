import type { TcgdexCard, TcgdexCardBrief, TcgdexSet, TcgdexSetBrief } from "./types";

const API = "https://api.tcgdex.net/v2";
const HEADERS = { "User-Agent": "Tapmat/0.1", Accept: "application/json" };
const RETRIES = 4;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * GET with retries on 429/5xx/network errors (exponential backoff). Returns null on 404.
 * TCGdex documents no rate limit; keep concurrency modest (see scripts/sync-pokemon.ts).
 */
async function getJson<T>(path: string): Promise<T | null> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(`${API}${path}`, { headers: HEADERS });
      if (res.status === 404) return null;
      if (res.ok) return (await res.json()) as T;
      if (res.status !== 429 && res.status < 500) {
        throw new Error(`TCGdex ${res.status} ${res.statusText} for ${path}`);
      }
      if (attempt >= RETRIES) throw new Error(`TCGdex ${res.status} after retries for ${path}`);
    } catch (error) {
      if (attempt >= RETRIES) throw error;
    }
    await sleep(1000 * 2 ** attempt);
  }
}

async function getRequired<T>(path: string): Promise<T> {
  const data = await getJson<T>(path);
  if (data == null) throw new Error(`TCGdex 404 for ${path}`);
  return data;
}

export const listSets = (lang = "en") => getRequired<TcgdexSetBrief[]>(`/${lang}/sets`);

export const getSet = (id: string) => getRequired<TcgdexSet>(`/en/sets/${encodeURIComponent(id)}`);

export const getCard = (id: string) => getJson<TcgdexCard>(`/en/cards/${encodeURIComponent(id)}`);

/** Brief list (id + name) of every card in a language — one request. */
export const listCards = (lang: string) => getRequired<TcgdexCardBrief[]>(`/${lang}/cards`);

/**
 * Whether an asset really is there. `res.ok` is not enough: the asset host answers **200 with a
 * 295-byte HTML page** for anything it hasn't got — checked on 2026-09-16 with made-up paths like
 * `/univ/me/noexiste/symbol` — so trusting the status alone stores a link to that page instead of
 * an image. The content type has to be an image.
 */
export async function assetExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD", headers: { "User-Agent": HEADERS["User-Agent"] } });
    return res.ok && (res.headers.get("content-type") ?? "").toLowerCase().startsWith("image/");
  } catch {
    return false;
  }
}
