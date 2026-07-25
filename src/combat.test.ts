/**
 * Tests for the combat rules.
 *
 * vanguard-web had no tests. The Phaser scenes need a browser and a canvas and
 * are not tested here; combat.ts and data.ts are pure and hold the rules that
 * decide whether a fight is winnable, which is the part that can be wrong
 * without looking wrong.
 *
 * Damage rolls call Math.random, so it is stubbed per-test rather than left to
 * chance — a flaky rules test is worse than none, because it teaches you to
 * re-run instead of read.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Battle, Combatant } from "./combat";
import { statsAtLevel, equipBonus } from "./data";
import type { UnitDef, AbilityDef } from "./data";

const unit = (over: Partial<UnitDef> = {}): UnitDef =>
  ({
    id: "t", name: "T", theme: "x", level: 1,
    hp: 100, mp: 20, ATK: 20, DEF: 10, MAG: 20, SPD: 10, LCK: 0,
    abilities: [], weaknesses: [], resistances: [], immunities: [], absorbs: [],
    ...over,
  } as UnitDef);

const physical = (over: Partial<AbilityDef> = {}): AbilityDef =>
  ({ id: "hit", name: "Hit", effect: "physical", power: 1, cost: 0, ...over } as AbilityDef);

let battle: Battle;

beforeEach(() => {
  // Pin every roll to its midpoint so damage is a function of the stats only.
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  battle = new Battle([new Combatant(unit(), "party", 0)], [new Combatant(unit(), "enemy", 0)]);
});
afterEach(() => vi.restoreAllMocks());

describe("Combatant construction", () => {
  it("clamps supplied hp to the maximum", () => {
    const c = new Combatant(unit({ hp: 50 }), "party", 0, { hp: 9999 });
    expect(c.hp).toBe(c.maxHp);
  });

  it("copies the ability list so per-battle changes cannot leak into the shared def", () => {
    const def = unit({ abilities: ["a"] });
    const c = new Combatant(def, "party", 0);
    c.abilities.push("b");
    expect(def.abilities).toEqual(["a"]);
  });

  it("applies level growth through statsAtLevel", () => {
    const def = unit({ growth: { hp: 10, mp: 1, ATK: 2, DEF: 1, MAG: 1, SPD: 1, LCK: 0 } } as Partial<UnitDef>);
    const c = new Combatant(def, "party", 0, { level: 5 });
    expect(c.maxHp).toBe(statsAtLevel(def, 5).maxHp);
    expect(c.stats.ATK).toBe(statsAtLevel(def, 5).ATK);
  });

  it("adds equipment bonuses on top of level stats", () => {
    const def = unit();
    const bare = new Combatant(def, "party", 0);
    const armed = new Combatant(def, "party", 0, { equip: { weapon: "iron_sword" } as any });
    expect(armed.stats.ATK - bare.stats.ATK).toBe(equipBonus({ weapon: "iron_sword" } as any).ATK);
  });
});

describe("effStat", () => {
  it("returns the base stat with no statuses", () => {
    const c = new Combatant(unit({ ATK: 30 }), "party", 0);
    expect(c.effStat("ATK")).toBe(30);
  });

  it("never drops below a 0.1 multiplier however many debuffs stack", () => {
    const c = new Combatant(unit({ ATK: 100 }), "party", 0);
    for (let i = 0; i < 10; i++) {
      c.debuffs.push({ def: { id: `d${i}`, stat: "ATK", magnitude: 0.5, cat: "debuff" } as any, turns: 3 });
    }
    // 1 - 5.0 would be deeply negative; the floor turns it into 0.1x, not a heal.
    expect(c.effStat("ATK")).toBe(Math.max(1, Math.floor(100 * 0.1)));
  });

  it("never returns less than 1", () => {
    const c = new Combatant(unit({ ATK: 1 }), "party", 0);
    c.debuffs.push({ def: { id: "d", stat: "ATK", magnitude: 0.9, cat: "debuff" } as any, turns: 3 });
    expect(c.effStat("ATK")).toBeGreaterThanOrEqual(1);
  });

  it("ignores statuses targeting a different stat", () => {
    const c = new Combatant(unit({ ATK: 30, DEF: 30 }), "party", 0);
    c.buffs.push({ def: { id: "b", stat: "DEF", magnitude: 1.0, cat: "buff" } as any, turns: 3 });
    expect(c.effStat("ATK")).toBe(30);
  });
});

describe("elemental multipliers", () => {
  const hitWith = (targetDef: Partial<UnitDef>, element = "fire") => {
    const src = new Combatant(unit({ ATK: 100 }), "party", 0);
    const tgt = new Combatant(unit({ DEF: 0, ...targetDef }), "enemy", 0);
    return battle.calc(src, tgt, physical({ element } as Partial<AbilityDef>));
  };

  it("weakness increases damage over neutral", () => {
    expect(hitWith({ weaknesses: ["fire"] }).damage)
      .toBeGreaterThan(hitWith({}).damage);
  });

  it("resistance reduces damage below neutral", () => {
    expect(hitWith({ resistances: ["fire"] }).damage)
      .toBeLessThan(hitWith({}).damage);
  });

  it("immunity deals exactly zero, not the usual minimum of one", () => {
    // The damage floor is Math.max(1, ...), so without the explicit
    // `if (em === 0) dmg = 0` an immune target still takes chip damage every
    // hit — which reads as "immunity is nearly working" and is worse than a
    // visible bug.
    expect(hitWith({ immunities: ["fire"] }).damage).toBe(0);
  });

  it("absorption heals the target and deals no damage", () => {
    const r = hitWith({ absorbs: ["fire"] });
    expect(r.damage).toBe(0);
    expect(r.healing).toBeGreaterThan(0);
  });

  it("absorb takes precedence over weakness on the same element", () => {
    const r = hitWith({ absorbs: ["fire"], weaknesses: ["fire"] });
    expect(r.healing).toBeGreaterThan(0);
    expect(r.damage).toBe(0);
  });

  it("immunity takes precedence over weakness", () => {
    expect(hitWith({ immunities: ["fire"], weaknesses: ["fire"] }).damage).toBe(0);
  });
});

describe("damage floor", () => {
  it("a hit that computes to zero or less still does at least 1", () => {
    const weak = new Combatant(unit({ ATK: 1 }), "party", 0);
    const tank = new Combatant(unit({ DEF: 9999 }), "enemy", 0);
    const r = battle.calc(weak, tank, physical());
    expect(r.damage).toBeGreaterThanOrEqual(1);
  });

  it("ignoresDefense raises damage against the same target", () => {
    const src = new Combatant(unit({ ATK: 100 }), "party", 0);
    const tgt = new Combatant(unit({ DEF: 50 }), "enemy", 0);
    const normal = battle.calc(src, tgt, physical());
    const piercing = battle.calc(src, tgt, physical({ ignoresDefense: 1 } as Partial<AbilityDef>));
    expect(piercing.damage).toBeGreaterThan(normal.damage);
  });
});

describe("healing abilities", () => {
  const heal = physical({ effect: "healing", power: 2 } as Partial<AbilityDef>);

  it("produces healing and no damage", () => {
    const src = new Combatant(unit({ MAG: 40 }), "party", 0);
    const tgt = new Combatant(unit(), "party", 1);
    const r = battle.calc(src, tgt, heal);
    expect(r.damage).toBe(0);
    expect(r.healing).toBeGreaterThan(0);
  });

  it("scales with the caster's MAG", () => {
    const tgt = new Combatant(unit(), "party", 1);
    const weak = battle.calc(new Combatant(unit({ MAG: 10 }), "party", 0), tgt, heal);
    const strong = battle.calc(new Combatant(unit({ MAG: 100 }), "party", 0), tgt, heal);
    expect(strong.healing).toBeGreaterThan(weak.healing);
  });

  it("always heals at least 1", () => {
    const src = new Combatant(unit({ MAG: 0 }), "party", 0);
    const tgt = new Combatant(unit(), "party", 1);
    expect(battle.calc(src, tgt, heal).healing).toBeGreaterThanOrEqual(1);
  });
});

describe("statsAtLevel", () => {
  it("level 1 is the base stat line", () => {
    const def = unit({ hp: 100, ATK: 20 });
    const s = statsAtLevel(def, 1);
    expect(s.maxHp).toBe(100);
    expect(s.ATK).toBe(20);
  });

  it("growth compounds linearly with level", () => {
    const def = unit({ hp: 100, growth: { hp: 10, mp: 0, ATK: 0, DEF: 0, MAG: 0, SPD: 0, LCK: 0 } } as Partial<UnitDef>);
    expect(statsAtLevel(def, 3).maxHp).toBe(120);
  });

  it("a def with no growth block does not produce NaN", () => {
    const s = statsAtLevel(unit(), 10);
    for (const v of Object.values(s)) expect(Number.isFinite(v)).toBe(true);
  });
});
