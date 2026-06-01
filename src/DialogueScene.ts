import Phaser from "phaser";
import { PAL, SPRITE_KEY, bakeAll, ffWindow } from "./sprites";
import { activeParty, awardXp, getStory, giveEquip, joinMember, saveStory, setFlag, startStep, type DialogSeq, type Line, type StoryStep } from "./story";

type OverlayData = { overlay: true; seq: DialogSeq; bg?: string; doneFlag?: string };

const W = 384;
const H = 216;
const FONT = '"Silkscreen", monospace';
const c = (n: number) => "#" + n.toString(16).padStart(6, "0");

// Speaker -> portrait sprite key. Unknown speakers fall back to a generic villager
// so every NPC gets a face. Maren's mother Renna also uses a villager sprite.
const PORTRAIT: Record<string, string> = { Maren: "maren", Kael: "kael", Lida: "lida", Senna: "senna", Davan: "davan", Yara: "yara", Rhogar: "rhogar", Toller: "elder", Renna: "villager2" };
const NAME_COLOR: Record<string, number> = { Maren: 0x8fd3ff, Kael: 0xd9b25e, Lida: 0x7fe0a0, Senna: 0xf77622, Renna: 0xf6a5c0, Rhogar: 0xe43b44, Toller: 0xe0c080, Davan: 0xb0b0c0, Yara: 0xc8902a };

export class DialogueScene extends Phaser.Scene {
  private step!: StoryStep;
  private idx = 0;
  private box!: Phaser.GameObjects.Container;
  private arrow!: Phaser.GameObjects.Text;
  private keyZ!: Phaser.Input.Keyboard.Key;
  private full = "";
  private shown = 0;
  private typing = false;
  private curLine: Line | null = null;
  private autoElapsed = 0;

  private overlay = false;
  private doneFlag?: string;

  constructor() { super("dialogue"); }

  init(data: StoryStep | OverlayData) {
    this.idx = 0;
    if ("overlay" in data) { this.overlay = true; this.doneFlag = data.doneFlag; this.step = { kind: "dialogue", seq: data.seq, bg: data.bg ?? "town" }; }
    else { this.overlay = false; this.doneFlag = undefined; this.step = data; }
  }

  create() {
    bakeAll(this);
    if (this.overlay) {
      // The scene config order ([..., Dialogue, Overworld, ...]) makes the overworld
      // render ABOVE this scene by default, hiding the overlay box behind it. Force
      // this scene to the top of the render order so the dialogue is actually visible.
      this.scene.bringToTop();
      // play over the paused overworld: just dim it, keep it visible behind
      const dim = this.add.graphics(); dim.fillStyle(0x05060c, 0.6); dim.fillRect(0, 0, W, H);
    } else {
      this.drawBg();
    }
    if (this.step.kind === "card") { this.drawCard(); }
    this.box = this.add.container(0, 0);
    this.arrow = this.add.text(W - 24, 198, "▼", { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(PAL.gold) }).setVisible(false);
    this.tweens.add({ targets: this.arrow, y: "+=2", duration: 400, yoyo: true, repeat: -1 });
    this.keyZ = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
    if (this.step.kind === "dialogue") this.showLine();
  }

  private drawBg() {
    const g = this.add.graphics();
    const bg = this.step.kind === "dialogue" ? this.step.bg : "dawn";
    if (bg === "clinic") { g.fillGradientStyle(0x3a2d44, 0x3a2d44, 0x241a33, 0x241a33, 1); g.fillRect(0, 0, W, H); g.fillStyle(0xf0b53c, 0.12); g.fillCircle(W / 2, 40, 60); }
    else if (bg === "marsh") {
      g.fillGradientStyle(0x2e3a44, 0x2e3a44, 0x3a4a44, 0x3a4a44, 1); g.fillRect(0, 0, W, H);
      g.fillStyle(0x4a5a4a, 0.4); g.fillCircle(120, 50, 40); g.fillStyle(0x4a5a4a, 0.3); g.fillCircle(280, 40, 50); // fog
      g.fillStyle(0x1a2a24, 1); g.fillRect(0, 150, W, H - 150);
      g.fillStyle(0x24403a, 1); g.fillEllipse(90, 175, 60, 12); g.fillEllipse(280, 185, 70, 14); // water
    } else if (bg === "hollows") {
      g.fillGradientStyle(0x1a2420, 0x1a2420, 0x0e1614, 0x0e1614, 1); g.fillRect(0, 0, W, H);
      g.fillStyle(0x14201a, 1); for (let i = 0; i < 6; i++) g.fillTriangle(i * 70 - 20, 160, i * 70 + 14, 40, i * 70 + 48, 160); // dark trunks/canopy
      g.fillStyle(0x6affc0, 1); for (let i = 0; i < 24; i++) g.fillCircle((i * 71) % W, 60 + (i * 53) % 100, 1); // glowing fungi
    } else { g.fillGradientStyle(0x2a3a5a, 0x2a3a5a, 0xb56a4a, 0xe0a060, 1); g.fillRect(0, 0, W, H); g.fillStyle(0xfee761, 0.8); g.fillCircle(300, 150, 18); }
    if (bg !== "marsh") { g.fillStyle(0x14200e, 1); g.fillRect(0, 160, W, H - 160); g.fillStyle(0x1a1430, 1); g.fillTriangle(-20, 160, 80, 110, 190, 160); g.fillTriangle(150, 160, 280, 100, 400, 160); }
  }

  private drawCard() {
    if (this.step.kind !== "card") return;
    this.add.text(W / 2, 86, this.step.title, { fontFamily: FONT, resolution: 4, fontSize: "32px", color: c(PAL.gold) }).setOrigin(0.5).setShadow(2, 2, "#000", 0, true, true);
    this.add.text(W / 2, 124, this.step.sub, { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(PAL.clothHi) }).setOrigin(0.5);
    this.add.text(W / 2, 196, "Z", { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(PAL.panelHi) }).setOrigin(0.5);
  }

  private showLine() {
    if (this.step.kind !== "dialogue") return;
    this.box.removeAll(true);
    this.arrow.setVisible(false);
    const line = this.step.seq.lines[this.idx];
    this.curLine = line; this.autoElapsed = 0;
    // side effects on display
    const st = getStory();
    if (line.setFlags) line.setFlags.forEach((f) => (st.flags[f] = true));
    if (line.partyAdd) joinMember(line.partyAdd);
    if (line.giveXp) awardXp(activeParty(), line.giveXp);
    if (line.giveEquip) giveEquip(line.giveEquip);
    saveStory(st);

    const narration = !line.speaker;
    // panel
    const g = this.add.graphics();
    ffWindow(g, 8, 150, W - 16, 58);
    this.box.add(g);

    if (!narration) {
      // Portrait card lifted ABOVE the text box so it never overlaps the words.
      // Name sits in the grey strip at the top of the card; the character fills below.
      const key = SPRITE_KEY[PORTRAIT[line.speaker!] ?? "villager"] ?? "villager";
      const nameCol = NAME_COLOR[line.speaker!] ?? PAL.gold;
      const fx = 10, fy = 82, fw = 60, fh = 64;
      const pg = this.add.graphics();
      pg.fillStyle(PAL.out, 0.92); pg.fillRect(fx, fy, fw, fh);              // dark backing
      pg.fillStyle(0x2a2440, 1); pg.fillRect(fx + 1, fy + 1, fw - 2, 11);    // name strip (grey)
      pg.fillStyle(0x161226, 1); pg.fillRect(fx + 1, fy + 12, fw - 2, fh - 13); // character well
      pg.lineStyle(1, nameCol, 1); pg.strokeRect(fx, fy, fw, fh);
      pg.fillStyle(nameCol, 0.5); pg.fillRect(fx + 1, fy + 12, fw - 2, 1);   // divider under name
      this.box.add(pg);
      this.box.add(this.add.text(fx + fw / 2, fy + 6, line.speaker!.toUpperCase(), { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(nameCol) }).setOrigin(0.5));
      const img = this.add.image(fx + fw / 2, fy + fh - 2, key).setOrigin(0.5, 1).setScale(1.5);
      this.box.add(img);
    }
    this.full = line.text;
    this.shown = 0; this.typing = true;
    const body = this.add.text(18, 160, "", { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(narration ? PAL.steelHi : PAL.clothHi) });
    body.setWordWrapWidth(W - 36);
    body.setName("body");
    this.box.add(body);
  }

  update(_: number, dt: number) {
    if (this.typing) {
      this.shown += dt * 0.06; // ~60 chars/sec
      const body = this.box.getByName("body") as Phaser.GameObjects.Text | null;
      if (body) body.setText(this.full.slice(0, Math.floor(this.shown)));
      if (this.shown >= this.full.length) { this.typing = false; if (!this.curLine?.auto) this.arrow.setVisible(true); }
    } else if (this.curLine?.auto) {
      this.autoElapsed += dt;
      if (this.autoElapsed >= (this.curLine.wait ?? 1) * 1000) { this.curLine = null; this.advance(); }
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyZ)) this.advance();
  }

  private finish() {
    if (this.overlay) {
      if (this.doneFlag) setFlag(this.doneFlag); // mark the story beat complete
      this.scene.stop();
      this.scene.resume("overworld");
    } else { startStep(this); } // safety: drop back into the world
  }

  private advance() {
    if (this.step.kind === "card") { this.finish(); return; }
    if (this.step.kind !== "dialogue") return;
    if (this.typing) { // skip typewriter
      this.shown = this.full.length;
      const body = this.box.getByName("body") as Phaser.GameObjects.Text | null;
      if (body) body.setText(this.full);
      this.typing = false; this.arrow.setVisible(true);
      return;
    }
    this.idx++;
    if (this.idx >= this.step.seq.lines.length) { this.finish(); return; }
    this.showLine();
  }
}
