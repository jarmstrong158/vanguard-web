import Phaser from "phaser";
import { ABIL, CONDUIT_PULSES, ENEMY_DEFS, ITEMS, STATUS, type AbilityDef, type ItemDef } from "./data";
import { Battle, Combatant } from "./combat";
import { drawBattleBackdrop } from "./art/backdrop";
import { PAL, SPRITE_KEY, bakeAll, ffWindow } from "./sprites";
import { bar as uiBar, selection, shadowed } from "./art/ui";
import { UI } from "./art/palette";
import { highlight } from "./art/shading";
import { RUN, applyLevels, clearSave, defForParty, getRun, restParty, saveRun } from "./run";
import { addBountyKills, addMarks, awardXp, getBnd, getCurHp, getCurMp, getEquip, getLevel, getStory, giveEquip, saveStory, setCurHpMp, XP_MULT, type BattleConfig } from "./story";
import { playBgm, sfx } from "./audio";

const W = 384;
const H = 216;
const FONT = '"Silkscreen", monospace';
const c = (n: number) => "#" + n.toString(16).padStart(6, "0");

type Phase = "command" | "select_ability" | "select_item" | "select_pulse" | "select_target" | "busy" | "results" | "defeat" | "escaped" | "runclear";

interface ActorView {
  c: Combatant;
  img: Phaser.GameObjects.Image;
  bar: Phaser.GameObjects.Graphics;
  nameText: Phaser.GameObjects.Text;
  baseX: number;
  baseY: number; // feet baseline
  displayedHp: number;
  displayedMp: number;
  dead: boolean;
  /** Per-instance offset for the idle breathe. Without it the whole party
   *  rises and falls as one organism and the scene reads as a sprite sheet
   *  rather than a group of characters (BRIEF §2.6). */
  breathPhase: number;
}


// Horizon: sky above, walkable battlefield below. Feet must sit below this.
const HZ = 100;
/** 2px of a 384px viewport -- the shake ceiling in BRIEF §2.6. Phaser takes
 *  intensity as a fraction of width, so the cap has to be expressed that way. */
const SHAKE_2PX = 2 / W;
// party formation slots (feet baselines), staggered for depth
const PARTY_SLOTS: [number, number][] = [
  [348, 124], [314, 138], [286, 154], [332, 161],
];
function enemyPositions(count: number): [number, number][] {
  if (count <= 1) return [[104, 152]];
  if (count === 2) return [[68, 128], [118, 156]];
  return [[54, 122], [96, 144], [134, 162]];
}

export class BattleScene extends Phaser.Scene {
  private battle!: Battle;
  private views = new Map<Combatant, ActorView>();
  private phase: Phase = "busy";
  private active: Combatant | null = null;

  private menuIndex = 0;
  private abilityIndex = 0;
  private targetIndex = 0;
  private pending: AbilityDef | null = null;
  private pendingItem: ItemDef | null = null;
  private targetList: Combatant[] = [];
  private commands: string[] = [];
  private listIds: string[] = []; // ability/item/pulse ids currently shown
  private pulsedThisTurn = false;

  private actorLayer!: Phaser.GameObjects.Container;
  private uiLayer!: Phaser.GameObjects.Container;
  private popupLayer!: Phaser.GameObjects.Container;

  private turnBar!: Phaser.GameObjects.Container;
  private bottomPanel!: Phaser.GameObjects.Container;
  private banner!: Phaser.GameObjects.Text;
  private bannerBg!: Phaser.GameObjects.Graphics;
  private marker!: Phaser.GameObjects.Triangle;
  private reticle!: Phaser.GameObjects.Graphics;

  private keyZ!: Phaser.Input.Keyboard.Key;
  private keyX!: Phaser.Input.Keyboard.Key;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

  private cfg: BattleConfig | null = null;

  constructor() { super("battle"); }

  init(data?: { story?: BattleConfig }) { this.cfg = data?.story ?? null; }

  create() {
    bakeAll(this);
    let introMsg: string;
    if (this.cfg) {
      const sb = this.cfg;
      // No floor-clamp: the party fights at its real, earned level. Skip too many
      // fights and you'll be under-leveled — grind the field / optional encounters.
      const party = sb.party.map((id, i) => {
        const cb = new Combatant(defForParty(id), "party", i, { level: getLevel(id), hp: getCurHp(id), mp: getCurMp(id), bnd: getBnd(id), equip: getEquip(id) });
        if (cb.hp <= 0) cb.alive = false; // KO'd from a previous fight — needs reviving / resting
        return cb;
      });
      const enemies = sb.enemies.map((id, i) => new Combatant(ENEMY_DEFS[id], "enemy", i));
      // share the persistent story inventory so bought consumables are usable (and spent)
      this.battle = new Battle(party, enemies, { canEscape: sb.escape !== false, inventory: getStory().inventory });
      playBgm(enemies.some((e) => e.def.isBoss) ? "boss" : "battle");
      introMsg = sb.intro;
    } else {
      const run = getRun();
      const enc = RUN[run.node];
      const party = run.party.map((ps, i) => {
        const cb = new Combatant(defForParty(ps.id), "party", i, { level: ps.level, hp: ps.hp, mp: ps.mp, bnd: ps.bnd, equip: ps.equip });
        if (ps.hp <= 0) cb.alive = false;
        return cb;
      });
      const enemies = enc.enemies.map((id, i) => new Combatant(ENEMY_DEFS[id], "enemy", i));
      this.battle = new Battle(party, enemies, { canEscape: !enc.boss && enc.escape !== false, inventory: run.inventory });
      saveRun(run);
      introMsg = `${enc.name}  (${run.node + 1}/${RUN.length})`;
    }
    this.views.clear();

    this.drawBackground();
    this.actorLayer = this.add.container(0, 0).setDepth(10);
    this.uiLayer = this.add.container(0, 0).setDepth(100);
    this.popupLayer = this.add.container(0, 0).setDepth(200);

    this.buildActors();
    this.buildUI();

    this.keyZ = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
    this.keyX = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.X);
    this.cursors = this.input.keyboard!.createCursorKeys();

    this.message(introMsg);
    this.time.delayedCall(700, () => this.beginTurn());
  }

  // ----------------------------------------------------------- background
  private drawBackground() {
    drawBattleBackdrop(this.add.graphics().setDepth(0), { W, H, HZ });
  }

  // ----------------------------------------------------------- actors
  private buildActors() {
    this.battle.party.forEach((u, i) => { const [x, y] = PARTY_SLOTS[i] ?? [320, 150]; this.makeView(u, x, y); });
    const eps = enemyPositions(this.battle.enemies.length);
    this.battle.enemies.forEach((u, i) => { const [x, y] = eps[i] ?? [100, 150]; this.makeView(u, x, y); });
  }

  private makeView(unit: Combatant, x: number, y: number) {
    // ground contact shadow (sits on the grass under the feet)
    const sh = this.add.graphics().setDepth(9);
    sh.fillStyle(0x0d1508, 0.5);
    sh.fillEllipse(x, y, unit.isParty ? 20 : 28, 7);
    sh.fillStyle(0x000000, 0.25);
    sh.fillEllipse(x, y, unit.isParty ? 12 : 18, 4);

    const img = this.add.image(x, y, SPRITE_KEY[unit.id]).setOrigin(0.5, 1);
    this.actorLayer.add(img);

    const bar = this.add.graphics();
    const headTop = y - (unit.isParty ? 30 : 21);
    const nameText = this.add
      .text(x, headTop - 13, unit.name, { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(PAL.clothHi) })
      .setOrigin(0.5, 0);
    nameText.setShadow(1, 1, "#000000", 0, true, true);
    this.uiLayer.add(bar);
    this.uiLayer.add(nameText);

    this.views.set(unit, { c: unit, img, bar, nameText, baseX: x, baseY: y, displayedHp: unit.hp, displayedMp: unit.mp, dead: false,
      // deterministic, but coprime-ish per actor so no two land in step
      breathPhase: (this.views.size * 437) % 1200 });
  }

  // ----------------------------------------------------------- UI
  private buildUI() {
    this.turnBar = this.add.container(0, 0);
    this.uiLayer.add(this.turnBar);

    // bottom panel frame (FF blue window)
    const panel = this.add.graphics();
    ffWindow(panel, 6, 165, W - 12, 48);
    this.uiLayer.add(panel);

    this.bottomPanel = this.add.container(0, 0);
    this.uiLayer.add(this.bottomPanel);

    this.bannerBg = this.add.graphics();
    this.uiLayer.add(this.bannerBg);
    this.banner = this.add.text(W / 2, 156, "", { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(PAL.gold) }).setOrigin(0.5);
    this.banner.setShadow(1, 1, "#000000", 0, true, true);
    this.uiLayer.add(this.banner);

    this.marker = this.add.triangle(0, 0, 0, 0, 8, 0, 4, 6, PAL.gold).setVisible(false);
    this.uiLayer.add(this.marker);
    this.tweens.add({ targets: this.marker, y: "+=3", duration: 420, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });

    this.reticle = this.add.graphics().setVisible(false);
    this.uiLayer.add(this.reticle);
  }

  private refreshTurnBar() {
    this.turnBar.removeAll(true);
    const order = this.battle.preview(8);
    this.turnBar.add(this.add.text(6, 5, "NEXT", { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(PAL.panelHi) }));
    let x = 44;
    order.forEach((u, i) => {
      const size = i === 0 ? 16 : 13;
      const yy = 4 + (i === 0 ? 0 : 1);
      const g = this.add.graphics();
      g.fillStyle(PAL.out, 1); g.fillRect(x - 1, yy - 1, size + 2, size + 2);
      g.fillStyle(i === 0 ? PAL.gold : UI.bevelHi, 1); g.fillRect(x, yy, size, size);
      g.fillStyle(UI.ground, 1); g.fillRect(x + 1, yy + 1, size - 2, size - 2);
      this.turnBar.add(g);
      const ic = this.add.image(x + size / 2, yy + size - 1, SPRITE_KEY[u.id])
        .setOrigin(0.5, 1).setCrop(0, 0, 24, 13);
      ic.setDisplaySize(size, size);
      this.turnBar.add(ic);
      x += size + 5;
    });
  }

  private buildCommands(a: Combatant): string[] {
    const cmds = ["Attack", "Ability"];
    if (a.id === "maren" && !this.pulsedThisTurn) cmds.push("Pulse");
    cmds.push("Item", "Defend");
    if (this.battle.canEscape) cmds.push("Escape");
    return cmds;
  }

  // shared 2-column scrolling-ish list renderer for ability/item/pulse menus
  private renderList(title: string, rows: { label: string; sub: string; disabled: boolean; desc?: string }[], idx: number) {
    const mk = (x: number, y: number, text: string, color: number) =>
      shadowed(this.add.text(x, y, text, { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(color) }));
    this.bottomPanel.add(mk(14, 170, title, PAL.steelHi));
    this.bottomPanel.add(mk(W - 70, 170, "X:back", PAL.steelHi));
    const short = rows.length <= 4; // 2 rows -> room for a description line
    rows.forEach((r, i) => {
      const sel = i === idx;
      const col = i % 2, row = Math.floor(i / 2);
      const x = 14 + col * 150, y = 182 + row * 11;
      if (sel) { const g = this.add.graphics(); g.fillStyle(0x3a6bd6, 1); g.fillRect(x - 4, y - 1, 142, 10); this.bottomPanel.add(g); }
      const color = r.disabled ? PAL.steelSh : sel ? PAL.gold : PAL.clothHi;
      this.bottomPanel.add(mk(x, y, r.label, color));
      this.bottomPanel.add(mk(x + 96, y, r.sub, r.disabled ? PAL.steelSh : PAL.cyan));
    });
    const d = short ? rows[idx]?.desc : undefined;
    if (d) { const t = mk(14, 206, d, PAL.steel); t.setWordWrapWidth(W - 40); }
  }

  private refreshBottom() {
    this.bottomPanel.removeAll(true);
    const a = this.active;
    const mk = (x: number, y: number, text: string, color: number, big = false) =>
      shadowed(this.add.text(x, y, text, { fontFamily: FONT, resolution: 4, fontSize: big ? "16px" : "8px", color: c(color) }));

    if (this.phase === "command" && a) {
      this.bottomPanel.add(mk(14, 172, a.name, PAL.clothHi));
      this.bottomPanel.add(mk(14, 187, `HP ${a.hp}/${a.maxHp}`, PAL.green));
      this.bottomPanel.add(mk(14, 199, `MP ${a.mp}/${a.maxMp}`, PAL.cyan));
      this.commands.forEach((cmd, i) => {
        const sel = i === this.menuIndex;
        const col = i % 3, row = Math.floor(i / 3);
        const x = 116 + col * 92, y = 176 + row * 17;
        if (sel) {
          const g = this.add.graphics();
          selection(g, x - 5, y - 2, 84, 13);
          this.bottomPanel.add(g);
        }
        this.bottomPanel.add(mk(x, y, cmd, sel ? PAL.gold : PAL.clothHi));
      });
    } else if (this.phase === "select_ability" && a) {
      const silenced = this.battle.isSilenced(a);
      this.renderList("ABILITY", a.abilities.map((id) => {
        const ab = ABIL[id];
        const dis = ab.mp > a.mp || (silenced && ab.effect === "magical");
        return { label: ab.name, sub: `${ab.mp}MP`, disabled: dis, desc: silenced && ab.effect === "magical" ? "Silenced!" : ab.desc };
      }), this.abilityIndex);
    } else if (this.phase === "select_pulse" && a) {
      this.renderList("CONDUIT PULSE", CONDUIT_PULSES.map((id) => {
        const ab = ABIL[id];
        return { label: ab.name, sub: "free", disabled: false, desc: ab.desc };
      }), this.abilityIndex);
    } else if (this.phase === "select_item") {
      this.renderList("ITEM", this.listIds.map((id) => {
        const it = ITEMS[id];
        return { label: it.name, sub: `x${this.battle.inventory[id]}`, disabled: this.battle.inventory[id] <= 0, desc: it.desc };
      }), this.abilityIndex);
    } else if (this.phase === "select_target") {
      this.bottomPanel.add(mk(14, 174, "SELECT TARGET", PAL.panelHi));
      this.bottomPanel.add(mk(W - 70, 174, "X:back", PAL.panelHi));
      const t = this.targetList[this.targetIndex];
      if (t) this.bottomPanel.add(mk(14, 190, `${t.name}  HP ${t.hp}/${t.maxHp}`, PAL.gold));
    } else if (this.phase === "results") {
      this.bottomPanel.add(mk(14, 170, "VICTORY!", PAL.gold));
      this.rewardLines.forEach((ln, i) => this.bottomPanel.add(mk(14, 182 + i * 10, ln, i === 0 ? PAL.clothHi : PAL.green)));
      this.bottomPanel.add(mk(W - 80, 170, "Z: onward", PAL.panelHi));
    } else if (this.phase === "defeat") {
      this.bottomPanel.add(mk(W / 2 - 48, 178, "DEFEAT", PAL.red, true));
      this.bottomPanel.add(mk(W / 2 - 78, 200, "Z: title screen", PAL.clothHi));
    } else if (this.phase === "escaped") {
      this.bottomPanel.add(mk(W / 2 - 66, 178, "GOT AWAY!", PAL.gold, true));
      this.bottomPanel.add(mk(W / 2 - 60, 200, "Z: title", PAL.clothHi));
    } else if (this.phase === "runclear") {
      this.bottomPanel.add(mk(W / 2 - 96, 176, "THORNWALL CLEARED!", PAL.gold, false));
      this.bottomPanel.add(mk(W / 2 - 96, 190, "Rhogar is defeated. The path is open.", PAL.clothHi));
      this.bottomPanel.add(mk(W / 2 - 60, 202, "Z: title screen", PAL.panelHi));
    }
  }

  private message(s: string) {
    this.banner.setText(s);
    const tw = this.banner.width + 16;
    this.bannerBg.clear();
    this.bannerBg.fillStyle(PAL.out, 0.82);
    this.bannerBg.fillRect(Math.round(W / 2 - tw / 2), 150, Math.round(tw), 13);
    this.bannerBg.fillStyle(PAL.gold, 0.8);
    this.bannerBg.fillRect(Math.round(W / 2 - tw / 2), 150, Math.round(tw), 1);
    this.bannerBg.fillRect(Math.round(W / 2 - tw / 2), 162, Math.round(tw), 1);
    this.banner.setScale(1.3);
    this.tweens.add({ targets: this.banner, scale: 1, duration: 160, ease: "Back.easeOut" });
  }

  // ----------------------------------------------------------- per-frame
  /** 2-frame breathe on a 1px offset, style guide §5.2/§5.3 (~600ms/frame).
   *  Runs only in the command phase: during an action the tweens own y, and
   *  two writers on one property produces a stutter, not a breath. */
  private breathe(now: number) {
    if (this.phase !== "command") return;
    this.views.forEach((v) => {
      if (!v.c.alive || v.dead) return;
      const up = Math.floor(((now + v.breathPhase) % 1200) / 600) === 1; // style guide §5.3
      v.img.y = v.baseY - (up ? 1 : 0);
    });
  }

  update(now: number, dt: number) {
    this.breathe(now);
    this.views.forEach((v) => {
      v.displayedHp += (v.c.hp - v.displayedHp) * Math.min(1, dt / 90);
      v.displayedMp += (v.c.mp - v.displayedMp) * Math.min(1, dt / 90);
      this.drawBar(v);
    });

    if (this.active && this.phase !== "busy") {
      const v = this.views.get(this.active)!;
      this.marker.setVisible(true);
      this.marker.x = v.baseX - 4;
      this.marker.y = v.baseY - (v.c.isParty ? 44 : 32);
    } else this.marker.setVisible(false);

    this.reticle.clear();
    if (this.phase === "select_target" && this.targetList[this.targetIndex]) {
      const v = this.views.get(this.targetList[this.targetIndex])!;
      const cx = v.baseX, cy = v.baseY - (v.c.isParty ? 15 : 10);
      const r = 16 + Math.sin(this.time.now / 150) * 2;
      this.reticle.setVisible(true);
      this.reticle.lineStyle(1, PAL.gold, 1);
      this.reticle.strokeCircle(cx, cy, r);
      this.reticle.lineStyle(1, PAL.clothHi, 0.8);
      this.reticle.strokeCircle(cx, cy, r - 4);
    } else this.reticle.setVisible(false);

    this.handleInput();
  }

  private drawBar(v: ActorView) {
    const u = v.c, g = v.bar;
    g.clear();
    const w = u.isParty ? 28 : 24;
    const x = Math.round(v.baseX - w / 2);
    const y = v.baseY - (u.isParty ? 38 : 28);
    const ratio = Phaser.Math.Clamp(v.displayedHp / u.maxHp, 0, 1);
    let col = PAL.green; if (ratio < 0.25) col = PAL.red; else if (ratio < 0.5) col = PAL.gold;
    uiBar(g, x, y, w, 3, ratio, col, highlight(col));
    if (u.isParty) {
      const mr = Phaser.Math.Clamp(v.displayedMp / Math.max(1, u.maxMp), 0, 1);
      uiBar(g, x, y + 5, w, 2, mr, PAL.cyan, highlight(PAL.cyan));
    }
    // status pips
    let px = x; const py = y - 5;
    for (let i = 0; i < u.buffs.length; i++) { g.fillStyle(PAL.green, 1); g.fillRect(px, py, 3, 3); px += 4; }
    for (let i = 0; i < u.debuffs.length; i++) { g.fillStyle(PAL.red, 1); g.fillRect(px, py, 3, 3); px += 4; }

    if (!u.alive && !v.dead) {
      v.dead = true;
      this.tweens.add({ targets: v.img, alpha: 0.35, angle: u.isParty ? -8 : 80, duration: 320 });
      v.nameText.setAlpha(0.35);
    }
  }

  // ----------------------------------------------------------- input
  private jd(k: Phaser.Input.Keyboard.Key) { return Phaser.Input.Keyboard.JustDown(k); }

  private handleInput() {
    if (this.phase === "busy") return;
    const up = this.jd(this.cursors.up!) || this.jd(this.cursors.left!);
    const down = this.jd(this.cursors.down!) || this.jd(this.cursors.right!);
    const confirm = this.jd(this.keyZ);
    const cancel = this.jd(this.keyX);

    if (this.phase === "results") { if (confirm) this.advanceNode(); return; }
    if (this.phase === "defeat") { if (confirm) { if (this.cfg) this.scene.restart({ story: this.cfg }); else this.scene.start("title"); } return; }
    if (this.phase === "escaped") {
      if (confirm) {
        if (this.cfg) { this.persistPartyPools(); this.returnToWorld(); }          // fled -> back into the world where you were
        else this.scene.start("title");
      }
      return;
    }
    if (this.phase === "runclear") { if (confirm) { clearSave(); this.scene.start("title"); } return; }
    if (!this.active) return;

    if (this.phase === "command") {
      const n = this.commands.length;
      if (up) { this.menuIndex = (this.menuIndex + n - 1) % n; this.refreshBottom(); }
      if (down) { this.menuIndex = (this.menuIndex + 1) % n; this.refreshBottom(); }
      if (confirm) this.chooseCommand();
    } else if (this.phase === "select_ability") {
      const n = this.active.abilities.length;
      if (up) { this.abilityIndex = (this.abilityIndex + n - 1) % n; this.refreshBottom(); }
      if (down) { this.abilityIndex = (this.abilityIndex + 1) % n; this.refreshBottom(); }
      if (cancel) { this.phase = "command"; this.refreshBottom(); }
      if (confirm) this.chooseFromList("ability");
    } else if (this.phase === "select_pulse") {
      const n = CONDUIT_PULSES.length;
      if (up) { this.abilityIndex = (this.abilityIndex + n - 1) % n; this.refreshBottom(); }
      if (down) { this.abilityIndex = (this.abilityIndex + 1) % n; this.refreshBottom(); }
      if (cancel) { this.phase = "command"; this.refreshBottom(); }
      if (confirm) this.chooseFromList("pulse");
    } else if (this.phase === "select_item") {
      const n = this.listIds.length;
      if (up) { this.abilityIndex = (this.abilityIndex + n - 1) % n; this.refreshBottom(); }
      if (down) { this.abilityIndex = (this.abilityIndex + 1) % n; this.refreshBottom(); }
      if (cancel) { this.phase = "command"; this.refreshBottom(); }
      if (confirm) this.chooseFromList("item");
    } else if (this.phase === "select_target") {
      const n = this.targetList.length;
      if (up) { this.targetIndex = (this.targetIndex + n - 1) % n; this.refreshBottom(); }
      if (down) { this.targetIndex = (this.targetIndex + 1) % n; this.refreshBottom(); }
      if (cancel) { this.cancelTarget(); }
      if (confirm) this.confirmTarget();
    }
  }

  private targetReturnPhase: Phase = "command";

  private chooseCommand() {
    const a = this.active!;
    const cmd = this.commands[this.menuIndex];
    if (cmd === "Attack") {
      this.pending = ABIL.attack; this.pendingItem = null;
      this.targetList = this.battle.targetsFor(a, ABIL.attack);
      this.targetIndex = 0; this.targetReturnPhase = "command"; this.phase = "select_target"; this.refreshBottom();
    } else if (cmd === "Ability") {
      this.phase = "select_ability"; this.abilityIndex = 0; this.refreshBottom();
    } else if (cmd === "Pulse") {
      this.phase = "select_pulse"; this.abilityIndex = 0; this.refreshBottom();
    } else if (cmd === "Item") {
      this.listIds = Object.keys(ITEMS).filter((id) => this.battle.inventory[id] > 0);
      if (this.listIds.length === 0) { this.message("No items!"); return; }
      this.phase = "select_item"; this.abilityIndex = 0; this.refreshBottom();
    } else if (cmd === "Defend") {
      this.battle.applyStatus(a, "defend", a); this.message(`${a.name} defends`); this.endTurnAfter(450);
    } else if (cmd === "Escape") {
      this.tryEscape(a);
    }
  }

  // unified selection from ability/pulse/item lists
  private chooseFromList(kind: "ability" | "pulse" | "item") {
    const a = this.active!;
    if (kind === "item") {
      const it = ITEMS[this.listIds[this.abilityIndex]];
      if (this.battle.inventory[it.id] <= 0) return;
      this.pendingItem = it; this.pending = null;
      this.targetList = it.target === "ko_ally" ? this.battle.party.filter((u) => !u.alive) : this.battle.living("party");
      if (this.targetList.length === 0) { this.message("No valid target"); return; }
      this.targetIndex = 0; this.targetReturnPhase = "select_item"; this.phase = "select_target"; this.refreshBottom();
      return;
    }
    const ids = kind === "pulse" ? CONDUIT_PULSES : a.abilities;
    const ab = ABIL[ids[this.abilityIndex]];
    if (kind === "ability") {
      if (ab.mp > a.mp) { this.message("Not enough MP!"); return; }
      if (this.battle.isSilenced(a) && ab.effect === "magical") { this.message("Silenced!"); return; }
    }
    this.pending = ab; this.pendingItem = null;
    this.targetReturnPhase = kind === "pulse" ? "select_pulse" : "select_ability";
    if (ab.target === "single_enemy" || ab.target === "single_ally") {
      this.targetList = this.battle.targetsFor(a, ab); this.targetIndex = 0; this.phase = "select_target"; this.refreshBottom();
    } else {
      this.commit(a, ab, null, ab.pulse ? false : true);
    }
  }

  private cancelTarget() { this.phase = this.targetReturnPhase; this.refreshBottom(); }

  private confirmTarget() {
    const a = this.active!;
    const target = this.targetList[this.targetIndex];
    if (this.pendingItem) { this.useItem(a, this.pendingItem, target); return; }
    this.commit(a, this.pending!, target, this.pending!.pulse ? false : true);
  }

  private tryEscape(a: Combatant) {
    this.phase = "busy"; this.refreshBottom();
    if (Math.random() < this.battle.escapeChance()) {
      this.message(`${a.name} flees the battle!`);
      this.time.delayedCall(700, () => { this.phase = "escaped"; this.refreshBottom(); });
    } else {
      this.message("Couldn't escape!");
      this.endTurnAfter(700);
    }
  }

  private useItem(a: Combatant, it: ItemDef, target: Combatant) {
    this.battle.inventory[it.id] = Math.max(0, this.battle.inventory[it.id] - 1);
    this.pulsedThisTurn = false; // item is the standard action -> ends turn
    this.phase = "busy"; this.refreshBottom();
    const tv = this.views.get(target)!;
    this.message(`${a.name} uses ${it.name}`);
    if (it.kind === "heal_pct") { const amt = Math.round(target.maxHp * (it.amount ?? 0)); this.battle.heal(target, amt); this.popup(tv.baseX, tv.baseY - 36, `+${amt}`, PAL.green); this.burst(tv.baseX, tv.baseY - 14, PAL.green); }
    else if (it.kind === "mp_pct") { const amt = Math.round(target.maxMp * (it.amount ?? 0)); target.mp = Math.min(target.maxMp, target.mp + amt); this.popup(tv.baseX, tv.baseY - 36, `+${amt} MP`, PAL.cyan); }
    else if (it.kind === "revive") { target.alive = true; target.hp = Math.max(1, Math.round(target.maxHp * (it.amount ?? 0.25))); const v = this.views.get(target)!; v.dead = false; v.img.setAlpha(1).setAngle(0); v.nameText.setAlpha(1); this.popup(tv.baseX, tv.baseY - 36, "REVIVE", PAL.gold); this.burst(tv.baseX, tv.baseY - 14, PAL.gold); }
    else if (it.kind === "cure") { const pool = target.debuffs; const i = pool.findIndex((e) => e.def.id === it.cures); if (i >= 0) pool.splice(i, 1); this.popup(tv.baseX, tv.baseY - 36, "CURED", PAL.green); }
    this.endTurnAfter(700);
  }

  // ----------------------------------------------------------- turn flow
  private beginTurn() {
    if (this.battle.sideWiped("enemy")) { if (this.cfg) this.storyWin(); else this.runVictory(); return; }
    if (this.battle.sideWiped("party")) { this.phase = "defeat"; this.message("The party has fallen..."); this.refreshBottom(); return; }
    const actor = this.battle.nextActor();
    if (!actor) return;
    this.active = actor;
    this.refreshTurnBar();
    this.pulsedThisTurn = false;

    // start-of-turn DoT / regen
    const fx = this.battle.startOfTurnEffects(actor);
    if (fx.length) {
      const tv = this.views.get(actor)!;
      let off = 0;
      for (const e of fx) { this.popup(tv.baseX, tv.baseY - 36 - off, e.kind === "poison" ? `-${e.amount}` : `+${e.amount}`, e.kind === "poison" ? PAL.red : PAL.green); off += 12; }
      if (!actor.alive) {
        this.message(`${actor.name} succumbs!`);
        this.phase = "busy"; this.refreshBottom();
        this.time.delayedCall(700, () => this.beginTurn());
        return;
      }
    }

    if (actor.hasStatus("stun")) {
      this.message(`${actor.name} is stunned!`);
      this.battle.tickStatuses(actor);
      this.phase = "busy";
      this.time.delayedCall(650, () => this.beginTurn());
      return;
    }
    this.battle.tickStatuses(actor);

    if (actor.isParty) { this.phase = "command"; this.commands = this.buildCommands(actor); this.menuIndex = 0; this.refreshBottom(); }
    else { this.phase = "busy"; this.refreshBottom(); this.enemyTurn(actor); }
  }

  private endTurnAfter(ms: number) { this.phase = "busy"; this.refreshBottom(); this.time.delayedCall(ms, () => this.beginTurn()); }

  private async commit(actor: Combatant, ab: AbilityDef, primary: Combatant | null, endsTurn = true) {
    this.phase = "busy"; this.refreshBottom();
    if (ab.pulse) {
      await this.runPulse(actor, ab, primary);
      this.pulsedThisTurn = true;
      if (this.battle.sideWiped("enemy") || this.battle.sideWiped("party")) { this.beginTurn(); return; }
      // free action: hand control back for the standard action
      this.phase = "command"; this.commands = this.buildCommands(actor); this.menuIndex = 0; this.refreshBottom();
      return;
    }
    await this.runAction(actor, ab, primary);
    if (endsTurn) this.beginTurn();
  }

  private async runPulse(actor: Combatant, ab: AbilityDef, target: Combatant | null) {
    const t = target ?? actor;
    this.message(`${actor.name}  >  ${ab.name}`);
    const av = this.views.get(actor)!;
    await this.tweenP({ targets: av.img, y: av.baseY - 6, duration: 100, yoyo: true });
    const tv = this.views.get(t)!;
    if (ab.pulse === "hasten") { t.tickCounter = Math.max(0, t.tickCounter - 3); this.popup(tv.baseX, tv.baseY - 36, "HASTE", PAL.cyan); }
    else if (ab.applies) { this.battle.applyStatus(t, ab.applies, actor); this.popup(tv.baseX, tv.baseY - 36, STATUS[ab.applies].name, PAL.green); }
    this.burst(tv.baseX, tv.baseY - 14, PAL.cyan);
    await this.delay(280);
  }

  private enemyTurn(actor: Combatant) {
    const usable = actor.abilities.map((id) => ABIL[id]).filter((ab) => (ab.mp ?? 0) <= actor.mp);
    const buffs = usable.filter((ab) => ab.effect === "buff");
    const aoes = usable.filter((ab) => ab.target === "all_enemies");
    const singles = usable.filter((ab) => (ab.effect === "physical" || ab.effect === "magical") && ab.target === "single_enemy");
    const livingParty = this.battle.living("party").length;
    const buffed = actor.buffs.length > 0;

    let ab: AbilityDef, target: Combatant | null;
    if (actor.hasStatus("provoked") && actor.provokeSource?.alive && singles.length) {
      ab = singles[Math.floor(Math.random() * singles.length)]; target = actor.provokeSource;
    } else if (buffs.length && !buffed && Math.random() < 0.3) {
      ab = buffs[Math.floor(Math.random() * buffs.length)]; target = actor;
    } else if (aoes.length && livingParty >= 2 && Math.random() < 0.45) {
      ab = aoes[Math.floor(Math.random() * aoes.length)]; target = this.lowestHpParty();
    } else if (singles.length) {
      ab = singles[Math.floor(Math.random() * singles.length)]; target = this.lowestHpParty();
    } else {
      ab = usable[0] ?? ABIL.enemy_bite; target = ab.target === "self" ? actor : this.lowestHpParty();
    }
    if (!target) { this.beginTurn(); return; }
    this.runAction(actor, ab, target).then(() => this.beginTurn());
  }

  private lowestHpParty(): Combatant | null {
    let best: Combatant | null = null, bestHp = Infinity;
    for (const u of this.battle.party) if (u.alive && u.hp < bestHp) { bestHp = u.hp; best = u; }
    return best;
  }

  private rewardLines: string[] = [];

  // persist each fighter's HP/MP back into the story so wounds carry into the next battle
  private persistPartyPools() {
    for (const u of this.battle.party) setCurHpMp(u.id, u.alive ? u.hp : 0, u.mp);
  }

  private storyWin() {
    this.phase = "busy"; this.refreshBottom();
    const cfg = this.cfg!;
    this.persistPartyPools();
    // award XP to the party that fought
    const xp = Math.round(cfg.enemies.reduce((a, id) => a + (ENEMY_DEFS[id]?.xp ?? 0), 0) * XP_MULT);
    const marks = cfg.enemies.reduce((a, id) => { const m = ENEMY_DEFS[id]?.marks ?? [0, 0]; return a + Math.floor((m[0] + m[1]) / 2); }, 0);
    const ups = awardXp(cfg.party, xp);
    if (marks > 0) addMarks(marks);
    addBountyKills(cfg.enemies); // credit any defeated creatures toward the farmer's bounty
    sfx(ups.length ? "levelup" : "victory");
    this.rewardLines = [`+${xp} XP${marks > 0 ? `   +${marks} Marks` : ""}`, ...ups.map((u) => `${u.id.toUpperCase()} reached Lv ${u.level}!`)];
    if (cfg.nodeFlag) getStory().flags[cfg.nodeFlag] = true;  // clear the on-map node
    if (cfg.doneFlag) getStory().flags[cfg.doneFlag] = true;  // mark the story beat complete
    if (cfg.rewardEquip) { const who = giveEquip(cfg.rewardEquip); if (who) this.rewardLines.push(`${who.toUpperCase()} equips ${cfg.rewardEquip.replace(/_/g, " ")}!`); }
    this.message("VICTORY!");
    this.cameras.main.flash(200, 255, 240, 180);
    this.time.delayedCall(900, () => { saveStory(getStory()); this.returnToWorld(); });
  }

  // Drop back into the connected world at the player's current region (owResume positions them).
  private returnToWorld() { this.scene.start("overworld", { kind: "overworld", map: getStory().loc, goal: "" }); }

  private runVictory() {
    this.phase = "busy"; this.refreshBottom();
    const run = getRun();
    let xp = 0, marks = 0;
    for (const e of this.battle.enemies) { xp += e.def.xp ?? 0; const m = e.def.marks ?? [0, 0]; marks += Math.floor((m[0] + m[1]) / 2); }
    xp = Math.round(xp * 4); // generous pacing for the slice
    run.marks += marks;
    const lines: string[] = [`+${xp} XP    +${marks} Marks`];
    for (const ps of run.party) {
      const cb = this.battle.party.find((c) => c.id === ps.id);
      if (cb) { ps.hp = cb.hp; ps.mp = cb.mp; }
      if (cb && cb.alive) { ps.xp += xp; if (applyLevels(ps) > 0) lines.push(`${ps.id.toUpperCase()} reached Lv ${ps.level}!`); }
    }
    this.rewardLines = lines;
    this.message("VICTORY!");
    this.time.delayedCall(550, () => { this.phase = "results"; this.refreshBottom(); });
  }

  private advanceNode() {
    const run = getRun();
    run.node++;
    if (run.node >= RUN.length) { saveRun(run); this.phase = "runclear"; this.refreshBottom(); return; }
    restParty(run);
    saveRun(run);
    this.scene.start("camp"); // rest + shop, then onward to the next battle
  }

  // ----------------------------------------------------------- juice
  private tweenP(cfg: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
    return new Promise((res) => { cfg.onComplete = () => res(); this.tweens.add(cfg); });
  }

  /** Freeze for two frames on impact. The pause is what sells weight -- the
   *  flash and knockback alone read as the sprite twitching. */
  private hitstop(frames = 2): Promise<void> {
    return new Promise((res) => this.time.delayedCall(Math.round(frames * (1000 / 60)), () => res()));
  }
  private delay(ms: number): Promise<void> { return new Promise((res) => this.time.delayedCall(ms, () => res())); }

  private async runAction(actor: Combatant, ab: AbilityDef, primary: Combatant | null) {
    if (ab.mp > 0) actor.mp = Math.max(0, actor.mp - ab.mp);
    this.message(`${actor.name}  >  ${ab.name}`);

    let group: Combatant[];
    if (ab.target === "all_allies") group = this.battle.living(actor.side);
    else if (ab.target === "all_enemies") group = this.battle.living(actor.side === "party" ? "enemy" : "party");
    else if (ab.target === "self") group = [actor];
    else group = primary ? [primary] : [];

    const av = this.views.get(actor)!;
    const offensive = ab.effect === "physical" || ab.effect === "magical";
    const dir = actor.side === "party" ? -1 : 1;

    if (offensive) await this.tweenP({ targets: av.img, x: av.baseX + dir * 28, duration: 130, ease: "Quad.easeOut" });
    else await this.tweenP({ targets: av.img, y: av.baseY - 8, duration: 120, yoyo: true, ease: "Quad.easeOut" });

    for (const target of group) await this.resolveOn(actor, ab, target);

    if (offensive) await this.tweenP({ targets: av.img, x: av.baseX, y: av.baseY, duration: 150, ease: "Quad.easeIn" });
    await this.delay(200);
  }

  private async resolveOn(actor: Combatant, ab: AbilityDef, target: Combatant) {
    const tv = this.views.get(target)!;
    const cx = tv.baseX, top = tv.baseY - (target.isParty ? 36 : 26);

    if (ab.effect === "physical" || ab.effect === "magical") {
      if (!this.battle.rollHit(actor)) { this.popup(cx, top, "MISS", PAL.steelHi); await this.delay(150); return; }
      const r = this.battle.calc(actor, target, ab);
      if (r.healing > 0) { this.battle.heal(target, r.healing); this.popup(cx, top, `+${r.healing}`, PAL.green); sfx("heal"); }
      else {
        this.battle.takeDamage(target, r.damage);
        sfx(r.crit || r.label === "WEAK" ? "crit" : "hit");
        // Three simultaneous cues or the hit reads as nothing happened
        // (BRIEF §2.6): white flash, knockback, and a hitstop.
        tv.img.setTintFill(0xffffff);
        this.time.delayedCall(110, () => tv.img.clearTint());
        this.tweens.add({ targets: tv.img, x: tv.baseX + (actor.side === "party" ? -1 : 1) * 6, duration: 60, yoyo: true });
        await this.hitstop();
        this.burst(cx, tv.baseY - 14, ab.element === "fire" ? PAL.red : PAL.clothHi);
        const big = r.crit || r.label === "WEAK";
        this.popup(cx, top, `${r.damage}`, r.crit ? PAL.gold : PAL.clothHi, big);
        if (r.label) this.popup(cx, top - 12, r.label, r.label === "WEAK" ? PAL.red : PAL.cyan);
        else if (r.crit) this.popup(cx, top - 12, "CRIT!", PAL.gold);
        if (big) this.cameras.main.shake(150, SHAKE_2PX); // BRIEF §2.6 caps shake at 2px
        const phaseLine = this.battle.maybePhase(target);
        if (phaseLine) { this.message(phaseLine); this.cameras.main.flash(220, 150, 40, 40); this.cameras.main.shake(280, SHAKE_2PX); }
      }
    } else if (ab.effect === "healing") {
      const r = this.battle.calc(actor, target, ab);
      this.battle.heal(target, r.healing);
      this.popup(cx, top, `+${r.healing}`, PAL.green);
      this.burst(cx, tv.baseY - 14, PAL.green);
    }

    if (ab.applies) {
      const chance = ab.statusChance ?? 1.0;
      if (Math.random() < chance) {
        this.battle.applyStatus(target, ab.applies, actor);
        const s = STATUS[ab.applies];
        this.popup(cx, top - (ab.effect === "buff" ? 0 : 24), s.name, s.cat === "buff" ? PAL.green : PAL.red);
      }
    }
    await this.delay(240);
  }

  private popup(x: number, y: number, text: string, color: number, big = false) {
    const t = this.add.text(x, y, text, { fontFamily: FONT, resolution: 4, fontSize: big ? "16px" : "8px", color: c(color) }).setOrigin(0.5).setDepth(300);
    t.setShadow(1, 1, "#000000", 0, true, true);
    this.popupLayer.add(t);
    t.setScale(0.5);
    this.tweens.add({ targets: t, scale: 1, duration: 140, ease: "Back.easeOut" });
    this.tweens.add({ targets: t, y: y - 16, alpha: { from: 1, to: 0 }, duration: 700, delay: 160, ease: "Quad.easeIn", onComplete: () => t.destroy() });
  }

  private burst(x: number, y: number, color: number) {
    for (let i = 0; i < 8; i++) {
      const p = this.add.image(x, y, "pdot").setTint(color).setDepth(250);
      this.popupLayer.add(p);
      const ang = Math.random() * Math.PI * 2, dist = Phaser.Math.FloatBetween(8, 22);
      this.tweens.add({
        targets: p, x: x + Math.cos(ang) * dist, y: y + Math.sin(ang) * dist,
        alpha: { from: 1, to: 0 }, scale: { from: 1.2, to: 0 },
        duration: Phaser.Math.Between(260, 460), ease: "Quad.easeOut", onComplete: () => p.destroy(),
      });
    }
  }
}
