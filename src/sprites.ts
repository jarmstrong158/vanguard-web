import Phaser from "phaser";
import { MAREN, marenPalette, PAL } from "./art/palette";
import { blend, highlight, ramp, shadeIndex, shadow, SHADOW_SKIN } from "./art/shading";

// Re-exported: PAL's home is art/palette.ts now, but scenes import it from here.
export { PAL };

const hex = (c: number) => "#" + (c >>> 0).toString(16).padStart(6, "0").slice(-6);

// Classic Final Fantasy (SNES) menu window: white border, dark inset, royal->navy
// blue gradient interior, top highlight. Draw into any Graphics object.
export function ffWindow(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number) {
  const r = 5;
  g.fillStyle(0x000000, 0.35); g.fillRoundedRect(x + 2, y + 3, w, h, r);       // drop shadow
  g.fillStyle(0xeaf0ff, 1); g.fillRoundedRect(x, y, w, h, r);                   // white outer border
  g.fillStyle(0x0a1430, 1); g.fillRoundedRect(x + 1, y + 1, w - 2, h - 2, r);   // dark inset line
  g.fillGradientStyle(0x2a52b8, 0x2a52b8, 0x0e1c52, 0x0e1c52, 1);               // blue gradient body
  g.fillRoundedRect(x + 2, y + 2, w - 4, h - 4, Math.max(1, r - 1));
  g.fillStyle(0x5f86e6, 0.5); g.fillRect(x + 5, y + 3, w - 10, 1);              // top sheen
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
  const skin = 0xe6b386, hair = 0xd9b25e, steel = 0x8b9bb4, leather = 0x4a3f36, scar = 0xcf7a68;
  // longsword (left), blade up
  p.block(7, 5, 2, 19, steel);
  p.rect(5, 23, 6, 2, 0xd9a23a); p.rect(5, 23, 6, 1, highlight(0xd9a23a)); // crossguard
  p.block(7, 25, 2, 3, leather); // grip
  chibi(p, skin, steel, steel);
  p.rect(15, 17, 2, 9, shadow(steel, 0.3)); // chest seam
  p.rect(10, 23, 12, 2, leather);            // belt
  // pauldrons
  p.block(8, 17, 5, 3, steel); p.block(19, 17, 5, 3, steel);
  // sandy blond cropped hair
  p.block(10, 4, 12, 4, hair); p.block(10, 7, 2, 2, hair); p.block(20, 7, 2, 2, hair);
  // scar down the cheek (his left = viewer right)
  p.px(19, 8, scar); p.px(19, 9, scar); p.px(18, 10, scar); p.px(18, 11, scar);
  // pale blue eyes
  p.rect(13, 11, 2, 2,0x355a7a); p.rect(17, 11, 2, 2,0x355a7a);
}

function drawLida(p: PC) {
  const skin = 0x7d4e30, hair = 0x231a24, robe = 0x6f8a52, apron = 0xddcda6, belt = 0x6b4a32, flower = 0xf2757a, rod = 0xb0895a, leaf = 0x5db04a;
  // healer's rod (right), with a green herb-orb
  p.block(24, 7, 2, 21, rod);
  p.block(22, 5, 4, 3, leaf); p.px(23, 4, highlight(leaf));
  chibi(p, skin, robe, robe);
  // robe flares at the hem
  p.block(9, 26, 14, 4, robe); p.rect(9, 29, 14, 1, shadow(robe, 0.5));
  // cream apron with a pocket seam
  p.block(13, 18, 6, 8, apron); p.rect(13, 22, 6, 1, shadow(apron, 0.35));
  p.rect(11, 17, 11, 1, belt);
  // thick black hair + side braid over shoulder
  p.block(10, 4, 12, 4, hair); p.block(10, 7, 2, 4, hair); p.block(20, 7, 2, 4, hair);
  p.block(21, 11, 2, 7, hair); p.px(21, 14, shadow(hair, 0.3)); p.rect(21, 18, 2, 1, belt); // braid + tie
  // tucked flower
  p.px(11, 5, flower); p.px(11, 4, highlight(flower)); p.px(12, 5, PAL.gold);
  // warm brown eyes + small smile
  p.rect(13, 11, 2, 2,0x3a2418); p.rect(17, 11, 2, 2,0x3a2418);
  p.px(15, 14, shadow(skin, 0.4));
}

function drawWolf(p: PC) {
  const fur = 0x6b4a38, eye = 0xff0044; // facing right, 36x22
  // legs
  p.block(7, 15, 3, 6, shadow(fur, 0.35)); p.block(12, 15, 3, 6, shadow(fur, 0.35));
  p.block(21, 15, 3, 6, shadow(fur, 0.35)); p.block(26, 15, 3, 6, shadow(fur, 0.35));
  // tail
  p.block(1, 6, 6, 3, fur); p.px(0, 5, fur);
  // body
  p.block(5, 7, 23, 9, fur);
  p.rect(5, 14, 23, 2, shadow(fur, 0.4)); // belly shadow
  // haunch
  p.block(5, 8, 7, 8, fur);
  // head (front-right)
  p.block(25, 5, 9, 9, fur);
  // snout
  p.block(31, 9, 4, 3, shadow(fur, 0.3)); p.px(34, 10, 0x181425);
  // ears
  p.block(25, 2, 2, 3, fur); p.block(29, 2, 2, 3, fur);
  // glowing eye
  p.px(29, 8, eye); p.px(30, 8, highlight(eye));
}

function drawSenna(p: PC) {
  const skin = 0x6a4330, hair = 0x1a141c, vest = 0x3a2d26, scarf = 0xd64b4b, pants = 0x9a8868, staff = 0xb0895a, flame = 0xf77622;
  // staff with flame (right)
  p.block(24, 7, 2, 21, staff);
  p.block(22, 4, 4, 4, flame); p.px(23, 3, highlight(flame)); p.px(24, 4, PAL.gold);
  chibi(p, skin, vest, pants);
  // red scarf at neck/chest
  p.rect(10, 17, 12, 3, scarf); p.rect(10, 17, 12, 1, highlight(scarf));
  p.px(11, 20, scarf); // loose end
  // short coiled black hair (close cut)
  p.block(10, 4, 12, 4, hair); p.block(10, 7, 2, 2, hair); p.block(20, 7, 2, 2, hair);
  // fierce eyes (catch firelight)
  p.rect(13, 11, 2, 2, 0x201018); p.rect(17, 11, 2, 2, 0x201018); p.px(13, 11, flame); p.px(17, 11, flame);
}

function drawSlime(p: PC) {
  const body = 0x3a9a6a;
  // squat blob
  p.block(4, 8, 20, 11, body);
  p.block(6, 5, 16, 5, body);
  p.rect(4, 17, 20, 2, shadow(body, 0.4));
  p.rect(6, 5, 16, 1, highlight(body));
  // gloss
  p.px(9, 7, highlight(body, 0.3)); p.px(10, 7, highlight(body, 0.3));
  // eyes
  p.rect(10, 10, 3, 4, 0xffffff); p.rect(16, 10, 3, 4, 0xffffff);
  p.rect(11, 12, 2, 2, 0x201828); p.rect(17, 12, 2, 2, 0x201828);
}

function drawMilitia(p: PC) {
  const skin = 0xd9a878, hair = 0x4a3326, tunic = 0x9a8a52, leather = 0x6b4a32, steel = 0xb7bcc8, shaft = 0x8a6a44;
  // spear (right)
  p.block(24, 4, 2, 24, shaft);
  p.rect(23, 4, 4, 4, steel); p.px(24, 2, highlight(steel)); // tip
  chibi(p, skin, tunic, leather);
  p.rect(10, 23, 12, 2, leather); // belt
  // leather cap on the big head
  p.block(10, 4, 12, 4, leather); p.block(10, 7, 2, 2, hair); p.block(20, 7, 2, 2, hair);
  p.rect(13, 11, 2, 2,0x2a2030); p.rect(17, 11, 2, 2,0x2a2030);
}

function drawRhogar(p: PC) {
  // big armored captain, 40x40, fire/red theme, facing right
  const steel = 0x6a5560, red = 0xb02a33, dark = 0x3a2d31, gold = 0xe0a93a, skin = 0xc89a78, flame = 0xf77622;
  // big sword (left)
  p.block(5, 4, 3, 26, steel);
  p.rect(3, 28, 7, 2, gold);
  p.block(6, 30, 3, 5, dark);
  // legs / greaves
  p.block(15, 30, 5, 8, steel); p.block(22, 30, 5, 8, steel);
  p.rect(15, 36, 5, 2, dark); p.rect(22, 36, 5, 2, dark);
  // broad torso plate
  p.block(11, 15, 20, 17, steel);
  p.block(13, 17, 16, 9, red);          // red tabard
  p.rect(20, 17, 2, 14, dark);          // center seam
  p.rect(11, 28, 20, 2, dark);          // belt
  // huge pauldrons
  p.block(8, 13, 7, 6, steel); p.block(27, 13, 7, 6, steel);
  p.px(10, 14, gold); p.px(31, 14, gold);
  // arms
  p.block(8, 19, 3, 11, steel); p.block(31, 19, 3, 11, steel);
  p.rect(8, 30, 3, 2, skin); p.rect(31, 30, 3, 2, skin);
  // head + horned helm
  p.block(15, 5, 12, 11, steel);
  p.block(16, 8, 10, 6, skin);          // face opening
  p.rect(16, 8, 10, 1, shadow(skin, 0.4));
  p.px(18, 11, flame); p.px(23, 11, flame); // burning eyes
  // horns
  p.block(13, 3, 3, 4, dark); p.px(12, 2, dark);
  p.block(26, 3, 3, 4, dark); p.px(29, 2, dark);
  p.rect(20, 3, 2, 3, red);             // crest
}

function drawAshguard(p: PC) {
  const skin = 0xc89a78, hair = 0x3a2d26, armor = 0x7a2f33, dark = 0x4a1f24, steel = 0x9aa0ae, shaft = 0x8a6a44;
  // spear
  p.block(24, 4, 2, 24, shaft);
  p.rect(23, 4, 4, 4, steel); p.px(24, 2, highlight(steel));
  chibi(p, skin, armor, dark);
  p.rect(10, 23, 12, 2, dark);       // belt
  p.rect(15, 17, 2, 8, dark);        // armor seam
  // pauldrons
  p.block(8, 17, 4, 3, steel); p.block(20, 17, 4, 3, steel);
  // steel helm over the big head, cheek guards leave a visor of face
  p.block(10, 4, 12, 5, steel);
  p.rect(19, 3, 2, 3, armor);                          // crest
  p.block(10, 9, 2, 4, steel); p.block(20, 9, 2, 4, steel); // cheek guards
  p.rect(12, 9, 8, 1, hair);                           // brow shadow
  // hostile red eyes
  p.rect(13, 11, 2, 2,0xc0392b); p.rect(17, 11, 2, 2,0xc0392b);
}

function drawDavan(p: PC) {
  const skin = 0xb89a82, hood = 0x2a2733, cloak = 0x342f3e, dark = 0x1c1924, blade = 0xc0cbdc;
  // dagger (right hand)
  p.block(23, 19, 2, 7, blade); p.px(23, 18, highlight(blade));
  chibi(p, skin, cloak, dark);
  // shadow-eating cloak edges + belt
  p.rect(10, 17, 1, 9, hood); p.rect(21, 17, 1, 9, hood);
  p.rect(10, 23, 12, 1, dark);
  // deep hood over the big head, shadowing the face
  p.block(10, 4, 12, 6, hood);
  p.block(10, 10, 2, 4, hood); p.block(20, 10, 2, 4, hood); // hood sides
  p.rect(12, 8, 8, 2, shadow(skin, 0.5));                // shadowed brow line
  // sharp eyes glinting in the dark
  p.rect(13, 11, 2, 2,0x3a4a4a); p.rect(17, 11, 2, 2,0x3a4a4a);
}

function drawShade(p: PC) {
  const fur = 0x342a48, eye = 0x8affd0; // shadow creeper, facing right, 36x22
  p.block(7, 15, 3, 6, shadow(fur, 0.3)); p.block(13, 15, 3, 6, shadow(fur, 0.3));
  p.block(21, 15, 3, 6, shadow(fur, 0.3)); p.block(26, 15, 3, 6, shadow(fur, 0.3));
  p.block(5, 8, 22, 8, fur);
  p.rect(5, 14, 22, 2, shadow(fur, 0.4));
  p.block(24, 5, 9, 8, fur);            // head
  p.block(24, 2, 2, 3, fur); p.block(28, 2, 2, 3, fur); // ears
  // wisps
  p.px(2, 7, fur); p.px(0, 9, fur); p.px(4, 5, fur);
  p.px(29, 8, eye); p.px(30, 8, highlight(eye));
}

function drawMoth(p: PC) {
  const wing = 0x3a2d52, wingEdge = 0x5a4a7a, body = 0x241a30, eye = 0xb08aff; // 34x24
  // wings
  p.block(2, 6, 12, 12, wing); p.block(20, 6, 12, 12, wing);
  p.rect(2, 6, 12, 1, wingEdge); p.rect(20, 6, 12, 1, wingEdge);
  p.px(7, 11, 0x8a6aff); p.px(26, 11, 0x8a6aff); // eyespots
  // body
  p.block(14, 5, 6, 16, body);
  // eyes + antennae
  p.px(15, 7, eye); p.px(18, 7, eye);
  p.px(14, 3, body); p.px(13, 2, body); p.px(19, 3, body); p.px(20, 2, body);
}

function drawStalker(p: PC) {
  // big shadow assassin beast, 44x36, hunched, many eyes
  const mass = 0x241830, massHi = 0x3a2848, eye = 0x9affe0, claw = 0x6a7a8a;
  // long limbs
  p.block(8, 22, 4, 12, mass); p.block(34, 22, 4, 12, mass);
  p.block(16, 26, 4, 10, mass); p.block(26, 26, 4, 10, mass);
  // claws
  p.px(8, 34, claw); p.px(11, 34, claw); p.px(34, 34, claw); p.px(37, 34, claw);
  // hunched body
  p.block(10, 10, 26, 18, mass);
  p.rect(10, 10, 26, 2, massHi);
  // head/maw lower-front
  p.block(28, 18, 12, 10, mass);
  // shadow wisps rising
  p.px(14, 6, mass); p.px(20, 4, mass); p.px(30, 6, mass); p.px(24, 2, mass);
  // many glowing eyes
  p.px(16, 14, eye); p.px(22, 13, eye); p.px(28, 15, eye); p.px(33, 21, eye); p.px(36, 23, eye);
  p.px(19, 16, eye); p.px(25, 16, eye);
}

function drawYara(p: PC) {
  const skin = 0x7a5240, stone = 0x8a8a96, hair = 0x1a141c, gi = 0x4a4a52, sash = 0x9a6a3a, iron = 0xb0b6c0;
  chibi(p, skin, gi, gi);
  p.rect(9, 22, 14, 2, sash);            // belt sash
  p.rect(10, 17, 12, 1, highlight(gi));  // lapel highlight
  // stone-textured forearms / fists (a monk's weapons)
  p.block(7, 20, 3, 5, stone); p.block(22, 20, 3, 5, stone);
  p.rect(7, 24, 3, 2, stone); p.rect(22, 24, 3, 2, stone);
  // iron pendant
  p.px(15, 18, iron); p.px(16, 18, iron);
  // black hair + thick braid over shoulder, iron-wire bands
  p.block(10, 4, 12, 4, hair); p.block(10, 7, 2, 4, hair); p.block(20, 7, 2, 4, hair);
  p.block(21, 11, 2, 8, hair); p.px(21, 14, iron); p.px(21, 17, iron); // braid + wire
  // amber eyes
  p.rect(13, 11, 2, 2, 0x2a1f18); p.rect(17, 11, 2, 2, 0x2a1f18);
  p.px(13, 11, 0xc8902a); p.px(17, 11, 0xc8902a);
}

function drawMirror(p: PC) {
  // dark Conduit echo — a hollow silhouette of Maren with glowing cracks, 32x36
  const dark = 0x1a1830, darkHi = 0x2e2a4a, crack = 0x6ad8ff;
  p.block(12, 26, 4, 8, dark); p.block(17, 26, 4, 8, dark); // legs
  p.block(8, 16, 16, 12, dark);                            // body
  p.rect(8, 16, 16, 1, darkHi);
  p.block(6, 17, 2, 9, dark); p.block(24, 17, 2, 9, dark); // arms
  p.block(11, 5, 10, 11, dark);                            // head (hooded, featureless)
  // glowing fracture lines
  p.px(15, 8, crack); p.px(16, 10, crack); p.px(15, 12, crack); p.px(14, 14, crack);
  p.px(12, 20, crack); p.px(19, 22, crack); p.px(16, 25, crack); p.px(10, 24, crack);
  // hollow glowing eyes
  p.px(13, 9, crack); p.px(18, 9, crack);
  // wisps
  p.px(9, 3, dark); p.px(22, 3, dark); p.px(7, 14, dark); p.px(25, 16, dark);
}

function townsfolk(p: PC, skin: number, hair: number, tunic: number, robe = false) {
  if (robe) {
    // floor-length robe (elder) — body to the ground
    p.block(10, 15, 12, 13, tunic); p.block(9, 26, 14, 3, shadow(tunic, 0.4)); p.rect(9, 28, 14, 1, shadow(tunic, 0.6));
    p.block(8, 18, 2, 7, tunic); p.block(22, 18, 2, 7, tunic);
    p.rect(8, 24, 2, 2, skin); p.rect(22, 24, 2, 2, skin);
    p.block(10, 6, 12, 9, skin);
  } else {
    chibi(p, skin, tunic, shadow(tunic, 0.45));
  }
  // hair
  p.block(10, 4, 12, 4, hair); p.block(10, 7, 2, 2, hair); p.block(20, 7, 2, 2, hair);
  // eyes
  p.rect(13, 11, 2, 2,0x2a2030); p.rect(17, 11, 2, 2,0x2a2030);
}

function drawRat(p: PC) {
  const fur = 0x8a7a64, pink = 0xc98a8a, eye = 0xff4455; // 28x16, facing right
  p.block(0, 9, 9, 2, pink); p.px(0, 8, pink);                                  // tail
  p.block(9, 12, 2, 4, shadow(fur, 0.35)); p.block(14, 12, 2, 4, shadow(fur, 0.35)); p.block(20, 12, 2, 4, shadow(fur, 0.35)); // legs
  p.block(7, 5, 16, 8, fur);                                                    // body
  p.rect(7, 11, 16, 2, shadow(fur, 0.4));                                       // belly shadow
  p.block(20, 4, 7, 7, fur);                                                    // head
  p.block(26, 7, 2, 2, pink); p.px(27, 8, 0x201018);                            // snout + nose
  p.block(19, 1, 3, 3, fur); p.block(24, 1, 3, 3, fur);                         // ears
  p.px(24, 6, eye);
}

function drawSpider(p: PC) {
  const body = 0x2a2438, leg = 0x161220, eye = 0xff5a5a, mark = 0xb03a3a; // 28x20
  for (let i = 0; i < 4; i++) { const y = 6 + i * 3; p.rect(1, y, 9, 1, leg); p.rect(18, y, 9, 1, leg); } // 8 legs
  p.block(9, 5, 10, 12, body);                                                  // round body
  p.rect(9, 5, 10, 1, 0x3a3450);                                                // top sheen
  p.px(13, 8, mark); p.px(14, 8, mark); p.px(13, 9, mark); p.px(14, 9, mark);   // red hourglass
  p.px(11, 13, eye); p.px(16, 13, eye); p.px(12, 15, eye); p.px(15, 15, eye);   // eye cluster
}

export function bakeAll(scene: Phaser.Scene) {
  bake(scene, "maren", 32, 32, drawMaren, marenPalette());
  bake(scene, "yara", 32, 32, drawYara);
  bake(scene, "villager", 32, 32, (p) => townsfolk(p, 0xe0a878, 0x4a3326, 0x9a7a52));
  bake(scene, "villager2", 32, 32, (p) => townsfolk(p, 0xc89a78, 0x2a2030, 0x5a7a5a));
  bake(scene, "elder", 32, 32, (p) => townsfolk(p, 0xd8b89a, 0xc0c0c8, 0x7a6a8a, true));
  bake(scene, "mirror", 32, 36, drawMirror);
  bake(scene, "davan", 32, 32, drawDavan);
  bake(scene, "shade", 36, 22, drawShade);
  bake(scene, "moth", 34, 24, drawMoth);
  bake(scene, "stalker", 44, 36, drawStalker);
  bake(scene, "ashguard", 32, 32, drawAshguard);
  bake(scene, "kael", 32, 32, drawKael);
  bake(scene, "lida", 32, 32, drawLida);
  bake(scene, "senna", 32, 32, drawSenna);
  bake(scene, "wolf", 36, 22, drawWolf);
  bake(scene, "slime", 28, 20, drawSlime);
  bake(scene, "rat", 28, 16, drawRat);
  bake(scene, "spider", 28, 20, drawSpider);
  bake(scene, "militia", 32, 32, drawMilitia);
  bake(scene, "rhogar", 40, 40, drawRhogar);
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
