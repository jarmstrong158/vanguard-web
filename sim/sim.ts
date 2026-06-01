// Headless balance simulator. Reuses the REAL combat code (no Phaser).
// Run: esbuild sim/sim.ts --bundle --platform=node --outfile=sim/out.cjs && node sim/out.cjs
import { Battle, Combatant } from "../src/combat";
import { ABIL, ENEMY_DEFS, PARTY_DEFS, type AbilityDef } from "../src/data";
import { STORY, type StoryBattle } from "../src/story";

const defOf = (id: string) => PARTY_DEFS.find((d) => d.id === id)!;
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

// expected (deterministic) damage of an ability vs a target — drives "reasonable play"
function estDamage(b: Battle, s: Combatant, t: Combatant, ab: AbilityDef): number {
  if (ab.effect !== "physical" && ab.effect !== "magical") return 0;
  const ignore = ab.ignoresDefense ?? 0;
  let raw: number;
  if (ab.effect === "physical") raw = s.effStat("ATK") * (ab.power ?? 1) - t.effStat("DEF") * (1 - ignore);
  else raw = s.effStat("MAG") * (ab.power ?? 1) - (t.effStat("DEF") * 0.3 + t.effStat("MAG") * 0.3) * (1 - ignore);
  const em = b.elementMult(ab.element ?? "", t);
  if (em < 0) return 0; // would heal the enemy (absorb) — avoid
  return Math.max(1, raw) * em;
}

interface Act { ab: AbilityDef; target: Combatant | null; }

function partyAction(b: Battle, actor: Combatant): Act {
  const foes = b.living("enemy");
  const allies = b.living("party");
  // heal if anyone is under 50%
  const healId = actor.abilities.find((id) => ABIL[id].effect === "healing" && (ABIL[id].mp ?? 0) <= actor.mp);
  const lowest = allies.slice().sort((a, c) => a.hp / a.maxHp - c.hp / c.maxHp)[0];
  if (healId && lowest && lowest.hp / lowest.maxHp < 0.5) {
    const ab = ABIL[healId];
    return { ab, target: ab.target === "single_ally" ? lowest : null };
  }
  // otherwise: best damaging ability vs the lowest-HP foe (focus fire), weakness-aware
  const target = foes.slice().sort((a, c) => a.hp - c.hp)[0];
  const cands = actor.abilities.map((id) => ABIL[id]).filter((ab) => (ab.effect === "physical" || ab.effect === "magical") && (ab.mp ?? 0) <= actor.mp);
  cands.push(ABIL.attack);
  let best = ABIL.attack, score = -1;
  for (const ab of cands) {
    const s = ab.target === "all_enemies" ? foes.reduce((a, f) => a + estDamage(b, actor, f, ab), 0) : estDamage(b, actor, target, ab);
    if (s > score) { score = s; best = ab; }
  }
  return { ab: best, target: best.target === "all_enemies" ? null : target };
}

function enemyAction(b: Battle, actor: Combatant): Act {
  const usable = actor.abilities.map((id) => ABIL[id]).filter((ab) => (ab.mp ?? 0) <= actor.mp);
  const buffs = usable.filter((ab) => ab.effect === "buff");
  const aoes = usable.filter((ab) => ab.target === "all_enemies");
  const singles = usable.filter((ab) => (ab.effect === "physical" || ab.effect === "magical") && ab.target === "single_enemy");
  const party = b.living("party");
  const target = party.slice().sort((a, c) => a.hp - c.hp)[0];
  if (actor.hasStatus("provoked") && actor.provokeSource?.alive && singles.length) return { ab: pick(singles), target: actor.provokeSource };
  if (buffs.length && actor.buffs.length === 0 && Math.random() < 0.3) return { ab: pick(buffs), target: actor };
  if (aoes.length && party.length >= 2 && Math.random() < 0.45) return { ab: pick(aoes), target };
  if (singles.length) return { ab: pick(singles), target };
  const f = usable[0] ?? ABIL.attack;
  return { ab: f, target: f.target === "self" ? actor : target };
}

function applyAction(b: Battle, actor: Combatant, act: Act) {
  const ab = act.ab;
  if (ab.mp) actor.mp = Math.max(0, actor.mp - ab.mp);
  let group: Combatant[];
  if (ab.target === "all_allies") group = b.living(actor.side);
  else if (ab.target === "all_enemies") group = b.living(actor.side === "party" ? "enemy" : "party");
  else if (ab.target === "self") group = [actor];
  else group = act.target ? [act.target] : [];
  for (const tg of group) {
    if (!tg) continue;
    if (ab.effect === "physical" || ab.effect === "magical") {
      if (!b.rollHit(actor)) continue;
      const r = b.calc(actor, tg, ab);
      if (r.healing > 0) b.heal(tg, r.healing);
      else { b.takeDamage(tg, r.damage); b.maybePhase(tg); }
    } else if (ab.effect === "healing") {
      b.heal(tg, b.calc(actor, tg, ab).healing);
    }
    if (ab.applies && Math.random() < (ab.statusChance ?? 1)) b.applyStatus(tg, ab.applies, actor);
  }
}

interface Buff { atk?: number; hp?: number; mag?: number; }
function simBattle(partyIds: string[], level: number, enemyIds: string[], trials: number, buff: Buff = {}) {
  let wins = 0, turnsTotal = 0;
  for (let t = 0; t < trials; t++) {
    const party = partyIds.map((id, i) => new Combatant(defOf(id), "party", i, { level }));
    const enemies = enemyIds.map((id, i) => {
      const e = new Combatant(ENEMY_DEFS[id], "enemy", i);
      if (buff.atk) e.stats.ATK = Math.round(e.stats.ATK * buff.atk);
      if (buff.mag) e.stats.MAG = Math.round(e.stats.MAG * buff.mag);
      if (buff.hp) { e.maxHp = Math.round(e.maxHp * buff.hp); e.hp = e.maxHp; }
      return e;
    });
    const b = new Battle(party, enemies, {});
    let turn = 0, result = "timeout";
    while (turn < 120) {
      const actor = b.nextActor();
      if (!actor) break;
      b.startOfTurnEffects(actor);
      if (b.sideWiped("enemy")) { result = "win"; break; }
      if (b.sideWiped("party")) { result = "lose"; break; }
      if (!actor.alive) { turn++; continue; }
      if (actor.hasStatus("stun")) { b.tickStatuses(actor); turn++; continue; }
      b.tickStatuses(actor);
      applyAction(b, actor, actor.isParty ? partyAction(b, actor) : enemyAction(b, actor));
      if (b.sideWiped("enemy")) { result = "win"; break; }
      if (b.sideWiped("party")) { result = "lose"; break; }
      turn++;
    }
    if (result === "win") { wins++; turnsTotal += turn; }
  }
  return { winRate: wins / trials, avgTurns: wins ? turnsTotal / wins : 0 };
}

// ----- XP economy -----
const XP_MULT = 1.5; // matches src/story.ts (tuned here)
const xpToNext = (lvl: number) => 40 + lvl * 20;
const battleXp = (ids: string[]) => ids.reduce((a, id) => a + (ENEMY_DEFS[id]?.xp ?? 0), 0) * XP_MULT;

// optional on-map encounters available per region (the player fights a fraction, flees the rest)
const REGION_OPTIONAL: Record<string, string[][]> = {
  early: [["thornwall_wolf", "thornwall_wolf"], ["marsh_slime", "marsh_slime"], ["thornwall_militia", "thornwall_wolf"]],
  emberreach: [["ashguard_scout", "ashguard_scout"], ["thornwall_militia", "ashguard_scout"]],
  hollows: [["shadow_creeper", "gloom_moth"], ["gloom_moth", "gloom_moth"], ["shadow_creeper", "shadow_creeper"]],
  stonemantle: [["shadow_creeper", "shadow_creeper"], ["gloom_moth", "shadow_creeper"]],
};
// which region's optional pool precedes each story battle (by order)
const BATTLE_REGION = ["early", "early", "emberreach", "hollows", "hollows", "stonemantle", "stonemantle"];

function levelFor(totalXp: number): number {
  let lvl = 1, xp = totalXp;
  while (lvl < 30 && xp >= xpToNext(lvl)) { xp -= xpToNext(lvl); lvl++; }
  return lvl;
}

function economyTrajectory(fleeFrac: number) {
  // fightFrac = fraction of optional encounters actually fought
  const fightFrac = 1 - fleeFrac;
  const battles = STORY.filter((s): s is StoryBattle => s.kind === "battle");
  let xp = 0;
  const out: { name: string; level: number }[] = [];
  battles.forEach((bt, i) => {
    const region = BATTLE_REGION[i] ?? "stonemantle";
    const optional = REGION_OPTIONAL[region] ?? [];
    // expected XP from optional encounters in this leg
    for (const enc of optional) xp += battleXp(enc) * fightFrac;
    // mandatory story battle
    xp += battleXp(bt.enemies);
    out.push({ name: bt.intro.slice(0, 28), level: levelFor(xp) });
  });
  return out;
}

// ----- boss difficulty tuning: find HP/ATK multipliers that yield a tense fight -----
// target for a boss at its intended arrival level: win ~82-93%, ~12-20 turns.
function tuneBosses() {
  const bosses = [
    { name: "Rhogar", party: ["maren", "kael", "lida", "senna"], enemies: ["captain_rhogar"], level: 5 },
    { name: "Hollow Stalker", party: ["maren", "kael", "davan", "lida"], enemies: ["hollow_stalker"], level: 7 },
    { name: "The Mirror", party: ["maren", "senna", "kael", "lida"], enemies: ["the_mirror"], level: 10 },
  ];
  console.log("=== BOSS DIFFICULTY TUNING (win% / avg turns at intended level) ===");
  for (const bo of bosses) {
    console.log(`\n${bo.name}  @ Lv ${bo.level}`);
    for (const hp of [1.0, 1.4, 1.8]) {
      let row = `   HPx${hp.toFixed(1)}: `;
      for (const atk of [1.0, 1.4, 1.8]) {
        const r = simBattle(bo.party, bo.level, bo.enemies, 300, { hp, atk, mag: atk });
        row += `ATKx${atk.toFixed(1)} ${(r.winRate * 100).toFixed(0).padStart(3)}%/${r.avgTurns.toFixed(0).padStart(2)}t   `;
      }
      console.log(row);
    }
  }
}
tuneBosses();

// ----- run report -----
const TRIALS = 300;
const battles = STORY.filter((s): s is StoryBattle => s.kind === "battle");

console.log("=== COMBAT WIN-RATE BY LEVEL (", TRIALS, "trials) ===");
const required: number[] = [];
for (const bt of battles) {
  console.log(`\n${bt.intro}`);
  console.log(`  party: ${bt.party.join(",")}  vs  ${bt.enemies.join(",")}   (set level ${bt.level})`);
  let req = 99;
  for (let lvl = Math.max(1, bt.level - 3); lvl <= bt.level + 4; lvl++) {
    const r = simBattle(bt.party, lvl, bt.enemies, TRIALS);
    const tag = r.winRate >= 0.85 ? "  <- reliable" : r.winRate >= 0.6 ? "  (risky)" : "";
    if (r.winRate >= 0.85 && lvl < req) req = lvl;
    console.log(`   Lv ${String(lvl).padStart(2)}: win ${(r.winRate * 100).toFixed(0).padStart(3)}%   avg ${r.avgTurns.toFixed(1).padStart(4)} turns${tag}`);
  }
  required.push(req === 99 ? bt.level + 4 : req);
}

console.log("\n=== XP ECONOMY: expected party level at each story battle ===");
console.log("(by fraction of optional on-map encounters the player FLEES/skips)");
for (const flee of [0.7, 0.5, 0.25]) {
  const traj = economyTrajectory(flee);
  console.log(`\n flee ${Math.round(flee * 100)}% (fights ${Math.round((1 - flee) * 100)}% of optional):`);
  traj.forEach((b, i) => console.log(`   #${i + 1} ${b.name.padEnd(30)} -> Lv ${b.level}   (needs Lv ${required[i]} to be reliable)`));
}

// ----- consequence of skipping fights (NO floor clamp) -----
// The party fights at its REAL earned level. Skip too many optional fights and you go in
// under-leveled — and you can lose. This shows the win% a player would actually face.
console.log("\n=== FOUGHT AT YOUR REAL LEVEL (no clamp) — the cost of skipping fights ===");
const bandTag = (w: number) => w >= 0.95 ? "TRIVIAL" : w >= 0.7 ? "fair" : w >= 0.45 ? "RISKY" : w >= 0.2 ? "BRUTAL" : "wall";
for (const flee of [0.8, 0.5, 0.2]) {
  const traj = economyTrajectory(flee);
  console.log(`\n flee ${Math.round(flee * 100)}% (fights ${Math.round((1 - flee) * 100)}% of optional):`);
  traj.forEach((b, i) => {
    const r = simBattle(battles[i].party, b.level, battles[i].enemies, 250);
    console.log(`   #${i + 1} ${b.name.padEnd(30)} Lv${b.level} vs intended ${battles[i].level}  win ${(r.winRate * 100).toFixed(0).padStart(3)}%  [${bandTag(r.winRate)}]`);
  });
}
console.log("\nTarget bands: trash on-level ~fair (70-92%), bosses on-level ~45-80%, under-leveled should bite.");
