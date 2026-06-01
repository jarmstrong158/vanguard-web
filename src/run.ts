// Run / meta-game state: a sequence of encounters, persistent party progression,
// inventory, and save/load to localStorage.
import { PARTY_DEFS, START_INVENTORY, statsAtLevel, type EquipSet, type UnitDef } from "./data";

export interface PartyState { id: string; level: number; xp: number; hp: number; mp: number; bnd: number; equip: EquipSet; }
export interface RunState { node: number; party: PartyState[]; inventory: Record<string, number>; marks: number; }

export interface EncounterDef { name: string; enemies: string[]; boss?: boolean; escape?: boolean; }

export const RUN: EncounterDef[] = [
  { name: "Marsh Ambush", enemies: ["marsh_slime", "marsh_slime"] },
  { name: "Thornwall Wolves", enemies: ["thornwall_wolf", "thornwall_wolf"] },
  { name: "Militia Patrol", enemies: ["thornwall_militia", "thornwall_wolf", "marsh_slime"] },
  { name: "Marsh Horde", enemies: ["marsh_slime", "marsh_slime", "thornwall_wolf"] },
  { name: "Wolf Pack", enemies: ["thornwall_wolf", "thornwall_wolf", "thornwall_militia"] },
  { name: "Captain Rhogar", enemies: ["captain_rhogar"], boss: true, escape: false },
];

const SAVE_KEY = "vanguard.save.v1";

export function defForParty(id: string): UnitDef { return PARTY_DEFS.find((d) => d.id === id)!; }

export function newRun(): RunState {
  return {
    node: 0,
    party: PARTY_DEFS.map((d) => {
      const s = statsAtLevel(d, 1);
      return { id: d.id, level: 1, xp: 0, hp: s.maxHp, mp: s.maxMp, bnd: d.bnd ?? 0, equip: {} as EquipSet };
    }),
    inventory: { ...START_INVENTORY },
    marks: 0,
  };
}

export function saveRun(r: RunState) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(r)); } catch { /* ignore */ } }
export function loadRun(): RunState | null { try { const s = localStorage.getItem(SAVE_KEY); return s ? (JSON.parse(s) as RunState) : null; } catch { return null; } }
export function hasSave(): boolean { return !!loadRun(); }
export function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } }

export function xpToNext(level: number): number { return 40 + level * 20; }

// Apply pending XP, leveling up (and +1 BND per level). Returns levels gained.
export function applyLevels(ps: PartyState): number {
  let gained = 0;
  while (ps.xp >= xpToNext(ps.level) && ps.level < 30) { ps.xp -= xpToNext(ps.level); ps.level++; ps.bnd = Math.min(100, ps.bnd + 1); gained++; }
  return gained;
}

// Full rest: restore HP/MP to current-level maxima.
export function restParty(r: RunState) {
  for (const ps of r.party) {
    const s = statsAtLevel(defForParty(ps.id), ps.level);
    ps.hp = s.maxHp; ps.mp = s.maxMp;
  }
}

// module-singleton "current run"
let current: RunState | null = null;
export function getRun(): RunState { if (!current) current = newRun(); return current; }
export function setRun(r: RunState) { current = r; }

// debug hook
if (typeof window !== "undefined") (window as unknown as { VG: unknown }).VG = { getRun, setRun, newRun, RUN };
