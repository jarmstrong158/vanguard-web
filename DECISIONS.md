# Decisions

Deviations from [BRIEF.md](BRIEF.md), newest first. One line each, with the reason.

## Milestone 3 — backgrounds

- **Ground texture is placed on a jittered 3×2 lattice, one tuft per cell, not per pixel.** Rolling every pixel independently at a density high enough to be visible produced isolated orphan pixels — static, not grass (style guide §8.6). Trading a visible repeat for noise is not a fix.
- **The ground gets only a 0.12 aerial lift where the mountains get up to 0.72.** Lifting the ground toward the sky as hard as the far ranges is "correct" aerial perspective and destroys figure/ground: measured, it put the field within 3.5 luma of the sprites standing on it, worse than the flat baseline's 10. Now 6.5, with the actors the lightest thing below the horizon apart from the UI. The §8 value-structure criterion outranks physical correctness here.
- **Four depth ranges, separated by value alone.** Detail does not read at this size; value does. The farthest range sits at 72% blended toward the sky and is deliberately almost invisible.

## Milestone 2 — shade derivation layer and Maren

- **Maren's sprite uses 32 colours, not the 15 in §1.** Ten materials at the three-shade minimum cannot fit 15. The budget is a SNES hardware convention with no equivalent constraint in a canvas renderer, whereas the three-shade rule is what stops a sprite reading as flat — so the budget gave way. The set is still *bounded and declared*: `marenPalette()` enumerates it and every pixel is snapped to its nearest entry at bake time, which is what actually buys cohesion. Unbounded, he measured 57.
- **Skin shadows shift toward rose (hue 0.98), not the blue-violet used for everything else.** Style guide §2.3 asks for blue-violet shadows generally but red-brown/rosy for skin specifically. Shifting skin's 27° hue toward blue travels through yellow-green and the shaded half of the face comes out olive. Hue interpolation also now takes the short way around the circle; a linear lerp was the mechanism.
- **Cast-shadow depths are explicit palette entries.** A cast shadow darkens past its own ramp's shadow step, and without an entry at that depth and hue, nearest-colour snapping sent deep cool brown to dark green. Three entries added (skin, tunic, pants).
- **Maren's head is narrower than the torso and has a neck row; the staff is held clear of the arm.** The flat-fill silhouette was an unreadable blob — head and torso were both 12px wide, and the staff sat flush against the arm. §2.2's silhouette test failed until the geometry changed. Applied via opt-in parameters on `chibi()`, so the unmigrated cast is untouched.
- **The eye catch-light is gold, not Conduit cyan.** Cyan on a 2px iris reads as blue eyes and contradicts the hazel in `docs/characters/maren.md`. Cyan is now reserved for the staff crystal.
- **Contact-sheet and focus shots were added to the §5 harness during milestone 2, not milestone 1.** The gate could not be judged without them: cohesion is invisible in a scene, where a sprite only ever appears alone.

## Milestone 1 — harness and integer scaling

- **The game clock is stepped by hand in shot mode rather than by requestAnimationFrame.** rAF never fires in a hidden or headless tab, so captures came out blank. Synthetic timestamps are also more reproducible than real frames.
- **Shot state marks every `WORLD_BEAT` as seen.** A fresh save has no story flags, so arriving anywhere fired that location's cutscene and the capture landed on a dialogue box.
- **`tsconfig.json` gained `noEmit`.** Outside the brief's scope, but `npm run build` was emitting 17 `.js` files into `src/` and vitest was running the suite twice, the second time against stale compiled output.
