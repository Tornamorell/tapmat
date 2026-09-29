import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCromosRepesList, toAlbumCards, type AlbumConfig } from "./cromosrepes";

const config: AlbumConfig = {
  releasedAt: "2025-08-06",
  editions: { II: "2025-09-12", III: "2025-10-23" },
  teams: {
    RMA: "Real Madrid CF",
    BAR: "FC Barcelona",
    ATC: "Athletic Club",
    RSO: "Real Sociedad de Fútbol",
  },
};

const sample = `
check_box
Serie Élite (y Paralelas)
4 faltas
·1 ELI Bellingham RMA
1
·1 ELI-POWER Bellingham RMA *

disabled_by_default

check_box
Deportivo Alavés
·19 Escudo
·21 BIS Raúl Fernández (II)
·21 Owono (Baja)

check_box
Nuevas Máster Rookie
·516 Gorrotxategi RSO (III)

check_box
Serie Special One Black
·4 SPECIAL ONE BLAK Lamine Yamal BAR *
·10 NUEVA SPECIAL ONE BLACK Rashford BAR (III)

check_box
Ediciones Limitadas
·EDL 01 Cubarsí BAR (Top Revelación) Starter Pack

check_box
Autógrafo Original
·AO 13 CARD AUTÓGRAFO ORIGINAL - Sancet ATC *

check_box
Índices
·Trading Cards Editados 2ª Edición (Checklist Cartas BIS) (1) (II)
`;

describe("parseCromosRepesList", () => {
  it("reads sections, items and the user's marks, skipping page chrome", () => {
    const items = parseCromosRepesList(sample);
    expect(items).toHaveLength(11);
    expect(items[0]).toEqual({
      section: "Serie Élite (y Paralelas)",
      label: "1 ELI Bellingham RMA",
      marked: 0,
    });
    expect(items[1]).toMatchObject({ label: "1 ELI-POWER Bellingham RMA *", marked: 1 });
    expect(items[2].section).toBe("Deportivo Alavés");
  });
});

describe("toAlbumCards", () => {
  const cards = toAlbumCards(parseCromosRepesList(sample), config);
  const byNumber = Object.fromEntries(cards.map((c) => [c.collectorNumber, c]));

  it("numbers parallels, BIS and the special series apart", () => {
    expect(cards.map((c) => c.collectorNumber)).toEqual([
      "1",
      "1-POWER",
      "19",
      "21-BIS",
      "21",
      "516",
      "SOB-4",
      "SOB-10",
      "EDL-01",
      "AO-13",
      "CHK-1",
    ]);
  });

  it("takes the series as rarity and the team from its code or its page", () => {
    expect(byNumber["1-POWER"]).toMatchObject({
      name: "Bellingham",
      rarity: "élite power",
      team: "Real Madrid CF",
    });
    expect(byNumber["19"]).toMatchObject({
      name: "Escudo Deportivo Alavés",
      rarity: "escudo",
      team: "Deportivo Alavés",
    });
    expect(byNumber["21-BIS"]).toMatchObject({
      name: "Raúl Fernández",
      rarity: "bis",
      team: "Deportivo Alavés",
    });
    expect(byNumber["21"]).toMatchObject({ name: "Owono (Baja)", rarity: "básica" });
    expect(byNumber["516"]).toMatchObject({
      name: "Gorrotxategi",
      rarity: "master rookie",
      team: "Real Sociedad de Fútbol",
    });
    expect(byNumber["SOB-4"]).toMatchObject({
      name: "Lamine Yamal",
      rarity: "special one black",
      team: "FC Barcelona",
    });
    expect(byNumber["EDL-01"]).toMatchObject({
      name: "Cubarsí (Top Revelación) Starter Pack",
      team: "FC Barcelona",
    });
    expect(byNumber["AO-13"]).toMatchObject({
      name: "Sancet",
      rarity: "autógrafo original",
      team: "Athletic Club",
    });
    expect(byNumber["CHK-1"]).toMatchObject({ rarity: "checklist" });
  });

  it("dates each card by its edition mark", () => {
    expect(byNumber["1"].releasedAt).toBe("2025-08-06");
    expect(byNumber["21-BIS"].releasedAt).toBe("2025-09-12");
    expect(byNumber["SOB-10"].releasedAt).toBe("2025-10-23");
  });

  it("imports the whole Megacracks 2025-26 list with unique numbers", () => {
    const text = readFileSync(
      join(__dirname, "../../../data/albums/liga-2025-26-megacracks.txt"),
      "utf8",
    );
    const all = toAlbumCards(parseCromosRepesList(text), config);
    expect(all).toHaveLength(717);
    expect(new Set(all.map((c) => c.collectorNumber)).size).toBe(717);
    // The stored list carries no personal marks.
    expect(all.every((c) => c.marked === 0)).toBe(true);
  });

  it("leaves out a slot CromosRepes hasn't named yet", () => {
    // A bare "·21" is a player's card with no name printed on the list yet: it stays out of the
    // catalog until the name arrives. On its own fixture on purpose — this used to be checked
    // against the 2026-27 album file, and the check died the day CromosRepes named them.
    const unnamed = `
check_box
Deportivo Alavés
·19 Escudo
·21
·22 Jonny
`;
    const cards = toAlbumCards(parseCromosRepesList(unnamed), config);
    expect(cards.map((c) => c.collectorNumber)).toEqual(["19", "22"]);
  });

  it("imports the whole Megacracks 2026-27 list, with its second edition", () => {
    const dir = join(__dirname, "../../../data/albums");
    const meta = JSON.parse(
      readFileSync(join(dir, "liga-2026-27-megacracks.json"), "utf8"),
    ) as AlbumConfig;
    const text = readFileSync(join(dir, "liga-2026-27-megacracks.txt"), "utf8");
    const all = toAlbumCards(parseCromosRepesList(text), meta);
    const by = Object.fromEntries(all.map((c) => [c.collectorNumber, c]));

    expect(all).toHaveLength(646);
    expect(new Set(all.map((c) => c.collectorNumber)).size).toBe(all.length);
    // Named in the list read on 2026-09-28, and dated by their "(II)" mark.
    expect(by["21"]).toMatchObject({ name: "Adrián Rodríguez", releasedAt: "2026-09-21" });
    expect(by["25-BIS"]).toMatchObject({ name: "Garcés", rarity: "bis", releasedAt: "2026-09-21" });
    expect(by["451"]).toMatchObject({ name: "Cucurella", rarity: "nuevo fichaje" });
    expect(by["12"]).toMatchObject({
      name: "Nico Williams",
      rarity: "élite",
      team: "Athletic Club",
    });
    expect(by["379-POWER"]).toMatchObject({
      name: "Abde",
      rarity: "enjoy power",
      team: "Real Betis Balompié",
    });
    expect(by["430"]).toMatchObject({
      name: "Zidane",
      rarity: "stars on 25",
      team: "Real Madrid CF",
    });
    expect(by["425-POWER"]).toMatchObject({
      name: "Varios Jugadores",
      rarity: "stars on 25 power",
    });
    expect(by["408-POWER"]).toMatchObject({
      name: "Carlos Espí",
      rarity: "master rookie power",
      team: "Levante UD",
    });
    expect(by["JUST-1"]).toMatchObject({
      name: "Cristiano Ronaldo",
      rarity: "just 25",
      team: "Real Madrid CF",
    });
    expect(by["SOC-VAL"]).toMatchObject({ rarity: "special one champions", team: "Valencia CF" });
    expect(by["EDL-02"]).toMatchObject({ name: "Lamine Yamal Starter Pack", team: "FC Barcelona" });
    // The «Índices» section came with the second edition; before it there were none.
    expect(all.filter((c) => c.rarity === "checklist")).toHaveLength(2);
  });
});
