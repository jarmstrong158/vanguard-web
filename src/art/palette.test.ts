// Makes the palette rules in BRIEF.md §1/§2.1 enforceable instead of
// conventions upheld by hand.
//
// These assert the DECLARATIONS, not baked pixels: baking needs a canvas, and
// a test that cannot run in CI is a test that stops running. Since every pixel
// is snapped to its character's declared palette at bake time, a bound on the
// declaration is a bound on the sprite.
import { describe, expect, it } from "vitest";
import { BEASTS, HEROES, marenPalette, paletteFor } from "./palette";
import { ramp, SHADOW_COOL, SHADOW_SKIN, toHSV } from "./shading";

/** Agreed ceiling. Above the style guide's 15 by a logged deviation
 *  (DECISIONS.md, milestone 2); this stops it drifting further. */
const MAX_COLOURS = 40;

const ALL: Record<string, Record<string, number>> = { ...HEROES, ...BEASTS };

/** Signed shortest distance between two hues on the circle, in degrees. */
function hueDelta(from: number, to: number): number {
  let d = to - from;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}
const hueOf = (c: number) => toHSV(c).h * 360;

describe("character palettes", () => {
  it("every character stays inside the colour ceiling", () => {
    const over: string[] = [];
    for (const [name, bases] of Object.entries(ALL)) {
      const n = paletteFor(bases, { castOn: ["skin"] }).length;
      if (n > MAX_COLOURS) over.push(`${name}: ${n}`);
    }
    expect(over).toEqual([]);
  });

  it("Maren's hand-built palette stays inside the ceiling too", () => {
    expect(marenPalette().length).toBeLessThanOrEqual(MAX_COLOURS);
  });

  it("no character declares two bases close enough to read as one colour", () => {
    // Bases within this squared RGB distance are indistinguishable at 384x216
    // and mean a material is not actually separable from its neighbour.
    const MIN_D2 = 120;
    // `eye` is excluded: it is a 2px accent sitting on skin, never adjacent to
    // hair, and its job is to be the darkest thing on the face -- so matching
    // a dark hair base is fine. Every other pair of materials on a figure can
    // end up side by side.
    const clashes: string[] = [];
    for (const [name, bases] of Object.entries(ALL)) {
      const es = Object.entries(bases).filter(([k]) => k !== "eye");
      for (let i = 0; i < es.length; i++) {
        for (let j = i + 1; j < es.length; j++) {
          const [ak, a] = es[i], [bk, b] = es[j];
          const dr = ((a >> 16) & 255) - ((b >> 16) & 255);
          const dg = ((a >> 8) & 255) - ((b >> 8) & 255);
          const db = (a & 255) - (b & 255);
          const d2 = dr * dr + dg * dg + db * db;
          if (d2 < MIN_D2) clashes.push(`${name}.${ak} ~ ${name}.${bk} (d2=${d2})`);
        }
      }
    }
    expect(clashes).toEqual([]);
  });
});

describe("shade derivation", () => {
  it("shadows shift hue, they do not merely darken", () => {
    // Brightness-only scaling is the 'plastic' look BRIEF §2.1 rejects.
    for (const [name, bases] of Object.entries(ALL)) {
      for (const [key, base] of Object.entries(bases)) {
        const { s } = toHSV(base);
        if (s < 0.12) continue; // near-greys have no meaningful hue to shift
        // A base already sitting on the shadow target has nowhere to rotate to
        // and correctly stays put -- e.g. moth.body is already violet.
        const toTarget = Math.abs(hueDelta(hueOf(base), SHADOW_COOL * 360));
        if (toTarget < 25) continue;
        // Below this brightness an 8-bit channel cannot represent a few
        // degrees of rotation: the shift happens in HSV and quantises away on
        // the way back. Real, just unrepresentable -- not a derivation bug.
        if (toHSV(base).v < 0.3 && toTarget < 45) continue;
        const r = ramp(base);
        expect(
          Math.abs(hueDelta(hueOf(base), hueOf(r.sh))),
          `${name}.${key} shadow did not shift hue`,
        ).toBeGreaterThan(0.5);
      }
    }
  });

  it("shaded skin still reads as skin", () => {
    // The olive-face bug, stated as the property that actually matters: the
    // shaded half of a face must stay in the warm band. Asserting a rotation
    // DIRECTION was the wrong test -- from a ~27deg base the short way to
    // blue-violet also runs backwards through red, so both targets rotate the
    // same way and the direction carries no information.
    const warmBand = (h: number) => h <= 60 || h >= 330;
    for (const [name, bases] of Object.entries(ALL)) {
      if (!("skin" in bases)) continue;
      const skin = bases.skin;
      const r = ramp(skin, 0.26, 0.2, SHADOW_SKIN);
      for (const [step, c] of [["sh", r.sh], ["dark", r.dark]] as const) {
        expect(warmBand(hueOf(c)), `${name}: skin ${step} left the warm band at ${Math.round(hueOf(c))}deg`).toBe(true);
      }
      expect(toHSV(r.sh).v, `${name}: skin shadow must darken`).toBeLessThan(toHSV(skin).v);
    }
  });

  it("ramp steps are strictly ordered by value", () => {
    const v = (c: number) => toHSV(c).v;
    for (const [name, bases] of Object.entries(ALL)) {
      for (const [key, base] of Object.entries(bases)) {
        const r = ramp(base);
        expect(v(r.dark), `${name}.${key}`).toBeLessThan(v(r.sh));
        expect(v(r.sh), `${name}.${key}`).toBeLessThan(v(r.base));
        // hi can clip at v=1 for an already-bright base, so allow equality
        expect(v(r.base), `${name}.${key}`).toBeLessThanOrEqual(v(r.hi));
      }
    }
  });

  it("no declared base is pure black", () => {
    // §8: no interior boundary uses black. Bases are the source of every shade.
    for (const [name, bases] of Object.entries(ALL))
      for (const [key, base] of Object.entries(bases))
        expect(base, `${name}.${key}`).not.toBe(0x000000);
  });
});
