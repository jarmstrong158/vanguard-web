import Phaser from "phaser";
import { BEASTS, HEROES, MAREN, marenPalette, paletteFor, PAL } from "./art/palette";
import { blend, highlight, ramp, shadeIndex, shadow, SHADOW_SKIN } from "./art/shading";
import { panel } from "./art/ui";

// Re-exported: PAL's home is art/palette.ts now, but scenes import it from here.
export { PAL };

const hex = (c: number) => "#" + (c >>> 0).toString(16).padStart(6, "0").slice(-6);

// Kept for the five scenes that already call it; the look now lives in art/ui.ts.
export function ffWindow(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number) {
  panel(g, x, y, w, h);
}

interface PC {
  px: (x: number, y: number, c: number) => void;
  rect: (x: number, y: number, w: number, h: number, c: number) => void;
  // shaded block: base fill, warm highlight on top+left, cool shadow on bottom+right
  block: (x: number, y: number, w: number, h: number, base: number) => void;
  // volumetric fill: three shades banded along the top-left light direction, so
  // the area reads as a rounded form rather than a flat panel with a rim.
  form: (x: number, y: number, w: number, h: number, base: number, shHue?: number) => void;
  // push already-drawn pixels toward their own shadow -- for cast shadows,
  // which is what actually creates depth at 32px.
  darken: (x: number, y: number, w: number, h: number, amt?: number) => void;
}

/** Nearest entry in a fixed palette, squared-distance in RGB. */
function snapTo(pal: number[], c: number): number {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  let best = pal[0], bestD = Infinity;
  for (const q of pal) {
    const dr = ((q >> 16) & 255) - r, dg = ((q >> 8) & 255) - g, db = (q & 255) - b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) { bestD = d; best = q; }
  }
  return best;
}

/**
 * @param palette when given, every pixel written is snapped to its nearest
 * entry. Derived shades, cast shadows and outline blends otherwise mint a new
 * colour each time they are applied -- Maren measured 57 distinct colours
 * before snapping. Bounding the palette is what makes a character read as one
 * cohesive piece of art rather than a gradient soup. Style guide §2.1.
 */
function bake(scene: Phaser.Scene, key: string, w: number, h: number, draw: (p: PC) => void, palette?: number[]) {
  // Textures are deterministic and live in the global TextureManager. Re-baking
  // (remove+recreate) would invalidate the glTexture for any sprite in a *paused*
  // scene that still references this key (e.g. the overworld behind an overlay
  // dialogue or the party menu) -> null glTexture -> render crash. So bake once.
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h)!;
  const ctx = tex.getContext()!;
  const id = (x: number, y: number) => y * w + x;
  const colorAt = new Map<number, number>();
  const p: PC = {
    px: (x, y, c) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const q = palette ? snapTo(palette, c) : c;
      ctx.fillStyle = hex(q); ctx.fillRect(x, y, 1, 1); colorAt.set(id(x, y), q);
    },
    rect: (x, y, rw, rh, c) => { for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) p.px(x + i, y + j, c); },
    block: (x, y, rw, rh, base) => {
      const sh = shadow(base), hl = highlight(base);
      p.rect(x, y, rw, rh, base);
      p.rect(x, y, rw, 1, hl); p.rect(x, y, 1, rh, hl);          // top + left lit
      p.rect(x, y + rh - 1, rw, 1, sh); p.rect(x + rw - 1, y, 1, rh, sh); // bottom + right shade
    },
    form: (x, y, rw, rh, base, shHue) => {
      // Below 4px there is no room for three bands; a rim is all that fits.
      if (rw < 4 || rh < 4) { p.block(x, y, rw, rh, base); return; }
      const r = ramp(base, 0.26, 0.2, shHue);
      const shades = [r.hi, r.base, r.sh];
      for (let j = 0; j < rh; j++)
        for (let i = 0; i < rw; i++)
          p.px(x + i, y + j, shades[shadeIndex(x + i, y + j, x, y, rw, rh)]);
    },
    darken: (x, y, rw, rh, amt = 0.3) => {
      for (let j = 0; j < rh; j++) {
        for (let i = 0; i < rw; i++) {
          const cur = colorAt.get(id(x + i, y + j));
          if (cur !== undefined) p.px(x + i, y + j, shadow(cur, amt));
        }
      }
    },
  };
  draw(p);
  // selective outline: each transparent border pixel takes its neighbour's colour pushed toward near-black
  const adds: [number, number, number][] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (colorAt.has(id(x, y))) continue;
    let n: number | undefined;
    if (x > 0 && colorAt.has(id(x - 1, y))) n = colorAt.get(id(x - 1, y));
    else if (x < w - 1 && colorAt.has(id(x + 1, y))) n = colorAt.get(id(x + 1, y));
    else if (y > 0 && colorAt.has(id(x, y - 1))) n = colorAt.get(id(x, y - 1));
    else if (y < h - 1 && colorAt.has(id(x, y + 1))) n = colorAt.get(id(x, y + 1));
    if (n !== undefined) adds.push([x, y, blend(n, PAL.out, 0.6)]);
  }
  for (const [x, y, col] of adds) {
    const q = palette ? snapTo(palette, col) : col;
    ctx.fillStyle = hex(q); ctx.fillRect(x, y, 1, 1);
  }
  tex.refresh();
}

// ============================== HEROES (32x32, light top-left) ==============================
// Canon appearances: vanguard/docs/characters/*.md + sprite_style_guide.md §6.
// FF4-style chibi proportions: oversized head (~half the figure), compact torso,
// stubby limbs, feet grounded near y30. Heads are 14px wide so faces read clearly.

// Shared chibi base: feet, torso, arms+hands, then the big head. The caller layers
// hair, eyes and props on top. Centered near x=15; figure spans y4..30.
// `paint` selects the fill: p.block for the flat-rim look the rest of the cast
// still uses, p.form for the volumetric three-band shading. Migrating a
// character is a one-argument change (BRIEF.md milestone 4).
function chibi(
  p: PC, skin: number, body: number, pants: number,
  paint: (x: number, y: number, w: number, h: number, c: number) => void = p.block,
  headW = 12,
) {
  paint(11, 26, 4, 4, pants); paint(17, 26, 4, 4, pants);                           // legs / feet
  p.rect(11, 29, 4, 1, shadow(pants, 0.6)); p.rect(17, 29, 4, 1, shadow(pants, 0.6)); // sole shadow
  paint(10, 15, 12, 12, body);                                                      // torso (taller)
  p.block(8, 18, 2, 7, body); p.block(22, 18, 2, 7, body);                          // arms (too thin to band)
  p.rect(8, 24, 2, 2, skin); p.rect(22, 24, 2, 2, skin);                            // hands
  // A head the same width as the torso merges with it into one rectangle: no
  // neck, no shoulder line, and the flat-fill silhouette becomes an unreadable
  // blob. A narrowed head plus an actual neck row cuts a notch on both sides,
  // which is what makes the figure read as a figure from outline alone.
  // Default keeps the old geometry for characters not yet migrated
  // (BRIEF.md milestone 4).
  if (headW < 12) {
    p.form(16 - (headW >> 1), 6, headW, 8, skin, SHADOW_SKIN);
    p.rect(14, 14, 4, 1, shadow(skin, 0.3, SHADOW_SKIN)); // neck, in the chin's shadow
  } else {
    paint(10, 6, 12, 9, skin);
  }
}

// Maren — rebuilt to the style guide bar (BRIEF.md milestone 2). Every colour
// comes from MAREN in art/palette.ts; every shade is derived. Volumetric fills
// via p.form, and three cast shadows, which are what actually read as depth at
// this size.
function drawMaren(p: PC) {
  const skin = ramp(MAREN.skin, 0.26, 0.2, SHADOW_SKIN), hair = ramp(MAREN.hair), tunic = ramp(MAREN.tunic);
  const vest = ramp(MAREN.vest), sash = ramp(MAREN.sash), staff = ramp(MAREN.staff);

  // Ash Staff, held clear of the body: a shaft flush against the arm merges
  // with it in silhouette and the staff stops reading as a held object.
  p.form(26, 7, 2, 21, MAREN.staff);
  p.form(25, 4, 4, 3, MAREN.staff);
  p.px(26, 3, MAREN.conduit); p.px(27, 4, highlight(MAREN.conduit));
  p.px(25, 6, staff.dark); // crystal seats into the wood

  chibi(p, MAREN.skin, MAREN.tunic, MAREN.pants, p.form, 10);

  // green vest over the chest, its own form so it does not flatten the torso
  p.form(11, 17, 10, 6, MAREN.vest);
  p.rect(11, 17, 10, 1, vest.hi);          // lit top edge catches the light
  p.rect(11, 22, 10, 1, vest.dark);        // interior boundary, material dark, never black

  // golden sash
  p.rect(10, 23, 12, 2, sash.base);
  p.rect(10, 23, 12, 1, sash.hi);
  p.px(10, 24, sash.sh); p.px(21, 24, sash.sh);
  // CAST SHADOW: sash onto the legs beneath it
  p.darken(11, 25, 10, 1, 0.45);

  // bandages wrapped around the right arm
  p.rect(22, 19, 2, 1, MAREN.bandage); p.rect(22, 21, 2, 1, MAREN.bandage);

  // short practical hair framing the narrowed head (x11..20)
  p.form(11, 4, 10, 4, MAREN.hair);
  p.form(11, 7, 2, 3, MAREN.hair); p.form(19, 7, 2, 3, MAREN.hair);
  p.rect(11, 4, 10, 1, hair.hi);           // top plane catches the most light
  // CAST SHADOW: hair onto the forehead -- the single most effective pixel row
  // on the whole sprite for making the head read as a volume
  p.darken(13, 8, 6, 1, 0.5);

  // CAST SHADOW: chin onto the chest
  p.darken(12, 15, 8, 1, 0.4);

  // brows, then big hazel eyes with a faint gold Conduit glint
  p.px(13, 9, skin.dark); p.px(14, 9, skin.dark);
  p.px(17, 9, skin.dark); p.px(18, 9, skin.dark);
  p.rect(13, 11, 2, 2, MAREN.eye); p.rect(17, 11, 2, 2, MAREN.eye);
  p.px(14, 11, MAREN.eyeGlint); p.px(18, 11, MAREN.eyeGlint); // matched catch-lights
  // cheek shading on the side away from the light
  p.px(19, 12, skin.sh); p.px(19, 13, skin.sh);

  // tunic hem separates the torso from the legs without a black line
  p.rect(11, 26, 4, 1, tunic.dark); p.rect(17, 26, 4, 1, tunic.dark);
}

function drawKael(p: PC) {
  const C = HEROES.kael; const steelR = ramp(C.steel), hairR = ramp(C.hair);
  const skin = C.skin, hair = C.hair, steel = C.steel, leather = C.leather, scar = C.scar;
  // longsword (left), blade up
  p.block(7, 5, 2, 19, steel);
  p.rect(5, 23, 6, 2, C.gold); p.rect(5, 23, 6, 1, highlight(C.gold)); // crossguard
  p.block(7, 25, 2, 3, leather); // grip
  chibi(p, skin, steel, steel, p.form, 10);
  p.rect(15, 17, 2, 9, steelR.dark); // chest seam
  p.rect(10, 23, 12, 2, leather);            // belt
  // pauldrons
  p.form(8, 17, 5, 3, steel); p.form(19, 17, 5, 3, steel);
  // sandy blond cropped hair over the narrowed head (x11..20)
  p.form(11, 4, 10, 4, hair); p.form(11, 7, 2, 3, hair); p.form(19, 7, 2, 3, hair);
  p.rect(11, 4, 10, 1, hairR.hi);
  p.darken(13, 8, 6, 1, 0.5);   // hair casts onto the forehead
  p.darken(12, 15, 8, 1, 0.4);  // chin casts onto the chest
  // scar down the cheek (his left = viewer right)
  p.px(19, 8, scar); p.px(19, 9, scar); p.px(18, 10, scar); p.px(18, 11, scar);
  // pale blue eyes
  p.rect(13, 11, 2, 2, C.eye); p.rect(17, 11, 2, 2, C.eye);
}

function drawLida(p: PC) {
  const C = HEROES.lida; const robeR = ramp(C.robe), hairR = ramp(C.hair), apronR = ramp(C.apron);
  const skin = C.skin, hair = C.hair, robe = C.robe, apron = C.apron, belt = C.belt, flower = C.flower, rod = C.rod, leaf = C.leaf;
  // healer's rod (right), with a green herb-orb
  p.block(24, 7, 2, 21, rod);
  p.block(22, 5, 4, 3, leaf); p.px(23, 4, highlight(leaf));
  chibi(p, skin, robe, robe, p.form, 10);
  // robe flares at the hem
  p.form(9, 26, 14, 4, robe); p.rect(9, 29, 14, 1, robeR.dark);
  // cream apron with a pocket seam
  p.form(13, 18, 6, 8, apron); p.rect(13, 22, 6, 1, apronR.dark);
  p.rect(11, 17, 11, 1, belt);
  // thick black hair + side braid over shoulder
  p.form(11, 4, 10, 4, hair); p.form(11, 7, 2, 4, hair); p.form(19, 7, 2, 4, hair);
  p.rect(11, 4, 10, 1, hairR.hi);
  p.block(21, 11, 2, 7, hairR.sh); p.px(21, 14, hairR.dark); p.rect(21, 18, 2, 1, belt); // braid + tie
  p.darken(13, 8, 6, 1, 0.5); p.darken(12, 15, 8, 1, 0.4);
  // tucked flower
  p.px(12, 5, flower); p.px(12, 4, highlight(flower)); p.px(13, 5, PAL.gold);
  // warm brown eyes + small smile
  p.rect(13, 11, 2, 2, C.eye); p.rect(17, 11, 2, 2, C.eye);
  p.px(15, 13, shadow(skin, 0.4, SHADOW_SKIN));
}

function drawWolf(p: PC) {
  const C = BEASTS.wolf; const fur = ramp(C.fur);
  for (const lx of [7, 12, 21, 26]) p.block(lx, 15, 3, 6, fur.sh);
  p.block(1, 6, 6, 3, fur.sh); p.px(0, 5, fur.dark);  // tail
  p.form(5, 7, 23, 9, C.fur);                         // body
  p.rect(5, 14, 23, 2, fur.dark);                     // belly
  p.form(5, 8, 7, 8, C.fur);                          // haunch
  p.form(25, 5, 9, 9, C.fur);                         // head
  p.rect(5, 7, 23, 1, fur.hi);                        // lit spine
  p.rect(31, 9, 4, 3, C.muzzle); p.px(34, 10, fur.dark);
  p.block(25, 2, 2, 3, fur.sh); p.block(29, 2, 2, 3, fur.sh);
  p.px(29, 8, C.eye); p.px(30, 8, highlight(C.eye));
}

function drawSenna(p: PC) {
  const C = HEROES.senna; const hairR = ramp(C.hair), scarfR = ramp(C.scarf);
  const skin = C.skin, hair = C.hair, vest = C.vest, scarf = C.scarf, pants = C.pants, staff = C.staff, flame = C.flame;
  // staff with flame (right)
  p.block(24, 7, 2, 21, staff);
  p.block(22, 4, 4, 4, flame); p.px(23, 3, highlight(flame)); p.px(24, 4, PAL.gold);
  chibi(p, skin, vest, pants, p.form, 10);
  // red scarf at neck/chest
  p.rect(10, 17, 12, 3, scarf); p.rect(10, 17, 12, 1, scarfR.hi); p.rect(10, 19, 12, 1, scarfR.dark);
  p.px(11, 20, scarfR.sh); // loose end
  // short coiled black hair (close cut)
  p.form(11, 4, 10, 4, hair); p.form(11, 7, 2, 3, hair); p.form(19, 7, 2, 3, hair);
  p.rect(11, 4, 10, 1, hairR.hi);
  p.darken(13, 8, 6, 1, 0.5); p.darken(12, 15, 8, 1, 0.4);
  // fierce eyes (catch firelight)
  p.rect(13, 11, 2, 2, C.eye); p.rect(17, 11, 2, 2, C.eye); p.px(13, 11, flame); p.px(17, 11, flame);
}

function drawSlime(p: PC) {
  const C = BEASTS.slime; const body = ramp(C.body);
  p.form(4, 8, 20, 11, C.body);
  p.form(6, 5, 16, 5, C.body);
  p.rect(4, 17, 20, 2, body.dark);           // pools at the base
  p.rect(6, 5, 16, 1, body.hi);
  p.px(9, 7, body.hi); p.px(10, 7, body.hi); // gloss
  p.rect(10, 10, 3, 4, C.eyeWhite); p.rect(16, 10, 3, 4, C.eyeWhite);
  p.rect(11, 12, 2, 2, C.pupil); p.rect(17, 12, 2, 2, C.pupil);
}

function drawMilitia(p: PC) {
  const C = BEASTS.militia; const hairR = ramp(C.hair);
  const skin = C.skin, hair = C.hair, tunic = C.tunic, leather = C.leather, steel = C.steel, shaft = C.shaft;
  // spear (right)
  p.block(24, 4, 2, 24, shaft);
  p.rect(23, 4, 4, 4, steel); p.px(24, 2, highlight(steel)); // tip
  chibi(p, skin, tunic, leather, p.form, 10);
  p.rect(10, 23, 12, 2, leather); // belt
  // leather cap on the narrowed head
  p.form(11, 4, 10, 4, leather); p.form(11, 7, 2, 2, hair); p.form(19, 7, 2, 2, hair);
  p.rect(11, 4, 10, 1, ramp(leather).hi);
  p.darken(13, 8, 6, 1, 0.5); p.darken(12, 15, 8, 1, 0.4);
  p.rect(13, 11, 2, 2, C.eye); p.rect(17, 11, 2, 2, C.eye);
  void hairR;
}

function drawRhogar(p: PC) {
  // big armored captain, 40x40, fire/red theme, facing right
  const C = BEASTS.rhogar; const steelR = ramp(C.steel);
  const steel = C.steel, red = C.red, dark = C.dark, gold = C.gold, skin = C.skin, flame = C.flame;
  // big sword (left)
  p.block(5, 4, 3, 26, steel);
  p.rect(3, 28, 7, 2, gold);
  p.block(6, 30, 3, 5, dark);
  // legs / greaves
  p.block(15, 30, 5, 8, steel); p.block(22, 30, 5, 8, steel);
  p.rect(15, 36, 5, 2, dark); p.rect(22, 36, 5, 2, dark);
  // broad torso plate
  p.form(11, 15, 20, 17, steel);
  p.form(13, 17, 16, 9, red);           // red tabard
  p.rect(20, 17, 2, 14, dark);          // center seam
  p.rect(11, 28, 20, 2, dark);          // belt
  // huge pauldrons
  p.form(8, 13, 7, 6, steel); p.form(27, 13, 7, 6, steel);
  p.px(10, 14, gold); p.px(31, 14, gold);
  // arms
  p.block(8, 19, 3, 11, steel); p.block(31, 19, 3, 11, steel);
  p.rect(8, 30, 3, 2, skin); p.rect(31, 30, 3, 2, skin);
  // head + horned helm
  p.form(15, 5, 12, 11, steel);
  p.form(16, 8, 10, 6, skin);           // face opening
  p.rect(16, 8, 10, 1, shadow(skin, 0.4, SHADOW_SKIN));
  void steelR;
  p.px(18, 11, flame); p.px(23, 11, flame); // burning eyes
  // horns
  p.block(13, 3, 3, 4, dark); p.px(12, 2, dark);
  p.block(26, 3, 3, 4, dark); p.px(29, 2, dark);
  p.rect(20, 3, 2, 3, red);             // crest
}

function drawAshguard(p: PC) {
  const C = BEASTS.ashguard;
  const skin = C.skin, hair = C.hair, armor = C.armor, dark = C.dark, steel = C.steel, shaft = C.shaft;
  // spear
  p.block(24, 4, 2, 24, shaft);
  p.rect(23, 4, 4, 4, steel); p.px(24, 2, highlight(steel));
  chibi(p, skin, armor, dark, p.form, 10);
  p.rect(10, 23, 12, 2, dark);       // belt
  p.rect(15, 17, 2, 8, dark);        // armor seam
  // pauldrons
  p.form(8, 17, 4, 3, steel); p.form(20, 17, 4, 3, steel);
  // steel helm, cheek guards leave a visor of face
  p.form(11, 4, 10, 5, steel);
  p.darken(12, 15, 8, 1, 0.4);
  p.rect(19, 3, 2, 3, armor);                          // crest
  p.block(11, 9, 2, 4, steel); p.block(19, 9, 2, 4, steel); // cheek guards
  p.rect(12, 9, 8, 1, hair);                           // brow shadow
  // hostile red eyes
  p.rect(13, 11, 2, 2, C.eye); p.rect(17, 11, 2, 2, C.eye);
}

function drawDavan(p: PC) {
  const C = HEROES.davan; const hoodR = ramp(C.hood);
  const skin = C.skin, hood = C.hood, cloak = C.cloak, dark = C.dark, blade = C.blade;
  // dagger (right hand)
  p.block(23, 19, 2, 7, blade); p.px(23, 18, highlight(blade));
  chibi(p, skin, cloak, dark, p.form, 10);
  // shadow-eating cloak edges + belt
  p.rect(10, 17, 1, 9, hood); p.rect(21, 17, 1, 9, hood);
  p.rect(10, 23, 12, 1, dark);
  // deep hood over the big head, shadowing the face
  p.form(11, 4, 10, 6, hood);
  p.block(11, 10, 2, 4, hoodR.sh); p.block(19, 10, 2, 4, hoodR.sh); // hood sides
  p.rect(11, 4, 10, 1, hoodR.hi);
  p.darken(12, 10, 8, 2, 0.55);                          // deep hood shadow over the brow
  // sharp eyes glinting in the dark
  p.rect(13, 11, 2, 2, C.eye); p.rect(17, 11, 2, 2, C.eye);
}

function drawShade(p: PC) {
  const C = BEASTS.shade; const fur = ramp(C.fur);
  // legs stay flat: 3px wide is below the banding threshold
  for (const lx of [7, 13, 21, 26]) p.block(lx, 15, 3, 6, fur.sh);
  p.form(5, 8, 22, 8, C.fur);              // body, volumetric
  p.rect(5, 14, 22, 2, fur.dark);          // belly in shadow
  p.form(24, 5, 9, 8, C.fur);              // head
  p.rect(30, 9, 3, 3, C.muzzle);           // muzzle darker than the coat
  p.block(24, 2, 2, 3, fur.sh); p.block(28, 2, 2, 3, fur.sh); // ears
  p.rect(5, 8, 22, 1, fur.hi);             // spine catches the light
  p.px(2, 7, fur.sh); p.px(0, 9, fur.dark); p.px(4, 5, fur.sh); // wisps
  p.px(29, 8, C.eye); p.px(30, 8, highlight(C.eye));
}

function drawMoth(p: PC) {
  const C = BEASTS.moth; const wing = ramp(C.wing), body = ramp(C.body);
  p.form(2, 6, 12, 12, C.wing); p.form(20, 6, 12, 12, C.wing);
  p.rect(2, 6, 12, 1, C.wingEdge); p.rect(20, 6, 12, 1, C.wingEdge);
  p.rect(2, 17, 12, 1, wing.dark); p.rect(20, 17, 12, 1, wing.dark);
  p.rect(6, 10, 3, 3, C.spot); p.rect(25, 10, 3, 3, C.spot);        // eyespots
  p.px(7, 11, wing.dark); p.px(26, 11, wing.dark);
  p.form(14, 5, 6, 16, C.body);
  p.rect(14, 9, 6, 1, body.dark); p.rect(14, 13, 6, 1, body.dark);  // segmentation
  p.px(15, 7, C.eye); p.px(18, 7, C.eye);
  p.px(14, 3, body.sh); p.px(13, 2, body.sh); p.px(19, 3, body.sh); p.px(20, 2, body.sh);
}

function drawStalker(p: PC) {
  // big shadow assassin beast, 44x36, hunched, many eyes
  const C = BEASTS.stalker; const mass = ramp(C.mass);
  p.form(8, 22, 4, 12, C.mass); p.form(34, 22, 4, 12, C.mass);
  p.form(16, 26, 4, 10, C.mass); p.form(26, 26, 4, 10, C.mass);
  p.px(8, 34, C.claw); p.px(11, 34, C.claw); p.px(34, 34, C.claw); p.px(37, 34, C.claw);
  p.form(10, 10, 26, 18, C.mass);       // hunched body
  p.rect(10, 10, 26, 2, mass.hi);       // lit shoulder ridge
  p.form(28, 18, 12, 10, C.mass);       // head / maw
  p.rect(28, 27, 12, 1, mass.dark);
  p.px(14, 6, mass.sh); p.px(20, 4, mass.sh); p.px(30, 6, mass.sh); p.px(24, 2, mass.dark);
  // many glowing eyes
  for (const [ex, ey] of [[16, 14], [22, 13], [28, 15], [33, 21], [36, 23], [19, 16], [25, 16]])
    p.px(ex, ey, C.eye);
}

function drawYara(p: PC) {
  const C = HEROES.yara; const hairR = ramp(C.hair), giR = ramp(C.gi);
  const skin = C.skin, stone = C.stone, hair = C.hair, gi = C.gi, sash = C.sash, iron = C.iron;
  chibi(p, skin, gi, gi, p.form, 10);
  p.rect(9, 22, 14, 2, sash);            // belt sash
  p.rect(10, 17, 12, 1, giR.hi);         // lapel highlight
  // stone-textured forearms / fists (a monk's weapons)
  p.form(7, 20, 3, 5, stone); p.form(22, 20, 3, 5, stone);
  p.rect(7, 24, 3, 2, stone); p.rect(22, 24, 3, 2, stone);
  // iron pendant
  p.px(15, 18, iron); p.px(16, 18, iron);
  // black hair + thick braid over shoulder, iron-wire bands
  p.form(11, 4, 10, 4, hair); p.form(11, 7, 2, 4, hair); p.form(19, 7, 2, 4, hair);
  p.rect(11, 4, 10, 1, hairR.hi);
  p.block(21, 11, 2, 8, hairR.sh); p.px(21, 14, iron); p.px(21, 17, iron); // braid + wire
  p.darken(13, 8, 6, 1, 0.5); p.darken(12, 15, 8, 1, 0.4);
  // amber eyes
  p.rect(13, 11, 2, 2, C.eye); p.rect(17, 11, 2, 2, C.eye);
  p.px(13, 11, C.amber); p.px(17, 11, C.amber);
}

function drawMirror(p: PC) {
  // dark Conduit echo — a hollow silhouette of Maren with glowing cracks, 32x36
  const C = HEROES.mirror; const mass = ramp(C.mass); const dark = C.mass, crack = C.crack;
  p.form(12, 26, 4, 8, dark); p.form(17, 26, 4, 8, dark); // legs
  p.form(8, 16, 16, 12, dark);                            // body
  p.rect(8, 16, 16, 1, mass.hi);
  p.block(6, 17, 2, 9, mass.sh); p.block(24, 17, 2, 9, mass.sh); // arms
  p.form(11, 5, 10, 11, dark);                            // head (hooded, featureless)
  // glowing fracture lines
  p.px(15, 8, crack); p.px(16, 10, crack); p.px(15, 12, crack); p.px(14, 14, crack);
  p.px(12, 20, crack); p.px(19, 22, crack); p.px(16, 25, crack); p.px(10, 24, crack);
  // hollow glowing eyes
  p.px(13, 9, crack); p.px(18, 9, crack);
  // wisps
  p.px(9, 3, mass.sh); p.px(22, 3, mass.sh); p.px(7, 14, mass.dark); p.px(25, 16, mass.dark);
}

function townsfolk(p: PC, skin: number, hair: number, tunic: number, robe = false, eye = 0x2a2030) {
  const tunicR = ramp(tunic), hairR = ramp(hair);
  if (robe) {
    // floor-length robe (elder) — body to the ground
    p.form(10, 15, 12, 13, tunic); p.form(9, 26, 14, 3, tunic); p.rect(9, 28, 14, 1, tunicR.dark);
    p.block(8, 18, 2, 7, tunicR.sh); p.block(22, 18, 2, 7, tunicR.sh);
    p.rect(8, 24, 2, 2, skin); p.rect(22, 24, 2, 2, skin);
    p.form(11, 6, 10, 8, skin, SHADOW_SKIN);
    p.rect(14, 14, 4, 1, shadow(skin, 0.3, SHADOW_SKIN));
  } else {
    chibi(p, skin, tunic, tunicR.sh, p.form, 10);
  }
  p.form(11, 4, 10, 4, hair); p.form(11, 7, 2, 2, hair); p.form(19, 7, 2, 2, hair);
  p.rect(11, 4, 10, 1, hairR.hi);
  p.darken(13, 8, 6, 1, 0.5); p.darken(12, 15, 8, 1, 0.4);
  p.rect(13, 11, 2, 2, eye); p.rect(17, 11, 2, 2, eye);
}

function drawRat(p: PC) {
  const C = BEASTS.rat; const fur = ramp(C.fur);
  p.block(0, 9, 9, 2, C.pink); p.px(0, 8, C.pink);               // tail
  for (const lx of [9, 14, 20]) p.block(lx, 12, 2, 4, fur.sh);   // legs
  p.form(7, 5, 16, 8, C.fur);                                    // body
  p.rect(7, 11, 16, 2, fur.dark);                                // belly
  p.form(20, 4, 7, 7, C.fur);                                    // head
  p.rect(7, 5, 16, 1, fur.hi);                                   // lit back
  p.block(26, 7, 2, 2, C.pink); p.px(27, 8, fur.dark);           // snout + nose
  p.block(19, 1, 3, 3, fur.sh); p.block(24, 1, 3, 3, fur.sh);    // ears
  p.px(24, 6, C.eye);
}

function drawSpider(p: PC) {
  const C = BEASTS.spider; const body = ramp(C.body);
  for (let i = 0; i < 4; i++) { const y = 6 + i * 3; p.rect(1, y, 9, 1, C.leg); p.rect(18, y, 9, 1, C.leg); }
  p.form(9, 5, 10, 12, C.body);         // round body
  p.rect(9, 5, 10, 1, body.hi);         // top sheen
  p.rect(9, 16, 10, 1, body.dark);      // underside
  p.rect(13, 8, 2, 2, C.mark);          // red hourglass
  p.px(11, 13, C.eye); p.px(16, 13, C.eye); p.px(12, 15, C.eye); p.px(15, 15, C.eye);
}

export function bakeAll(scene: Phaser.Scene) {
  bake(scene, "maren", 32, 32, drawMaren, marenPalette());
  bake(scene, "yara", 32, 32, drawYara, paletteFor(HEROES.yara, { castOn: ["skin"] }));
  bake(scene, "villager", 32, 32, (p) => townsfolk(p, HEROES.villager.skin, HEROES.villager.hair, HEROES.villager.tunic, false, HEROES.villager.eye), paletteFor(HEROES.villager, { castOn: ["skin"] }));
  bake(scene, "villager2", 32, 32, (p) => townsfolk(p, HEROES.villager2.skin, HEROES.villager2.hair, HEROES.villager2.tunic, false, HEROES.villager2.eye), paletteFor(HEROES.villager2, { castOn: ["skin"] }));
  bake(scene, "elder", 32, 32, (p) => townsfolk(p, HEROES.elder.skin, HEROES.elder.hair, HEROES.elder.tunic, true, HEROES.elder.eye), paletteFor(HEROES.elder, { castOn: ["skin"] }));
  bake(scene, "mirror", 32, 36, drawMirror, paletteFor(HEROES.mirror, { skinKeys: [] }));
  bake(scene, "davan", 32, 32, drawDavan, paletteFor(HEROES.davan, { castOn: ["skin"], extras: [highlight(HEROES.davan.blade)] }));
  bake(scene, "shade", 36, 22, drawShade, paletteFor(BEASTS.shade, { skinKeys: [], extras: [highlight(BEASTS.shade.eye)] }));
  bake(scene, "moth", 34, 24, drawMoth, paletteFor(BEASTS.moth, { skinKeys: [] }));
  bake(scene, "stalker", 44, 36, drawStalker, paletteFor(BEASTS.stalker, { skinKeys: [] }));
  bake(scene, "ashguard", 32, 32, drawAshguard, paletteFor(BEASTS.ashguard, { castOn: ["skin"], extras: [highlight(BEASTS.ashguard.steel)] }));
  bake(scene, "kael", 32, 32, drawKael, paletteFor(HEROES.kael, { castOn: ["skin"], extras: [highlight(HEROES.kael.gold)] }));
  bake(scene, "lida", 32, 32, drawLida, paletteFor(HEROES.lida, { castOn: ["skin"], extras: [highlight(HEROES.lida.flower), highlight(HEROES.lida.leaf), PAL.gold] }));
  bake(scene, "senna", 32, 32, drawSenna, paletteFor(HEROES.senna, { castOn: ["skin"], extras: [highlight(HEROES.senna.flame), PAL.gold] }));
  bake(scene, "wolf", 36, 22, drawWolf, paletteFor(BEASTS.wolf, { skinKeys: [], extras: [highlight(BEASTS.wolf.eye)] }));
  bake(scene, "slime", 28, 20, drawSlime, paletteFor(BEASTS.slime, { skinKeys: [] }));
  bake(scene, "rat", 28, 16, drawRat, paletteFor(BEASTS.rat, { skinKeys: [] }));
  bake(scene, "spider", 28, 20, drawSpider, paletteFor(BEASTS.spider, { skinKeys: [] }));
  bake(scene, "militia", 32, 32, drawMilitia, paletteFor(BEASTS.militia, { castOn: ["skin"], extras: [highlight(BEASTS.militia.steel)] }));
  bake(scene, "rhogar", 40, 40, drawRhogar, paletteFor(BEASTS.rhogar, { castOn: ["skin"] }));
  if (!scene.textures.exists("pdot")) {
    const t = scene.textures.createCanvas("pdot", 3, 3)!;
    const cx = t.getContext()!; cx.fillStyle = "#ffffff"; cx.fillRect(1, 0, 1, 3); cx.fillRect(0, 1, 3, 1); t.refresh();
  }
}

export const SPRITE_KEY: Record<string, string> = {
  maren: "maren", kael: "kael", lida: "lida", senna: "senna", yara: "yara", mirror: "mirror",
  thornwall_wolf: "wolf", marsh_slime: "slime", thornwall_militia: "militia", captain_rhogar: "rhogar",
  field_rat: "rat", rat: "rat", forest_spider: "spider", spider: "spider",
  ashguard_scout: "ashguard", ashguard_soldier: "ashguard",
  davan: "davan", shadow_creeper: "shade", gloom_moth: "moth", hollow_stalker: "stalker",
  villager: "villager", villager2: "villager2", elder: "elder",
};
