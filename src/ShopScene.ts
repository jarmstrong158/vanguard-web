import Phaser from "phaser";
import { PAL, bakeAll, ffWindow } from "./sprites";
import { ITEMS, ITEM_PRICE, SHOP_ITEMS, EQUIP, SHOP_EQUIP } from "./data";
import { addItem, addOwnedEquip, getInventory, getMarks, spendMarks } from "./story";
import { sfx } from "./audio";

const W = 384;
const H = 216;
const FONT = '"Silkscreen", monospace';
const c = (n: number) => "#" + n.toString(16).padStart(6, "0");

type ShopKind = "item" | "equip";
interface Row { id: string; name: string; price: number; desc: string; note: () => string; buy: () => string; }

export class ShopScene extends Phaser.Scene {
  private kind: ShopKind = "item";
  private idx = 0;
  private rows: Row[] = [];
  private list!: Phaser.GameObjects.Container;
  private marksText!: Phaser.GameObjects.Text;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyZ!: Phaser.Input.Keyboard.Key;
  private keyX!: Phaser.Input.Keyboard.Key;
  private keyEnter!: Phaser.Input.Keyboard.Key;

  constructor() { super("shop"); }

  init(data: { kind?: ShopKind }) { this.kind = data?.kind ?? "item"; this.idx = 0; }

  create() {
    bakeAll(this);
    this.scene.bringToTop(); // overlay renders above the paused overworld
    this.buildRows();

    const g = this.add.graphics();
    g.fillStyle(0x05060c, 0.78); g.fillRect(0, 0, W, H);
    ffWindow(g, 8, 18, W - 16, 22);
    ffWindow(g, 8, 44, W - 16, H - 60);

    const title = this.kind === "item" ? "PROVISIONS" : "ARMORY";
    this.add.text(16, 29, title, { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(PAL.gold) }).setOrigin(0, 0.5);
    this.marksText = this.add.text(W - 16, 29, "", { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(0xfee761) }).setOrigin(1, 0.5);

    this.list = this.add.container(0, 0);
    this.draw();

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keyZ = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
    this.keyX = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.X);
    this.keyEnter = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    // coming back from the party menu: clear held keys so we don't instantly re-open / buy
    this.events.on(Phaser.Scenes.Events.RESUME, () => { this.keyZ.reset(); this.keyX.reset(); this.keyEnter.reset(); });
    this.add.text(W / 2, H - 9, "↑↓ choose    Z: buy    Enter: menu    X: leave", { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(PAL.steelHi) }).setOrigin(0.5);
  }

  private buildRows() {
    if (this.kind === "item") {
      this.rows = SHOP_ITEMS.map((id) => ({
        id, name: ITEMS[id].name, price: ITEM_PRICE[id], desc: ITEMS[id].desc,
        note: () => `x${getInventory()[id] ?? 0}`,
        buy: () => { addItem(id); return `Bought ${ITEMS[id].name}.`; },
      }));
    } else {
      this.rows = SHOP_EQUIP.map((id) => ({
        id, name: EQUIP[id].name, price: EQUIP[id].price, desc: EQUIP[id].desc,
        note: () => EQUIP[id].slot.toUpperCase(),
        buy: () => { addOwnedEquip(id); return `Bought ${EQUIP[id].name} — equip it in the party menu.`; },
      }));
    }
  }

  private draw() {
    this.list.removeAll(true);
    this.marksText.setText(`Marks: ${getMarks()}`);
    const marks = getMarks();
    this.rows.forEach((r, i) => {
      const sel = i === this.idx;
      const y = 54 + i * 16;
      const afford = marks >= r.price;
      if (sel) { const g = this.add.graphics(); g.fillStyle(0x3a6bd6, 1); g.fillRect(14, y - 2, W - 28, 13); g.lineStyle(1, PAL.gold, 1); g.strokeRect(14, y - 2, W - 28, 13); this.list.add(g); }
      const col = !afford ? PAL.steelSh : sel ? PAL.gold : PAL.clothHi;
      this.list.add(this.add.text(20, y, r.name, { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(col) }));
      this.list.add(this.add.text(210, y, r.note(), { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(PAL.steelHi) }));
      this.list.add(this.add.text(W - 22, y, `${r.price}`, { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(afford ? PAL.cyan : PAL.steelSh) }).setOrigin(1, 0));
    });
    // selected item description
    const r = this.rows[this.idx];
    if (r) this.list.add(this.add.text(20, H - 30, r.desc, { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(PAL.steelHi) }));
  }

  private toast(msg: string, good = true) {
    const t = this.add.text(W / 2, H - 46, msg, { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(good ? PAL.green : PAL.red) }).setOrigin(0.5).setDepth(5);
    this.tweens.add({ targets: t, alpha: 0, delay: 900, duration: 400, onComplete: () => t.destroy() });
  }

  update() {
    const jd = (k: Phaser.Input.Keyboard.Key) => Phaser.Input.Keyboard.JustDown(k);
    const n = this.rows.length;
    if (jd(this.cursors.up!)) { this.idx = (this.idx + n - 1) % n; this.draw(); sfx("move"); }
    if (jd(this.cursors.down!)) { this.idx = (this.idx + 1) % n; this.draw(); sfx("move"); }
    if (jd(this.keyZ)) {
      const r = this.rows[this.idx];
      if (getMarks() < r.price) { this.toast("Not enough Marks!", false); sfx("error"); }
      else if (spendMarks(r.price)) { this.toast(r.buy()); this.draw(); sfx("buy"); }
    }
    if (jd(this.keyEnter)) { this.scene.launch("partymenu", { from: "shop" }); this.scene.pause(); return; }
    if (jd(this.keyX)) { sfx("cancel"); this.scene.stop(); this.scene.resume("overworld"); }
  }
}
