import { describe, expect, it } from "vitest";
import { preferListed } from "./prefer";

const card = (id: string, oracleId: string | null) => ({ id, oracleId });

describe("preferListed", () => {
  it("picks the one card the deck lists, so an ambiguous read stops asking", () => {
    const matches = [card("a", "sol-ring"), card("b", "arcane-signet"), card("c", "mind-stone")];
    expect(preferListed(matches, new Set(["arcane-signet"]))).toEqual([card("b", "arcane-signet")]);
  });

  it("puts the deck's cards first when several of them fit, without losing the rest", () => {
    const matches = [card("a", "one"), card("b", "two"), card("c", "three")];
    expect(preferListed(matches, new Set(["two", "three"]))).toEqual([
      card("b", "two"),
      card("c", "three"),
      card("a", "one"),
    ]);
  });

  it("leaves the read alone when the deck lists none of the candidates", () => {
    const matches = [card("a", "one"), card("b", "two")];
    expect(preferListed(matches, new Set(["other"]))).toBe(matches);
  });

  it("leaves a single candidate and an empty list alone", () => {
    const one = [card("a", "one")];
    expect(preferListed(one, new Set(["one"]))).toBe(one);
    const two = [card("a", "one"), card("b", "two")];
    expect(preferListed(two, new Set())).toBe(two);
  });

  it("ignores cards with no oracle id (football, D29)", () => {
    const matches = [card("a", null), card("b", null)];
    expect(preferListed(matches, new Set(["one"]))).toBe(matches);
  });
});
