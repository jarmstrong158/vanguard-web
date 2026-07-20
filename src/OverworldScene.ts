import Phaser from "phaser";
import { PAL, SPRITE_KEY, bakeAll, ffWindow } from "./sprites";
import { playBgm, sfx } from "./audio";
import { activeParty, addMarks, assignBounty, awardXp, bountyReward, clearBounty, creatureName, currentObjective, flag, gatesFor, getBounty, getMarks, getOwResume, getStory, getVenue, giveEquip, partyNeedsRest, pendingBeats, restParty, setLoc, setOwResume, setVenue, spendMarks, Q_TOLLER, Q_TOLLER_THANKS, Q_WALL_REPAIR, type DialogSeq, type Gate, type MapId, type StoryStep, type WorldBeat } from "./story";

const W = 384;   // camera viewport
const H = 216;
const FONT = '"Silkscreen", monospace';
const c = (n: number) => "#" + n.toString(16).padStart(6, "0");

interface EncNode { x: number; y: number; enemies: string[]; id: string; boss?: boolean; rewardEquip?: string; intro?: string; }
interface Chest { x: number; y: number; id: string; equip?: string; xp?: number; }
interface Rect { x: number; y: number; w: number; h: number; }
// a person/spot you press Z near to start an (overlay) conversation, gated by flags
interface Interactable { x: number; y: number; sprite?: string; label?: string; labelColor?: number; prompt?: string; quest?: () => boolean; active: () => boolean; seq: () => DialogSeq | null; action?: () => void; }
// a building doorway: walk onto it to enter the named interior
interface Door { x: number; y: number; w: number; h: number; interior: string; }
type ShopKind = "item" | "equip";
interface InteriorDef { name: string; sign: number; vendor?: string; vendorName?: string; shop?: ShopKind; line?: DialogSeq; clinic?: boolean; inn?: boolean; restCost?: number; }

// Flavor chatter for a plain house.
const HOME_CHAT: DialogSeq = { id: "home_chat", context: "A Thornwall Home", lines: [
  { speaker: "Villager", text: "Cold morning, isn't it? Help yourself to the fire." },
  { speaker: "Villager", text: "Folks say the south wall cracked again. Hope someone sees to it." },
]};

// A townsperson points the player toward Farmer Bram's bounty work.
const FARMER_HINT: DialogSeq = { id: "farmer_hint", context: "Town Gossip", lines: [
  { speaker: "Villager", text: "Old Bram's pasture has been crawling with critters lately — rats, spiders, wolves off the moor." },
  { speaker: "Villager", text: "He's paying good coin to anyone who'll thin them out. The pasture gate's up the north road, past the clinic." },
]};

// Maren's mother runs the village clinic.
const CLINIC_CHAT: DialogSeq = { id: "clinic_chat", context: "Thornwall Clinic", lines: [
  { speaker: "Renna", text: "Mind the cots, love — someone's always limping in scraped up these days." },
  { speaker: "Renna", text: "Rest whenever you need. The hearth's warm and the kettle's on." },
]};

// ---- ambient townsfolk (flavor chatter that fleshes out the later hub towns) ----
// WAYSTATION — a rest stop crowded with people fleeing the occupation to the south.
const WAY_TRAVELER: DialogSeq = { id: "way_traveler", context: "A Weary Traveler", lines: [
  { speaker: "Traveler", text: "Came up from the south with nothing but the coat on my back. Redhollow's not a town anymore — it's a cage with a fire in the middle." },
  { speaker: "Traveler", text: "Warm yourself while the road's quiet, friend. It never stays that way for long." },
]};
const WAY_TRADER: DialogSeq = { id: "way_trader", context: "A Grounded Caravanner", lines: [
  { speaker: "Caravanner", text: "I used to run salt and iron clear through to Ironhold. Now the Ashguard turn back anyone without a Valcrest seal." },
  { speaker: "Caravanner", text: "If you're set on heading south, talk to old Fennick first. That one's read more than he lets on." },
]};

// REDHOLLOW — occupied by Valcrest; residents are watched, and reactive to liberation.
const RED_RESIDENT_OCC: DialogSeq = { id: "red_resident_occ", context: "A Wary Resident", lines: [
  { speaker: "Resident", text: "(low voice) Don't stand so close. They keep a list of who talks to strangers." },
  { speaker: "Resident", text: "This place had a name that meant something once. Now the maps just say 'occupied.'" },
]};
const RED_RESIDENT_FREE: DialogSeq = { id: "red_resident_free", context: "A Hopeful Resident", lines: [
  { speaker: "Resident", text: "You drove that captain out. First morning in a year I've seen the checkpoints stand empty." },
  { speaker: "Resident", text: "Don't celebrate too loud, though. Valcrest doesn't forget a bloodied nose — and neither does the Archon." },
]};
const RED_DEFIANT: DialogSeq = { id: "red_defiant", context: "Keeper of the Ember", lines: [
  { speaker: "Ashkeeper", text: "See the Kindlepeak? That glow's wrong — cold at the heart. Valcrest fire, not ours." },
  { speaker: "Ashkeeper", text: "They took my son for keeping the old ember shrine lit. So now I keep it. They can hold the streets. Not the mountain." },
]};

// IRONHOLD — a guild meritocracy proud of its unconquered vertical city and its fighting pit.
const IRON_ARTISAN: DialogSeq = { id: "iron_artisan", context: "A Stonecutter", lines: [
  { speaker: "Stonecutter", text: "Two hundred years my guild's been carving this cliff. No army's ever taken Ironhold, and none ever will." },
  { speaker: "Stonecutter", text: "Here a person's worth is cut, not inherited. You want a seat at the table? Earn it down in the pit." },
]};
const IRON_FAN: DialogSeq = { id: "iron_fan", context: "A Pit Regular", lines: [
  { speaker: "Pit Regular", text: "You're here for Yara, aren't you? Everyone is. She's never lost — not once, not close." },
  { speaker: "Pit Regular", text: "Put her on the ground and the whole city owes you a drink. Nobody's had to buy one yet." },
]};

// Interior rooms reachable through doors. The town map is unchanged; the venue just
// swaps what the overworld renders. Shops open the ShopScene; houses play a line.
const INTERIORS: Record<string, InteriorDef> = {
  thornwall_item:   { name: "PROVISIONS", sign: 0x7fe0a0, vendor: "villager2", vendorName: "Mira",     shop: "item" },
  thornwall_equip:  { name: "ARMORY",     sign: 0xc0cbdc, vendor: "villager",  vendorName: "Garrin",   shop: "equip" },
  thornwall_home:   { name: "HOME",       sign: 0xe0c080, vendor: "elder",     vendorName: "Resident", line: HOME_CHAT },
  thornwall_clinic: { name: "CLINIC",     sign: 0xff8a8a, vendor: "villager2", vendorName: "Renna",    line: CLINIC_CHAT, clinic: true },
  // Waystation — a traveler's rest stop
  waystation_inn:   { name: "WAYFARER'S REST", sign: 0xffd98a, vendor: "villager", vendorName: "Hobb",  inn: true, restCost: 15 },
  waystation_item:  { name: "SUPPLIES",   sign: 0x7fe0a0, vendor: "villager2", vendorName: "Petra",    shop: "item" },
  // Redhollow — occupied, but commerce limps on
  emberreach_inn:   { name: "ASH & EMBER INN", sign: 0xffd98a, vendor: "villager2", vendorName: "Calla", inn: true, restCost: 25 },
  emberreach_item:  { name: "BLACK MARKET", sign: 0x7fe0a0, vendor: "villager", vendorName: "Smuggler", shop: "item" },
  emberreach_equip: { name: "SCAVENGED ARMS", sign: 0xc0cbdc, vendor: "villager", vendorName: "Dorn",  shop: "equip" },
  // Ironhold — a guild meritocracy city
  stonemantle_inn:  { name: "GUILD LODGE", sign: 0xffd98a, vendor: "villager2", vendorName: "Steward", inn: true, restCost: 40 },
  stonemantle_item: { name: "GUILD STORES", sign: 0x7fe0a0, vendor: "villager2", vendorName: "Quartermaster", shop: "item" },
  stonemantle_equip:{ name: "FORGE HALL",  sign: 0xc0cbdc, vendor: "villager", vendorName: "Smith",    shop: "equip" },
};

export class OverworldScene extends Phaser.Scene {
  private step!: StoryStep;
  private map: MapId = "thornwall";
  private player!: Phaser.GameObjects.Image;
  private px = 192; private py = 96;
  private worldW = W; private worldH = H;
  private solids: Rect[] = [];
  private needsTalk = true;
  private prompt!: Phaser.GameObjects.Text;
  private toast!: Phaser.GameObjects.Text;
  private bannerTxt!: Phaser.GameObjects.Text;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyZ!: Phaser.Input.Keyboard.Key;
  private keyX!: Phaser.Input.Keyboard.Key;
  private keyMenu!: Phaser.Input.Keyboard.Key;
  private done = false;
  private nodes: EncNode[] = [];
  private nodeViews: { x: number; y: number; n: EncNode; flag: string }[] = [];
  private chests: Chest[] = [];
  private chestViews: { x: number; y: number; ch: Chest; flag: string; img: Phaser.GameObjects.Container }[] = [];
  private interactables: Interactable[] = [];
  private talkViews: { ia: Interactable; marker: Phaser.GameObjects.Text }[] = [];
  private resting = false; // mid clinic-rest fade (suppresses input)
  private innPrompt: { cost: number; objs: Phaser.GameObjects.GameObject[] } | null = null; // paid-inn Yes/No confirm
  private breachDebris?: Phaser.GameObjects.Graphics;
  private breachPatch?: Phaser.GameObjects.Graphics;
  private doors: Door[] = [];
  private venue: string | null = null;        // interior id when inside a building, else null
  private exitDoor: Rect | null = null;        // walkable zone that leaves an interior
  private shopVendor: { x: number; y: number; shop: ShopKind } | null = null;
  // random encounters (JRPG-style) for wilderness maps; bosses stay as visible nodes
  private encGroups?: string[][];
  private encIntro = "";
  private encDist = 0;
  private encThreshold = 0;
  // connected-world: walkable region gates + in-place story beats
  private gates: Gate[] = [];
  private beatViews: { beat: WorldBeat; marker: Phaser.GameObjects.Text }[] = [];
  private worldObjs: Phaser.GameObjects.GameObject[] = []; // gate+beat visuals (rebuilt when state changes)

  constructor() { super("overworld"); }
  init(data: StoryStep) {
    this.step = data; this.map = getStory().loc; this.done = false;
    this.worldW = W; this.worldH = H; this.solids = []; this.nodes = []; this.nodeViews = []; this.chests = [];
    this.chestViews = []; this.interactables = []; this.talkViews = []; this.doors = []; this.exitDoor = null; this.shopVendor = null;
    this.encGroups = undefined; this.encIntro = ""; this.encDist = 0; this.encThreshold = 0;
    this.gates = []; this.beatViews = []; this.worldObjs = [];
  }

  // arm JRPG-style random encounters for the current map (rolls a fresh step threshold)
  private setEncounters(groups: string[][], intro: string) {
    this.encGroups = groups; this.encIntro = intro;
    this.encDist = 0; this.encThreshold = Phaser.Math.Between(120, 230);
  }

  create() {
    bakeAll(this);
    this.venue = getVenue();
    let bannerText: string, hint: string, bannerCol = PAL.gold;
    if (this.venue === "field") {
      this.buildField();
      const b = getBounty();
      bannerText = b ? `BOUNTY: ${b.have}/${b.need} ${creatureName(b.target)}` : "FARMER'S PASTURE";
      bannerCol = 0x7fe0a0;
      hint = "Arrows: move    Z: talk Bram    gate (bottom) → Thornwall";
    } else if (this.venue) {
      const def = INTERIORS[this.venue];
      this.buildInterior(this.venue);
      bannerText = def?.name ?? "INSIDE";
      bannerCol = def?.sign ?? PAL.gold;
      hint = def?.shop ? "Arrows: move    Z: shop    walk down to leave" : "Arrows: move    Z: talk    walk down to leave";
    } else {
      if (this.map === "thornwall") this.buildThornwall();
      else if (this.map === "marsh") this.buildMarsh();
      else if (this.map === "waystation") this.buildWaystation();
      else if (this.map === "emberreach") this.buildEmberreach();
      else if (this.map === "hollows") this.buildHollows();
      else this.buildStonemantle();
      this.renderNodes();
      this.renderChests();
      this.renderWorld();
      bannerText = currentObjective();
      hint = "Arrows: move    Z: talk/act    walk into a gate to travel    Enter: party";
    }
    // resume at the spot we left from (after a fight / exiting a building / arriving via a gate).
    // venue-aware so a field/interior random encounter returns the player to where they fought
    // rather than the venue's default entrance.
    const res = getOwResume();
    if (res && res.map === this.map && (res.venue ?? null) === (this.venue ?? null)) {
      this.px = res.x; this.py = res.y; setOwResume(null);
    }
    this.renderInteractables();

    this.player = this.add.image(this.px, this.py, SPRITE_KEY.maren).setOrigin(0.5, 1).setDepth(50);

    // scrolling camera that follows the player across the (larger-than-screen) world
    this.cameras.main.setBounds(0, 0, this.worldW, this.worldH);
    this.cameras.main.startFollow(this.player, true, 0.14, 0.14);

    // screen-fixed UI
    const banner = this.add.graphics().setScrollFactor(0).setDepth(80); ffWindow(banner, 4, 4, W - 8, 18);
    this.bannerTxt = this.add.text(W / 2, 14, bannerText, { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(bannerCol) }).setOrigin(0.5).setScrollFactor(0).setDepth(81);
    this.add.text(W / 2, 204, hint, { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(PAL.panelHi) }).setOrigin(0.5).setScrollFactor(0).setDepth(81);
    this.toast = this.add.text(W / 2, 30, "", { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(PAL.gold) }).setOrigin(0.5).setScrollFactor(0).setDepth(90);

    this.prompt = this.add.text(0, 0, this.needsTalk ? "Z: talk" : "go", { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(PAL.gold) }).setOrigin(0.5).setDepth(60).setVisible(false);
    // region-appropriate music (towns calm, wilderness/pasture adventurous)
    playBgm(this.venue === "field" ? "field" : this.venue ? "town" : (this.map === "marsh" || this.map === "hollows") ? "field" : "town");
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keyZ = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
    this.keyX = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.X);
    this.keyMenu = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    // When an overlay (dialogue / party menu) closes and resumes us, the keypress
    // that dismissed it can still be flagged "just down" on our keys — we were paused
    // and never consumed it. Clear it so the resumed frame doesn't instantly re-open
    // the same talk/menu (which manifested as a freeze on Toller).
    this.events.on(Phaser.Scenes.Events.RESUME, () => {
      this.keyZ.reset(); this.keyX.reset(); this.keyMenu.reset(); this.done = false;
      if (!this.venue) this.renderWorld();   // a beat may have completed -> refresh gates/markers/NPCs
    });
  }

  // ---------------- shared draw helpers ----------------
  private marker(x: number, y: number, col = PAL.gold, txt = "!") {
    const mk = this.add.text(x, y, txt, { fontFamily: FONT, resolution: 4, fontSize: "16px", color: c(col) }).setOrigin(0.5).setDepth(55);
    this.tweens.add({ targets: mk, y: "-=4", duration: 500, yoyo: true, repeat: -1 });
  }
  // background NPC — same size/style as the heroes (a baked character sprite)
  private npc(x: number, y: number, sprite = "villager") {
    const g = this.add.graphics().setDepth(39);
    g.fillStyle(0x000000, 0.28); g.fillEllipse(x, y, 16, 5);
    this.add.image(x, y, sprite).setOrigin(0.5, 1).setDepth(40);
  }

  private renderInteractables() {
    for (const ia of this.interactables) {
      if (ia.sprite) {
        const g = this.add.graphics().setDepth(39);
        g.fillStyle(0x000000, 0.28); g.fillEllipse(ia.x, ia.y, 16, 5);
        this.add.image(ia.x, ia.y, ia.sprite).setOrigin(0.5, 1).setDepth(40);
      }
      if (ia.label) this.add.text(ia.x, ia.y - 36, ia.label, { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(ia.labelColor ?? PAL.clothHi) }).setOrigin(0.5).setDepth(55);
      const m = this.add.text(ia.x, ia.y - 46, "!", { fontFamily: FONT, resolution: 4, fontSize: "16px", color: c(PAL.gold) }).setOrigin(0.5).setDepth(56).setVisible(false);
      this.tweens.add({ targets: m, y: ia.y - 50, duration: 500, yoyo: true, repeat: -1 });
      this.talkViews.push({ ia, marker: m });
    }
  }
  private house(g: Phaser.GameObjects.Graphics, x: number, y: number, col: number, roof = 0x6b3a2a) {
    g.fillStyle(0x3a2d26, 1); g.fillRect(x, y + 22, 40, 6);
    g.fillStyle(col, 1); g.fillRect(x, y, 40, 24);
    g.fillStyle(roof, 1); g.fillTriangle(x - 3, y, x + 20, y - 12, x + 43, y);
    g.fillStyle(0x2a1f18, 1); g.fillRect(x + 15, y + 12, 10, 12);
    g.fillStyle(0x8fd3ff, 0.6); g.fillRect(x + 5, y + 5, 6, 6); g.fillRect(x + 29, y + 5, 6, 6);
    this.solids.push({ x: x - 2, y: y + 8, w: 44, h: 22 }); // footprint blocks movement
  }

  // A proper character-scale building (~62x56) with a door you walk into to enter `interior`.
  // (x,y) is the top-left of the wall block. Sign text floats above the roof.
  private building(g: Phaser.GameObjects.Graphics, x: number, y: number, interior: string, wall = 0x8a7a5a, roof = 0x6b3a2a) {
    const bw = 62, bh = 50;
    g.fillStyle(0x000000, 0.22); g.fillEllipse(x + bw / 2, y + bh + 3, bw + 6, 12);   // ground shadow
    g.fillStyle(wall, 1); g.fillRect(x, y, bw, bh);                                    // walls
    g.fillStyle(0x4a3a2c, 1); g.fillRect(x, y + bh - 6, bw, 6);                        // base trim
    g.fillStyle(roof, 1); g.fillTriangle(x - 6, y + 2, x + bw / 2, y - 18, x + bw + 6, y + 2);
    g.fillStyle(0x4a4038, 1); g.fillRect(x - 6, y, bw + 12, 3);                        // eave line
    // windows
    g.fillStyle(0x2a2030, 1); g.fillRect(x + 8, y + 12, 12, 12); g.fillRect(x + bw - 20, y + 12, 12, 12);
    g.fillStyle(0x8fd3ff, 0.5); g.fillRect(x + 9, y + 13, 10, 5); g.fillRect(x + bw - 19, y + 13, 10, 5);
    // door (bottom-center)
    const dcx = x + bw / 2;
    g.fillStyle(0x3a2620, 1); g.fillRect(dcx - 9, y + bh - 22, 18, 22);
    g.fillStyle(0x573a2c, 1); g.fillRect(dcx - 7, y + bh - 20, 14, 20);
    g.fillStyle(0xe0b84a, 1); g.fillRect(dcx + 3, y + bh - 11, 2, 2);                  // knob
    // walls block movement; the doorway is the trigger (just below the door)
    this.solids.push({ x: x - 2, y: y - 2, w: bw + 4, h: bh });
    this.doors.push({ x: dcx - 9, y: y + bh, w: 18, h: 12, interior });
  }

  // Render a building interior as a small room with a vendor/resident and an exit door.
  private buildInterior(id: string) {
    const def = INTERIORS[id];
    this.worldW = W; this.worldH = H;
    const g = this.add.graphics();
    // floor
    g.fillStyle(0x3a2c22, 1); g.fillRect(0, 0, W, H);
    g.fillStyle(0x4a392c, 1); for (let yy = 30; yy < H; yy += 16) g.fillRect(0, yy, W, 8);
    // back + side walls
    g.fillStyle(0x5a4636, 1); g.fillRect(0, 0, W, 40);
    g.fillStyle(0x6a5440, 1); g.fillRect(0, 38, W, 3);
    g.fillStyle(0x4a3a2c, 1); g.fillRect(0, 0, 14, H); g.fillRect(W - 14, 0, 14, H);
    if (!def?.clinic) {
      // a warm rug
      g.fillStyle(0x6a3a3a, 1); g.fillRoundedRect(W / 2 - 70, 120, 140, 70, 6);
      g.fillStyle(0x7a4a4a, 1); g.fillRoundedRect(W / 2 - 62, 126, 124, 58, 5);
    }
    // exit doormat (bottom center) — walk onto it to leave
    const ex = W / 2;
    g.fillStyle(0x2a1f18, 1); g.fillRect(ex - 16, H - 14, 32, 14);
    g.fillStyle(0x4a3a2a, 1); g.fillRect(ex - 14, H - 12, 28, 12);
    this.add.text(ex, H - 7, "EXIT", { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(0xd8c8a0) }).setOrigin(0.5).setDepth(56);
    this.exitDoor = { x: ex - 16, y: H - 16, w: 32, h: 18 };

    if (def?.shop) {
      // shop counter + vendor behind it
      g.fillStyle(0x3a2a1e, 1); g.fillRect(W / 2 - 60, 70, 120, 14);
      g.fillStyle(0x6a4a30, 1); g.fillRect(W / 2 - 60, 68, 120, 4);
      this.solids.push({ x: W / 2 - 60, y: 70, w: 120, h: 14 });
      this.npc(W / 2, 66, def.vendor ?? "villager2");
      this.add.text(W / 2, 30, def.vendorName ?? "Shopkeeper", { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(def.sign) }).setOrigin(0.5).setDepth(56);
      this.shopVendor = { x: W / 2, y: 86, shop: def.shop };
    } else if (def?.clinic) {
      // clinic: pale tiled floor, a medicine shelf, two cots, and the healer at a desk
      g.fillStyle(0x5a6470, 1); g.fillRect(14, 40, W - 28, H - 40);
      g.fillStyle(0x66707c, 1); for (let yy = 48; yy < H; yy += 18) g.fillRect(14, yy, W - 28, 2);
      // medicine shelves flanking the back wall (clear of the name plate)
      const shelf = (sx: number) => {
        g.fillStyle(0x4a3a2c, 1); g.fillRect(sx, 20, 56, 10);
        const bottle = [0x8fd3ff, 0xf6757a, 0x7fe0a0, 0xfee761];
        bottle.forEach((bc, i) => { g.fillStyle(bc, 1); g.fillRect(sx + 4 + i * 13, 21, 5, 8); });
      };
      shelf(20); shelf(W - 76);
      // a cot (bed) helper
      const cot = (cx: number, cy: number) => {
        g.fillStyle(0x6a5440, 1); g.fillRect(cx - 20, cy, 40, 18);          // frame
        g.fillStyle(0xe6e6ee, 1); g.fillRect(cx - 18, cy + 2, 36, 12);      // mattress
        g.fillStyle(0xc7d0e0, 1); g.fillRect(cx - 16, cy + 3, 10, 8);       // pillow
        g.fillStyle(0x9aa6b8, 1); g.fillRect(cx - 6, cy + 8, 24, 1);        // blanket fold
        this.solids.push({ x: cx - 20, y: cy, w: 40, h: 18 });
      };
      cot(56, 120); cot(56, 158); cot(W - 56, 120); cot(W - 56, 158);
      // Renna behind a small desk
      g.fillStyle(0x3a2a1e, 1); g.fillRect(W / 2 - 26, 70, 52, 12); g.fillStyle(0x6a4a30, 1); g.fillRect(W / 2 - 26, 68, 52, 4);
      this.solids.push({ x: W / 2 - 26, y: 70, w: 52, h: 12 });
      this.npc(W / 2, 66, def.vendor ?? "villager2");
      this.add.text(W / 2, 30, def.vendorName ?? "Clinic", { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(def.sign) }).setOrigin(0.5).setDepth(56);
      // sleep on the first cot to restore the whole party's HP/MP
      this.interactables = [
        { x: W / 2, y: 88, label: def.vendorName, labelColor: def.sign, active: () => true, seq: () => def.line ?? null },
        { x: 56, y: 132, label: "REST", labelColor: 0x7fe0a0, prompt: "rest", active: () => true, seq: () => null, action: () => this.restAtClinic() },
      ];
    } else if (def?.inn) {
      // inn: warm wood floor, a row of beds, an innkeeper at the counter. Rest costs Marks.
      const cost = def.restCost ?? 20;
      g.fillStyle(0x4a3528, 1); g.fillRect(14, 40, W - 28, H - 40);
      g.fillStyle(0x573f2e, 1); for (let yy = 50; yy < H; yy += 16) g.fillRect(14, yy, W - 28, 2);
      g.fillStyle(0xf0b53c, 0.10); g.fillCircle(W / 2, 30, 50); // hearth glow
      const bed = (cx: number, cy: number) => {
        g.fillStyle(0x6a4a30, 1); g.fillRect(cx - 22, cy, 44, 18);            // frame
        g.fillStyle(0xe6dcc6, 1); g.fillRect(cx - 20, cy + 2, 40, 12);        // mattress
        g.fillStyle(0xc0a070, 1); g.fillRect(cx - 18, cy + 3, 11, 8);         // pillow
        g.fillStyle(0x9a6a4a, 1); g.fillRect(cx - 6, cy + 8, 26, 2);          // quilt fold
        this.solids.push({ x: cx - 22, y: cy, w: 44, h: 18 });
      };
      bed(58, 120); bed(58, 158); bed(W - 58, 120); bed(W - 58, 158);
      // innkeeper's counter
      g.fillStyle(0x3a2a1e, 1); g.fillRect(W / 2 - 30, 70, 60, 12); g.fillStyle(0x6a4a30, 1); g.fillRect(W / 2 - 30, 68, 60, 4);
      this.solids.push({ x: W / 2 - 30, y: 70, w: 60, h: 12 });
      this.npc(W / 2, 66, def.vendor ?? "villager2");
      this.add.text(W / 2, 30, def.vendorName ?? "Innkeeper", { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(def.sign) }).setOrigin(0.5).setDepth(56);
      this.add.text(58, 106, `${cost} Marks`, { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(0xffd98a) }).setOrigin(0.5).setDepth(56);
      this.interactables = [
        { x: W / 2, y: 88, label: def.vendorName, labelColor: def.sign, prompt: `rest ${cost}M`, active: () => true, seq: () => null, action: () => this.tryRest(cost) },
        { x: 58, y: 132, label: "REST", labelColor: 0xffd98a, prompt: `rest ${cost}M`, active: () => true, seq: () => null, action: () => this.tryRest(cost) },
      ];
    } else if (def?.line) {
      this.npc(W / 2, 78, def.vendor ?? "elder");
      this.interactables = [{ x: W / 2, y: 88, label: def.vendorName, labelColor: def.sign, active: () => true, seq: () => def.line ?? null }];
    }
    // spawn just inside the entrance, facing the room
    this.px = ex; this.py = H - 22;
  }

  // ---------------- maps ----------------
  private buildThornwall() {
    this.worldW = 640; this.worldH = 540;
    const g = this.add.graphics();
    g.fillStyle(0x3a5a3a, 1); g.fillRect(0, 0, this.worldW, this.worldH);
    g.fillStyle(0x2e4a2e, 1); for (let y = 0; y < this.worldH; y += 8) for (let x = (y % 16); x < this.worldW; x += 16) g.fillRect(x, y, 3, 2);
    const sign = (x: number, y: number, t: string, col: number) => this.add.text(x, y, t, { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(col) }).setOrigin(0.5).setDepth(46);

    // ---- Farmer Bram's pasture, NORTH of the village (visible through a rail fence) ----
    g.fillStyle(0x2f4e2f, 1); g.fillRect(0, 0, this.worldW, 92);                 // greener pasture grass
    const sheep = (sx: number) => { g.fillStyle(0xe8e4dc, 1); g.fillEllipse(sx, 52, 18, 11); g.fillStyle(0x3a3330, 1); g.fillEllipse(sx + 9, 52, 6, 6); g.fillRect(sx - 7, 58, 2, 4); g.fillRect(sx + 3, 58, 2, 4); };
    sheep(150); sheep(430); sheep(540);
    for (let x = 8; x < this.worldW; x += 26) { g.fillStyle(0x7a6446, 1); g.fillRect(x, 80, 4, 16); } // fence posts
    g.fillStyle(0x6a5436, 1); g.fillRect(0, 88, 286, 5); g.fillRect(332, 88, this.worldW - 332, 5);     // rails (gap = gate)
    this.solids.push({ x: -2, y: 86, w: 288, h: 10 }); this.solids.push({ x: 332, y: 86, w: this.worldW - 330, h: 10 });
    g.fillStyle(0x3a2d20, 1); g.fillRect(290, 84, 44, 14);                       // gate frame
    g.fillStyle(0x2a1f18, 1); g.fillRect(300, 86, 24, 12);                       // gateway
    sign(312, 72, "FARMER'S PASTURE", 0x9ad0a0);
    this.doors.push({ x: 298, y: 96, w: 28, h: 14, interior: "field" });

    // central dirt road from the pasture gate down through town to the south gate
    g.fillStyle(0x6b5a3a, 1); g.fillRect(300, 96, 30, 404);
    g.fillStyle(0x5a4a30, 1); for (let y = 104; y < 496; y += 12) g.fillRect(304, y, 22, 2);
    g.fillStyle(0x6b5a3a, 1); g.fillRect(40, 340, this.worldW - 80, 28);        // crossroad

    // buildings (all enterable)
    this.building(g, 150, 138, "thornwall_clinic", 0xcfc0a8, 0xb24a3a); // Maren's mother's clinic
    g.fillStyle(0xd64b4b, 1); g.fillRect(180, 148, 3, 11); g.fillRect(176, 152, 11, 3); // red cross
    sign(181, 114, "CLINIC", 0xff8a8a);
    this.building(g, 70, 210, "thornwall_item", 0x6a8a64, 0x3a6a4a);  sign(101, 184, "PROVISIONS", 0x7fe0a0);
    this.building(g, 470, 200, "thornwall_equip", 0x8a8a96, 0x52505a); sign(501, 174, "ARMORY", 0xc0cbdc);
    this.building(g, 96, 410, "thornwall_home", 0x8a7a5a, 0x6b3a2a);   sign(127, 384, "HOME", 0xe0c080);
    this.house(g, 540, 380, 0x7a6a52); // decorative

    // ---- SOUTH WALL with the gate + a frost-cracked breach to the east ----
    g.fillStyle(0x5a5048, 1); g.fillRect(0, 500, this.worldW, 14);
    g.fillStyle(0x6a6058, 1); g.fillRect(0, 500, this.worldW, 2);
    g.fillStyle(0x4a3a2a, 1); g.fillRect(286, 498, 60, 18);
    g.fillStyle(0x2a1f18, 1); g.fillRect(300, 500, 30, 16);
    const bx = 470;
    this.breachDebris = this.add.graphics().setDepth(2);
    this.breachDebris.fillStyle(0x3a5a3a, 1); this.breachDebris.fillRect(bx, 496, 48, 20);
    this.breachDebris.fillStyle(0x6a6058, 1); this.breachDebris.fillRect(bx - 4, 510, 12, 5); this.breachDebris.fillRect(bx + 36, 512, 12, 4);
    this.breachDebris.fillStyle(0x4a3a2a, 1); this.breachDebris.fillRect(bx + 16, 504, 6, 10);
    this.breachPatch = this.add.graphics().setDepth(3).setVisible(false);
    this.breachPatch.fillStyle(0x5a5048, 1); this.breachPatch.fillRect(bx, 500, 48, 14);
    this.breachPatch.fillStyle(0x6a6058, 1); this.breachPatch.fillRect(bx, 500, 48, 2);

    // townsfolk (character-sized)
    this.npc(360, 270, "villager"); this.npc(120, 360, "villager2");
    // (Kael at the south gate is rendered by the b_kael story beat)
    this.chests = [{ x: 600, y: 250, id: "t1", equip: "travel_cloak" }];
    this.nodes = [{ x: bx + 24, y: 490, enemies: ["thornwall_wolf", "thornwall_wolf"], id: "tb", intro: "Wolves slipped through the breach!" }];
    // people / quest spots you can talk to
    this.interactables = [
      { x: 210, y: 310, sprite: "elder", label: "Toller", labelColor: 0xe0c080,
        quest: () => !flag("wall_quest"), active: () => true,
        seq: () => (flag("wall_fixed") ? Q_TOLLER_THANKS : Q_TOLLER) },
      { x: bx + 24, y: 494, label: "Breach", labelColor: 0xe07a5a,
        quest: () => flag("enc_thornwall_tb") && !flag("wall_fixed"),
        active: () => flag("enc_thornwall_tb") && !flag("wall_fixed"),
        seq: () => Q_WALL_REPAIR },
      // a townsperson who points you to the farmer's work (the pasture bounty)
      { x: 420, y: 300, sprite: "villager", label: "Townsfolk", labelColor: 0xc8d0a0,
        quest: () => true, active: () => true, seq: () => FARMER_HINT },
    ];
    this.px = 300; this.py = 200; this.needsTalk = true;
  }

  private buildMarsh() {
    this.worldW = W; this.worldH = 460;
    const g = this.add.graphics();
    g.fillStyle(0x2a3a30, 1); g.fillRect(0, 0, W, this.worldH);
    g.fillStyle(0x24332a, 1); for (let y = 0; y < this.worldH; y += 7) for (let x = (y % 14); x < W; x += 14) g.fillRect(x, y, 3, 1);
    // water pools (solid)
    const pool = (x: number, y: number, rw: number, rh: number) => { g.fillStyle(0x24403a, 1); g.fillEllipse(x, y, rw, rh); g.fillStyle(0x3a5a50, 0.5); g.fillEllipse(x, y - 3, rw * 0.7, rh * 0.5); this.solids.push({ x: x - rw / 2, y: y - rh / 2, w: rw, h: rh }); };
    pool(70, 110, 70, 30); pool(310, 180, 80, 30); pool(120, 300, 60, 24); pool(300, 360, 70, 26);
    g.fillStyle(0x5a4a38, 1); g.fillRect(176, 24, 24, this.worldH);
    g.fillStyle(0x9aa6a0, 0.06); g.fillRect(0, 0, W, this.worldH);
    g.fillStyle(0x4a3a2a, 1); g.fillRect(160, 440, 64, 18);
    // no visible trash — the marsh has random encounters as you cross it
    this.setEncounters([
      ["marsh_slime", "marsh_slime"],
      ["marsh_slime", "thornwall_wolf"],
      ["thornwall_wolf", "marsh_slime", "marsh_slime"],
    ], "Marsh creatures lunge from the fog!");
    this.chests = [{ x: 60, y: 240, id: "ms1", xp: 30 }];
    this.px = 192; this.py = 44; this.needsTalk = false;
  }

  private buildHollows() {
    this.worldW = 520; this.worldH = 500;
    const g = this.add.graphics();
    g.fillStyle(0x14201a, 1); g.fillRect(0, 0, this.worldW, this.worldH);
    g.fillStyle(0x0e1814, 1); for (let y = 0; y < this.worldH; y += 7) for (let x = (y % 14); x < this.worldW; x += 14) g.fillRect(x, y, 3, 1);
    // winding mossy path
    g.fillStyle(0x2a3a28, 1); g.fillRect(240, 24, 24, 200); g.fillRect(120, 200, 144, 24); g.fillRect(120, 200, 24, 260);
    const tree = (x: number, y: number) => {
      g.fillStyle(0x1a1410, 1); g.fillRect(x - 2, y, 4, 20);
      g.fillStyle(0x1f2e22, 1); g.fillCircle(x, y - 4, 13); g.fillCircle(x - 9, y, 9); g.fillCircle(x + 9, y, 9);
      this.solids.push({ x: x - 10, y: y - 6, w: 20, h: 14 });
    };
    tree(80, 90); tree(360, 70); tree(420, 200); tree(180, 120); tree(300, 300); tree(440, 360); tree(60, 300); tree(360, 440);
    g.fillStyle(0x6affc0, 1); for (let i = 0; i < 70; i++) g.fillCircle((i * 47) % this.worldW, (i * 71) % this.worldH, 1);
    // mossbridge exit (bottom-left where the path ends)
    g.fillStyle(0x3a2d20, 1); g.fillRect(110, 472, 50, 18);
    // wandering shadows are random encounters; the lair guardian stays visible as a node
    this.setEncounters([
      ["shadow_creeper", "gloom_moth"],
      ["gloom_moth", "gloom_moth"],
      ["shadow_creeper", "shadow_creeper"],
    ], "Shadows stir in the Hollows!");
    this.nodes = [
      { x: 440, y: 120, enemies: ["shadow_creeper", "shadow_creeper", "gloom_moth"], id: "hb", boss: true, rewardEquip: "war_staff", intro: "A lair guardian blocks the cache!" },
    ];
    this.chests = [{ x: 470, y: 440, id: "hc1", equip: "swift_boots" }, { x: 60, y: 90, id: "hc2", xp: 40 }];
    this.px = 252; this.py = 40; this.needsTalk = false;
  }

  // WAYSTATION — a fortified rest stop on the south road through the wilds.
  private buildWaystation() {
    this.worldW = 540; this.worldH = 360;
    const g = this.add.graphics();
    const sign = (x: number, y: number, t: string, col: number) => this.add.text(x, y, t, { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(col) }).setOrigin(0.5).setDepth(46);
    // packed-earth ground
    g.fillStyle(0x4a4232, 1); g.fillRect(0, 0, this.worldW, this.worldH);
    g.fillStyle(0x3e3729, 1); for (let y = 0; y < this.worldH; y += 8) for (let x = (y % 16); x < this.worldW; x += 16) g.fillRect(x, y, 3, 2);
    // grassy verge + treeline along the top, hinting at the road's wild surroundings
    g.fillStyle(0x2f4a2f, 1); g.fillRect(0, 0, this.worldW, 44);
    for (let i = 0; i < 9; i++) { const tx = 30 + i * 62; g.fillStyle(0x1f3320, 1); g.fillTriangle(tx - 14, 44, tx, 8, tx + 14, 44); }
    // log palisade just below the treeline (decorative, with a solid strip — gate gaps at the edges)
    g.fillStyle(0x5a4632, 1); g.fillRect(40, 44, this.worldW - 80, 7);
    this.solids.push({ x: 40, y: 44, w: this.worldW - 80, h: 9 });
    // main east–west road with a vertical spur to the well
    g.fillStyle(0x6b5a3a, 1); g.fillRect(0, 182, this.worldW, 40);
    g.fillStyle(0x5a4a30, 1); for (let x = 8; x < this.worldW; x += 14) g.fillRect(x, 200, 8, 2);
    g.fillStyle(0x6b5a3a, 1); g.fillRect(258, 222, 24, 70);
    // a stone well (solid)
    g.fillStyle(0x3a3640, 1); g.fillCircle(270, 300, 17); g.fillStyle(0x6a6470, 1); g.fillCircle(270, 300, 14); g.fillStyle(0x10141c, 1); g.fillCircle(270, 300, 9);
    g.fillStyle(0x4a3a2c, 1); g.fillRect(266, 282, 8, 18); // well post
    this.solids.push({ x: 252, y: 290, w: 36, h: 22 });
    // a campfire ring for travelers
    g.fillStyle(0x2a2018, 1); g.fillCircle(110, 300, 12); g.fillStyle(0xffcf6a, 0.8); g.fillCircle(110, 300, 5); g.fillStyle(0xff7a3a, 0.7); g.fillCircle(110, 300, 3);
    // enterable buildings
    this.building(g, 100, 92, "waystation_inn", 0x9a8460, 0x7a4a2a);  sign(131, 68, "WAYFARER'S REST", 0xffd98a);
    this.building(g, 360, 92, "waystation_item", 0x6a8a64, 0x3a6a4a); sign(391, 68, "SUPPLIES", 0x7fe0a0);
    sign(270, 18, "WAYSTATION", 0xfff0d0);
    // (Fennick is rendered by the b_fennick beat at 270,256)
    // ambient travelers — flavor that colors the road south
    this.interactables = [
      { x: 150, y: 290, sprite: "villager", label: "Traveler", labelColor: 0xc8d0a0, active: () => true, seq: () => WAY_TRAVELER },
      { x: 440, y: 250, sprite: "elder", label: "Caravanner", labelColor: 0xd8c090, active: () => true, seq: () => WAY_TRADER },
    ];
    this.px = 60; this.py = 200; this.needsTalk = false;
  }

  // REDHOLLOW — a fire-region town under Valcrest occupation. Scorched, watched, defiant.
  private buildEmberreach() {
    this.worldW = 560; this.worldH = 360;
    const g = this.add.graphics();
    const sign = (x: number, y: number, t: string, col: number) => this.add.text(x, y, t, { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(col) }).setOrigin(0.5).setDepth(46);
    // ashen ground
    g.fillStyle(0x3a2a30, 1); g.fillRect(0, 0, this.worldW, this.worldH);
    g.fillStyle(0x332530, 1); for (let y = 0; y < this.worldH; y += 8) for (let x = (y % 16); x < this.worldW; x += 16) g.fillRect(x, y, 3, 2);
    // ember mountain on the skyline with a lava seam
    g.fillStyle(0x1f1622, 1); g.fillTriangle(60, 64, 180, 0, 300, 64); g.fillTriangle(300, 64, 410, 6, 520, 64);
    g.fillStyle(0xe04a2a, 0.85); g.fillTriangle(168, 36, 180, 0, 192, 36);
    g.fillStyle(0xff7a3a, 0.5); g.fillCircle(180, 10, 6);
    // soot-stained plaza
    g.fillStyle(0x453640, 1); g.fillRect(0, 64, this.worldW, this.worldH - 64);
    // cracked stone road (decorative)
    g.fillStyle(0x564652, 1); g.fillRect(0, 230, this.worldW, 34); g.fillRect(280, 120, 26, 144);
    g.fillStyle(0x3e3038, 1); for (let x = 8; x < this.worldW; x += 16) g.fillRect(x, 246, 8, 2);
    // Valcrest occupation banners (red with black sigil) on poles
    const banner = (x: number) => { g.fillStyle(0x2a2024, 1); g.fillRect(x, 70, 3, 60); g.fillStyle(0xc0392b, 1); g.fillRect(x - 7, 74, 17, 22); g.fillStyle(0x1a1014, 1); g.fillRect(x - 1, 80, 5, 10); };
    banner(70); banner(250); banner(470);
    // a few rubble piles (solid) — a town half-knocked-down
    const rubble = (x: number, y: number) => { g.fillStyle(0x2e2630, 1); g.fillEllipse(x, y, 30, 14); g.fillStyle(0x3a3340, 1); g.fillRect(x - 8, y - 8, 8, 8); g.fillRect(x + 2, y - 5, 6, 6); this.solids.push({ x: x - 15, y: y - 8, w: 30, h: 16 }); };
    rubble(150, 300); rubble(400, 150);
    // enterable buildings (scorched walls, dark roofs)
    this.building(g, 88, 92, "emberreach_inn", 0x6a5258, 0x3a2628);  sign(119, 68, "ASH & EMBER INN", 0xffd98a);
    this.building(g, 300, 92, "emberreach_item", 0x5a4a52, 0x2e2230); sign(331, 68, "BLACK MARKET", 0x7fe0a0);
    this.building(g, 444, 250, "emberreach_equip", 0x60504a, 0x2e2422); sign(475, 226, "SCAVENGED ARMS", 0xc0cbdc);
    sign(280, 18, "REDHOLLOW — OCCUPIED", 0xe0a0a0);
    // (Senna at 300,210 and the Rhogar beats are rendered by the story beats)
    // townsfolk under occupation — the resident's mood flips once Rhogar is driven out
    this.interactables = [
      { x: 210, y: 300, sprite: "villager2", label: "Resident", labelColor: 0xd0a0a8,
        active: () => true, seq: () => (flag("b_rhogar_done") ? RED_RESIDENT_FREE : RED_RESIDENT_OCC) },
      { x: 110, y: 180, sprite: "elder", label: "Ashkeeper", labelColor: 0xe0906a, active: () => true, seq: () => RED_DEFIANT },
    ];
    this.px = 64; this.py = 300; this.needsTalk = false;
  }

  // IRONHOLD — a guild-meritocracy city of the earth region, built around its fighting pit.
  private buildStonemantle() {
    this.worldW = 560; this.worldH = 360;
    const g = this.add.graphics();
    const sign = (x: number, y: number, t: string, col: number) => this.add.text(x, y, t, { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(col) }).setOrigin(0.5).setDepth(46);
    // dressed-stone ground with crystal flecks
    g.fillStyle(0x3a3640, 1); g.fillRect(0, 0, this.worldW, this.worldH);
    g.fillStyle(0x322e3a, 1); for (let y = 0; y < this.worldH; y += 10) g.fillRect(0, y, this.worldW, 1);
    g.fillStyle(0xc0d0e0, 1); for (let i = 0; i < 40; i++) { const x = (i * 53) % this.worldW; const y = (i * 67) % this.worldH; g.fillRect(x, y, 1, 5); }
    // raised stone terraces (decorative)
    const plat = (x: number, y: number, w: number) => { g.fillStyle(0x4a4852, 1); g.fillRect(x, y, w, 8); g.fillStyle(0x6a6874, 1); g.fillRect(x, y, w, 2); };
    plat(20, 60, 120); plat(360, 60, 150); plat(40, 320, 180); plat(360, 320, 160);
    // banners of the guilds (slate + bronze)
    const banner = (x: number, col: number) => { g.fillStyle(0x2a2832, 1); g.fillRect(x, 70, 3, 54); g.fillStyle(col, 1); g.fillRect(x - 7, 74, 17, 20); };
    banner(80, 0xb0863a); banner(470, 0x5a7a9a);
    // the fighting pit (the b_yara beat triggers within ~46px of 300,160)
    g.fillStyle(0x241f1a, 1); g.fillEllipse(300, 168, 88, 36); g.fillStyle(0x3a3026, 1); g.fillEllipse(300, 166, 76, 28);
    g.fillStyle(0x52483a, 1); for (let a = 0; a < 12; a++) { const ang = (a / 12) * Math.PI * 2; g.fillRect(300 + Math.cos(ang) * 46 - 2, 166 + Math.sin(ang) * 20 - 2, 4, 4); } // pit-edge stones
    this.add.image(300, 162, SPRITE_KEY.yara).setOrigin(0.5, 1).setDepth(40);
    sign(300, 128, "FIGHTING PIT", 0xe0b070);
    // enterable buildings
    this.building(g, 70, 92, "stonemantle_inn", 0x7a7884, 0x4a4852);   sign(101, 68, "GUILD LODGE", 0xffd98a);
    this.building(g, 430, 92, "stonemantle_item", 0x6a8a64, 0x3a6a4a);  sign(461, 68, "GUILD STORES", 0x7fe0a0);
    this.building(g, 430, 250, "stonemantle_equip", 0x8a8a96, 0x52505a); sign(461, 226, "FORGE HALL", 0xc0cbdc);
    sign(280, 18, "IRONHOLD", 0xc8d0e0);
    // guild-city locals — pride in the unconquered cliff and hype for the pit
    this.interactables = [
      { x: 150, y: 300, sprite: "villager", label: "Stonecutter", labelColor: 0xc0cbdc, active: () => true, seq: () => IRON_ARTISAN },
      { x: 200, y: 110, sprite: "villager2", label: "Pit Regular", labelColor: 0xe0b070, active: () => true, seq: () => IRON_FAN },
    ];
    this.px = 60; this.py = 176; // (b_ironhold arrival cinematic fires on entry)
  }

  // The farmer's pasture: a scrolling grind field reached from Thornwall's back gate.
  private buildField() {
    this.worldW = 480; this.worldH = 400;
    const g = this.add.graphics();
    g.fillStyle(0x3e5e3a, 1); g.fillRect(0, 0, this.worldW, this.worldH);
    g.fillStyle(0x345030, 1); for (let y = 0; y < this.worldH; y += 8) for (let x = (y % 16); x < this.worldW; x += 16) g.fillRect(x, y, 3, 2);
    g.fillStyle(0xe0d060, 1); for (let i = 0; i < 36; i++) g.fillCircle((i * 97) % this.worldW, 52 + (i * 53) % (this.worldH - 70), 1); // wildflowers
    // the fenced pen along the top
    g.fillStyle(0x223c22, 1); g.fillRect(0, 0, this.worldW, 38);
    g.fillStyle(0x6a5436, 1); g.fillRect(0, 40, this.worldW, 4);
    for (let x = 4; x < this.worldW; x += 24) { g.fillStyle(0x7a6446, 1); g.fillRect(x, 30, 4, 14); }
    this.solids.push({ x: -2, y: 36, w: this.worldW + 4, h: 10 }); // fence blocks the pen
    const sheep = (x: number) => { g.fillStyle(0xe8e4dc, 1); g.fillEllipse(x, 22, 16, 10); g.fillStyle(0x3a3330, 1); g.fillEllipse(x + 8, 22, 5, 5); g.fillRect(x - 6, 27, 2, 3); g.fillRect(x + 2, 27, 2, 3); };
    sheep(120); sheep(300); sheep(390);
    // Farmer Bram, just outside the fence
    this.interactables = [{
      x: 220, y: 64, sprite: "elder", label: "Farmer Bram", labelColor: 0xe0c080,
      quest: () => { const b = getBounty(); return !b || b.have >= b.need; }, active: () => true, seq: () => this.farmerSeq(),
    }];
    // gate back to Thornwall (bottom edge)
    const gx = this.worldW / 2;
    g.fillStyle(0x4a3a2a, 1); g.fillRect(gx - 20, this.worldH - 10, 40, 10);
    g.fillStyle(0x2a1f18, 1); g.fillRect(gx - 13, this.worldH - 8, 26, 8);
    this.add.text(gx, this.worldH - 2, "TO THORNWALL", { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(0xd8c8a0) }).setOrigin(0.5).setDepth(56);
    this.doors.push({ x: gx - 13, y: this.worldH - 12, w: 26, h: 14, interior: "__town" });
    // low-level random encounters
    this.setEncounters([
      ["field_rat", "field_rat"], ["forest_spider"], ["thornwall_wolf", "field_rat"],
      ["marsh_slime", "forest_spider"], ["field_rat", "forest_spider", "field_rat"], ["thornwall_wolf"],
    ], "Wildlife pours from the brush!");
    this.px = gx; this.py = this.worldH - 28; this.needsTalk = true;
  }

  // Dynamic farmer dialogue that also assigns / completes the repeatable bounty.
  private farmerSeq(): DialogSeq {
    const b = getBounty();
    if (b && b.have >= b.need) {
      const reward = bountyReward(b); addMarks(reward); clearBounty();
      return { id: "farmer_done", context: "Bounty Complete", lines: [
        { speaker: "Farmer Bram", text: `Hah — ${b.need} ${creatureName(b.target)} culled! The herd can graze easy tonight.` },
        { speaker: "Farmer Bram", text: `Here's ${reward} Marks for your trouble. Come back any time — there's always varmints.` },
      ] };
    }
    if (b) {
      return { id: "farmer_progress", context: "Still Hunting", lines: [
        { speaker: "Farmer Bram", text: `Still need ${b.need - b.have} more ${creatureName(b.target)}. They're thick out past the fence.` },
      ] };
    }
    const nb = assignBounty();
    return { id: "farmer_new", context: "A Hunting Bounty", lines: [
      { speaker: "Farmer Bram", text: "You handy in a scrap? Critters keep slippin' in and spookin' my livestock." },
      { speaker: "Farmer Bram", text: `Thin out ${nb.need} ${creatureName(nb.target)} past the fence and I'll pay you well.` },
    ] };
  }

  // ---------------- objects ----------------
  private renderNodes() {
    const flags = getStory().flags;
    for (const n of this.nodes) {
      const flag = `enc_${this.map}_${n.id}`;
      if (flags[flag]) continue;
      this.add.image(n.x, n.y, SPRITE_KEY[n.enemies[0]] ?? "wolf").setOrigin(0.5, 1).setDepth(45).setScale(n.boss ? 1.2 : 1);
      this.marker(n.x, n.y - 30, n.boss ? 0xff4444 : 0xe24b4b, n.boss ? "!!" : "!");
      this.nodeViews.push({ x: n.x, y: n.y, n, flag });
    }
  }

  private renderChests() {
    const flags = getStory().flags;
    for (const ch of this.chests) {
      const flag = `chest_${this.map}_${ch.id}`;
      if (flags[flag]) continue;
      const cont = this.add.container(ch.x, ch.y).setDepth(44);
      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.25); g.fillEllipse(0, 1, 16, 5);
      g.fillStyle(0x6b4a28, 1); g.fillRoundedRect(-7, -8, 14, 9, 2);
      g.fillStyle(0x8a6a3a, 1); g.fillRoundedRect(-7, -10, 14, 4, 2);
      g.fillStyle(0xe0b84a, 1); g.fillRect(-1, -10, 2, 11); g.fillRect(-7, -6, 14, 1);
      cont.add(g);
      this.tweens.add({ targets: cont, y: ch.y - 2, duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      this.chestViews.push({ x: ch.x, y: ch.y, ch, flag, img: cont });
    }
  }

  private showToast(msg: string) {
    this.toast.setText(msg).setScale(1.3).setAlpha(1);
    this.tweens.add({ targets: this.toast, scale: 1, duration: 160, ease: "Back.easeOut" });
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 1600, duration: 500 });
  }

  // Free rest at Maren's mother's clinic cot — a short fade-to-black, then full HP/MP.
  private restAtClinic() { this.tryRest(0); }

  // Paid inn rest in other towns. Free rests heal immediately; paid rests pop a
  // Yes/No confirm first so the player never loses Marks by accident.
  private tryRest(cost: number) {
    if (this.resting || this.innPrompt) return;
    if (!partyNeedsRest()) { sfx("cancel"); this.showToast("The party is already well rested."); return; }
    if (cost <= 0) { this.doRest(0); return; }
    if (getMarks() < cost) { sfx("error"); this.showToast(`Not enough Marks (the inn costs ${cost}).`); return; }
    this.openInnPrompt(cost);
  }

  // a small Yes/No panel anchored to screen for the paid inn
  private openInnPrompt(cost: number) {
    sfx("confirm");
    this.prompt.setVisible(false);
    const g = this.add.graphics().setScrollFactor(0).setDepth(95);
    ffWindow(g, 96, 78, W - 192, 56);
    const t1 = this.add.text(W / 2, 92, `Rest the party for`, { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(PAL.clothHi) }).setOrigin(0.5).setScrollFactor(0).setDepth(96);
    const t2 = this.add.text(W / 2, 104, `${cost} Marks?`, { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(0xfee761) }).setOrigin(0.5).setScrollFactor(0).setDepth(96);
    const t3 = this.add.text(W / 2, 122, `Z: Yes    X: No`, { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(PAL.steelHi) }).setOrigin(0.5).setScrollFactor(0).setDepth(96);
    this.innPrompt = { cost, objs: [g, t1, t2, t3] };
  }

  private closeInnPrompt() {
    if (!this.innPrompt) return;
    this.innPrompt.objs.forEach((o) => o.destroy());
    this.innPrompt = null;
  }

  private handleInnPrompt() {
    if (!this.innPrompt) return;
    if (Phaser.Input.Keyboard.JustDown(this.keyZ)) {
      const cost = this.innPrompt.cost;
      this.closeInnPrompt();
      if (spendMarks(cost)) this.doRest(cost); else { sfx("error"); this.showToast("Not enough Marks."); }
    } else if (Phaser.Input.Keyboard.JustDown(this.keyX)) {
      sfx("cancel"); this.closeInnPrompt();
    }
  }

  // the shared fade-to-black + full heal used by both the clinic and paid inns
  private doRest(cost: number) {
    this.resting = true;
    this.prompt.setVisible(false);
    sfx("confirm");
    this.cameras.main.fadeOut(450, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      restParty();
      sfx("heal");
      this.cameras.main.fadeIn(550, 0, 0, 0);
      this.showToast(cost > 0 ? `Rested. HP/MP restored.  -${cost} Marks` : "The party rests... HP and MP fully restored!");
      this.time.delayedCall(650, () => { this.resting = false; });
    });
  }

  // ---------------- collision ----------------
  private blocked(x: number, y: number): boolean {
    for (const s of this.solids) {
      if (y >= s.y && y <= s.y + s.h && x + 5 >= s.x && x - 5 <= s.x + s.w) return true;
    }
    return false;
  }
  private pointIn(r: Rect): boolean { return this.px >= r.x && this.px <= r.x + r.w && this.py >= r.y && this.py <= r.y + r.h; }

  update(_: number, dt: number) {
    if (this.done) return;
    if (this.resting || this.innPrompt) { this.handleInnPrompt(); return; } // mid-rest / inn confirm: suppress movement
    // open the party / status menu — available everywhere (towns, interiors, the field)
    if (Phaser.Input.Keyboard.JustDown(this.keyMenu)) { this.scene.launch("partymenu", { from: "overworld" }); this.scene.pause(); return; }
    const sp = 0.075 * dt;
    let dx = 0, dy = 0;
    if (this.cursors.left!.isDown) dx -= sp;
    if (this.cursors.right!.isDown) dx += sp;
    if (this.cursors.up!.isDown) dy -= sp;
    if (this.cursors.down!.isDown) dy += sp;
    const ox = this.px, oy = this.py;
    const nx = Phaser.Math.Clamp(this.px + dx, 12, this.worldW - 12);
    if (!this.blocked(nx, this.py)) this.px = nx;
    const ny = Phaser.Math.Clamp(this.py + dy, 30, this.worldH - 6);
    if (!this.blocked(this.px, ny)) this.py = ny;
    this.player.setPosition(Math.round(this.px), Math.round(this.py));
    const moved = Math.hypot(this.px - ox, this.py - oy);

    if (this.venue && this.venue !== "field") { this.updateInterior(); return; }

    // keep the pasture banner showing live bounty progress
    if (this.venue === "field" && this.bannerTxt) {
      const b = getBounty();
      this.bannerTxt.setText(b ? `BOUNTY: ${b.have}/${b.need} ${creatureName(b.target)}` : "FARMER'S PASTURE");
    }

    // JRPG random encounters: accumulate steps, trigger a battle past the threshold
    if (this.encGroups && moved > 0.05) {
      this.encDist += moved;
      if (this.encDist >= this.encThreshold) {
        this.done = true;
        setOwResume({ map: this.map, x: this.px, y: this.py, venue: this.venue ?? null });
        const grp = this.encGroups[Math.floor(Math.random() * this.encGroups.length)];
        this.scene.start("battle", { story: { party: activeParty(), enemies: grp, level: 1, intro: this.encIntro, escape: true, field: true, returnLoc: this.map } });
        return;
      }
    }

    // walk into a door: enter a building interior, head out to the field, or return to town
    for (const d of this.doors) {
      if (this.pointIn(d)) {
        this.done = true;
        if (d.interior === "__town") { setVenue(null); setOwResume({ map: "thornwall", x: 312, y: 118 }); } // field gate -> just below the pasture gate
        else { setOwResume({ map: this.map, x: d.x + d.w / 2, y: d.y + 22 }); setVenue(d.interior); } // building/field entrance
        this.scene.restart(this.step);
        return;
      }
    }

    // treasure chests
    for (let i = this.chestViews.length - 1; i >= 0; i--) {
      const cv = this.chestViews[i];
      if (Phaser.Math.Distance.Between(this.px, this.py, cv.x, cv.y) < 20) {
        getStory().flags[cv.flag] = true;
        cv.img.destroy();
        this.chestViews.splice(i, 1);
        if (cv.ch.equip) { const who = giveEquip(cv.ch.equip); this.showToast(`Found ${cv.ch.equip.replace(/_/g, " ")}!${who ? " (" + who.toUpperCase() + ")" : ""}`); }
        else if (cv.ch.xp) { awardXp(activeParty(), cv.ch.xp); this.showToast(`Found a cache! +${cv.ch.xp} XP`); }
      }
    }

    // breach visual reflects quest state live
    if (this.breachDebris && this.breachPatch) {
      const fixed = flag("wall_fixed");
      this.breachDebris.setVisible(!fixed);
      this.breachPatch.setVisible(fixed);
    }

    // optional on-map encounters (walk into a "!" to fight, or route around it)
    for (const nv of this.nodeViews) {
      if (Phaser.Math.Distance.Between(this.px, this.py, nv.x, nv.y) < 24) {
        this.done = true;
        setOwResume({ map: this.map, x: this.px, y: this.py, venue: this.venue ?? null }); // come back to this spot after the fight
        this.scene.start("battle", { story: { party: activeParty(), enemies: nv.n.enemies, level: 1, intro: nv.n.intro ?? (nv.n.boss ? "An optional foe guards a hidden prize!" : "Ambush!"), escape: true, field: true, returnLoc: this.map, nodeFlag: nv.flag, rewardEquip: nv.n.rewardEquip } });
        return;
      }
    }

    // talkable NPCs / quest spots (Z to talk; markers update with quest state)
    let onTalker = false;
    for (const tv of this.talkViews) {
      tv.marker.setVisible(!!tv.ia.quest?.() && tv.ia.active());
      if (tv.ia.active() && Phaser.Math.Distance.Between(this.px, this.py, tv.ia.x, tv.ia.y) < 26) {
        onTalker = true;
        this.prompt.setText("Z: talk").setVisible(true).setPosition(tv.ia.x, tv.ia.y - 44);
        if (Phaser.Input.Keyboard.JustDown(this.keyZ)) {
          const seq = tv.ia.seq();
          if (seq) { this.scene.launch("dialogue", { overlay: true, seq, bg: "town" }); this.scene.pause(); return; }
        }
      }
    }

    if (this.venue) return; // the field has no story beats/gates

    // ---- story beats (fire in place) ----
    const pend = pendingBeats(this.map);
    // cinematic beats auto-fire (arrivals, post-fight lines, scripted boss intros)
    const cine = pend.find((b) => b.cinematic);
    if (cine) { this.fireBeat(cine); return; }
    // proximity (at) beats — battles you walk into
    for (const b of pend) {
      if (b.at && Phaser.Math.Distance.Between(this.px, this.py, b.at.x, b.at.y) < (b.at.r ?? 30)) { this.fireBeat(b); return; }
    }
    // talk beats — press Z near the marked NPC
    for (const bv of this.beatViews) {
      bv.marker.setVisible(!flag(bv.beat.id));
      const t = bv.beat.talk;
      if (t && !flag(bv.beat.id) && Phaser.Math.Distance.Between(this.px, this.py, t.x, t.y) < 28) {
        onTalker = true;
        this.prompt.setText("Z: talk").setVisible(true).setPosition(t.x, t.y - 42);
        if (Phaser.Input.Keyboard.JustDown(this.keyZ)) { this.fireBeat(bv.beat); return; }
      }
    }
    if (!onTalker) this.prompt.setVisible(false);

    // ---- region gates (walk in to travel) ----
    for (const g of this.gates) {
      if (g.locked?.()) continue;
      if (this.px >= g.x && this.px <= g.x + g.w && this.py >= g.y && this.py <= g.y + g.h) {
        this.done = true;
        setLoc(g.to);
        setOwResume({ map: g.to, x: g.toX, y: g.toY });
        this.scene.restart(this.step);
        return;
      }
    }
  }

  // (re)build gate + beat visuals; safe to call again when story flags change
  private renderWorld() {
    this.worldObjs.forEach((o) => o.destroy()); this.worldObjs = [];
    this.gates = []; this.beatViews = [];
    this.renderGates();
    this.renderBeats();
  }

  private renderGates() {
    this.gates = gatesFor(this.map);
    for (const g of this.gates) {
      const locked = g.locked?.() ?? false;
      const gr = this.add.graphics().setDepth(6);
      gr.fillStyle(0x241a14, 1); gr.fillRect(g.x - 1, g.y - 1, g.w + 2, g.h + 2);
      gr.fillStyle(locked ? 0x39342e : 0x6a4a2a, 1); gr.fillRect(g.x, g.y, g.w, g.h);
      if (!locked) { gr.fillStyle(0x9a6a3a, 1); gr.fillRect(g.x, g.y, g.w, 2); }
      const t = this.add.text(g.x + g.w / 2, g.y - 9, g.label, { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(locked ? 0x7a726a : 0xe0c060) }).setOrigin(0.5).setDepth(56);
      this.worldObjs.push(gr, t);
    }
  }

  private renderBeats() {
    for (const beat of pendingBeats(this.map)) {
      let mx: number, my: number;
      if (beat.talk) {
        const t = beat.talk;
        const sh = this.add.graphics().setDepth(39); sh.fillStyle(0x000000, 0.28); sh.fillEllipse(t.x, t.y, 16, 5);
        const img = this.add.image(t.x, t.y, SPRITE_KEY[t.sprite] ?? t.sprite).setOrigin(0.5, 1).setDepth(40);
        const lbl = this.add.text(t.x, t.y - 34, t.label, { fontFamily: FONT, resolution: 4, fontSize: "8px", color: c(t.color) }).setOrigin(0.5).setDepth(55);
        this.worldObjs.push(sh, img, lbl);
        mx = t.x; my = t.y;
      } else if (beat.at && !beat.cinematic) { mx = beat.at.x; my = beat.at.y; }
      else continue; // cinematic beats need no marker
      const m = this.add.text(mx, my - 46, "!", { fontFamily: FONT, resolution: 4, fontSize: "16px", color: c(0xfee761) }).setOrigin(0.5).setDepth(56);
      this.tweens.add({ targets: m, y: my - 50, duration: 500, yoyo: true, repeat: -1 });
      this.worldObjs.push(m);
      this.beatViews.push({ beat, marker: m });
    }
  }

  private fireBeat(beat: WorldBeat) {
    this.done = true;
    if (beat.kind === "dialogue") {
      // cinematic beats play over a scenic backdrop; talk beats dim the world in place
      const bg = beat.bg ?? (this.map === "marsh" ? "marsh" : this.map === "hollows" || this.map === "emberreach" ? "hollows" : "dawn");
      this.scene.launch("dialogue", { overlay: true, seq: beat.seq, doneFlag: beat.id, cinematic: beat.cinematic, bg });
      this.scene.pause();
    } else if (beat.battle) {
      setOwResume({ map: this.map, x: this.px, y: this.py, venue: this.venue ?? null });
      this.scene.start("battle", { story: { party: beat.battle.party, enemies: beat.battle.enemies, level: 1, intro: beat.battle.intro, escape: beat.battle.escape ?? false, returnLoc: this.map, doneFlag: beat.id } });
    }
  }

  // inside a building: leave via the doormat, shop at the counter, or chat with a resident
  private updateInterior() {
    if (this.exitDoor && this.pointIn(this.exitDoor)) {
      this.done = true;
      setVenue(null);                 // owResume (set on entry) drops us back at the doorstep
      this.scene.restart(this.step);
      return;
    }
    if (this.shopVendor) {
      const near = Phaser.Math.Distance.Between(this.px, this.py, this.shopVendor.x, this.shopVendor.y) < 30;
      this.prompt.setText("Z: shop").setVisible(near).setPosition(this.shopVendor.x, this.shopVendor.y - 28);
      if (near && Phaser.Input.Keyboard.JustDown(this.keyZ)) { this.scene.launch("shop", { kind: this.shopVendor.shop }); this.scene.pause(); return; }
      return;
    }
    let onTalker = false;
    for (const tv of this.talkViews) {
      if (tv.ia.active() && Phaser.Math.Distance.Between(this.px, this.py, tv.ia.x, tv.ia.y) < 28) {
        onTalker = true;
        this.prompt.setText(`Z: ${tv.ia.prompt ?? "talk"}`).setVisible(true).setPosition(tv.ia.x, tv.ia.y - 28);
        if (Phaser.Input.Keyboard.JustDown(this.keyZ)) {
          if (tv.ia.action) { tv.ia.action(); return; }
          const seq = tv.ia.seq();
          if (seq) { this.scene.launch("dialogue", { overlay: true, seq, bg: "clinic" }); this.scene.pause(); return; }
        }
      }
    }
    if (!onTalker) this.prompt.setVisible(false);
  }
}
