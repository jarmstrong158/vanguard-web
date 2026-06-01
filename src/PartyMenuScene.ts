import Phaser from "phaser";
import { PAL, SPRITE_KEY, bakeAll, ffWindow } from "./sprites";
import { ABIL, EQUIP, PARTY_DEFS, equipBonus, statsAtLevel, type EquipSlot } from "./data";
import { equipItem, getBnd, getCurHp, getCurMp, getStory, stashFor, unequipItem } from "./story";
import { sfx } from "./audio";

const W = 384;
const H = 216;
const FONT = '"Silkscreen", monospace';
const c = (n: number) => "#" + n.toString(16).padStart(6, "0");
const X0 = 118; // right-panel content left edge

type Mode = "roster" | "actions" | "equip" | "pick" | "skills" | "class";
const ACTIONS = ["Equipment", "Skills", "Class"] as const;
const SLOTS: { key: EquipSlot; label: string }[] = [
  { key: "weapon", label: "Weapon" }, { key: "armor", label: "Armor" }, { key: "accessory", label: "Accessory" },
];

export class PartyMenuScene extends Phaser.Scene {
  private mode: Mode = "roster";
  private idx = 0;        // selected member
  private aIdx = 0;       // action
  private sIdx = 0;       // equip slot
  private pIdx = 0;       // pick option
  private skIdx = 0;      // skill
  private pickOptions: { id: string | null; label: string }[] = [];
  private ids: string[] = [];
  private detail!: Phaser.GameObjects.Container;
  private listBox!: Phaser.GameObjects.Container;
  private hint!: Phaser.GameObjects.Text;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyX!: Phaser.Input.Keyboard.Key;
  private keyZ!: Phaser.Input.Keyboard.Key;
  private keyEnter!: Phaser.Input.Keyboard.Key;

  constructor() { super("partymenu"); }

  create() {
    bakeAll(this);
    this.scene.bringToTop();
    this.ids = getStory().party.slice();
    this.mode = "roster"; this.idx = 0; this.aIdx = 0;

    const g = this.add.graphics();
    g.fillStyle(0x05060c, 0.82); g.fillRect(0, 0, W, H);
    ffWindow(g, 0, 0, W, 18);
    this.add.text(10, 9, "PARTY", { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(PAL.gold) }).setOrigin(0, 0.5);
    ffWindow(g, 8, 24, 96, H - 32);
    ffWindow(g, 110, 24, W - 118, H - 32);

    this.listBox = this.add.container(0, 0);
    this.detail = this.add.container(0, 0);
    this.hint = this.add.text(W - 10, 9, "", { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(PAL.steelHi) }).setOrigin(1, 0.5);
    this.redraw();

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keyX = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.X);
    this.keyZ = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
    this.keyEnter = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
  }

  private get memberId() { return this.ids[this.idx]; }

  private redraw() { this.drawList(); this.drawRight(); this.drawHint(); }

  private drawHint() {
    const h: Record<Mode, string> = {
      roster: "↑↓ choose   Z: manage   Enter/X: close",
      actions: "↑↓ choose   Z: open   X: back",
      equip: "↑↓ slot   Z: change   X: back",
      pick: "↑↓ choose   Z: equip   X: back",
      skills: "↑↓ view   X: back",
      class: "X: back",
    };
    this.hint.setText(h[this.mode]);
  }

  private drawList() {
    this.listBox.removeAll(true);
    this.ids.forEach((id, i) => {
      const def = PARTY_DEFS.find((d) => d.id === id)!;
      const lvl = getStory().prog[id]?.level ?? 1;
      const sel = i === this.idx;
      const active = sel && this.mode === "roster";
      const y = 32 + i * 26;
      if (sel) { const g = this.add.graphics(); g.fillStyle(active ? 0x3a6bd6 : 0x26365e, 1); g.fillRect(10, y - 2, 92, 24); g.lineStyle(1, active ? PAL.gold : PAL.steelSh, 1); g.strokeRect(10, y - 2, 92, 24); this.listBox.add(g); }
      this.listBox.add(this.add.image(24, y + 20, SPRITE_KEY[def.theme] ?? id).setOrigin(0.5, 1).setScale(0.7).setCrop(2, 0, 28, 30));
      this.listBox.add(this.add.text(40, y + 2, def.name, { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(sel ? PAL.gold : PAL.clothHi) }));
      this.listBox.add(this.add.text(40, y + 12, `Lv ${lvl}`, { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(PAL.steelHi) }));
    });
  }

  private mk(x: number, y: number, t: string, col = PAL.clothHi) {
    this.detail.add(this.add.text(x, y, t, { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(col) }));
  }
  private bar(x: number, y: number, w: number, sel: boolean) {
    const g = this.add.graphics();
    g.fillStyle(sel ? 0x3a6bd6 : 0x22305a, 1); g.fillRect(x, y, w, 12);
    if (sel) { g.lineStyle(1, PAL.gold, 1); g.strokeRect(x, y, w, 12); }
    this.detail.add(g);
  }

  private drawRight() {
    this.detail.removeAll(true);
    const id = this.memberId;
    const def = PARTY_DEFS.find((d) => d.id === id)!;
    const st = getStory();
    const lvl = st.prog[id]?.level ?? 1;
    const s = statsAtLevel(def, lvl);
    const eq = equipBonus(st.equip[id]);

    // header: portrait + name + lv + HP/MP + stats (shared by all modes)
    this.detail.add(this.add.image(X0 + 10, 64, SPRITE_KEY[def.theme] ?? id).setOrigin(0.5, 1));
    this.mk(X0 + 30, 30, def.name, PAL.gold);
    this.mk(X0 + 30, 42, `${def.job ?? "—"}   Lv ${lvl}`, PAL.steelHi);
    this.mk(X0 + 30, 54, `HP ${getCurHp(id)}/${s.maxHp + eq.hp}`, PAL.green);
    this.mk(X0 + 30, 64, `MP ${getCurMp(id)}/${s.maxMp + eq.mp}`, PAL.cyan);
    const stat = (l: string, b: number, bo: number) => `${l} ${b + bo}${bo ? `(+${bo})` : ""}`;
    this.mk(X0 + 2, 78, stat("ATK", s.ATK, eq.ATK)); this.mk(X0 + 92, 78, stat("SPD", s.SPD, eq.SPD));
    this.mk(X0 + 2, 88, stat("DEF", s.DEF, eq.DEF)); this.mk(X0 + 92, 88, stat("LCK", s.LCK, eq.LCK));
    this.mk(X0 + 2, 98, stat("MAG", s.MAG, eq.MAG));
    const bnd = getBnd(id); if (bnd != null) this.mk(X0 + 92, 98, `BND ${bnd}`, PAL.gold);
    const g = this.add.graphics(); g.fillStyle(PAL.panelEdge, 1); g.fillRect(X0, 110, W - X0 - 18, 1); this.detail.add(g);

    if (this.mode === "roster") this.drawSummary(def, st, id);
    else if (this.mode === "actions") this.drawActions();
    else if (this.mode === "equip" || this.mode === "pick") this.drawEquip(st, id);
    else if (this.mode === "skills") this.drawSkills(def);
    else if (this.mode === "class") this.drawClass(def);
  }

  private drawSummary(def: typeof PARTY_DEFS[number], st: ReturnType<typeof getStory>, id: string) {
    const e = st.equip[id] ?? {};
    this.mk(X0, 116, "GEAR", PAL.steelHi);
    this.mk(X0, 128, `Wpn: ${e.weapon ? EQUIP[e.weapon].name : "—"}`);
    this.mk(X0, 138, `Arm: ${e.armor ? EQUIP[e.armor].name : "—"}`);
    this.mk(X0, 148, `Acc: ${e.accessory ? EQUIP[e.accessory].name : "—"}`);
    this.mk(X0, 164, "ABILITIES", PAL.steelHi);
    const names = def.abilities.map((a) => ABIL[a]?.name ?? a).join(", ");
    const t = this.add.text(X0, 176, names, { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(PAL.clothHi) });
    t.setWordWrapWidth(W - X0 - 16); this.detail.add(t);
    this.mk(X0, 198, "Z: manage this character", PAL.steelHi);
  }

  private drawActions() {
    this.mk(X0, 116, "MANAGE", PAL.steelHi);
    ACTIONS.forEach((a, i) => {
      const y = 130 + i * 16;
      this.bar(X0, y - 2, W - X0 - 18, i === this.aIdx);
      this.mk(X0 + 6, y, a, i === this.aIdx ? PAL.gold : PAL.clothHi);
    });
  }

  private drawEquip(st: ReturnType<typeof getStory>, id: string) {
    this.mk(X0, 116, "EQUIPMENT", PAL.steelHi);
    SLOTS.forEach((sl, i) => {
      const y = 128 + i * 14;
      const selSlot = this.sIdx === i;
      this.bar(X0, y - 2, W - X0 - 18, selSlot && this.mode === "equip");
      const cur = st.equip[id]?.[sl.key];
      this.mk(X0 + 4, y, sl.label, PAL.steelHi);
      this.mk(X0 + 64, y, cur ? EQUIP[cur].name : "—", selSlot && this.mode === "equip" ? PAL.gold : PAL.clothHi);
    });
    if (this.mode === "pick") {
      // overlay the pick list in the lower area
      const g = this.add.graphics(); g.fillStyle(0x0a1430, 0.92); g.fillRect(X0 - 2, 172, W - X0 - 14, 38); this.detail.add(g);
      this.pickOptions.forEach((o, i) => {
        if (i > 2) return; // keep it compact; most slots have few options
        const y = 176 + i * 11;
        this.bar(X0, y - 1, W - X0 - 18, i === this.pIdx);
        this.mk(X0 + 4, y, o.label, o.id === "__none" ? PAL.steelSh : i === this.pIdx ? PAL.gold : PAL.clothHi);
      });
    } else {
      const sl = SLOTS[this.sIdx]; const cur = st.equip[id]?.[sl.key];
      if (cur) this.mk(X0, 176, EQUIP[cur].desc, PAL.cyan);
      this.mk(X0, 196, "Z: change   X: back", PAL.steelHi);
    }
  }

  private drawSkills(def: typeof PARTY_DEFS[number]) {
    this.mk(X0, 116, "SKILLS", PAL.steelHi);
    def.abilities.forEach((aid, i) => {
      const ab = ABIL[aid]; const y = 128 + i * 12;
      this.bar(X0, y - 1, W - X0 - 18, i === this.skIdx);
      this.mk(X0 + 4, y, ab?.name ?? aid, i === this.skIdx ? PAL.gold : PAL.clothHi);
      if (ab?.mp) this.detail.add(this.add.text(W - 24, y, `${ab.mp}MP`, { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(PAL.cyan) }).setOrigin(1, 0));
    });
    const ab = ABIL[def.abilities[this.skIdx]];
    if (ab?.desc) { const t = this.add.text(X0, 188, ab.desc, { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(PAL.steelHi) }); t.setWordWrapWidth(W - X0 - 16); this.detail.add(t); }
  }

  private drawClass(def: typeof PARTY_DEFS[number]) {
    this.mk(X0, 116, "CLASS", PAL.steelHi);
    this.mk(X0, 130, def.job ?? "—", PAL.gold);
    const blurb = CLASS_BLURB[def.job ?? ""] ?? "A capable member of the Vanguard.";
    const t = this.add.text(X0, 144, blurb, { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(PAL.clothHi) }); t.setWordWrapWidth(W - X0 - 16); this.detail.add(t);
    const t2 = this.add.text(X0, 184, "Advanced paths & Attunements unlock as bonds deepen.", { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(PAL.steelHi) }); t2.setWordWrapWidth(W - X0 - 16); this.detail.add(t2);
  }

  private openPick() {
    const id = this.memberId; const slot = SLOTS[this.sIdx].key;
    const cur = getStory().equip[id]?.[slot];
    const opts: { id: string | null; label: string }[] = [];
    if (cur) opts.push({ id: null, label: `Remove (${EQUIP[cur].name})` });
    for (const eid of stashFor(id, slot)) opts.push({ id: eid, label: EQUIP[eid].name });
    if (opts.length === 0) opts.push({ id: "__none", label: "(no spare gear)" });
    this.pickOptions = opts; this.pIdx = 0; this.mode = "pick"; this.redraw();
  }

  private applyPick() {
    const o = this.pickOptions[this.pIdx];
    const id = this.memberId; const slot = SLOTS[this.sIdx].key;
    if (o.id === "__none") { this.mode = "equip"; this.redraw(); return; }
    if (o.id === null) unequipItem(id, slot);
    else equipItem(id, o.id);
    this.mode = "equip"; this.redraw();
  }

  update() {
    const jd = (k: Phaser.Input.Keyboard.Key) => Phaser.Input.Keyboard.JustDown(k);
    const up = jd(this.cursors.up!), down = jd(this.cursors.down!), z = jd(this.keyZ), x = jd(this.keyX), ent = jd(this.keyEnter);
    if (up || down) sfx("move"); else if (z || ent) sfx("confirm"); else if (x) sfx("cancel");

    if (this.mode === "roster") {
      if (up) { this.idx = (this.idx + this.ids.length - 1) % this.ids.length; this.redraw(); }
      if (down) { this.idx = (this.idx + 1) % this.ids.length; this.redraw(); }
      if (z) { this.mode = "actions"; this.aIdx = 0; this.redraw(); }
      if (x || ent) { this.scene.stop(); this.scene.resume("overworld"); }
    } else if (this.mode === "actions") {
      if (up) { this.aIdx = (this.aIdx + ACTIONS.length - 1) % ACTIONS.length; this.redraw(); }
      if (down) { this.aIdx = (this.aIdx + 1) % ACTIONS.length; this.redraw(); }
      if (z) { this.mode = (["equip", "skills", "class"] as Mode[])[this.aIdx]; this.sIdx = 0; this.skIdx = 0; this.redraw(); }
      if (x) { this.mode = "roster"; this.redraw(); }
    } else if (this.mode === "equip") {
      if (up) { this.sIdx = (this.sIdx + SLOTS.length - 1) % SLOTS.length; this.redraw(); }
      if (down) { this.sIdx = (this.sIdx + 1) % SLOTS.length; this.redraw(); }
      if (z) this.openPick();
      if (x) { this.mode = "actions"; this.redraw(); }
    } else if (this.mode === "pick") {
      const n = this.pickOptions.length;
      if (up) { this.pIdx = (this.pIdx + n - 1) % n; this.redraw(); }
      if (down) { this.pIdx = (this.pIdx + 1) % n; this.redraw(); }
      if (z) this.applyPick();
      if (x) { this.mode = "equip"; this.redraw(); }
    } else if (this.mode === "skills") {
      const n = PARTY_DEFS.find((d) => d.id === this.memberId)!.abilities.length;
      if (up) { this.skIdx = (this.skIdx + n - 1) % n; this.redraw(); }
      if (down) { this.skIdx = (this.skIdx + 1) % n; this.redraw(); }
      if (x) { this.mode = "actions"; this.redraw(); }
    } else if (this.mode === "class") {
      if (x) { this.mode = "actions"; this.redraw(); }
    }
  }
}

const CLASS_BLURB: Record<string, string> = {
  Conduit: "Amplifier — empowers allies and channels the Lattice through bonds.",
  Knight: "Front-line guardian. Heavy armor, shielding blows, holds the line.",
  "White Mage": "Healer and warder — mends wounds and lifts the party's spirit.",
  "Black Mage": "Elemental artillery — fire, ice and ruin at range.",
  Thief: "Swift striker — speed, evasion and opportunistic blades.",
  Monk: "Bare-fist bruiser — raw power and relentless pressure.",
};
