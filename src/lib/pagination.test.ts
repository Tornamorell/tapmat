import { describe, expect, it } from "vitest";
import { pageNumbers } from "./pagination";

describe("pageNumbers", () => {
  it("shows them all while they fit", () => {
    expect(pageNumbers(1, 1)).toEqual([1]);
    expect(pageNumbers(2, 3)).toEqual([1, 2, 3]);
  });

  it("keeps the first and the last, with a gap in between", () => {
    expect(pageNumbers(6, 12)).toEqual([1, null, 5, 6, 7, null, 12]);
  });

  it("doesn't leave a gap standing in for a single page", () => {
    // "1 … 3 4 5 6" would hide only page 2, and the gap takes the same room: show the number.
    expect(pageNumbers(4, 6)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("works at both ends", () => {
    expect(pageNumbers(1, 8)).toEqual([1, 2, null, 8]);
    expect(pageNumbers(8, 8)).toEqual([1, null, 7, 8]);
  });

  it("takes a wider window when asked", () => {
    expect(pageNumbers(6, 12, 2)).toEqual([1, null, 4, 5, 6, 7, 8, null, 12]);
  });

  it("copes with a page out of range or nonsense", () => {
    expect(pageNumbers(99, 3)).toEqual([1, 2, 3]);
    expect(pageNumbers(0, 3)).toEqual([1, 2, 3]);
    expect(pageNumbers(Number.NaN, 3)).toEqual([1, 2, 3]);
  });

  it("has nothing to show without pages", () => {
    expect(pageNumbers(1, 0)).toEqual([]);
  });
});
