// Battle backdrop (BRIEF.md §2.4).
//
// The old backdrop was two flat colour bands and one mountain silhouette. Good
// sprites on that read as pasted on, because nothing behind them describes
// space. Three things fix it, in order of how much they buy:
//
//   1. Depth planes separated by VALUE, not by detail. Four ranges, each one
//      blended further toward the sky colour, which is what aerial perspective
//      actually is: distance desaturates and lifts contrast toward the sky.
//   2. A horizon that transitions instead of butting two fills together.
//   3. Ground texture placed by hash rather than on a fixed stride. The old
//      specks stepped x += 11 on every row and read as a visible repeat.
//
// Everything here is deterministic -- hash01, never Math.random -- so the
// screenshot harness stays byte-identical across runs.
import Phaser from "phaser";
import { blend, hash01, shadow } from "./shading";
import { PAL } from "./palette";

export interface BackdropOpts {
  W: number;
  H: number;
  /** Horizon y. */
  HZ: number;
}

/** Aerial perspective: push a colour toward the sky it sits against. */
const aerial = (c: number, sky: number, t: number) => blend(c, sky, t);

export function drawBattleBackdrop(g: Phaser.GameObjects.Graphics, o: BackdropOpts) {
  const { W, H, HZ } = o;
  const SKY_AT_HORIZON = PAL.sky3;

  // ---- sky: five steps instead of three, with dithered seams so the
  // transitions read as gradient rather than as stripes.
  const steps = [
    { y: 0, c: PAL.sky1 },
    { y: 26, c: blend(PAL.sky1, PAL.sky2, 0.5) },
    { y: 46, c: PAL.sky2 },
    { y: 66, c: blend(PAL.sky2, PAL.sky3, 0.5) },
    { y: 84, c: PAL.sky3 },
  ];
  steps.forEach((s, i) => {
    const next = steps[i + 1];
    g.fillStyle(s.c, 1);
    g.fillRect(0, s.y, W, (next ? next.y : HZ) - s.y);
  });
  // dither each seam: a 2px scatter of the upper colour into the lower one
  for (let i = 1; i < steps.length; i++) {
    g.fillStyle(steps[i - 1].c, 1);
    for (let x = 0; x < W; x++) {
      if (hash01(x, steps[i].y) > 0.5) g.fillRect(x, steps[i].y, 1, 1);
      if (hash01(x, steps[i].y + 1) > 0.75) g.fillRect(x, steps[i].y + 1, 1, 1);
    }
  }

  // ---- moon
  g.fillStyle(PAL.sun, 1); g.fillCircle(86, 46, 22);
  g.fillStyle(PAL.sunHi, 1); g.fillCircle(81, 41, 15);
  g.fillStyle(PAL.sky2, 0.5); g.fillCircle(93, 51, 18);

  // ---- range 1, farthest: almost the sky's own value. Present, not readable.
  g.fillStyle(aerial(PAL.mtn, SKY_AT_HORIZON, 0.72), 1);
  g.fillTriangle(-40, HZ, 60, 62, 170, HZ);
  g.fillTriangle(150, HZ, 250, 68, 350, HZ);
  g.fillTriangle(300, HZ, 400, 60, 470, HZ);

  // ---- range 2
  g.fillStyle(aerial(PAL.mtn, SKY_AT_HORIZON, 0.42), 1);
  g.fillTriangle(-20, HZ, 80, 44, 190, HZ);
  g.fillTriangle(290, HZ, 400, 50, 470, HZ);
  g.fillStyle(aerial(PAL.mtnLt, SKY_AT_HORIZON, 0.42), 1);
  g.fillTriangle(80, 44, 80, 58, 52, 84);   // lit face

  // ---- range 3, nearest peaks: closest to true value
  g.fillStyle(aerial(PAL.mtn, SKY_AT_HORIZON, 0.12), 1);
  g.fillTriangle(120, HZ, 250, 56, 380, HZ);
  g.fillStyle(aerial(PAL.mtnLt, SKY_AT_HORIZON, 0.12), 1);
  g.fillTriangle(250, 56, 250, 70, 226, 96);

  // ---- range 4: low foothills, dark, rooted at the horizon. Separates the
  // mountains from the ground so the horizon is not one hard seam.
  const foot = shadow(PAL.mtn, 0.35);
  g.fillStyle(foot, 1);
  g.fillTriangle(-30, HZ + 1, 40, HZ - 13, 130, HZ + 1);
  g.fillTriangle(100, HZ + 1, 200, HZ - 9, 300, HZ + 1);
  g.fillTriangle(250, HZ + 1, 340, HZ - 14, 430, HZ + 1);

  // ---- ground: far-to-near value ramp. Far grass is lit and lifted toward
  // the sky; the foreground is darkest, which pushes the actors forward.
  // Aerial lift is kept small here and the near end pushed dark. Lifting the
  // ground toward the sky as hard as the mountains looks correct in isolation
  // and destroys figure/ground: measured, it put the field within 3.5 luma of
  // the sprites standing on it. The actors must be the lightest thing below
  // the horizon apart from the UI.
  const farGrass = aerial(PAL.grass, SKY_AT_HORIZON, 0.12);
  const nearGrass = shadow(PAL.grassDk, 0.45);
  const rows = H - HZ;
  for (let i = 0; i < rows; i++) {
    const t = i / rows;
    g.fillStyle(blend(farGrass, nearGrass, Math.pow(t, 1.3)), 1);
    g.fillRect(0, HZ + i, W, 1);
  }

  // ---- horizon transition: a scattered band rather than a butt joint
  for (let x = 0; x < W; x++) {
    if (hash01(x, HZ) > 0.35) { g.fillStyle(PAL.grassHi, 1); g.fillRect(x, HZ, 1, 1); }
    if (hash01(x, HZ + 1) > 0.6) { g.fillStyle(farGrass, 1); g.fillRect(x, HZ - 1, 1, 1); }
    if (hash01(x, HZ + 2) > 0.7) { g.fillStyle(foot, 1); g.fillRect(x, HZ + 1, 1, 1); }
  }

  // ---- ground texture: sparse tufts, denser toward the camera.
  //
  // Decided on a coarse 3x2 lattice rather than per-pixel. Rolling every pixel
  // independently at a density high enough to be visible produces isolated
  // orphan pixels -- static, not grass (style guide §8.6). One tuft per cell,
  // 2-3px wide, is what reads as ground cover at this size. The lattice is
  // jittered by hash so it never lines up into rows.
  const CELL_X = 3, CELL_Y = 2;
  for (let cy = HZ + 2; cy < H; cy += CELL_Y) {
    const depth = (cy - HZ) / rows;
    const density = 0.16 + depth * 0.22;
    for (let cx = 0; cx < W; cx += CELL_X) {
      if (hash01(cx, cy) > density) continue;
      const x = cx + Math.floor(hash01(cx + 7, cy) * CELL_X);
      const y = cy + Math.floor(hash01(cx, cy + 7) * CELL_Y);
      if (y >= H) continue;
      const dark = hash01(x * 5, y) > 0.5;
      g.fillStyle(dark ? shadow(PAL.grassDk, 0.35) : blend(PAL.grassHi, nearGrass, 0.35 + depth * 0.5), 1);
      g.fillRect(x, y, hash01(x, y * 3) > 0.65 ? 2 : 1, 1);
    }
  }

  // ---- pines on the horizon, the far ones lifted toward the sky too
  const pine = (x: number, s: number, t: number) => {
    g.fillStyle(aerial(0x14200e, SKY_AT_HORIZON, t), 1);
    g.fillTriangle(x - 7 * s, HZ + 2, x, HZ - 20 * s, x + 7 * s, HZ + 2);
    g.fillTriangle(x - 6 * s, HZ - 8 * s, x, HZ - 28 * s, x + 6 * s, HZ - 8 * s);
    g.fillStyle(aerial(0x0d1508, SKY_AT_HORIZON, t), 1);
    g.fillRect(x - 1, HZ + 1, 2, 4);
  };
  pine(230, 0.65, 0.3); pine(175, 0.8, 0.2); pine(26, 1, 0.05); pine(360, 1.15, 0.0);

  // ---- foreground bushes: darkest things in frame, so the eye reads them as
  // nearest and the actors sit between them and the mid-ground.
  g.fillStyle(shadow(PAL.grassDk, 0.45), 1);
  g.fillEllipse(150, 168, 26, 8);
  g.fillEllipse(210, 150, 18, 6);
  g.fillStyle(shadow(PAL.grassDk, 0.2), 1);
  g.fillEllipse(150, 166, 22, 6);
}
