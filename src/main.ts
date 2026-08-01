import Phaser from "phaser";
import { BattleScene } from "./BattleScene";
import { TitleScene } from "./TitleScene";
import { CampScene } from "./CampScene";
import { DialogueScene } from "./DialogueScene";
import { OverworldScene } from "./OverworldScene";
import { PartyMenuScene } from "./PartyMenuScene";
import { ShopScene } from "./ShopScene";
import { resumeAudio, toggleMute } from "./audio";
import { applyShot, beginShotMode } from "./debugBoot";

function start() {
  // Screenshot-harness mode (?shot=...). Seeds RNG before any scene is built;
  // a no-op during normal play. See BRIEF.md §5.
  const shot = beginShotMode();

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    width: 384,
    height: 216,
    parent: "game",
    backgroundColor: "#181425",
    pixelArt: true, // NEAREST filtering -> crisp pixels when scaled
    // Shot mode reads pixels back off the canvas, which a WebGL context
    // discards after each frame unless asked to keep them. Off during normal
    // play -- it costs performance for nothing.
    render: shot ? { preserveDrawingBuffer: true } : undefined,
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
    const grab = () => { cv.focus(); resumeAudio(); }; // start audio on first gesture (browser policy)
    cv.addEventListener("pointerdown", grab);
    window.addEventListener("keydown", (e) => { resumeAudio(); if (e.key === "m" || e.key === "M") toggleMute(); });
    window.addEventListener("focus", grab);
    grab();
    if (shot) applyShot(game, shot);
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
