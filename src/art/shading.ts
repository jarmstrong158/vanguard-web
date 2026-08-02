// Shade derivation. The single source of every non-base colour in the game.
//
// BRIEF.md §2.1: no shadow or highlight is ever written by hand. Every shade is
// derived from a declared base in palette.ts through these functions, so
// retuning a base colour propagates everywhere instead of leaving its old
// hand-picked shades stranded next to it.
//
// Algorithm is the style guide's (docs/sprite_style_guide.md §2.3) ported from
// GDScript: shadows darken and shift cool, highlights lighten and shift warm.
// Brightness-only scaling reads as plastic.

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function toHSV(c: number) {
  const r = ((c >> 16) & 255) / 255, g = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  return { h, s: mx === 0 ? 0 : d / mx, v: mx };
}

export function fromHSV(h: number, s: number, v: number) {
  const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  let r = 0, g = 0, b = 0;
  switch (((i % 6) + 6) % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    default: r = v; g = p; b = q;
  }
  return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
}

/** Interpolate hue the short way around the circle. A linear lerp from 0.07
 *  (warm skin) to 0.65 (blue) travels forwards through yellow and green, which
 *  is why an unshifted skin shadow comes out olive instead of rosy. */
function lerpHue(a: number, b: number, t: number) {
  let d = b - a;
  if (d > 0.5) d -= 1;
  if (d < -0.5) d += 1;
  return ((a + d * t) % 1 + 1) % 1;
}

/** Hue that shadows lean toward. Cloth, metal and foliage go blue-violet;
 *  skin goes rosy red-brown, per style guide §2.3. */
export const SHADOW_COOL = 0.65;
export const SHADOW_SKIN = 0.98;

/** Darken and shift the hue toward `target`. */
export function shadow(c: number, amt = 0.26, target = SHADOW_COOL) {
  const { h, s, v } = toHSV(c);
  return fromHSV(lerpHue(h, target, amt * 0.3), clamp01(s * (1 - amt * 0.15)), clamp01(v * (1 - amt)));
}

/** Lighten and shift the hue toward yellow. */
export function highlight(c: number, amt = 0.2) {
  const { h, s, v } = toHSV(c);
  return fromHSV(lerp(h, 0.12, amt * 0.4), clamp01(s * (1 + amt * 0.1)), clamp01(v + amt));
}

export function blend(a: number, b: number, t: number) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(lerp(ar, br, t)) << 16) | (Math.round(lerp(ag, bg, t)) << 8) | Math.round(lerp(ab, bb, t));
}

export interface Ramp {
  /** Darkest: interior boundaries and selective outlining. Never pure black. */
  dark: number;
  sh: number;
  base: number;
  hi: number;
}

/** Four derived steps from one declared base. `dark` exists so an outline can
 *  be the material's own darkest shade rather than a shared black keyline. */
export function ramp(base: number, shAmt = 0.26, hiAmt = 0.2, shHue = SHADOW_COOL): Ramp {
  return {
    dark: shadow(base, shAmt + 0.28, shHue),
    sh: shadow(base, shAmt, shHue),
    base,
    hi: highlight(base, hiAmt),
  };
}

/** Deterministic per-pixel noise in [0,1). No Math.random: sprite generation
 *  must stay byte-identical across runs or the screenshot harness is useless. */
export function hash01(x: number, y: number): number {
  let n = (x * 374761393 + y * 668265263) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/**
 * Which shade a pixel takes under a top-left light, as an index into
 * [hi, base, sh].
 *
 * The light falls along the diagonal, so the bands run perpendicular to it and
 * a form reads as rounded rather than as a flat panel with a rim. The boundary
 * is jittered by a deterministic hash because a clean straight band is the
 * "banding" pitfall in the style guide §8.2 -- broken edges read as gradient,
 * straight ones read as stripes.
 */
export function shadeIndex(
  x: number, y: number,
  x0: number, y0: number, w: number, h: number,
  jitter = 0.07,
): 0 | 1 | 2 {
  const d = 0.5 * ((x - x0 + 0.5) / w + (y - y0 + 0.5) / h) + jitter * (hash01(x, y) - 0.5);
  if (d < 0.32) return 0;
  if (d < 0.68) return 1;
  return 2;
}
