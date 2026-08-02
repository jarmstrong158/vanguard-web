# Decisions

Deviations from [BRIEF.md](BRIEF.md), newest first. One line each, with the reason.

## Milestone 7 (partial) — making the criteria measurable

- **Palette tests assert the DECLARATIONS, not baked pixels.** Baking needs a canvas; a test that cannot run in CI is a test that stops running. Since every pixel is snapped to its character's declared palette at bake time, a bound on the declaration is a bound on the sprite.
- **Two of my own test assumptions were wrong and were corrected, not the code.** (1) "Shadows always shift hue" fails for a base already sitting on the shadow target, and for dark bases where a few degrees of rotation quantises away in 8-bit. (2) "Skin rotates toward red, cloth rotates the other way" is false: from a ~27° base the short way to blue-violet *also* runs backwards through red, so direction carries no information. Replaced with the property that actually matters — shaded skin must stay in the warm band.
- **`eye` is excluded from the base-clash check.** It is a 2px accent on skin, never adjacent to hair, and its job is to be the darkest thing on the face. The check did find a real bug first: `villager2.eye` was byte-identical to its hair, left over from extracting palettes out of draw code.
- **Frame time is now measured by a separate rAF-mode probe (`npm run perf`), not by the screenshot harness.** The harness drives the clock by hand so captures reproduce; that same property makes its timings meaningless for performance. `?perf=1` settles the scene with the manual clock, then hands it back to requestAnimationFrame and samples 600 real deltas.
- **What the probe measures is per-frame WORK, not delivered frame rate.** It runs headless with `--disable-gpu-vsync`, so rAF fires unthrottled (~1300 fps) and each delta is the cost of a step rather than a 16.6 ms display interval. Measured: mean 0.35–0.80 ms, worst single frame 13.7 ms, 0% of frames over the 16.6 ms budget across all four scenes. That is strong evidence §8's budget is met and is *not* the same claim as "verified 60 FPS on the target machine" — a real-display check is still outstanding.

## Milestone 6 (partial) — impact and idle

- **Text shadows are installed by patching the Text factory once, not by wrapping ~60 `add.text` call sites.** A rule enforced by remembering to wrap each call is a rule that decays the first time someone adds a scene. Closes §8's text-legibility criterion across all six scenes, including the four never edited by hand.
- **Idle breathe runs only in the command phase.** During an action the tweens own `img.y`, and two writers on one property produce a stutter rather than a breath. Phase offsets are per-actor and deterministic so no two are in step.
- **Knockback stays at 6px against the brief's stated 1–2px.** At 384×216 with 32px sprites, 2px does not read as impact; the existing 6px does. The brief's figure was written before the canvas size was checked (it also assumed 320×180).
- **Correction to earlier notes in this file and in several claim summaries:** §2.6 contains no "four-phase attack timing table". That phrase came from the EMBERCLASH example brief bundled with the `implementation-brief` skill, not from this document. §2.6 asks for style-guide timings, the three impact cues, idle phase offsets, and secondary motion — nothing else.
- **Camera shake capped at 2px.** §2.6 says "keep the shake at 2px maximum"; the existing calls used Phaser intensities of 0.008 and 0.012, which on a 384px viewport are 3.1px and 4.6px. Now expressed as `SHAKE_2PX = 2 / W` so the cap cannot drift when the viewport changes.
- **Idle breathe retimed to the style guide's ~600 ms per frame** (it was 800).
- **Secondary motion (hair/satchel lag) is deferred, with a reason.** Each character bakes to a single texture, so there is no hair layer to lag: implementing it means splitting every sprite into body + trailing parts and compositing at draw time. That is a change to the sprite pipeline, not a tweak, and it is the one §2.6 item genuinely out of proportion to its payoff right now. Recorded as outstanding, not as done.

## Milestone 5 — UI

- **`ffWindow()` kept its name and signature but now delegates to `art/ui.ts`.** Five scenes call it; changing the look in one place beat touching five call sites, and the old name is accurate again only in spirit — it is no longer a Final Fantasy gradient window.
- **The selection highlight is a value step plus a bevel, not a hue change.** §8 requires it to be identifiable in greyscale. Measured luma delta against an unselected cell went 35.5 → 47.0; the old saturated blue was legible but modest once desaturated.
- **Text shadows are applied in BattleScene only so far.** The `shadowed()` helper exists and the battle menus use it; DialogueScene, ShopScene, PartyMenuScene, OverworldScene and CampScene still add unshadowed text. §8's "all text is legible over its actual background" is therefore **not yet fully met** — remaining work, not an accepted deviation.

## Milestone 4b — the rest of the cast

- **Senna's vest was lightened from `0x3a2d26` to `0x5c4838`.** Measured against the milestone 3 ground she sat at dv +1.2 — the same value as the field she stands on — so she read as a hole rather than a character. This predates the migration; the harness only made it visible. Same failure as the Shadow Creeper, found the same way.
- **Every humanoid moved to the narrowed head and neck (`headW: 10`).** The silhouette fix proven on Maren applies to the whole cast; leaving the default would have made him the only character whose outline reads.
- **`townsfolk()` takes its eye colour as a parameter** rather than hard-coding one, so the three NPC variants can be declared entries like everyone else.

## Milestone 4a — enemy sprites

- **Enemy palettes are declared in `BEASTS` and built by a generic `paletteFor()`,** rather than one hand-written palette function per character. Maren's bespoke `marenPalette()` was worth writing once to find out what the helper needed; repeating it nineteen times would not be.
- **The Shadow Creeper's base value was tuned to the ground it stands on, not to its own sprite.** Giving it a brighter violet ramp so it had "visible form" per §2.3 looked right in isolation and dropped its contrast against the field from 12.5 to 2.0 — it would have vanished in play. Darkened until contrast came back to 12.3 with the ramp intact. Sprite values are a property of the scene, not of the sprite.

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
