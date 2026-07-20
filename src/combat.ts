// Combat engine — ported from scripts/battle/{combatant,damage_calculator,turn_queue}.gd
import { ABIL, STATUS, START_INVENTORY, statsAtLevel, equipBonus, type AbilityDef, type EquipSet, type StatKey, type StatusDef, type UnitDef } from "./data";

export interface StatusInstance { def: StatusDef; turns: number; }

export type Side = "party" | "enemy";

export interface CombatantOpts { level?: number; hp?: number; mp?: number; bnd?: number; equip?: EquipSet; }

export class Combatant {
  def: UnitDef;
  id: string;
  name: string;
  side: Side;
  isParty: boolean;
  theme: string;
  level: number;
  maxHp: number; hp: number;
  maxMp: number; mp: number;
  stats: Record<StatKey, number>;
  bnd?: number;
  abilities: string[];
  weaknesses: string[]; resistances: string[]; immunities: string[]; absorbs: string[];
  ai?: string;
  buffs: StatusInstance[] = [];
  debuffs: StatusInstance[] = [];
  elementOverride = "";
  provokeSource: Combatant | null = null;
  alive = true;
  phased = false; // boss phase-2 triggered?
  // --- boss mechanic state (see BossMechanic in data.ts) ---
  rageStacks = 0;      // rage: compounding stat stacks applied so far
  pressure = 0;        // pressure: the boss's own turns charged toward an unleash
  pressureArmed = false; // pressure: telegraphed last turn -> erupts this turn
  tickCounter = 0; tickRate = 0;
  slot: number;

  constructor(def: UnitDef, side: Side, slot: number, opts: CombatantOpts = {}) {
    this.def = def;
    this.id = def.id; this.name = def.name; this.side = side; this.isParty = side === "party";
    this.theme = def.theme;
    this.level = opts.level ?? def.level ?? 1;
    const s = statsAtLevel(def, this.level);
    const eb = equipBonus(opts.equip);
    this.maxHp = s.maxHp + eb.hp; this.hp = opts.hp != null ? Math.min(opts.hp, this.maxHp) : this.maxHp;
    this.maxMp = s.maxMp + eb.mp; this.mp = opts.mp != null ? Math.min(opts.mp, this.maxMp) : this.maxMp;
    this.stats = { ATK: s.ATK + eb.ATK, DEF: s.DEF + eb.DEF, MAG: s.MAG + eb.MAG, SPD: s.SPD + eb.SPD, LCK: s.LCK + eb.LCK };
    this.bnd = opts.bnd ?? def.bnd;
    this.abilities = [...def.abilities]; // copy so per-battle changes never mutate the shared def
    this.weaknesses = def.weaknesses ?? [];
    this.resistances = def.resistances ?? [];
    this.immunities = def.immunities ?? [];
    this.absorbs = def.absorbs ?? [];
    this.ai = def.ai;
    this.slot = slot;
  }

  effStat(stat: StatKey): number {
    let mult = 1.0;
    for (const b of this.buffs) if (b.def.stat === stat) mult += b.def.magnitude;
    for (const d of this.debuffs) if (d.def.stat === stat) mult -= d.def.magnitude;
    if (mult < 0.1) mult = 0.1;
    return Math.max(1, Math.floor(this.stats[stat] * mult));
  }

  hasStatus(id: string): boolean {
    return this.buffs.some((b) => b.def.id === id) || this.debuffs.some((d) => d.def.id === id);
  }
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const has = (list: string[], v: string) => list.includes(v);
const clampf = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface CalcResult { damage: number; healing: number; crit: boolean; label: string; }

export class Battle {
  party: Combatant[] = [];
  enemies: Combatant[] = [];
  inventory: Record<string, number> = { ...START_INVENTORY };
  canEscape = true;

  constructor(party: Combatant[], enemies: Combatant[], opts: { canEscape?: boolean; inventory?: Record<string, number> } = {}) {
    this.party = party;
    this.enemies = enemies;
    for (const c of this.all()) c.tickCounter = 100 / Math.max(1, c.effStat("SPD"));
    this.canEscape = opts.canEscape ?? true;
    this.inventory = opts.inventory ?? { ...START_INVENTORY };
  }

  all(): Combatant[] { return [...this.enemies, ...this.party]; }
  living(side: Side): Combatant[] {
    return (side === "party" ? this.party : this.enemies).filter((c) => c.alive);
  }
  sideWiped(side: Side): boolean { return this.living(side).length === 0; }
  findParty(id: string): Combatant | undefined { return this.party.find((c) => c.id === id); }

  bndMult(id?: string): number {
    if (!id) return 1.0;
    const c = this.findParty(id);
    return 1.0 + ((c?.bnd ?? 0) / 100);
  }

  // ---- formulas (damage_calculator.gd) ----
  elementMult(element: string, target: Combatant): number {
    if (element === "") return 1.0;
    if (has(target.absorbs, element)) return -1.0;
    if (has(target.immunities, element)) return 0.0;
    if (has(target.weaknesses, element)) return 1.5;
    if (has(target.resistances, element)) return 0.5;
    return 1.0;
  }
  static effLabel(m: number): string {
    if (m <= -0.1) return "ABSORB";
    if (m < 0.1) return "IMMUNE";
    if (m < 0.8) return "RESIST";
    if (m > 1.2) return "WEAK";
    return "";
  }
  rollCrit(s: Combatant): boolean { return Math.random() < 0.05 + s.effStat("LCK") * 0.005; }
  rollHit(s: Combatant): boolean {
    return Math.random() < clampf(0.95 + s.effStat("LCK") * 0.005, 0.3, 1.0);
  }
  private resolveElement(s: Combatant, ab: AbilityDef): string {
    if (s.elementOverride !== "") { const e = s.elementOverride; s.elementOverride = ""; return e; }
    return ab.element ?? "";
  }

  calc(source: Combatant, target: Combatant, ab: AbilityDef): CalcResult {
    if (ab.effect === "healing") {
      let raw = source.effStat("MAG") * (ab.power ?? 1) + (ab.flatBonus ?? 0);
      if (ab.scalesBnd) raw *= this.bndMult(ab.scalesBnd);
      raw *= rand(0.95, 1.05);
      return { damage: 0, healing: Math.max(1, Math.floor(raw)), crit: false, label: "" };
    }
    if (ab.effect !== "physical" && ab.effect !== "magical")
      return { damage: 0, healing: 0, crit: false, label: "" };

    let raw: number;
    const ignore = ab.ignoresDefense ?? 0;
    if (ab.effect === "physical") {
      raw = source.effStat("ATK") * (ab.power ?? 1) - target.effStat("DEF") * (1 - ignore);
    } else {
      const term = (target.effStat("DEF") * 0.3 + target.effStat("MAG") * 0.3) * (1 - ignore);
      raw = source.effStat("MAG") * (ab.power ?? 1) - term;
    }
    const elem = this.resolveElement(source, ab);
    const em = this.elementMult(elem, target);
    const label = Battle.effLabel(em);
    if (em < 0) return { damage: 0, healing: Math.max(1, Math.floor(Math.abs(raw) * Math.abs(em))), crit: false, label };
    raw *= em;
    raw *= rand(0.9, 1.1);
    const crit = this.rollCrit(source);
    if (crit) raw *= 1.5;
    let dmg = Math.max(1, Math.floor(raw));
    if (em === 0) dmg = 0;
    return { damage: dmg, healing: 0, crit, label };
  }

  // ---- status ----
  applyStatus(target: Combatant, statusId: string, source: Combatant) {
    const def = STATUS[statusId];
    if (!def) return;
    const pool = def.cat === "buff" ? target.buffs : target.debuffs;
    const existing = pool.find((e) => e.def.id === statusId);
    if (existing) { existing.turns = def.dur; }
    else {
      // Godot status_manager.gd caps active statuses (max 6 buffs / 4 debuffs);
      // drop the oldest when full so stat multipliers can't be stacked indefinitely.
      const cap = def.cat === "buff" ? 6 : 4;
      if (pool.length >= cap) pool.shift();
      pool.push({ def, turns: def.dur });
    }
    if (statusId === "provoked") target.provokeSource = source;
  }
  // Start-of-turn DoT / regen. Returns events for the UI to animate.
  startOfTurnEffects(c: Combatant): { amount: number; kind: "poison" | "regen" }[] {
    const out: { amount: number; kind: "poison" | "regen" }[] = [];
    for (const e of [...c.buffs, ...c.debuffs]) {
      const amt = e.def.flat ?? 0;
      if (e.def.tick === "poison") { this.takeDamage(c, amt); out.push({ amount: amt, kind: "poison" }); }
      else if (e.def.tick === "regen") { this.heal(c, amt); out.push({ amount: amt, kind: "regen" }); }
    }
    return out;
  }
  isSilenced(c: Combatant): boolean {
    return [...c.buffs, ...c.debuffs].some((e) => e.def.blocksMagic);
  }
  // Boss phase change at 50% HP — applies stat multipliers once. Returns the flavour line.
  maybePhase(c: Combatant): string | null {
    if (c.phased || !c.def.phaseAt50 || !c.alive || c.hp > c.maxHp * 0.5) return null;
    c.phased = true;
    const m = c.def.phaseAt50.mult;
    (Object.keys(m) as StatKey[]).forEach((k) => { c.stats[k] = Math.round(c.stats[k] * (m[k] as number)); });
    return c.def.phaseAt50.line;
  }

  // ---- boss "gimmick" mechanics (BossMechanic in data.ts) ----
  // Reflect: after `target` takes MAGICAL damage, bounce a fraction back onto the attacker,
  // unless the hit's element pierces (the boss's weakness). Returns the reflected amount (0 = none).
  reflectFor(attacker: Combatant, target: Combatant, ab: AbilityDef, dealt: number): number {
    const m = target.def.mechanic;
    if (!m || m.kind !== "reflect" || !target.alive) return 0;
    if (ab.effect !== "magical" || dealt <= 0 || !attacker.alive) return 0;
    if (m.pierce.includes(ab.element ?? "")) return 0; // e.g. fire/light burn through the Mirror
    const back = Math.max(1, Math.floor(dealt * m.pct));
    this.takeDamage(attacker, back);
    return back;
  }

  // Run at the start of a boss's action. Advances rage/pressure and reports what to narrate:
  //  - line: flavour banner to show (rage tick, pressure telegraph, or eruption)
  //  - forceAbility: an ability id the AI must use this turn (the pressure unleash)
  bossTurnStart(c: Combatant): { line?: string; forceAbility?: string } {
    const m = c.def.mechanic;
    if (!m || !c.alive) return {};
    if (m.kind === "rage") {
      // enrage only once wounded past the halfway mark; compound the stat each turn to a cap
      if (c.hp <= c.maxHp * 0.5 && c.rageStacks < m.maxStacks) {
        c.rageStacks++;
        c.stats[m.stat] = Math.round(c.stats[m.stat] * (1 + m.perTurn));
        return { line: m.line };
      }
    } else if (m.kind === "pressure") {
      if (c.pressureArmed) { c.pressureArmed = false; c.pressure = 0; return { line: m.line, forceAbility: m.ability }; }
      c.pressure++;
      if (c.pressure >= m.charge) { c.pressureArmed = true; return { line: m.telegraph }; }
    }
    return {};
  }
  escapeChance(): number {
    const avg = (arr: Combatant[]) => { const a = arr.filter((u) => u.alive); return a.length ? a.reduce((s, u) => s + u.effStat("SPD"), 0) / a.length : 0; };
    return clampf(0.5 + (avg(this.party) - avg(this.enemies)) * 0.05, 0.15, 0.95);
  }

  tickStatuses(c: Combatant) {
    for (let i = c.buffs.length - 1; i >= 0; i--) { if (--c.buffs[i].turns <= 0) c.buffs.splice(i, 1); }
    for (let i = c.debuffs.length - 1; i >= 0; i--) {
      const id = c.debuffs[i].def.id;
      if (--c.debuffs[i].turns <= 0) { if (id === "provoked") c.provokeSource = null; c.debuffs.splice(i, 1); }
    }
  }
  takeDamage(c: Combatant, amount: number) {
    c.hp = Math.max(0, c.hp - amount);
    if (c.hp <= 0) { c.alive = false; c.buffs = []; c.debuffs = []; c.provokeSource = null; }
  }
  heal(c: Combatant, amount: number) { if (c.alive) c.hp = Math.min(c.maxHp, c.hp + amount); }

  // ---- turn queue (turn_queue.gd) ----
  private recalcRates() { for (const c of this.all()) c.tickRate = 100 / Math.max(1, c.effStat("SPD")); }
  nextActor(): Combatant | null {
    this.recalcRates();
    let best: Combatant | null = null, bestC = Infinity;
    for (const c of this.all()) if (c.alive && c.tickCounter < bestC) { bestC = c.tickCounter; best = c; }
    if (!best) return null;
    for (const c of this.all()) if (c.alive) c.tickCounter -= bestC;
    best.tickCounter = best.tickRate;
    return best;
  }
  preview(count: number): Combatant[] {
    const alive = this.all().filter((c) => c.alive);
    const ctr = new Map<Combatant, number>();
    const rate = new Map<Combatant, number>();
    for (const c of alive) { ctr.set(c, c.tickCounter); rate.set(c, 100 / Math.max(1, c.effStat("SPD"))); }
    const out: Combatant[] = [];
    for (let i = 0; i < count; i++) {
      let best: Combatant | null = null, bc = Infinity;
      for (const c of alive) { const v = ctr.get(c)!; if (v < bc) { bc = v; best = c; } }
      if (!best) break;
      for (const c of alive) ctr.set(c, ctr.get(c)! - bc);
      ctr.set(best, rate.get(best)!);
      out.push(best);
    }
    return out;
  }

  targetsFor(actor: Combatant, ab: AbilityDef): Combatant[] {
    const foes: Side = actor.side === "party" ? "enemy" : "party";
    switch (ab.target) {
      case "single_enemy": case "all_enemies": return this.living(foes);
      case "single_ally": case "all_allies": return this.living(actor.side);
      default: return [actor];
    }
  }
}

export { ABIL };
