// UI chrome (BRIEF.md §2.5).
//
// The old panel was a rounded rect with a royal-blue gradient body and a
// translucent drop shadow -- §0 names that look as a defect, and §2.5's
// negative spec bans every ingredient of it: no gradients, no rounded corners,
// no partial alpha. GBA-era windows are a flat desaturated ground inside a
// two-tone bevel lit from the same top-left the sprites are.
//
// Everything here is opaque and pixel-aligned. Alpha is binary at 384x216.
import Phaser from "phaser";
import { UI } from "./palette";

type G = Phaser.GameObjects.Graphics;

const px = (g: G, c: number, x: number, y: number, w: number, h: number) => {
  g.fillStyle(c, 1);
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
};

/**
 * A window. Outer keyline, a bevel lit top-left and shaded bottom-right, and a
 * flat interior. The bevel is what makes it read as a raised physical panel
 * rather than a coloured rectangle, and it costs two rectangles.
 */
export function panel(g: G, x: number, y: number, w: number, h: number) {
  px(g, UI.border, x, y, w, h);                       // keyline
  px(g, UI.bevelHi, x + 1, y + 1, w - 2, h - 2);      // lit face
  px(g, UI.bevelSh, x + 2, y + 2, w - 3, h - 3);      // shaded face, offset 1
  px(g, UI.ground, x + 2, y + 2, w - 4, h - 4);       // interior
}

/**
 * Selected-row highlight. Deliberately a VALUE step plus a bevel, not a hue
 * change: §8 requires the selection to be identifiable in the greyscale
 * capture, and gold-on-white text alone does not survive desaturation.
 */
export function selection(g: G, x: number, y: number, w: number, h: number) {
  px(g, UI.selShade, x, y, w, h);
  px(g, UI.selFill, x, y, w - 1, h - 1);
  px(g, UI.selHi, x, y, w - 1, 1);      // lit top edge
  px(g, UI.selHi, x, y, 1, h - 1);      // lit left edge
}

/**
 * A stat bar: dark trough, then the fill, then a lit top row on the fill so it
 * reads as a filled tube rather than a coloured rectangle.
 */
export function bar(g: G, x: number, y: number, w: number, h: number, ratio: number, col: number, hi: number) {
  px(g, UI.border, x - 1, y - 1, w + 2, h + 2);
  px(g, UI.trough, x, y, w, h);
  const fw = ratio > 0 ? Math.max(1, Math.round(w * Math.min(1, ratio))) : 0;
  if (!fw) return;
  px(g, col, x, y, fw, h);
  if (h > 1) px(g, hi, x, y, fw, 1);
}

/**
 * 1px hard drop shadow under text. Required everywhere by §2.5: light text
 * over a light background is illegible at this resolution, and that pairing
 * happens the moment a panel sits over the sky.
 */
export function shadowed<T extends Phaser.GameObjects.Text>(t: T): T {
  t.setShadow(1, 1, "#0c0e18", 0, false, true);
  return t;
}

/**
 * Give every Text created anywhere the 1px shadow §2.5 requires.
 *
 * Patched at the factory rather than at each `add.text` call: there are ~60
 * call sites across six scenes, and a rule enforced by remembering to wrap
 * each one is a rule that decays the first time someone adds a scene.
 */
export function installTextShadows() {
  const proto = Phaser.GameObjects.GameObjectFactory.prototype;
  const orig = proto.text;
  proto.text = function (this: Phaser.GameObjects.GameObjectFactory, ...args: Parameters<typeof orig>) {
    return shadowed(orig.apply(this, args));
  };
}
