// Vanguard combat data — ported faithfully from the Godot project's .tres files.
// Stats, abilities, and formulas match docs/design/combat_design.md.

export type StatKey = "ATK" | "DEF" | "MAG" | "SPD" | "LCK";
export type Effect = "physical" | "magical" | "healing" | "buff" | "debuff";
export type Target = "single_enemy" | "single_ally" | "all_allies" | "all_enemies" | "self";

export interface StatusDef {
  id: string;
  name: string;
  cat: "buff" | "debuff";
  stat: StatKey | "";
  magnitude: number; // 0.25 = +25%
  dur: number;
  tick?: "poison" | "regen";   // start-of-turn HP change
  flat?: number;               // HP per tick for poison/regen
  blocksMagic?: boolean;       // silence
}

export interface AbilityDef {
  id: string;
  name: string;
  mp: number;
  target: Target;
  effect: Effect;
  power?: number;
  element?: string;
  applies?: string;
  statusChance?: number;
  ignoresDefense?: number;
  flatBonus?: number;
  scalesBnd?: string; // ally id whose BND multiplier applies
  pulse?: "encourage" | "steady" | "hasten"; // Conduit Pulse free-action kind
  desc?: string;
}

export interface ItemDef {
  id: string;
  name: string;
  kind: "heal_pct" | "mp_pct" | "revive" | "cure";
  amount?: number;     // fraction of max (heal/mp) or revive ratio
  cures?: string;      // status id removed
  target: "single_ally" | "ko_ally";
  desc: string;
}

export const ITEMS: Record<string, ItemDef> = {
  potion:      { id: "potion",      name: "Potion",      kind: "heal_pct", amount: 0.3, target: "single_ally", desc: "Restore 30% HP." },
  hi_potion:   { id: "hi_potion",   name: "Hi-Potion",   kind: "heal_pct", amount: 0.6, target: "single_ally", desc: "Restore 60% HP." },
  ether:       { id: "ether",       name: "Ether",       kind: "mp_pct",   amount: 0.2, target: "single_ally", desc: "Restore 20% MP." },
  phoenix_ash: { id: "phoenix_ash", name: "Phoenix Ash", kind: "revive",   amount: 0.25, target: "ko_ally",   desc: "Revive at 25% HP." },
  antidote:    { id: "antidote",    name: "Antidote",    kind: "cure", cures: "poison", target: "single_ally", desc: "Cure Poison." },
};

// Party-shared starting inventory (id -> count).
export const START_INVENTORY: Record<string, number> = {
  potion: 3, hi_potion: 1, ether: 2, phoenix_ash: 1, antidote: 2,
};

// ---- Equipment (flat bonuses, per docs/design/items_equipment.md) ----
export type EquipSlot = "weapon" | "armor" | "accessory";
export interface EquipDef {
  id: string; name: string; slot: EquipSlot; price: number;
  ATK?: number; DEF?: number; MAG?: number; SPD?: number; LCK?: number; hp?: number; mp?: number;
  for?: string[]; // restrict to these party ids (empty = anyone)
  desc: string;
}
export const EQUIP: Record<string, EquipDef> = {
  iron_sword:     { id: "iron_sword",     name: "Iron Sword",   slot: "weapon", price: 120, ATK: 5, for: ["kael"], desc: "+5 ATK" },
  war_staff:      { id: "war_staff",      name: "War Staff",    slot: "weapon", price: 120, MAG: 5, for: ["maren", "senna", "lida"], desc: "+5 MAG" },
  combat_rod:     { id: "combat_rod",     name: "Combat Rod",   slot: "weapon", price: 100, MAG: 4, hp: 6, for: ["lida"], desc: "+4 MAG, +6 HP" },
  scale_mail:     { id: "scale_mail",     name: "Scale Mail",   slot: "armor",  price: 140, DEF: 5, hp: 12, desc: "+5 DEF, +12 HP" },
  travel_cloak:   { id: "travel_cloak",   name: "Travel Cloak", slot: "armor",  price: 80,  DEF: 2, SPD: 2, desc: "+2 DEF, +2 SPD" },
  power_band:     { id: "power_band",     name: "Power Band",   slot: "accessory", price: 100, ATK: 3, desc: "+3 ATK" },
  swift_boots:    { id: "swift_boots",    name: "Swift Boots",  slot: "accessory", price: 100, SPD: 3, desc: "+3 SPD" },
  lucky_charm:    { id: "lucky_charm",    name: "Lucky Charm",  slot: "accessory", price: 90,  LCK: 5, desc: "+5 LCK" },
};

// Shop stock (between-battle camp).
export const SHOP_ITEMS = ["potion", "hi_potion", "ether", "phoenix_ash", "antidote"];
export const ITEM_PRICE: Record<string, number> = {
  potion: 50, hi_potion: 200, ether: 100, phoenix_ash: 300, antidote: 25,
};
export const SHOP_EQUIP = ["iron_sword", "war_staff", "combat_rod", "scale_mail", "travel_cloak", "power_band", "swift_boots", "lucky_charm"];

export interface EquipSet { weapon?: string; armor?: string; accessory?: string; }
export function equipBonus(equip?: EquipSet) {
  const b = { ATK: 0, DEF: 0, MAG: 0, SPD: 0, LCK: 0, hp: 0, mp: 0 };
  if (!equip) return b;
  for (const id of [equip.weapon, equip.armor, equip.accessory]) {
    const e = id ? EQUIP[id] : undefined;
    if (!e) continue;
    b.ATK += e.ATK ?? 0; b.DEF += e.DEF ?? 0; b.MAG += e.MAG ?? 0; b.SPD += e.SPD ?? 0; b.LCK += e.LCK ?? 0; b.hp += e.hp ?? 0; b.mp += e.mp ?? 0;
  }
  return b;
}

export interface Growth { hp: number; mp: number; ATK: number; DEF: number; MAG: number; SPD: number; LCK: number; }

export interface UnitDef {
  id: string;
  name: string;
  theme: string; // palette key
  job?: string;  // class name (Conduit / Knight / ...)
  hp: number; mp: number;
  ATK: number; DEF: number; MAG: number; SPD: number; LCK: number;
  bnd?: number;
  abilities: string[];
  growth?: Growth;
  weaknesses?: string[];
  resistances?: string[];
  immunities?: string[];
  absorbs?: string[];
  element?: string;
  ai?: string;
  level?: number;
  xp?: number;        // XP this enemy awards
  marks?: [number, number];
  isBoss?: boolean;
  phaseAt50?: { mult: Partial<Record<StatKey, number>>; line: string };
}

// Stats for a party member at a given level (floor of base + growth*(level-1)).
export function statsAtLevel(def: UnitDef, level: number) {
  const g = def.growth ?? { hp: 0, mp: 0, ATK: 0, DEF: 0, MAG: 0, SPD: 0, LCK: 0 };
  const n = level - 1;
  return {
    maxHp: Math.floor(def.hp + g.hp * n),
    maxMp: Math.floor(def.mp + g.mp * n),
    ATK: Math.floor(def.ATK + g.ATK * n),
    DEF: Math.floor(def.DEF + g.DEF * n),
    MAG: Math.floor(def.MAG + g.MAG * n),
    SPD: Math.floor(def.SPD + g.SPD * n),
    LCK: Math.floor(def.LCK + g.LCK * n),
  };
}

export const STATUS: Record<string, StatusDef> = {
  iron_will_buff: { id: "iron_will_buff", name: "DEF+", cat: "buff", stat: "DEF", magnitude: 0.25, dur: 3 },
  atk_up_large:   { id: "atk_up_large",   name: "ATK+", cat: "buff", stat: "ATK", magnitude: 0.20, dur: 3 },
  defend:         { id: "defend",         name: "Guard", cat: "buff", stat: "DEF", magnitude: 0.50, dur: 1 },
  stun:           { id: "stun",           name: "Stun", cat: "debuff", stat: "", magnitude: 0, dur: 1 },
  provoked:       { id: "provoked",       name: "Taunt", cat: "debuff", stat: "", magnitude: 0, dur: 2 },
  poison:         { id: "poison",         name: "Poison", cat: "debuff", stat: "", magnitude: 0, dur: 3, tick: "poison", flat: 5 },
  burn:           { id: "burn",           name: "Burn", cat: "debuff", stat: "", magnitude: 0, dur: 2, tick: "poison", flat: 6 },
  silence:        { id: "silence",        name: "Silence", cat: "debuff", stat: "", magnitude: 0, dur: 2, blocksMagic: true },
  regen:          { id: "regen",          name: "Regen", cat: "buff", stat: "", magnitude: 0, dur: 3, tick: "regen", flat: 8 },
  // Conduit Pulse (Maren free action) — small, 1-turn nudges
  encourage:      { id: "encourage",      name: "Encourage", cat: "buff", stat: "ATK", magnitude: 0.08, dur: 1 },
  steady:         { id: "steady",         name: "Steady", cat: "buff", stat: "DEF", magnitude: 0.08, dur: 1 },
  def_up_large:   { id: "def_up_large",   name: "Shield", cat: "buff", stat: "DEF", magnitude: 0.40, dur: 3 },
  spd_down:       { id: "spd_down",       name: "Slow", cat: "debuff", stat: "SPD", magnitude: 0.25, dur: 2 },
};

export const ABIL: Record<string, AbilityDef> = {
  attack:      { id: "attack",      name: "Attack",      mp: 0,  target: "single_enemy", effect: "physical", power: 2.0, element: "", desc: "Basic physical strike." },
  fire:        { id: "fire",        name: "Fire",        mp: 6,  target: "single_enemy", effect: "magical",  power: 2.0, element: "fire", desc: "Fire damage to one foe." },
  shield_bash: { id: "shield_bash", name: "Shield Bash", mp: 6,  target: "single_enemy", effect: "physical", power: 1.5, applies: "stun", statusChance: 0.3, desc: "Heavy bash, 30% stun." },
  guard:       { id: "guard",       name: "Guard",       mp: 0,  target: "self",         effect: "buff",     applies: "defend", desc: "DEF +50% for 1 turn." },
  provoke:     { id: "provoke",     name: "Provoke",     mp: 4,  target: "single_enemy", effect: "debuff",   applies: "provoked", statusChance: 1.0, desc: "Force a foe to target Kael." },
  cure:        { id: "cure",        name: "Cure",        mp: 5,  target: "single_ally",  effect: "healing",  power: 1.5, desc: "Heal one ally (MAG x1.5)." },
  heal:        { id: "heal",        name: "Heal",        mp: 10, target: "all_allies",   effect: "healing",  power: 1.0, desc: "Heal the whole party." },
  // Maren's Attunement abilities — scale with the bonded ally's BND.
  iron_will:   { id: "iron_will",   name: "Iron Will",   mp: 4,  target: "self",         effect: "buff",     applies: "iron_will_buff", scalesBnd: "kael", desc: "DEF+ (scales w/ Kael's Bond)." },
  mend_pulse:  { id: "mend_pulse",  name: "Pulse",       mp: 6,  target: "all_allies",   effect: "healing",  power: 0.8, scalesBnd: "lida", desc: "Party heal (scales w/ Lida's Bond)." },
  regen_ab:    { id: "regen_ab",    name: "Regen",       mp: 6,  target: "single_ally",  effect: "buff",     applies: "regen", desc: "Heal an ally over 3 turns." },
  // Conduit Pulse (Maren only, free action)
  pulse_encourage: { id: "pulse_encourage", name: "Encourage", mp: 0, target: "single_ally", effect: "buff", applies: "encourage", pulse: "encourage", desc: "Free: +8% ATK (1 turn)." },
  pulse_steady:    { id: "pulse_steady",    name: "Steady",    mp: 0, target: "single_ally", effect: "buff", applies: "steady",    pulse: "steady",    desc: "Free: +8% DEF (1 turn)." },
  pulse_hasten:    { id: "pulse_hasten",    name: "Hasten",    mp: 0, target: "single_ally", effect: "buff", pulse: "hasten", desc: "Free: ally acts sooner." },
  // Senna (Black Mage)
  ice:         { id: "ice",         name: "Ice",         mp: 6,  target: "single_enemy", effect: "magical",  power: 2.0, element: "ice", desc: "Ice damage to one foe." },
  lightning:   { id: "lightning",   name: "Lightning",   mp: 6,  target: "single_enemy", effect: "magical",  power: 2.0, element: "lightning", desc: "Lightning damage to one foe." },
  blizzard:    { id: "blizzard",    name: "Blizzard",    mp: 14, target: "all_enemies",  effect: "magical",  power: 1.8, element: "ice", desc: "Ice damage to all foes." },
  // Enemy / boss
  enemy_slash: { id: "enemy_slash", name: "Slash",       mp: 0,  target: "single_enemy", effect: "physical", power: 2.0 },
  enemy_bite:  { id: "enemy_bite",  name: "Bite",        mp: 0,  target: "single_enemy", effect: "physical", power: 2.2 },
  enemy_howl:  { id: "enemy_howl",  name: "Howl",        mp: 3,  target: "self",         effect: "buff",     applies: "atk_up_large" },
  // Davan (Thief)
  mug:          { id: "mug",          name: "Mug",         mp: 3,  target: "single_enemy", effect: "physical", power: 2.4, desc: "A swift, larcenous strike." },
  poison_strike:{ id: "poison_strike",name: "Poison Strike",mp: 4, target: "single_enemy", effect: "physical", power: 1.5, applies: "poison", statusChance: 0.6, desc: "Strike that may poison." },
  smoke_bomb:   { id: "smoke_bomb",   name: "Smoke Bomb",  mp: 6,  target: "all_enemies",  effect: "debuff",   applies: "spd_down", desc: "Slow all foes." },
  // Yara (Monk)
  palm_strike:  { id: "palm_strike",  name: "Palm Strike", mp: 3, target: "single_enemy", effect: "physical", power: 2.2, desc: "A focused open-palm strike." },
  roundhouse:   { id: "roundhouse",   name: "Roundhouse",  mp: 6, target: "all_enemies",  effect: "physical", power: 1.4, desc: "Sweeping kick hits all foes." },
  earth_fist:   { id: "earth_fist",   name: "Earth Fist",  mp: 5, target: "single_enemy", effect: "physical", power: 2.4, element: "earth", desc: "Earth-charged punch." },
  meditate:     { id: "meditate",     name: "Meditate",    mp: 0, target: "self",          effect: "healing",  power: 0, flatBonus: 24, desc: "Center yourself — restore HP." },
  // Mirror (boss)
  enemy_mirror_echo:  { id: "enemy_mirror_echo",  name: "Mirror Echo",  mp: 8,  target: "single_enemy", effect: "magical", power: 2.2, element: "dark" },
  enemy_lattice_pulse:{ id: "enemy_lattice_pulse",name: "Lattice Pulse",mp: 12, target: "all_enemies",  effect: "magical", power: 1.7, element: "dark" },
  // Hollows enemies
  enemy_shadow_claw:  { id: "enemy_shadow_claw",  name: "Shadow Claw",  mp: 0, target: "single_enemy", effect: "physical", power: 2.0, element: "dark" },
  enemy_dark_pulse:   { id: "enemy_dark_pulse",   name: "Dark Pulse",   mp: 6, target: "single_enemy", effect: "magical",  power: 1.8, element: "dark" },
  enemy_shadow_lunge: { id: "enemy_shadow_lunge", name: "Shadow Lunge", mp: 0, target: "single_enemy", effect: "physical", power: 2.5, element: "dark" },
  enemy_charge:     { id: "enemy_charge",     name: "Charge",     mp: 0, target: "single_enemy", effect: "physical", power: 2.8 },
  enemy_fire_breath:{ id: "enemy_fire_breath",name: "Fire Breath",mp: 8, target: "all_enemies",  effect: "magical",  power: 1.5, element: "fire" },
  enemy_shield_wall:{ id: "enemy_shield_wall",name: "Shield Wall",mp: 4, target: "self",         effect: "buff",     applies: "def_up_large" },
  enemy_poison_sting:{ id: "enemy_poison_sting",name: "Poison Sting",mp: 0, target: "single_enemy", effect: "physical", power: 1.5, applies: "poison", statusChance: 0.4 },
};

export const CONDUIT_PULSES = ["pulse_encourage", "pulse_steady", "pulse_hasten"];

// Level-1 base stats from data/characters/*.tres.
export const PARTY_DEFS: UnitDef[] = [
  { id: "maren", name: "Maren", theme: "maren", job: "Conduit", hp: 40, mp: 20, ATK: 5,  DEF: 5,  MAG: 8,  SPD: 5, LCK: 3,
    abilities: ["fire", "iron_will", "mend_pulse"],
    growth: { hp: 12, mp: 6, ATK: 1.5, DEF: 1.5, MAG: 2.5, SPD: 1.5, LCK: 0.5 } },
  { id: "kael",  name: "Kael",  theme: "kael",  job: "Knight", hp: 55, mp: 12, ATK: 8, DEF: 10, MAG: 3,  SPD: 5, LCK: 2, bnd: 10,
    abilities: ["shield_bash", "guard", "provoke"],
    growth: { hp: 18, mp: 3, ATK: 3, DEF: 3, MAG: 0.5, SPD: 1, LCK: 0.3 } },
  { id: "lida",  name: "Lida",  theme: "lida",  job: "White Mage", hp: 35, mp: 25, ATK: 4,  DEF: 6,  MAG: 11, SPD: 7, LCK: 4, bnd: 15,
    abilities: ["cure", "heal", "regen_ab"],
    growth: { hp: 10, mp: 7, ATK: 0.5, DEF: 1, MAG: 3, SPD: 1.5, LCK: 0.5 } },
  { id: "senna", name: "Senna", theme: "senna", job: "Black Mage", hp: 30, mp: 28, ATK: 4,  DEF: 4,  MAG: 12, SPD: 7, LCK: 3, bnd: 5,
    abilities: ["fire", "ice", "lightning", "blizzard"],
    growth: { hp: 9, mp: 8, ATK: 0.5, DEF: 0.5, MAG: 3.5, SPD: 1.5, LCK: 0.5 } },
  { id: "davan", name: "Davan", theme: "davan", job: "Thief", hp: 38, mp: 16, ATK: 9, DEF: 5, MAG: 5, SPD: 10, LCK: 6, bnd: 8,
    abilities: ["mug", "poison_strike", "smoke_bomb"],
    growth: { hp: 11, mp: 4, ATK: 2.5, DEF: 1, MAG: 1, SPD: 3, LCK: 1 } },
  { id: "yara", name: "Yara", theme: "yara", job: "Monk", hp: 48, mp: 14, ATK: 12, DEF: 8, MAG: 5, SPD: 7, LCK: 2, bnd: 12,
    abilities: ["palm_strike", "roundhouse", "earth_fist", "meditate"],
    growth: { hp: 14, mp: 4, ATK: 3.5, DEF: 2, MAG: 1, SPD: 2, LCK: 0.3 } },
];

// Enemy registry (stats/abilities ported from data/enemies/*.tres).
export const ENEMY_DEFS: Record<string, UnitDef> = {
  marsh_slime: { id: "marsh_slime", name: "Slime", theme: "slime", hp: 32, mp: 0, ATK: 5, DEF: 6, MAG: 3, SPD: 3, LCK: 1,
    weaknesses: ["fire", "lightning"], ai: "swarm", abilities: ["enemy_poison_sting"], level: 1, xp: 5, marks: [3, 8] },
  thornwall_wolf: { id: "thornwall_wolf", name: "Wolf", theme: "wolf", hp: 44, mp: 10, ATK: 8, DEF: 4, MAG: 2, SPD: 6, LCK: 2,
    weaknesses: ["fire"], ai: "swarm", abilities: ["enemy_bite", "enemy_howl"], level: 2, xp: 8, marks: [5, 10] },
  // low-level field creatures (the farmer's pasture, starter grinding)
  field_rat: { id: "field_rat", name: "Field Rat", theme: "rat", hp: 14, mp: 0, ATK: 5, DEF: 2, MAG: 1, SPD: 8, LCK: 2,
    ai: "swarm", abilities: ["enemy_bite"], level: 1, xp: 4, marks: [2, 6] },
  forest_spider: { id: "forest_spider", name: "Forest Spider", theme: "spider", hp: 20, mp: 0, ATK: 5, DEF: 4, MAG: 2, SPD: 6, LCK: 2,
    weaknesses: ["fire"], ai: "swarm", abilities: ["enemy_poison_sting"], level: 1, xp: 6, marks: [3, 8] },
  thornwall_militia: { id: "thornwall_militia", name: "Militia", theme: "militia", hp: 40, mp: 0, ATK: 8, DEF: 5, MAG: 2, SPD: 4, LCK: 2,
    ai: "brute", abilities: ["enemy_slash"], level: 2, xp: 7, marks: [5, 12] },
  yara_duel: { id: "yara_duel", name: "Yara", theme: "yara", hp: 430, mp: 40, ATK: 38, DEF: 11, MAG: 5, SPD: 18, LCK: 3,
    ai: "brute", abilities: ["enemy_charge", "enemy_slash", "roundhouse"], level: 9, xp: 60, marks: [20, 30] },
  the_mirror: { id: "the_mirror", name: "The Mirror", theme: "mirror", hp: 640, mp: 80, ATK: 34, DEF: 10, MAG: 44, SPD: 14, LCK: 10,
    element: "dark", weaknesses: ["fire", "light"], immunities: ["dark"], ai: "mirror", abilities: ["enemy_mirror_echo", "enemy_lattice_pulse"],
    level: 12, xp: 120, marks: [20, 30], isBoss: true, phaseAt50: { mult: { MAG: 1.35, SPD: 1.2 }, line: "The echo destabilizes — reflecting harder!" } },
  shadow_creeper: { id: "shadow_creeper", name: "Shadow Creeper", theme: "shade", hp: 95, mp: 8, ATK: 16, DEF: 7, MAG: 10, SPD: 9, LCK: 2,
    element: "dark", weaknesses: ["light"], ai: "swarm", abilities: ["enemy_shadow_claw", "enemy_bite"], level: 9, xp: 20, marks: [14, 22] },
  gloom_moth: { id: "gloom_moth", name: "Gloom Moth", theme: "moth", hp: 72, mp: 16, ATK: 4, DEF: 5, MAG: 18, SPD: 10, LCK: 3,
    element: "dark", weaknesses: ["light"], ai: "caster", abilities: ["enemy_dark_pulse", "enemy_poison_sting"], level: 9, xp: 22, marks: [16, 24] },
  hollow_stalker: { id: "hollow_stalker", name: "Hollow Stalker", theme: "stalker", hp: 600, mp: 40, ATK: 40, DEF: 6, MAG: 30, SPD: 15, LCK: 3,
    element: "dark", weaknesses: ["light"], immunities: ["dark"], ai: "assassin", abilities: ["enemy_shadow_claw", "enemy_dark_pulse", "enemy_shadow_lunge"],
    level: 8, xp: 80, marks: [60, 90], isBoss: true, phaseAt50: { mult: { SPD: 1.3, ATK: 1.25 }, line: "The Stalker splits into the dark!" } },
  ashguard_scout: { id: "ashguard_scout", name: "Ashguard Scout", theme: "ashguard", hp: 30, mp: 0, ATK: 6, DEF: 6, MAG: 3, SPD: 6, LCK: 2,
    element: "fire", weaknesses: ["ice", "water"], resistances: ["fire"], ai: "assassin", abilities: ["enemy_slash"], level: 4, xp: 14, marks: [10, 18] },
  ashguard_soldier: { id: "ashguard_soldier", name: "Ashguard Soldier", theme: "ashguard", hp: 64, mp: 10, ATK: 11, DEF: 9, MAG: 4, SPD: 6, LCK: 2,
    element: "fire", weaknesses: ["ice", "water"], resistances: ["fire"], ai: "brute", abilities: ["enemy_slash", "enemy_charge"], level: 5, xp: 18, marks: [15, 25] },
  captain_rhogar: { id: "captain_rhogar", name: "Captain Rhogar", theme: "rhogar", hp: 440, mp: 30, ATK: 30, DEF: 14, MAG: 15, SPD: 8, LCK: 4,
    element: "fire", weaknesses: ["ice"], resistances: ["fire"], ai: "tank",
    abilities: ["enemy_slash", "enemy_charge", "enemy_fire_breath", "enemy_shield_wall"],
    level: 10, xp: 120, marks: [80, 120], isBoss: true,
    phaseAt50: { mult: { ATK: 1.4, SPD: 1.2 }, line: "Rhogar roars with rage!" } },
};

// Per-character palette (code-driven art).
export interface Theme { body: number; bodyDark: number; head: number; accent: number; }
export const THEMES: Record<string, Theme> = {
  maren: { body: 0x4f7fd6, bodyDark: 0x33599e, head: 0xf2c9a0, accent: 0x8fd3ff },
  kael:  { body: 0x8a93a8, bodyDark: 0x5b6275, head: 0xe9b890, accent: 0xd64b4b },
  lida:  { body: 0xe7e9f2, bodyDark: 0xb7bcd0, head: 0xf4cfa6, accent: 0x7fe0a0 },
  wolf:  { body: 0x6b5947, bodyDark: 0x453a2e, head: 0x6b5947, accent: 0xe05a3a },
};
