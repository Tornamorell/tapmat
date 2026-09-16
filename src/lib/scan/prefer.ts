/**
 * Preferring a deck's list while scanning into its box (D35).
 *
 * Scanning a deck that's already written down is the common case: the owner pastes the list and
 * then scans the cards into the box. So when the catalog answers a read with several cards, the
 * list says which one it almost certainly is — and a read that would have stopped to ask
 * resolves on its own.
 *
 * Pure, so it can be tested; the set of cards comes from `deckOracleIds()`.
 */
export function preferListed<T extends { oracleId: string | null }>(
  matches: T[],
  listed: ReadonlySet<string>,
): T[] {
  // With one candidate there is nothing to choose, and with no list nothing to choose it by.
  if (!listed.size || matches.length < 2) return matches;
  const inList = matches.filter((m) => m.oracleId !== null && listed.has(m.oracleId));
  if (!inList.length) return matches;
  // Exactly one candidate is in the deck: that's the card, so don't ask.
  if (inList.length === 1) return inList;
  // Several are: keep them all, the deck's first, and let the picture decide.
  const rest = matches.filter((m) => !inList.includes(m));
  return [...inList, ...rest];
}
