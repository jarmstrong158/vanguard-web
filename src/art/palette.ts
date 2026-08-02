import { highlight, ramp, shadow, SHADOW_SKIN } from "./shading";

// Declared base colours. BRIEF.md §2.1: this is the only file in which a
// colour literal may appear. Every shade used anywhere derives from one of
// these through art/shading.ts, so retuning a character is a one-line edit
// here rather than a hunt through draw code.
//
// Character palettes follow docs/sprite_style_guide.md §6.

/** Environment, UI and effect colours (Endesga-32 derived). */
export const PAL = {
  out: 0x181425,
  gold: 0xfee761, red: 0xe43b44, green: 0x63c74d, cyan: 0x2ce8f5, clothHi: 0xffffff,
  steel: 0x8b9bb4, steelSh: 0x5a6988, steelHi: 0xc0cbdc,
  sky1: 0x3a4466, sky2: 0x68386c, sky3: 0xb55088, sun: 0xf6757a, sunHi: 0xfee761,
  mtn: 0x262b44, mtnLt: 0x3a4466,
  grass: 0x265c42, grassDk: 0x193c3e, grassHi: 0x3e8948,
  panel: 0x181425, panelEdge: 0x3a4466, panelHi: 0x5a6988,
};

/**
 * Maren — the Conduit. Style guide §6.1: olive green tunic, dark brown hair,
 * golden sash, ash-wood staff.
 *
 * Only bases are declared. Shadow, highlight and darkest are derived, which is
 * what keeps the hue shift consistent across every material on the figure.
 */
export const MAREN = {
  skin: 0xe0a06a,
  hair: 0x4a3326,
  tunic: 0x76803a,
  vest: 0x355a30,
  sash: 0xf0b53c,
  pants: 0x6b4a32,
  staff: 0xc2a368,
  bandage: 0xe8dcb8,
  /** Iris. Deliberately a violet-leaning dark, never neutral black -- a pure
   *  black pupil punches a hole in a 32px face. */
  eye: 0x2a2030,
  /** Conduit crystal at the staff head. Cyan belongs here and nowhere else on
   *  the figure -- in the eye it overwhelms a 2px iris and reads as blue eyes,
   *  which contradicts the hazel in docs/characters/maren.md. */
  conduit: 0x6ad8ff,
  /** Faint gold Conduit glint in the iris. */
  eyeGlint: 0xc8a24a,
};

/**
 * Maren's complete colour set: the only values his sprite may contain. Every
 * pixel is snapped to the nearest entry at bake time.
 *
 * Larger than the style guide's 15-colour budget, deliberately -- see
 * DECISIONS.md. Ten materials at the three-shade minimum cannot fit in 15, and
 * the budget is a SNES hardware convention with no equivalent constraint here,
 * whereas the three-shade rule is what stops a sprite reading as flat. Bounding
 * the set is what matters for cohesion; the exact ceiling less so.
 */
/**
 * Build a bounded palette from a character's declared bases.
 *
 * Every base contributes its four ramp steps; `skinKeys` get the rosy shadow
 * target instead of the cool one, and `castOn` adds a deeper entry for any
 * material that receives a cast shadow -- without one, nearest-colour snapping
 * sends a deep shadow to whatever material happens to sit closest in RGB.
 * See DECISIONS.md, milestone 2.
 */
export function paletteFor(
  bases: Record<string, number>,
  opts: { skinKeys?: string[]; castOn?: string[]; extras?: number[] } = {},
): number[] {
  const { skinKeys = ["skin"], castOn = [], extras = [] } = opts;
  const out: number[] = [PAL.out, ...extras];
  for (const [k, base] of Object.entries(bases)) {
    const hue = skinKeys.includes(k) ? SHADOW_SKIN : undefined;
    const r = ramp(base, 0.26, 0.2, hue);
    out.push(r.dark, r.sh, r.base, r.hi);
    if (castOn.includes(k)) out.push(shadow(base, 0.5, hue));
  }
  return [...new Set(out)];
}

/** Party, NPCs and humanoid antagonists. One entry per material; every shade
 *  is derived. Skin keys get the rosy shadow target via paletteFor(). */
export const HEROES = {
  kael:  { skin: 0xe6b386, hair: 0xd9b25e, steel: 0x8b9bb4, leather: 0x4a3f36, gold: 0xd9a23a, scar: 0xcf7a68, eye: 0x355a7a },
  lida:  { skin: 0x7d4e30, hair: 0x231a24, robe: 0x6f8a52, apron: 0xddcda6, belt: 0x6b4a32, rod: 0xb0895a, leaf: 0x5db04a, flower: 0xf2757a, eye: 0x3a2418 },
  senna: { skin: 0x6a4330, hair: 0x1a141c, vest: 0x5c4838, scarf: 0xd64b4b, pants: 0x9a8868, staff: 0xb0895a, flame: 0xf77622, eye: 0x201018 },
  yara:  { skin: 0x7a5240, hair: 0x1a141c, gi: 0x4a4a52, sash: 0x9a6a3a, stone: 0x8a8a96, iron: 0xb0b6c0, eye: 0x2a1f18, amber: 0xc8902a },
  davan: { skin: 0xb89a82, hood: 0x2a2733, cloak: 0x342f3e, dark: 0x1c1924, blade: 0xc0cbdc, eye: 0x3a4a4a },
  mirror: { mass: 0x1a1830, crack: 0x6ad8ff },
  villager:  { skin: 0xe0a878, hair: 0x4a3326, tunic: 0x9a7a52, eye: 0x2a2030 },
  villager2: { skin: 0xc89a78, hair: 0x2a2030, tunic: 0x5a7a5a, eye: 0x2a2030 },
  elder:     { skin: 0xd8b89a, hair: 0xc0c0c8, tunic: 0x7a6a8a, eye: 0x2a2030 },
};

/** Enemies and beasts. One entry per material; shades are all derived. */
export const BEASTS = {
  /** Shadow Creeper. A dark creature is not a black creature (BRIEF §2.3) --
   *  it needs a full violet ramp with visible form, not one flat fill. */
  shade: { fur: 0x352a4e, muzzle: 0x231b34, eye: 0x8affd0 },
  moth: { wing: 0x4a3a66, wingEdge: 0x6a5a92, body: 0x2e2440, eye: 0xb08aff, spot: 0x8a6aff },
  wolf: { fur: 0x6b4a38, muzzle: 0x4a3226, eye: 0xff0044 },
  slime: { body: 0x3a9a6a, eyeWhite: 0xe8f0e8, pupil: 0x201828 },
  rat: { fur: 0x8a7a64, pink: 0xc98a8a, eye: 0xff4455 },
  spider: { body: 0x3a3050, leg: 0x241d38, mark: 0xb03a3a, eye: 0xff5a5a },
  stalker: { mass: 0x342448, claw: 0x6a7a8a, eye: 0x9affe0 },
  militia: { skin: 0xd9a878, hair: 0x4a3326, tunic: 0x9a8a52, leather: 0x6b4a32, steel: 0xb7bcc8, shaft: 0x8a6a44, eye: 0x2a2030 },
  ashguard: { skin: 0xc89a78, hair: 0x3a2d26, armor: 0x7a2f33, dark: 0x4a1f24, steel: 0x9aa0ae, shaft: 0x8a6a44, eye: 0xc0392b },
  rhogar: { skin: 0xc89a78, steel: 0x6a5560, red: 0xb02a33, dark: 0x3a2d31, gold: 0xe0a93a, flame: 0xf77622 },
};

export function marenPalette(): number[] {
  const skin = ramp(MAREN.skin, 0.26, 0.2, SHADOW_SKIN), hair = ramp(MAREN.hair), tunic = ramp(MAREN.tunic);
  const vest = ramp(MAREN.vest), sash = ramp(MAREN.sash), pants = ramp(MAREN.pants);
  const staff = ramp(MAREN.staff);
  return [...new Set([
    skin.dark, skin.sh, skin.base, skin.hi,
    hair.dark, hair.sh, hair.base, hair.hi,
    tunic.dark, tunic.sh, tunic.base, tunic.hi,
    vest.sh, vest.base, vest.hi,          // vest.dark collapses onto tunic.dark
    sash.sh, sash.base, sash.hi,
    pants.sh, pants.base, pants.hi,       // pants.dark collapses onto hair.dark
    staff.sh, staff.base, staff.hi,
    MAREN.bandage, MAREN.eye, MAREN.eyeGlint,
    MAREN.conduit, highlight(MAREN.conduit),
    PAL.out,                              // outer silhouette against transparency
    // Cast-shadow depths. A cast shadow darkens a pixel well past its own
    // ramp's shadow step; without an entry of the right hue at that depth,
    // nearest-colour snapping sends it to whatever material happens to sit
    // closest in RGB -- deep cool brown lands on dark green, and the shaded
    // side of the face turns olive.
    shadow(MAREN.skin, 0.5, SHADOW_SKIN), shadow(MAREN.tunic, 0.5), shadow(MAREN.pants, 0.5),
  ])];
}
