// Focused unit checks for the boss-mechanic logic (reflect / rage / pressure).
import { Battle, Combatant } from "../src/combat";
import { ABIL, ENEMY_DEFS, PARTY_DEFS } from "../src/data";

const defOf = (id: string) => PARTY_DEFS.find((d) => d.id === id)!;
let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };

// ---- reflect (The Mirror) ----
{
  const maren = new Combatant(defOf("maren"), "party", 0, { level: 12 });
  const mirror = new Combatant(ENEMY_DEFS.the_mirror, "enemy", 0);
  const b = new Battle([maren], [mirror], {});
  // ice (neutral, not a pierce element) -> should bounce back onto Maren
  const before = maren.hp;
  const back = b.reflectFor(maren, mirror, ABIL.ice, 100);
  ok("ice reflects ~50%", back === 50 && maren.hp === before - 50);
  // fire pierces (Mirror weakness) -> no reflection
  const back2 = b.reflectFor(maren, mirror, ABIL.fire, 100);
  ok("fire pierces (no reflect)", back2 === 0 && maren.hp === before - 50);
  // physical never reflects
  ok("physical never reflects", b.reflectFor(maren, mirror, ABIL.attack, 100) === 0);
}

// ---- rage (Rhogar) ----
{
  const rhogar = new Combatant(ENEMY_DEFS.captain_rhogar, "enemy", 0);
  const b = new Battle([new Combatant(defOf("kael"), "party", 0, { level: 6 })], [rhogar], {});
  const atk0 = rhogar.stats.ATK;
  // above 50% HP: rage should NOT tick
  ok("rage dormant above 50%", b.bossTurnStart(rhogar).line === undefined && rhogar.stats.ATK === atk0);
  // drop below 50% and tick up to the cap
  rhogar.hp = Math.floor(rhogar.maxHp * 0.4);
  for (let i = 0; i < 6; i++) b.bossTurnStart(rhogar);
  ok("rage caps at maxStacks", rhogar.rageStacks === 4);
  ok("rage raised ATK", rhogar.stats.ATK > atk0);
}

// ---- pressure (Hollow Stalker) ----
{
  const stalker = new Combatant(ENEMY_DEFS.hollow_stalker, "enemy", 0);
  const b = new Battle([new Combatant(defOf("kael"), "party", 0, { level: 8 })], [stalker], {});
  const lines: (string | undefined)[] = [];
  const forced: (string | undefined)[] = [];
  for (let i = 0; i < 5; i++) { const h = b.bossTurnStart(stalker); lines.push(h.line); forced.push(h.forceAbility); }
  // charge=3: turns 1,2 silent; turn 3 telegraph; turn 4 erupts (forced ability); turn 5 silent again
  ok("pressure telegraphs on charge turn", lines[2] === stalker.def.mechanic!.line || lines[2] !== undefined);
  ok("pressure erupts with forced AoE", forced[3] === "enemy_hollow_rupture");
  ok("pressure resets after erupting", forced[4] === undefined && stalker.pressure === 1);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
