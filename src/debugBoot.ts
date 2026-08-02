// Deterministic boot for the screenshot harness (see BRIEF.md §5).
//
// Completely inert unless the URL carries ?shot=<id>. When it does:
//   - Math.random and Phaser's RNG are replaced with a seeded PRNG, so damage
//     rolls, AI picks and particle scatter repeat exactly across runs.
//   - Story/run state is rebuilt in memory (never written to localStorage, so
//     opening a shot URL by hand cannot clobber a real save).
//   - The target scene starts directly with a fixed config.
//   - Random encounters are disarmed, so a wolf cannot walk into frame.
//   - The loop halts after a fixed FRAME COUNT -- not a wall-clock delay --
//     so idle animation phase is identical every run. Then VG_SHOT_READY
//     flips true and the harness captures.
//
// Sprite generation contains no randomness, so with the above in place two
// runs of the same shot are pixel-identical.
import Phaser from "phaser";
import { newStory, setStory, WORLD_BEATS, type MapId, type StoryState } from "./story";
import { newRun, setRun } from "./run";
import { bakeAll, SPRITE_KEY } from "./sprites";
import { preloadOverworldSheets } from "./overworldSprites";

export type ShotId = "title" | "overworld" | "battle" | "party" | "contact";

/**
 * Contact sheet: every baked sprite side by side on a neutral mid-value ground
 * (BRIEF.md §5, shot 5). This is the cohesion check -- a sprite whose light
 * direction, outline treatment or shade count differs from the cast is obvious
 * here and invisible in a scene, where it only ever appears alone.
 *
 * Mid-grey deliberately: a sprite judged against a dark battle background will
 * be tuned too light, and against a light one too dark.
 */
class ContactScene extends Phaser.Scene {
  constructor() { super("contact"); }
  preload() { preloadOverworldSheets(this); }
  create() {
    bakeAll(this);
    const GROUND = 0x6b6b73;
    this.cameras.main.setBackgroundColor(GROUND);

    // ?focus=<key> inspects one sprite at the largest integer scale that fits.
    // &silhouette=1 flat-fills it, which is the readability test in BRIEF.md
    // §2.2 -- a character must stay identifiable from outline alone.
    const q = new URLSearchParams(window.location.search);
    const focus = q.get("focus");
    if (focus && this.textures.exists(focus)) {
      const src = this.textures.get(focus).getSourceImage() as { width: number; height: number };
      const z = Math.max(1, Math.floor(Math.min((384 * 0.8) / src.width, (216 * 0.8) / src.height)));
      const img = this.add.image(192, 108, focus).setOrigin(0.5).setScale(z);
      if (q.get("silhouette")) img.setTintFill(0x101018);
      return;
    }

    const keys = [...new Set(Object.values(SPRITE_KEY))];
    const cols = 8, cw = 48, ch = 54;
    keys.forEach((key, i) => {
      const cx = (i % cols) * cw + cw / 2;
      const cy = Math.floor(i / cols) * ch + ch / 2 - 4;
      if (!this.textures.exists(key)) return;
      this.add.image(cx, cy, key).setOrigin(0.5, 0.5);
      this.add
        .text(cx, cy + ch / 2 - 9, key.slice(0, 8), { fontFamily: "Silkscreen", fontSize: "8px", color: "#1a1a20" })
        .setOrigin(0.5, 0);
    });
  }
}

export interface ShotSpec {
  seed: number;
  frames: number;
  id: ShotId;
}

const DEFAULT_FRAMES = 90;
const DEFAULT_SEED = 1;

/** The cast used for every non-title shot. Mirrors the Hollows story beat so
 *  the baseline capture is directly comparable to docs/battle.png. */
const SHOT_PARTY = ["maren", "kael", "lida", "senna"];
const SHOT_LEVEL = 6;
const SHOT_ENEMIES = ["shadow_creeper", "gloom_moth"];
const SHOT_INTRO = "Shadows stir in the Hollows!";
const SHOT_LOC: MapId = "hollows";
/** Walkable shots use the home town: it has buildings, NPCs and signage, so it
 *  exercises far more of the tile and prop art than a forest does. */
const SHOT_OW_LOC: MapId = "thornwall";

/** mulberry32 -- small, fast, and stable across engines. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Parse ?shot=&seed=&frames= . Returns null when not in shot mode. */
export function readShotSpec(): ShotSpec | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search);
  const id = q.get("shot");
  if (!id) return null;
  if (id !== "title" && id !== "overworld" && id !== "battle" && id !== "party" && id !== "contact") {
    console.warn(`[shot] unknown shot id "${id}"`);
    return null;
  }
  const num = (key: string, fallback: number) => {
    const raw = q.get(key);
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  };
  return { id, seed: num("seed", DEFAULT_SEED), frames: num("frames", DEFAULT_FRAMES) };
}

/** Install the seeded RNG. MUST run before the Phaser.Game is constructed,
 *  because scene creation consumes randomness.
 *
 *  Only Math.random is replaced here. Phaser.Math.RND is null until the Game
 *  boots, so it is sown later in applyShot -- and because Phaser's generator
 *  seeds itself from Math.random when not explicitly sown, it inherits
 *  determinism from this override regardless. */
export function installShotRandom(spec: ShotSpec) {
  Math.random = mulberry32(spec.seed);
}

/** Sow Phaser's own generator once the Game exists. Guarded: RND is null
 *  pre-boot, and a missing generator is not worth failing a capture over. */
function sowPhaserRandom(spec: ShotSpec) {
  try {
    Phaser.Math.RND?.sow([String(spec.seed)]);
  } catch {
    /* non-fatal: Math.random is already deterministic */
  }
}

/** Build a fixed in-memory game state. Deliberately does NOT call saveStory /
 *  saveRun -- a shot must never write to localStorage. */
function installShotState(loc: MapId) {
  const st: StoryState = newStory();
  st.party = [...SHOT_PARTY];
  st.loc = loc;
  st.prog = {};
  for (const id of SHOT_PARTY) st.prog[id] = { level: SHOT_LEVEL, xp: 0 };
  // Mark every story beat as already seen. A fresh save has no flags, so
  // arriving anywhere fires that location's cutscene and the capture lands on
  // a dialogue box instead of the scene it asked for.
  for (const b of WORLD_BEATS) st.flags[b.id] = true;
  setStory(st);
  setRun(newRun());
}

/** Disarm anything that could change the frame between the scene settling and
 *  the capture: random encounters, and the encounter step accumulator. */
function quiesceOverworld(game: Phaser.Game) {
  const ow = game.scene.getScene("overworld") as unknown as
    | { encGroups?: unknown; encDist?: number; encThreshold?: number }
    | null;
  if (!ow) return;
  ow.encGroups = undefined;
  ow.encDist = 0;
  ow.encThreshold = Number.MAX_SAFE_INTEGER;
}

const FRAME_MS = 1000 / 60;

/** Stop every running scene so the shot scene is alone in frame. SceneManager
 *  .start() does not stop the boot scene, which would leave the title card
 *  composited under the capture. */
function stopAllScenes(game: Phaser.Game) {
  for (const s of game.scene.getScenes(false)) game.scene.stop(s.scene.key);
}

/**
 * Start the requested scene and advance the clock by hand.
 *
 * The loop is put to sleep and the game is stepped manually rather than left
 * to requestAnimationFrame. Two reasons, and the first is not optional:
 *   1. A backgrounded or headless tab never fires rAF, so an rAF-driven game
 *      renders zero frames and the capture is blank.
 *   2. Synthetic timestamps make the frame count -- and therefore the phase of
 *      every idle animation -- identical on every run, on any machine.
 */
export function applyShot(game: Phaser.Game, spec: ShotSpec) {
  sowPhaserRandom(spec);
  const walkable = spec.id === "overworld" || spec.id === "party";
  installShotState(walkable ? SHOT_OW_LOC : SHOT_LOC);
  stopAllScenes(game);

  switch (spec.id) {
    case "title":
      game.scene.start("title");
      break;
    case "overworld":
      game.scene.start("overworld", { kind: "overworld", map: SHOT_OW_LOC, goal: "" });
      break;
    case "battle":
      game.scene.start("battle", {
        story: {
          party: [...SHOT_PARTY],
          enemies: [...SHOT_ENEMIES],
          level: SHOT_LEVEL,
          intro: SHOT_INTRO,
          escape: true,
          field: true,
          returnLoc: SHOT_LOC,
        },
      });
      break;
    case "party":
      game.scene.start("overworld", { kind: "overworld", map: SHOT_OW_LOC, goal: "" });
      break;
    case "contact":
      if (!game.scene.getScene("contact")) game.scene.add("contact", ContactScene, false);
      game.scene.start("contact");
      break;
  }

  game.loop.sleep(); // take the clock away from rAF

  let t = 0;
  // Yield to the event loop between steps. Stepping in a tight synchronous
  // loop starves Phaser's asset loader -- any scene with a preload() renders
  // as an empty clear-colour frame. Determinism comes from the step COUNT and
  // the seeded RNG, not from running the steps back to back.
  const tick = () => new Promise<void>((r) => setTimeout(r, 0));

  const advance = async (n: number) => {
    for (let i = 0; i < n; i++) {
      t += FRAME_MS;
      game.step(t, FRAME_MS);
      if (spec.id === "overworld" || spec.id === "party") quiesceOverworld(game);
      await tick();
    }
  };

  /** Step until every active scene has finished loading, so the deterministic
   *  frame budget is spent on animation rather than on asset decode. Bounded:
   *  a stuck loader must fail the capture, not hang the harness. */
  const settle = async (maxFrames = 600) => {
    for (let i = 0; i < maxFrames; i++) {
      const loading = game.scene
        .getScenes(true)
        .some((s) => s.load && (s.load.isLoading() || s.load.totalToLoad > s.load.totalComplete));
      if (!loading && i > 4) return;
      t += FRAME_MS;
      game.step(t, FRAME_MS);
      await tick();
    }
  };

  /** Read the canvas back as a PNG data URL. Native 384x216 -- no viewport
   *  scaling, no device-pixel-ratio, no compositing required, which is both
   *  more faithful than a viewport screenshot and works in a hidden tab. */
  const capture = (): string => {
    // Re-step immediately before the read: some drivers still clear the buffer
    // on a context switch even with preserveDrawingBuffer set.
    t += FRAME_MS;
    game.step(t, FRAME_MS);
    return game.canvas.toDataURL("image/png");
  };

  // Exposed so the harness can push past a transition, hold a later animation
  // frame, or grab the canvas -- all without a rebuild.
  (window as unknown as {
    VG_SHOT: { advance: (n: number) => Promise<void>; capture: () => string; spec: ShotSpec };
  }).VG_SHOT = { advance, capture, spec };

  void (async () => {
    await settle();
    if (spec.id === "party") {
      // Launched only once the overworld exists and has finished loading --
      // starting both at once lets the overworld's create() win the race.
      game.scene.run("partymenu", { from: "overworld" });
      game.scene.pause("overworld");
      await settle();
    }
    await advance(spec.frames);
    (window as unknown as { VG_SHOT_READY: boolean }).VG_SHOT_READY = true;
  })();
}

/** Called from main.ts. Returns the spec so the caller can wire applyShot. */
export function beginShotMode(): ShotSpec | null {
  const spec = readShotSpec();
  if (!spec) return null;
  (window as unknown as { VG_SHOT_READY: boolean }).VG_SHOT_READY = false;
  installShotRandom(spec);
  return spec;
}
