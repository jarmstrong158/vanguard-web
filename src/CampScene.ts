import Phaser from "phaser";
import { PAL, SPRITE_KEY, bakeAll, ffWindow } from "./sprites";
import { EQUIP, ITEMS, ITEM_PRICE, SHOP_EQUIP, SHOP_ITEMS, statsAtLevel } from "./data";
import { RUN, defForParty, getRun, saveRun } from "./run";

const W = 384;
const H = 216;
const FONT = '"Silkscreen", monospace';
const c = (n: number) => "#" + n.toString(16).padStart(6, "0");

// flat selectable list: 0 = Depart, 1..N items, then equipment
export class CampScene extends Phaser.Scene {
  private index = 0;
  private list!: Phaser.GameObjects.Container;
  private msg = "";
  private picking = false;
  private pickIndex = 0;
  private pickAllies: string[] = [];
  private pendingEquip = "";
  private keyZ!: Phaser.Input.Keyboard.Key;
  private keyX!: Phaser.Input.Keyboard.Key;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

  constructor() { super("camp"); }

  private get entries() { return ["__depart", ...SHOP_ITEMS, ...SHOP_EQUIP]; }

  create() {
    bakeAll(this);
    const g = this.add.graphics();
    g.fillGradientStyle(PAL.sky2, PAL.sky2, PAL.sky3, PAL.sky3, 1); g.fillRect(0, 0, W, H);
    g.fillStyle(PAL.grassDk, 1); g.fillRect(0, 150, W, H - 150);
    // campfire
    g.fillStyle(0xf77622, 1); g.fillTriangle(56, 150, 64, 132, 72, 150);
    g.fillStyle(PAL.gold, 1); g.fillTriangle(60, 150, 64, 140, 68, 150);
    g.fillStyle(0x3a2d26, 1); g.fillRect(50, 150, 28, 4);

    this.add.text(14, 8, "CAMP", { fontFamily: FONT, resolution: 4, fontSize: "16px", color: c(PAL.gold) });
    this.add.text(W - 130, 12, "Rest — spend Marks", { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(PAL.panelHi) });

    // party row (rested)
    const run = getRun();
    run.party.forEach((ps, i) => {
      const x = 30 + i * 90;
      this.add.image(x, 150, SPRITE_KEY[ps.id]).setOrigin(0.5, 1);
      this.add.text(x - 20, 36, `${ps.id.toUpperCase()} L${ps.level}`, { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(PAL.clothHi) });
      const s = statsAtLevel(defForParty(ps.id), ps.level);
      this.add.text(x - 20, 48, `HP ${s.maxHp}`, { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(PAL.green) });
      const eq = ps.equip; const eqTxt = [eq.weapon, eq.armor, eq.accessory].filter(Boolean).map((id) => EQUIP[id!].name).join(", ") || "-";
      this.add.text(x - 20, 58, eqTxt, { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(PAL.panelHi) }).setWordWrapWidth(80);
    });

    this.list = this.add.container(0, 0);
    this.draw();

    this.keyZ = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
    this.keyX = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.X);
    this.cursors = this.input.keyboard!.createCursorKeys();
  }

  private draw() {
    this.list.removeAll(true);
    const run = getRun();
    const mk = (x: number, y: number, t: string, col: number) => this.add.text(x, y, t, { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(col) });
    // panel
    const p = this.add.graphics();
    ffWindow(p, 6, 78, W - 12, 132);
    this.list.add(p);
    this.list.add(mk(W - 110, 82, `Marks: ${run.marks}`, PAL.gold));

    const ent = this.entries;
    ent.forEach((id, i) => {
      const sel = i === this.index && !this.picking;
      let label: string, price = 0, col = PAL.clothHi;
      if (id === "__depart") { label = "DEPART  →  " + (RUN[run.node]?.name ?? "?"); }
      else if (ITEMS[id]) { price = ITEM_PRICE[id]; label = `${ITEMS[id].name}  (x${run.inventory[id] ?? 0})`; }
      else { const e = EQUIP[id]; price = e.price; label = `${e.name}  ${e.desc}`; }
      // layout: depart full width row0; items left col; equip right col
      let x: number, y: number;
      if (id === "__depart") { x = 14; y = 94; }
      else if (i <= SHOP_ITEMS.length) { x = 14; y = 110 + (i - 1) * 12; }
      else { const j = i - 1 - SHOP_ITEMS.length; x = 196; y = 96 + j * 13; }
      const afford = price === 0 || run.marks >= price;
      col = sel ? PAL.gold : afford ? PAL.clothHi : PAL.steelSh;
      if (sel) { const h = this.add.graphics(); h.fillStyle(0x3a6bd6, 1); h.fillRect(x - 4, y - 1, 174, 11); this.list.add(h); }
      this.list.add(mk(x, y, label, col));
      if (price > 0) this.list.add(mk(x + 150, y, `${price}`, afford ? PAL.cyan : PAL.steelSh));
    });

    if (this.picking) {
      const pp = this.add.graphics(); ffWindow(pp, 90, 90, 200, 90);
      this.list.add(pp);
      this.list.add(mk(100, 96, `Equip ${EQUIP[this.pendingEquip].name} to:`, PAL.clothHi));
      this.pickAllies.forEach((aid, i) => {
        const sel = i === this.pickIndex;
        if (sel) { const h = this.add.graphics(); h.fillStyle(0x3a6bd6, 1); h.fillRect(96, 108 + i * 14 - 1, 188, 13); this.list.add(h); }
        this.list.add(mk(100, 108 + i * 14, aid.toUpperCase(), sel ? PAL.gold : PAL.clothHi));
      });
      this.list.add(mk(100, 168, "Z: equip   X: cancel", PAL.panelHi));
    } else if (this.msg) {
      this.list.add(mk(14, 198, this.msg, PAL.green));
    }
  }

  update() {
    const jd = (k: Phaser.Input.Keyboard.Key) => Phaser.Input.Keyboard.JustDown(k);
    const up = jd(this.cursors.up!) || jd(this.cursors.left!);
    const down = jd(this.cursors.down!) || jd(this.cursors.right!);
    const confirm = jd(this.keyZ);
    const cancel = jd(this.keyX);

    if (this.picking) {
      const n = this.pickAllies.length;
      if (up) { this.pickIndex = (this.pickIndex + n - 1) % n; this.draw(); }
      if (down) { this.pickIndex = (this.pickIndex + 1) % n; this.draw(); }
      if (cancel) { this.picking = false; this.draw(); }
      if (confirm) this.equipTo(this.pickAllies[this.pickIndex]);
      return;
    }

    const n = this.entries.length;
    if (up) { this.index = (this.index + n - 1) % n; this.draw(); }
    if (down) { this.index = (this.index + 1) % n; this.draw(); }
    if (confirm) this.select();
  }

  private select() {
    const run = getRun();
    const id = this.entries[this.index];
    if (id === "__depart") { saveRun(run); this.scene.start("battle"); return; }
    if (ITEMS[id]) {
      const price = ITEM_PRICE[id];
      if (run.marks < price) { this.msg = "Not enough Marks."; this.draw(); return; }
      run.marks -= price; run.inventory[id] = (run.inventory[id] ?? 0) + 1; saveRun(run);
      this.msg = `Bought ${ITEMS[id].name}.`; this.draw(); return;
    }
    // equipment
    const e = EQUIP[id];
    if (run.marks < e.price) { this.msg = "Not enough Marks."; this.draw(); return; }
    const eligible = run.party.filter((ps) => !e.for || e.for.includes(ps.id)).map((ps) => ps.id);
    if (eligible.length === 0) { this.msg = "No one can use that."; this.draw(); return; }
    this.pendingEquip = id; this.pickAllies = eligible; this.pickIndex = 0; this.picking = true; this.draw();
  }

  private equipTo(allyId: string) {
    const run = getRun();
    const e = EQUIP[this.pendingEquip];
    if (run.marks < e.price) { this.picking = false; this.msg = "Not enough Marks."; this.draw(); return; }
    const ps = run.party.find((p) => p.id === allyId)!;
    run.marks -= e.price;
    ps.equip[e.slot] = e.id;
    saveRun(run);
    this.picking = false;
    this.msg = `${allyId.toUpperCase()} equipped ${e.name}.`;
    this.draw();
  }
}
