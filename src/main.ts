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

const GAME_W = 384;
const GAME_H = 216;

/**
 * Largest whole-number multiple of the 384x216 canvas that fits the window.
 *
 * Must be an integer. At a fractional zoom -- which Phaser.Scale.FIT produces
 * on essentially every window size -- nearest-neighbour sampling gives some
 * source pixels three screen pixels and their neighbours two, so the pixel
 * grid is visibly uneven and no amount of sprite work can survive it.
 * Letterboxing the remainder is the price, and it is worth paying.
 */
function integerZoom(): number {
  const margin = 0.94; // breathing room, matching the old container width
  const fit = Math.min((window.innerWidth * margin) / GAME_W, (window.innerHeight * margin) / GAME_H);
  return Math.max(1, Math.floor(fit));
}

function start() {
  // Screenshot-harness mode (?shot=...). Seeds RNG before any scene is built;
  // a no-op during normal play. See BRIEF.md §5.
  const shot = beginShotMode();

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    width: GAME_W,
    height: GAME_H,
    parent: "game",
    backgroundColor: "#181425",
    pixelArt: true, // NEAREST filtering -> crisp pixels when scaled
    // Shot mode reads pixels back off the canvas, which a WebGL context
    // discards after each frame unless asked to keep them. Off during normal
    // play -- it costs performance for nothing.
    render: shot ? { preserveDrawingBuffer: true } : undefined,
    scale: {
      // NONE + an integer zoom, never FIT: FIT stretches to the container and
      // lands on a fractional multiple. Shot mode pins 1 so a capture never
      // depends on the harness viewport.
      mode: Phaser.Scale.NONE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      zoom: shot ? 1 : integerZoom(),
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

    // Re-pick the integer zoom when the window changes. Skipped in shot mode,
    // where the zoom is pinned.
    if (!shot) {
      let last = game.scale.zoom;
      window.addEventListener("resize", () => {
        const z = integerZoom();
        if (z === last) return; // most resizes do not cross a step boundary
        last = z;
        game.scale.setZoom(z);
      });
    }

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
