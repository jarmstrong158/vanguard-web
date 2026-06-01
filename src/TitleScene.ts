import Phaser from "phaser";
import { PAL, bakeAll, ffWindow } from "./sprites";
import { hasStorySave, loadStory, newStory, setStory, startStep } from "./story";
import { playBgm, sfx } from "./audio";

const W = 384;
const H = 216;
const FONT = '"Silkscreen", monospace';
const c = (n: number) => "#" + n.toString(16).padStart(6, "0");

export class TitleScene extends Phaser.Scene {
  private index = 0;
  private options: string[] = [];
  private keyZ!: Phaser.Input.Keyboard.Key;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private menu!: Phaser.GameObjects.Container;

  constructor() { super("title"); }

  create() {
    bakeAll(this);
    playBgm("title");
    // backdrop
    const g = this.add.graphics();
    g.fillGradientStyle(PAL.sky1, PAL.sky1, PAL.sky3, PAL.sky3, 1); g.fillRect(0, 0, W, H);
    g.fillStyle(PAL.mtn, 1);
    g.fillTriangle(-20, 150, 90, 70, 200, 150); g.fillTriangle(150, 150, 280, 80, 400, 150);
    g.fillStyle(PAL.grassDk, 1); g.fillRect(0, 145, W, H - 145);
    g.fillStyle(PAL.sun, 1); g.fillCircle(300, 56, 22); g.fillStyle(PAL.sunHi, 1); g.fillCircle(295, 51, 15);
    // hero sprites lined up on the ridge
    ["kael", "maren", "lida", "senna"].forEach((k, i) => this.add.image(120 + i * 50, 150, k).setOrigin(0.5, 1));

    // title
    const t = this.add.text(W / 2, 44, "VANGUARD", { fontFamily: FONT, resolution: 4, fontSize: "32px", color: c(PAL.gold) }).setOrigin(0.5);
    t.setShadow(2, 2, "#000000", 0, true, true);
    this.add.text(W / 2, 74, "Conduit of the Shattered Sea", { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(PAL.clothHi) }).setOrigin(0.5);

    this.options = hasStorySave() ? ["Continue", "New Game"] : ["New Game"];
    this.index = 0;
    this.menu = this.add.container(0, 0);
    this.drawMenu();

    this.keyZ = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
    this.cursors = this.input.keyboard!.createCursorKeys();
  }

  private drawMenu() {
    this.menu.removeAll(true);
    this.options.forEach((opt, i) => {
      const sel = i === this.index;
      const y = 150 + i * 18;
      if (sel) {
        const g = this.add.graphics();
        ffWindow(g, W / 2 - 60, y - 4, 120, 16);
        this.menu.add(g);
      }
      this.menu.add(this.add.text(W / 2, y, opt, { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(sel ? PAL.gold : PAL.clothHi) }).setOrigin(0.5));
    });
    this.menu.add(this.add.text(W / 2, 200, "Arrows / Z", { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(PAL.panelHi) }).setOrigin(0.5));
  }

  update() {
    if (Phaser.Input.Keyboard.JustDown(this.cursors.up!) || Phaser.Input.Keyboard.JustDown(this.cursors.down!)) {
      this.index = (this.index + 1) % this.options.length; this.drawMenu(); sfx("move");
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyZ)) {
      sfx("confirm");
      const opt = this.options[this.index];
      if (opt === "Continue") { const s = loadStory(); if (s) setStory(s); }
      else { setStory(newStory()); }
      startStep(this);
    }
  }
}
