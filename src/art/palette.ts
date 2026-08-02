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
