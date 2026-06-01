import Phaser from "phaser";
import { BattleScene } from "./BattleScene";
import { TitleScene } from "./TitleScene";
import { CampScene } from "./CampScene";
import { DialogueScene } from "./DialogueScene";
import { OverworldScene } from "./OverworldScene";
import { PartyMenuScene } from "./PartyMenuScene";
import { ShopScene } from "./ShopScene";

function start() {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    width: 384,
    height: 216,
    parent: "game",
    backgroundColor: "#181425",
    pixelArt: true, // NEAREST filtering -> crisp pixels when scaled
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [TitleScene, BattleScene, CampScene, DialogueScene, OverworldScene, PartyMenuScene, ShopScene],
  });
  (window as unknown as { game: Phaser.Game }).game = game;

  // Keep keyboard input alive after the window/canvas loses and regains focus.
  game.events.once("ready", () => {
    const cv = game.canvas;
    cv.setAttribute("tabindex", "0");
    cv.style.outline = "none";
    const grab = () => cv.focus();
    cv.addEventListener("pointerdown", grab);
    window.addEventListener("focus", grab);
    grab();
  });
}

// Wait for the pixel font so the first frame isn't drawn in a fallback face.
const fonts = (document as unknown as { fonts?: { ready: Promise<unknown>; load: (s: string) => Promise<unknown> } }).fonts;
if (fonts?.load) {
  Promise.all([fonts.load('8px "Silkscreen"'), fonts.load('700 8px "Silkscreen"')])
    .then(() => fonts.ready)
    .then(start)
    .catch(start);
} else {
  start();
}
