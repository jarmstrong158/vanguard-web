// Act 1 opening — story flow + dialogue, ported from vanguard/data/dialog/*.tres.
import type Phaser from "phaser";
import { ENEMY_DEFS, EQUIP, PARTY_DEFS, START_INVENTORY, equipBonus, statsAtLevel, type EquipSet, type EquipSlot } from "./data";

export interface Line { speaker?: string; text: string; setFlags?: string[]; partyAdd?: string; auto?: boolean; wait?: number; giveXp?: number; giveEquip?: string; }
export interface DialogSeq { id: string; context: string; lines: Line[]; }

const INTRO_OPENING: DialogSeq = {
  id: "intro_opening", context: "Morning in Thornwall",
  lines: [
    { text: "THORNWALL." },
    { text: "No Lattice Fragment. No magic. No connection to the great power that shapes the rest of the world." },
    { text: "Just stone walls, cold winters, and people who decided that was enough." },
    { text: "My mother's name is Renna Ashwick. She runs the only clinic within three days' walk. When someone is hurt, her name is the first word out of their mouth." },
    { text: "I carry her medicines. I sharpen her instruments. I am nineteen years old. I have never left this village." },
    { text: "My name is Maren. And this is a normal morning." },
    { speaker: "Renna", text: "You're up early again." },
    { speaker: "Maren", text: "Couldn't sleep. Something felt off." },
    { speaker: "Renna", text: "That's your father's instinct. He could always smell a storm before it came." },
    { speaker: "Renna", text: "Kael's been keeping watch at the south gate since dawn. Go check on him." },
    { speaker: "Maren", text: "I'll bring him back for breakfast." },
    { speaker: "Renna", text: "He won't eat it. But bring him anyway." },
    { text: "[The alarm bell. One strike. Then three, fast — the militia's emergency signal.]" },
  ],
};

const INTRO_ATTACK: DialogSeq = {
  id: "intro_attack", context: "The Ashguard Arrives",
  lines: [
    { speaker: "Kael", text: "Maren. North road. They're here." },
    { speaker: "Maren", text: "What is it?" },
    { speaker: "Kael", text: "Ashguard. Fifty soldiers and a Lattice mage on the road. Captain Rhogar." },
    { speaker: "Kael", text: "He burned a village called Solfen. I was stationed nearby when it happened. I didn't stop it." },
    { speaker: "Kael", text: "He came for me." },
    { speaker: "Maren", text: "There are three hundred people inside these walls." },
    { speaker: "Kael", text: "I know." },
    { text: "[Outside, a voice cuts through. Trained to carry. Trained to land like a hand around the throat.]" },
    { speaker: "Rhogar", text: "THORNWALL. You are harboring a deserter and a coward. His name is Kael Dremond." },
    { speaker: "Rhogar", text: "Surrender him by dawn. Those who comply walk away. Those who resist..." },
    { speaker: "Rhogar", text: "...we have made examples before. Ask Solfen." },
    { speaker: "Kael", text: "Scouts at the gate. They won't wait for dawn. Stay close to me." },
  ],
};

const INTRO_CLINIC: DialogSeq = {
  id: "intro_clinic", context: "Power Revealed",
  lines: [
    { text: "[The field clinic. Lida has been here since midnight.]" },
    { speaker: "Lida", text: "Stop hovering in the doorway. You're either in or you're out." },
    { speaker: "Maren", text: "Militia fighter from the outer gate — deep chest wound—" },
    { speaker: "Lida", text: "I know. I heard. Bring him in." },
    { speaker: "Lida", text: "...I can't stop the bleeding. Past what herbs can do. He has minutes." },
    { speaker: "Maren", text: "Let me try something." },
    { speaker: "Lida", text: "Maren, you're not a—" },
    { text: "[Warmth, like a hearth catching in a cold room. The man's breathing steadies. Lida's hands are glowing.]" },
    { speaker: "Lida", text: "...Maren. Your eyes. What did you just do?" },
    { speaker: "Kael", text: "Conduit. An Amplifier. He doesn't cast — he makes latent ability real. Rhogar's mage just felt that pulse." },
    { speaker: "Kael", text: "We have minutes." },
    { speaker: "Maren", text: "I'm not leaving Thornwall to burn." },
    { speaker: "Kael", text: "Sevrin — the Archon who commands Rhogar — hunts Conduits. Drains everything they're connected to." },
    { speaker: "Kael", text: "If he takes you, it isn't just you. It's Lida. Your mother. This whole village. You staying here saves no one." },
    { speaker: "Lida", text: "He's right. I hate that he's right.", partyAdd: "lida" },
    { speaker: "Maren", text: "...Where do we go?" },
    { speaker: "Kael", text: "South. Marsh, then a waystation. A scholar there can explain what you are. After that — Emberreach." },
    { speaker: "Renna", text: "Maren." },
    { speaker: "Renna", text: "The wall holds because every thorn points outward." },
    { speaker: "Renna", text: "Your place is out there now. Come back to me.", setFlags: ["intro_complete"] },
  ],
};

const GATE_FAREWELL: DialogSeq = {
  id: "thornwall_gate_farewell", context: "Leaving Thornwall",
  lines: [
    { text: "[At the south gate. Kael and Lida are waiting.]" },
    { speaker: "Kael", text: "South road. Marsh, then a waystation. There's a scholar named Fennick there — he can tell you what you are." },
    { speaker: "Maren", text: "How do you know what I am?" },
    { speaker: "Kael", text: "I served in the Ashguard for eight years. I know what Sevrin looks for." },
    { speaker: "Lida", text: "And after the waystation?", partyAdd: "lida" },
    { speaker: "Kael", text: "Emberreach. There's a resistance fighting the Valcrest occupation. I owe them a debt." },
    { speaker: "Kael", text: "Once we're in the marsh, there's no quick way back. Stay close — and don't touch the water.", setFlags: ["thornwall_fled"] },
  ],
};

const MARSH_ENTRY: DialogSeq = {
  id: "marsh_first_entry", context: "First Steps into the Marsh",
  lines: [
    { text: "[The village walls behind you. Marsh fog ahead. The sound of pursuit hasn't followed. Not yet.]" },
    { speaker: "Lida", text: "Maren. I've been trying to find the right words for what happened back there." },
    { speaker: "Maren", text: "I'm still looking for them myself." },
    { speaker: "Lida", text: "My hands were glowing. I've practiced medicine since I was seven without a trace of magic. And then you—" },
    { speaker: "Maren", text: "Touched your shoulder. I know. I don't know how to explain it." },
    { speaker: "Lida", text: "I think I can. You don't generate power. You find what's already there and open the door for it." },
    { speaker: "Maren", text: "...That's exactly what it felt like." },
    { speaker: "Lida", text: "Seven notches on my rod. Seven patients I couldn't save. If I'd known this was in me—" },
    { speaker: "Maren", text: "You couldn't have known." },
    { speaker: "Lida", text: "No. But I know now." },
    { speaker: "Kael", text: "We should keep moving. Marsh wolves come out at dusk." },
    { speaker: "Lida", text: "(quieter) We're going to figure out what you are. Both of us.", setFlags: ["marsh_entered"] },
  ],
};

const FENNICK: DialogSeq = {
  id: "waystation_fennick", context: "Fennick Explains Conduits",
  lines: [
    { speaker: "Fennick", text: "Remarkable. You're a Conduit, aren't you? I've only read about your kind. Amplifiers, the old texts called them." },
    { speaker: "Fennick", text: "Two hundred years ago, a Conduit named Auren Voss shattered this continent. He was an Absorber — your opposite. He drained power from everything around him." },
    { speaker: "Fennick", text: "An Amplifier gives. An Absorber takes. The Lattice records everything — every act of magic leaves a mark. Voss left a scar." },
    { speaker: "Maren", text: "The Ashguard are after us. A commander — Archon Sevrin — specifically wants me." },
    { speaker: "Fennick", text: "Sevrin. The most powerful Absorber alive. He sees you as a threat. Or a tool. Be careful, young Conduit — the Lattice has plans for both of you.", setFlags: ["met_fennick"] },
  ],
};

const SENNA_JOINS: DialogSeq = {
  id: "senna_joins", context: "The Reluctant Ally",
  lines: [
    { text: "[Redhollow, under occupation. Ashguard checkpoints at every corner. The Kindlepeak glows wrong — Valcrest fire, not Ember fire.]" },
    { speaker: "Senna", text: "Outsiders in Redhollow. Traveling with a man in scratched-off Ashguard insignia. That's either very brave or very stupid." },
    { speaker: "Kael", text: "Former Ashguard. The distinction matters." },
    { speaker: "Senna", text: "Not in Redhollow it doesn't. What are you doing here? Be specific." },
    { speaker: "Maren", text: "Looking for the resistance. Valcrest drove us out of our home. We have nowhere to go but south." },
    { speaker: "Senna", text: "Everyone says that. Half of them are informants." },
    { speaker: "Maren", text: "We're not. He can fight, she can heal. And I can do something I don't fully understand yet." },
    { speaker: "Senna", text: "(studying Maren) ...There were rumors. Someone in the north who made a Lattice pulse with no Fragment. That was you." },
    { speaker: "Maren", text: "I don't know what I am. That's part of why we're here." },
    { speaker: "Senna", text: "Fine. Tactical alliance. I'm not your friend, and I'm not joining your cause. I have my own reasons for fighting Valcrest." },
    { speaker: "Senna", text: "Don't slow me down.", partyAdd: "senna", setFlags: ["senna_joined"] },
  ],
};

const RHOGAR_ENCOUNTER: DialogSeq = {
  id: "rhogar_encounter", context: "The Captain's Blockade",
  lines: [
    { speaker: "Rhogar", text: "So this is the Conduit? I expected someone more... impressive." },
    { speaker: "Kael", text: "Rhogar. Still doing Sevrin's dirty work, I see." },
    { speaker: "Rhogar", text: "Kael. The deserter. The Archon will be pleased to know you're still alive. Briefly." },
    { speaker: "Maren", text: "We're not going anywhere with you." },
    { speaker: "Rhogar", text: "Then you'll go nowhere at all.", setFlags: ["rhogar_encountered"] },
  ],
};

const RHOGAR_DEFEATED: DialogSeq = {
  id: "rhogar_defeated", context: "After the Battle",
  lines: [
    { speaker: "Rhogar", text: "Gah... You fight better than you look, Conduit. But this changes nothing." },
    { speaker: "Rhogar", text: "The Archon knows what you are now. He'll send more than a single captain next time." },
    { speaker: "Kael", text: "Then we'll be ready. Get out of here, Rhogar. Before I change my mind." },
    { speaker: "Lida", text: "Maren... that power you used in the fight. It was different from last time. Stronger." },
    { speaker: "Maren", text: "I felt it too. Like I was channeling through all of you at once. Whatever this power is — it grows when we fight together.", setFlags: ["rhogar_defeated", "act1_complete"] },
  ],
};

const HOLLOWS_ARRIVAL: DialogSeq = {
  id: "hollows_arrival", context: "Into the Hollows",
  lines: [
    { text: "[The Hollows. The canopy closes behind them like a held breath.]", auto: true, wait: 1.6 },
    { speaker: "Lida", text: "The light doesn't reach the ground." },
    { speaker: "Kael", text: "Eyes up. Everything moves here." },
    { speaker: "Senna", text: "I've heard stories. Thought they were exaggerated." },
    { speaker: "Lida", text: "They're not." },
    { text: "[Something glows beneath the roots. Then dozens — drifting between the stones like drowned embers.]", auto: true, wait: 1.6 },
    { speaker: "Senna", text: "What is that." },
    { speaker: "Lida", text: "Bioluminescent fungi. Harmless." },
    { speaker: "Kael", text: "Probably." },
    { speaker: "Kael", text: "We need the Mossbridge path before what passes for dark here. Move." },
    { speaker: "Maren", text: "Something's following us.", setFlags: ["hollows_entered"] },
  ],
};

const DAVAN_JOINS: DialogSeq = {
  id: "davan_joins", context: "The Test",
  lines: [
    { text: "[Campfire in the Hollows. Davan sits at the edge of the light — just inside it.]", auto: true, wait: 1.6 },
    { speaker: "Senna", text: "He lifted a button off my coat. One of Kael's belt hooks. Lida's hair tie. While we slept." },
    { speaker: "Kael", text: "I know. He's testing us. Whether we'll chase him or cut him loose." },
    { speaker: "Maren", text: "Why'd you take them?" },
    { speaker: "Davan", text: "Two years alone in here, you develop habits. You take things to see if people come looking. Or to find out that they won't." },
    { speaker: "Davan", text: "Easier to know early." },
    { speaker: "Maren", text: "And if they come looking?" },
    { speaker: "Davan", text: "Then maybe they mean it." },
    { speaker: "Maren", text: "I'll be here in the morning." },
    { text: "[Davan passes a small carved button back into Maren's hand. Doesn't let go right away.]", auto: true, wait: 1.6 },
    { text: "[Morning. He's still there.]", auto: true, wait: 1.4 },
    { speaker: "Davan", text: "I can get you through the rest of the Hollows. I know the border paths to Stonemantle too.", partyAdd: "davan", setFlags: ["davan_joined"] },
    { speaker: "Lida", text: "I am so relieved. I've been reading the moss entirely wrong." },
  ],
};

const STALKER_ENCOUNTER: DialogSeq = {
  id: "hollow_stalker_encounter", context: "The Hollow Stalker",
  lines: [
    { text: "[Something massive moves in the shadow ahead. Not toward them. Around them.]", auto: true, wait: 1.4 },
    { speaker: "Davan", text: "Stop. Don't move." },
    { speaker: "Lida", text: "What is—" },
    { speaker: "Davan", text: "Hollow Stalker. It's been tracking us since the garden. It's deciding." },
    { speaker: "Kael", text: "Then let's help it decide." },
    { speaker: "Kael", text: "We fight.", setFlags: ["hollow_stalker_encountered"] },
  ],
};

const STALKER_DEFEATED: DialogSeq = {
  id: "hollow_stalker_defeated", context: "After the Stalker",
  lines: [
    { text: "[The Stalker dissolves into the shadow. The forest goes still.]", auto: true, wait: 1.6 },
    { speaker: "Davan", text: "I've seen three people killed by those things." },
    { speaker: "Kael", text: "Before today." },
    { speaker: "Davan", text: "Before today." },
    { speaker: "Lida", text: "Is it dead?" },
    { speaker: "Davan", text: "No. Just done.", setFlags: ["hollow_stalker_defeated"] },
  ],
};

const IRONHOLD_ARRIVAL: DialogSeq = {
  id: "ironhold_arrival", context: "The Vertical City",
  lines: [
    { text: "[Ironhold. An entire city carved into a cliff face — walkways and iron bridges connecting hundreds of chambers, lit by veins of mineral that glow faint silver.]", auto: true, wait: 2 },
    { speaker: "Lida", text: "It's..." },
    { speaker: "Kael", text: "The Stonecutters' Guild. Two hundred years of work, at least." },
    { speaker: "Davan", text: "I've heard stories. They were underselling it." },
    { speaker: "Kael", text: "Every Valcrest assessment of Ironhold says the same thing: it cannot be taken by force." },
    { speaker: "Maren", text: "Then let's earn what we can't take.", setFlags: ["ironhold_arrived"] },
  ],
};

const YARA_JOINS: DialogSeq = {
  id: "yara_joins", context: "The Champion",
  lines: [
    { text: "[The fight is over. Yara is on one knee, breathing hard. The crowd is silent.]", auto: true, wait: 1.6 },
    { speaker: "Yara", text: "You hit like a breeze. No force. No impact. But somehow I'm on the ground. Explain." },
    { speaker: "Maren", text: "I made sure everyone around me was hitting at their best. You were fighting all of us at once." },
    { speaker: "Yara", text: "That's not a fighting style." },
    { speaker: "Maren", text: "No." },
    { speaker: "Yara", text: "I've never lost in the pits." },
    { speaker: "Kael", text: "Neither have most of the things we've fought." },
    { speaker: "Yara", text: "I want to understand what you do." },
    { speaker: "Maren", text: "Then come with us." },
    { speaker: "Yara", text: "I'll escort you personally. So I can keep watching you.", partyAdd: "yara", setFlags: ["yara_joined"] },
    { speaker: "Davan", text: "She said that the same way I did." },
    { speaker: "Lida", text: "You really did." },
  ],
};

const MIRROR_ENCOUNTER: DialogSeq = {
  id: "mirror_encounter", context: "The Echo",
  lines: [
    { text: "[The air here is wrong. The Lattice hums at the wrong frequency — like a string plucked too hard, still vibrating.]", auto: true, wait: 1.4 },
    { speaker: "Maren", text: "Something happened here. Something Conduit-level." },
    { speaker: "Lida", text: "I tried reaching it with my magic. It reflected. Everything I put toward it came back." },
    { speaker: "Maren", text: "A Conduit echo. Lattice energy still running — still reacting — but empty. Someone was here and then wasn't." },
    { speaker: "Maren", text: "I have to go in. It's responding to me specifically." },
    { text: "[He steps forward. The temperature drops ten degrees. The echo turns toward him.]", auto: true, wait: 1.5, setFlags: ["mirror_encountered"] },
  ],
};

const MIRROR_DEFEATED: DialogSeq = {
  id: "mirror_defeated", context: "The Echo Ends",
  lines: [
    { text: "[The echo disperses. The cold breaks. The twisted Lattice collapses back into ordinary rock and char.]", auto: true, wait: 1.6 },
    { speaker: "Maren", text: "That was a Conduit. Sevrin drained them. Completely. This is what's left — an echo of someone who used to exist." },
    { speaker: "Maren", text: "That could be me. If he gets close enough, that's exactly what I become." },
    { speaker: "Kael", text: "It won't be. I'll pull you back. Same job I've had since Thornwall." },
    { text: "[They leave. Maren doesn't look back at the place where the echo was.]", auto: true, wait: 1.5, setFlags: ["mirror_defeated"] },
  ],
};

export type StoryBattle = { kind: "battle"; party: string[]; enemies: string[]; level: number; intro: string; escape?: boolean };
export type MapId = "thornwall" | "marsh" | "waystation" | "emberreach" | "hollows" | "stonemantle" | "field";
export type StoryStep =
  | { kind: "dialogue"; seq: DialogSeq; bg: string }
  | { kind: "overworld"; map: MapId; goal: string }
  | { kind: "battle"; party: string[]; enemies: string[]; level: number; intro: string; escape?: boolean }
  | { kind: "card"; title: string; sub: string };

export const STORY: StoryStep[] = [
  { kind: "dialogue", seq: INTRO_OPENING, bg: "dawn" },
  { kind: "overworld", map: "thornwall", goal: "Find Kael at the south gate" },
  { kind: "dialogue", seq: INTRO_ATTACK, bg: "dawn" },
  { kind: "battle", party: ["maren", "kael"], enemies: ["ashguard_scout", "ashguard_scout"], level: 3, intro: "Ashguard scouts breach the gate!", escape: false }, // sim: req Lv2
  { kind: "dialogue", seq: INTRO_CLINIC, bg: "clinic" },
  { kind: "dialogue", seq: GATE_FAREWELL, bg: "dawn" },
  { kind: "dialogue", seq: MARSH_ENTRY, bg: "marsh" },
  { kind: "overworld", map: "marsh", goal: "Cross the marsh to the waystation" },
  { kind: "battle", party: ["maren", "kael", "lida"], enemies: ["marsh_slime", "thornwall_wolf", "marsh_slime"], level: 3, intro: "Marsh creatures lunge from the fog!", escape: true },
  { kind: "overworld", map: "waystation", goal: "Speak with Fennick the scholar" },
  { kind: "dialogue", seq: FENNICK, bg: "clinic" },
  { kind: "overworld", map: "emberreach", goal: "Find the resistance in occupied Redhollow" },
  { kind: "dialogue", seq: SENNA_JOINS, bg: "dawn" },
  { kind: "dialogue", seq: RHOGAR_ENCOUNTER, bg: "dawn" },
  { kind: "battle", party: ["maren", "kael", "lida", "senna"], enemies: ["captain_rhogar"], level: 5, intro: "Captain Rhogar blocks the road!", escape: false },
  { kind: "dialogue", seq: RHOGAR_DEFEATED, bg: "dawn" },
  { kind: "card", title: "END OF ACT ONE", sub: "Emberreach breathes again. The road to the Hollows awaits." },
  // ---- ACT TWO: The Hollows ----
  { kind: "card", title: "ACT TWO", sub: "The Hollows" },
  { kind: "dialogue", seq: HOLLOWS_ARRIVAL, bg: "hollows" },
  { kind: "overworld", map: "hollows", goal: "Find the Mossbridge path" },
  { kind: "battle", party: ["maren", "kael", "lida", "senna"], enemies: ["shadow_creeper", "gloom_moth"], level: 6, intro: "Shadows stir in the Hollows!", escape: true },
  { kind: "dialogue", seq: DAVAN_JOINS, bg: "hollows" },
  { kind: "dialogue", seq: STALKER_ENCOUNTER, bg: "hollows" },
  { kind: "battle", party: ["maren", "kael", "davan", "lida"], enemies: ["hollow_stalker"], level: 7, intro: "The Hollow Stalker strikes from the dark!", escape: false },
  { kind: "dialogue", seq: STALKER_DEFEATED, bg: "hollows" },
  { kind: "card", title: "THE HOLLOWS — CLEARED", sub: "The border paths to Stonemantle lie ahead." },
  // ---- ACT TWO: Stonemantle & the Mirror ----
  { kind: "dialogue", seq: IRONHOLD_ARRIVAL, bg: "dawn" },
  { kind: "overworld", map: "stonemantle", goal: "Reach the fighting pits" },
  { kind: "battle", party: ["maren", "kael", "lida", "davan"], enemies: ["yara_duel"], level: 8, intro: "Yara, champion of the pits, tests you!", escape: false },
  { kind: "dialogue", seq: YARA_JOINS, bg: "dawn" },
  { kind: "dialogue", seq: MIRROR_ENCOUNTER, bg: "hollows" },
  { kind: "battle", party: ["maren", "senna", "kael", "lida"], enemies: ["the_mirror"], level: 10, intro: "The Conduit echo lashes out! (It reflects — fire burns it.)", escape: false },
  { kind: "dialogue", seq: MIRROR_DEFEATED, bg: "hollows" },
  { kind: "card", title: "STONEMANTLE", sub: "A champion won, an echo silenced. Sevrin's shadow grows. To be continued." },
];

// ---- story state + persistence ----
// hp/mp are the member's CURRENT pool, persisted between battles. undefined = full
// (a fresh member, or one that has rested). Story battles carry wounds forward; the
// clinic and other rest points restore them.
export interface Prog { level: number; xp: number; hp?: number; mp?: number; }
export interface Bounty { target: string; need: number; have: number; }
export interface StoryState { step: number; loc: MapId; flags: Record<string, boolean>; party: string[]; prog: Record<string, Prog>; equip: Record<string, EquipSet>; marks: number; inventory: Record<string, number>; ownedEquip: string[]; bounty: Bounty | null; }
const KEY = "vanguard.story.v1";
export function newStory(): StoryState {
  return { step: 0, loc: "thornwall", flags: {}, party: ["maren", "kael"], prog: { maren: { level: 1, xp: 0 }, kael: { level: 1, xp: 0 } }, equip: {}, marks: 80, inventory: { ...START_INVENTORY }, ownedEquip: [], bounty: null };
}

// ---- currency + shared inventory ----
export function getMarks(): number { return getStory().marks; }
export function addMarks(n: number) { const st = getStory(); st.marks = Math.max(0, st.marks + n); saveStory(st); }
export function spendMarks(n: number): boolean { const st = getStory(); if (st.marks < n) return false; st.marks -= n; saveStory(st); return true; }
export function getInventory(): Record<string, number> { return getStory().inventory; }
export function addItem(id: string, n = 1) { const st = getStory(); st.inventory[id] = (st.inventory[id] ?? 0) + n; saveStory(st); }

// ---- farmer's repeatable hunting bounty ----
// Low-level creatures that roam the pasture outside the fence (and what the farmer can target).
export const FIELD_CREATURES = ["thornwall_wolf", "marsh_slime", "forest_spider", "field_rat"];
export const creatureName = (id: string) => ENEMY_DEFS[id]?.name ?? id;
export function getBounty(): Bounty | null { return getStory().bounty; }
export function bountyReward(b: Bounty): number { return 20 + b.need * 12; }
export function assignBounty(): Bounty {
  const st = getStory();
  const target = FIELD_CREATURES[Math.floor(Math.random() * FIELD_CREATURES.length)];
  const need = 3 + Math.floor(Math.random() * 4); // 3..6
  st.bounty = { target, need, have: 0 };
  saveStory(st);
  return st.bounty;
}
export function clearBounty() { const st = getStory(); st.bounty = null; saveStory(st); }
// count defeated enemies toward the active bounty (called after each won battle)
export function addBountyKills(enemyIds: string[]) {
  const st = getStory(); const b = st.bounty; if (!b) return;
  const n = enemyIds.filter((id) => id === b.target).length;
  if (n > 0) { b.have = Math.min(b.need, b.have + n); saveStory(st); }
}

export function getEquip(id: string): EquipSet | undefined { return getStory().equip[id]; }
// Receive a piece of equipment. Auto-equips it to an eligible member whose slot is
// empty (immediate payoff for story rewards); otherwise it goes to the shared stash
// for the player to assign via the party menu. Returns the recipient id, or null if stashed.
export function giveEquip(itemId: string): string | null {
  const e = EQUIP[itemId];
  if (!e) return null;
  const st = getStory();
  const eligible = st.party.filter((id) => !e.for || e.for.includes(id));
  const target = eligible.find((id) => !(st.equip[id]?.[e.slot]));
  if (target) { (st.equip[target] ??= {})[e.slot] = itemId; saveStory(st); return target; }
  st.ownedEquip.push(itemId); saveStory(st); return null;
}
// add straight to the stash (used by shops — the player chooses who wears it)
export function addOwnedEquip(itemId: string) { if (!EQUIP[itemId]) return; const st = getStory(); st.ownedEquip.push(itemId); saveStory(st); }
// stash items a given member could wear in a given slot
export function stashFor(memberId: string, slot: EquipSlot): string[] {
  return getStory().ownedEquip.filter((id) => { const e = EQUIP[id]; return !!e && e.slot === slot && (!e.for || e.for.includes(memberId)); });
}
// equip a stash item onto a member; any item displaced from that slot returns to the stash
export function equipItem(memberId: string, itemId: string) {
  const e = EQUIP[itemId]; if (!e) return;
  const st = getStory();
  const i = st.ownedEquip.indexOf(itemId); if (i < 0) return;
  st.ownedEquip.splice(i, 1);
  const cur = st.equip[memberId]?.[e.slot];
  if (cur) st.ownedEquip.push(cur);
  (st.equip[memberId] ??= {})[e.slot] = itemId;
  saveStory(st);
}
// unequip a slot back into the stash
export function unequipItem(memberId: string, slot: EquipSlot) {
  const st = getStory();
  const cur = st.equip[memberId]?.[slot];
  if (!cur) return;
  st.ownedEquip.push(cur);
  delete st.equip[memberId]![slot];
  saveStory(st);
}

export const xpToNext = (lvl: number) => 40 + lvl * 20;
export const XP_MULT = 1.5; // tuned via sim/sim.ts

export function getLevel(id: string): number { return getStory().prog[id]?.level ?? 1; }
// ---- persistent HP/MP pools (current values carried between story battles) ----
const partyDef = (id: string) => PARTY_DEFS.find((d) => d.id === id);
export function maxHpFor(id: string): number { const d = partyDef(id); if (!d) return 1; return statsAtLevel(d, getLevel(id)).maxHp + equipBonus(getEquip(id)).hp; }
export function maxMpFor(id: string): number { const d = partyDef(id); if (!d) return 0; return statsAtLevel(d, getLevel(id)).maxMp + equipBonus(getEquip(id)).mp; }
// current HP/MP; undefined pool means "full" (clamped to max in case equipment/level changed)
export function getCurHp(id: string): number { const p = getStory().prog[id]; const mx = maxHpFor(id); return p?.hp != null ? Math.min(p.hp, mx) : mx; }
export function getCurMp(id: string): number { const p = getStory().prog[id]; const mx = maxMpFor(id); return p?.mp != null ? Math.min(p.mp, mx) : mx; }
// write back HP/MP after a battle so wounds (and spent MP) persist into the next fight
export function setCurHpMp(id: string, hp: number, mp: number) {
  const st = getStory(); const p = st.prog[id] ?? (st.prog[id] = { level: 1, xp: 0 });
  p.hp = Math.max(0, Math.min(hp, maxHpFor(id))); p.mp = Math.max(0, Math.min(mp, maxMpFor(id)));
  saveStory(st);
}
// full rest: restore every party member to max HP/MP (clinic cot, inns, etc.)
export function restParty() {
  const st = getStory();
  for (const id of st.party) { const p = st.prog[id] ?? (st.prog[id] = { level: 1, xp: 0 }); p.hp = maxHpFor(id); p.mp = maxMpFor(id); }
  saveStory(st);
}
// does anyone in the active party need patching up? (gates the clinic's "rest" prompt)
export function partyNeedsRest(): boolean { return activeParty().some((id) => getCurHp(id) < maxHpFor(id) || getCurMp(id) < maxMpFor(id)); }
// Effective Bond: design says BND grows +1 per level-up (atop story/bond-quest jumps).
// Maren is the Conduit source and has no BND (def.bnd undefined) -> returns undefined.
export function getBnd(id: string): number | undefined {
  const def = PARTY_DEFS.find((d) => d.id === id);
  if (!def || def.bnd == null) return undefined;
  return def.bnd + (getLevel(id) - 1);
}
export function avgPartyLevel(): number {
  const ls = Object.values(getStory().prog).map((p) => p.level);
  return ls.length ? Math.max(1, Math.round(ls.reduce((a, b) => a + b, 0) / ls.length)) : 1;
}
// a newly recruited member starts near the party's current level (not Lv1)
export function joinMember(id: string) {
  const st = getStory();
  if (!st.party.includes(id)) st.party.push(id);
  if (!st.prog[id]) st.prog[id] = { level: avgPartyLevel(), xp: 0 };
  saveStory(st);
}
// award XP to specific members, applying level-ups; returns [{id, newLevel}] for those who leveled
export function awardXp(ids: string[], amount: number): { id: string; level: number }[] {
  const st = getStory();
  const ups: { id: string; level: number }[] = [];
  for (const id of ids) {
    const p = st.prog[id] ?? (st.prog[id] = { level: 1, xp: 0 });
    p.xp += amount;
    let leveled = false;
    while (p.level < 30 && p.xp >= xpToNext(p.level)) { p.xp -= xpToNext(p.level); p.level++; leveled = true; }
    if (leveled) ups.push({ id, level: p.level });
  }
  saveStory(st);
  return ups;
}
// the active party (Maren + up to 3 others), used for optional field battles
export function activeParty(): string[] { return getStory().party.slice(0, 4); }
export function flag(f: string): boolean { return !!getStory().flags[f]; }
export function setFlag(f: string) { const st = getStory(); st.flags[f] = true; saveStory(st); }

// transient (not saved): where to drop the player when re-entering a map/venue after a fight.
// `venue` distinguishes a region (null) from an interior/field overlay so a field encounter
// returns you to where you fought, not the field entrance.
let owResume: { map: string; x: number; y: number; venue?: string | null } | null = null;
export function setOwResume(p: { map: string; x: number; y: number; venue?: string | null } | null) { owResume = p; }
export function getOwResume() { return owResume; }

// transient (not saved): which building interior the overworld should render instead of the
// town map. Set when walking into a door; cleared when leaving. The story step is unchanged.
let venue: string | null = null;
export function setVenue(id: string | null) { venue = id; }
export function getVenue() { return venue; }

// ---- side-quest dialogue (overlay, played from the overworld) ----
export const Q_TOLLER: DialogSeq = {
  id: "toller_quest", context: "The Broken Wall",
  lines: [
    { speaker: "Toller", text: "You're Renna's boy. Good — I need hands, and mine are useless this week." },
    { speaker: "Toller", text: "The south wall cracked in the last frost. There's a breach on the east stretch by the gate, wide enough for trouble to walk through." },
    { speaker: "Maren", text: "I'll shore it up. Anything I should know?" },
    { speaker: "Toller", text: "Heard growling out past the timber this morning. If wolves found the gap before we did... be ready.", setFlags: ["wall_quest"] },
  ],
};
export const Q_TOLLER_THANKS: DialogSeq = {
  id: "toller_thanks", context: "Grateful",
  lines: [{ speaker: "Toller", text: "The breach is holding. Good work, boy — Thornwall won't forget it." }],
};
export const Q_WALL_REPAIR: DialogSeq = {
  id: "wall_repair", context: "Sealing the Breach",
  lines: [
    { text: "[The breach — splintered timber, frost-cracked stone, and wolf tracks in the mud.]", auto: true, wait: 1.4 },
    { speaker: "Maren", text: "That's the last of them. Now to close this gap before anything else gets ideas." },
    { text: "[He hauls timber, packs the breach with stone, and lashes it tight.]", auto: true, wait: 1.4 },
    { speaker: "Maren", text: "There. That'll hold through the season.", setFlags: ["wall_fixed"], giveEquip: "lucky_charm", giveXp: 25 },
  ],
};
// clearing a story battle locks the party to at least its floor level (keeps prog consistent)
export function ensureLevel(ids: string[], minLevel: number) {
  const st = getStory();
  let changed = false;
  for (const id of ids) {
    const p = st.prog[id] ?? (st.prog[id] = { level: 1, xp: 0 });
    if (p.level < minLevel) { p.level = minLevel; changed = true; }
  }
  if (changed) saveStory(st);
}

export interface BattleConfig { party: string[]; enemies: string[]; level: number; intro: string; escape?: boolean; field?: boolean; returnStep?: number; nodeFlag?: string; rewardEquip?: string; returnLoc?: MapId; doneFlag?: string; }
export function saveStory(s: StoryState) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } }
export function loadStory(): StoryState | null {
  try {
    const v = localStorage.getItem(KEY);
    if (!v) return null;
    const raw = JSON.parse(v) as Partial<StoryState>;
    if (!raw || typeof raw !== "object") return null;
    // Backfill any missing/corrupt fields so consumers (activeParty, prog lookups,
    // PARTY_DEFS.find) never hit undefined from an old or partial save.
    const base = newStory();
    const s: StoryState = {
      step: typeof raw.step === "number" ? raw.step : base.step,
      flags: raw.flags && typeof raw.flags === "object" ? raw.flags : {},
      party: Array.isArray(raw.party) && raw.party.length ? raw.party.filter((id) => PARTY_DEFS.some((d) => d.id === id)) : base.party,
      prog: raw.prog && typeof raw.prog === "object" ? raw.prog : {},
      equip: raw.equip && typeof raw.equip === "object" ? raw.equip : {},
      marks: typeof raw.marks === "number" && raw.marks >= 0 ? raw.marks : base.marks,
      inventory: raw.inventory && typeof raw.inventory === "object" ? raw.inventory : { ...START_INVENTORY },
      ownedEquip: Array.isArray(raw.ownedEquip) ? raw.ownedEquip.filter((id) => EQUIP[id]) : [],
      bounty: raw.bounty && typeof raw.bounty === "object" && ENEMY_DEFS[(raw.bounty as Bounty).target] ? raw.bounty as Bounty : null,
      loc: typeof raw.loc === "string" ? raw.loc as MapId : "thornwall",
    };
    if (s.party.length === 0) s.party = base.party.slice();
    // ensure every party member has a prog entry
    for (const id of s.party) if (!s.prog[id]) s.prog[id] = { level: 1, xp: 0 };
    return s;
  } catch { return null; }
}
export function hasStorySave(): boolean { const s = loadStory(); return !!s && (Object.keys(s.flags).length > 0 || s.loc !== "thornwall"); }
export function clearStory() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }

let cur: StoryState | null = null;
export function getStory(): StoryState { if (!cur) cur = newStory(); return cur; }
export function setStory(s: StoryState) { cur = s; }

// ============================ CONNECTED WORLD ============================
// Aethara is one walkable world: regions linked by gates, with story "beats"
// (dialogue / battle) that fire in place when you reach a spot or talk to an NPC —
// gated by flags. Completing a beat sets its flag (= its id). No linear scene-cuts.

export interface Gate { x: number; y: number; w: number; h: number; to: MapId; toX: number; toY: number; label: string; locked?: () => boolean; }
export interface WorldBeat {
  id: string;            // completion flag
  loc: MapId;
  talk?: { x: number; y: number; sprite: string; label: string; color: number }; // press Z near to fire
  at?: { x: number; y: number; r?: number };  // auto-fire on proximity
  cinematic?: boolean;   // auto-fire immediately when pending (arrivals, post-fight lines)
  when: () => boolean;   // preconditions (flags)
  kind: "dialogue" | "battle";
  seq?: DialogSeq;
  bg?: string;           // backdrop for cinematic beats (dawn/clinic/marsh/hollows)
  battle?: { party: string[]; enemies: string[]; intro: string; escape?: boolean };
  objective?: string;    // banner hint while this is the next pending beat
}

export const WORLD_BEATS: WorldBeat[] = [
  // --- THORNWALL: the morning, the attack, Maren's awakening ---
  { id: "b_open", loc: "thornwall", cinematic: true, when: () => true, kind: "dialogue", seq: INTRO_OPENING, objective: "Find Kael at the south gate" },
  { id: "b_kael", loc: "thornwall", talk: { x: 300, y: 490, sprite: "kael", label: "Kael", color: 0xd9b25e }, when: () => flag("b_open"), kind: "dialogue", seq: INTRO_ATTACK, objective: "Find Kael at the south gate" },
  { id: "b_gate", loc: "thornwall", at: { x: 300, y: 482, r: 70 }, when: () => flag("b_kael"), kind: "battle", battle: { party: ["maren", "kael"], enemies: ["ashguard_scout", "ashguard_scout"], intro: "Ashguard scouts breach the gate!", escape: false }, objective: "Defend the south gate!" },
  { id: "b_clinic", loc: "thornwall", cinematic: true, when: () => flag("b_gate"), kind: "dialogue", seq: INTRO_CLINIC, bg: "clinic" },
  { id: "b_farewell", loc: "thornwall", cinematic: true, when: () => flag("b_clinic"), kind: "dialogue", seq: GATE_FAREWELL, objective: "Leave through the south gate" },
  // --- THE MARSH ---
  { id: "b_marsh_in", loc: "marsh", cinematic: true, when: () => true, kind: "dialogue", seq: MARSH_ENTRY, objective: "Cross the marsh" },
  { id: "b_marsh_fight", loc: "marsh", at: { x: 192, y: 250, r: 48 }, when: () => flag("b_marsh_in"), kind: "battle", battle: { party: ["maren", "kael", "lida"], enemies: ["marsh_slime", "thornwall_wolf", "marsh_slime"], intro: "Marsh creatures lunge from the fog!", escape: true }, objective: "Cross the marsh to the waystation" },
  // --- WAYSTATION ---
  { id: "b_fennick", loc: "waystation", talk: { x: 270, y: 256, sprite: "elder", label: "Fennick", color: 0x9ab0e0 }, when: () => true, kind: "dialogue", seq: FENNICK, objective: "Speak with Fennick the scholar" },
  // --- REDHOLLOW (Emberreach) ---
  { id: "b_senna", loc: "emberreach", talk: { x: 300, y: 210, sprite: "senna", label: "?", color: 0xf77622 }, when: () => true, kind: "dialogue", seq: SENNA_JOINS, objective: "Find the resistance in Redhollow" },
  { id: "b_rhogar_meet", loc: "emberreach", cinematic: true, when: () => flag("b_senna"), kind: "dialogue", seq: RHOGAR_ENCOUNTER },
  { id: "b_rhogar", loc: "emberreach", cinematic: true, when: () => flag("b_rhogar_meet"), kind: "battle", battle: { party: ["maren", "kael", "lida", "senna"], enemies: ["captain_rhogar"], intro: "Captain Rhogar blocks the road!", escape: false }, objective: "Drive Captain Rhogar from Redhollow" },
  { id: "b_rhogar_done", loc: "emberreach", cinematic: true, when: () => flag("b_rhogar"), kind: "dialogue", seq: RHOGAR_DEFEATED, objective: "Redhollow breathes — press on to the Hollows" },
  // --- THE HOLLOWS ---
  { id: "b_hollows_in", loc: "hollows", cinematic: true, when: () => true, kind: "dialogue", seq: HOLLOWS_ARRIVAL, objective: "Find the Mossbridge path" },
  { id: "b_hollows_fight", loc: "hollows", at: { x: 250, y: 150, r: 48 }, when: () => flag("b_hollows_in"), kind: "battle", battle: { party: ["maren", "kael", "lida", "senna"], enemies: ["shadow_creeper", "gloom_moth"], intro: "Shadows stir in the Hollows!", escape: true }, objective: "Find the Mossbridge path" },
  { id: "b_davan", loc: "hollows", cinematic: true, when: () => flag("b_hollows_fight"), kind: "dialogue", seq: DAVAN_JOINS },
  { id: "b_stalker_meet", loc: "hollows", cinematic: true, when: () => flag("b_davan"), kind: "dialogue", seq: STALKER_ENCOUNTER },
  { id: "b_stalker", loc: "hollows", cinematic: true, when: () => flag("b_stalker_meet"), kind: "battle", battle: { party: ["maren", "kael", "davan", "lida"], enemies: ["hollow_stalker"], intro: "The Hollow Stalker strikes from the dark!", escape: false }, objective: "Survive the Hollow Stalker" },
  { id: "b_stalker_done", loc: "hollows", cinematic: true, when: () => flag("b_stalker"), kind: "dialogue", seq: STALKER_DEFEATED, objective: "Cross to Stonemantle" },
  // --- STONEMANTLE (Ironhold) ---
  { id: "b_ironhold", loc: "stonemantle", cinematic: true, when: () => true, kind: "dialogue", seq: IRONHOLD_ARRIVAL, objective: "Reach the fighting pits" },
  { id: "b_yara", loc: "stonemantle", at: { x: 300, y: 152, r: 46 }, when: () => flag("b_ironhold"), kind: "battle", battle: { party: ["maren", "kael", "lida", "davan"], enemies: ["yara_duel"], intro: "Yara, champion of the pits, tests you!", escape: false }, objective: "Face Yara in the fighting pit" },
  { id: "b_yara_done", loc: "stonemantle", cinematic: true, when: () => flag("b_yara"), kind: "dialogue", seq: YARA_JOINS },
  { id: "b_mirror_meet", loc: "stonemantle", cinematic: true, when: () => flag("b_yara_done"), kind: "dialogue", seq: MIRROR_ENCOUNTER },
  { id: "b_mirror", loc: "stonemantle", cinematic: true, when: () => flag("b_mirror_meet"), kind: "battle", battle: { party: ["maren", "senna", "kael", "lida"], enemies: ["the_mirror"], intro: "The Conduit echo lashes out! (It reflects — fire burns it.)", escape: false }, objective: "Shatter the Mirror" },
  { id: "b_mirror_done", loc: "stonemantle", cinematic: true, when: () => flag("b_mirror"), kind: "dialogue", seq: MIRROR_DEFEATED, objective: "Stonemantle holds. (More of Vanguard is on the way.)" },
];

export const WORLD_GATES: Partial<Record<MapId, Gate[]>> = {
  thornwall: [
    { x: 296, y: 500, w: 40, h: 18, to: "marsh", toX: 192, toY: 56, label: "SOUTH GATE", locked: () => !flag("b_farewell") },
  ],
  marsh: [
    { x: 174, y: 24, w: 28, h: 16, to: "thornwall", toX: 316, toY: 122, label: "↑ THORNWALL" },
    { x: 160, y: 442, w: 64, h: 16, to: "waystation", toX: 44, toY: 200, label: "WAYSTATION ↓" },
  ],
  waystation: [
    { x: 8, y: 184, w: 18, h: 50, to: "marsh", toX: 192, toY: 430, label: "← MARSH" },
    { x: 514, y: 184, w: 18, h: 50, to: "emberreach", toX: 64, toY: 300, label: "REDHOLLOW →", locked: () => !flag("b_fennick") },
  ],
  emberreach: [
    { x: 8, y: 276, w: 18, h: 52, to: "waystation", toX: 496, toY: 200, label: "← WAYSTATION" },
    { x: 538, y: 150, w: 18, h: 52, to: "hollows", toX: 252, toY: 48, label: "THE HOLLOWS →", locked: () => !flag("b_rhogar_done") },
  ],
  hollows: [
    { x: 238, y: 24, w: 28, h: 16, to: "emberreach", toX: 500, toY: 176, label: "↑ REDHOLLOW" },
    { x: 110, y: 472, w: 50, h: 18, to: "stonemantle", toX: 60, toY: 176, label: "STONEMANTLE ↓", locked: () => !flag("b_stalker_done") },
  ],
  stonemantle: [
    { x: 8, y: 150, w: 18, h: 52, to: "hollows", toX: 134, toY: 460, label: "← THE HOLLOWS" },
  ],
};

export function gatesFor(loc: MapId): Gate[] { return WORLD_GATES[loc] ?? []; }
export function pendingBeats(loc: MapId): WorldBeat[] { return WORLD_BEATS.filter((b) => b.loc === loc && !flag(b.id) && b.when()); }
export function currentObjective(): string {
  const here = pendingBeats(getStory().loc).find((b) => b.objective);
  if (here?.objective) return here.objective;
  const any = WORLD_BEATS.find((b) => !flag(b.id) && b.when() && b.objective);
  return any?.objective ?? "Explore Aethara";
}
export function setLoc(loc: MapId) { const st = getStory(); st.loc = loc; saveStory(st); }

// Launch the world at the player's current region.
export function startStep(scene: Phaser.Scene) { scene.scene.start("overworld", { kind: "overworld", map: getStory().loc, goal: currentObjective() } as StoryStep); }

if (typeof window !== "undefined") (window as unknown as { STORYDBG: unknown }).STORYDBG = { getStory, setStory, newStory, STORY, WORLD_BEATS };
