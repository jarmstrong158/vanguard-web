# VANGUARD — Visual Fidelity Pass · Implementation Brief

You are the sole engineer and pixel artist on a finished-but-ugly JRPG. Build it end to end. This document is the spec, the art direction, and the acceptance criteria.

Every sprite, tile, and background in this project is generated procedurally in TypeScript. There are no art files. Changing how the game looks means changing code, which means the whole visual bar is reachable by an agent that can see its own output — which, in this repo, it can.

## 0. Prime directive

**Rendered fidelity to the GBA-era bar is the product.** The systems are done. Combat, story flags, towns, shops, the Conduit/Bond mechanic, the turn queue, the balance sim — all built, all playable, all out of scope. Do not add a mechanic, a scene, a region, an item, or a balance change. If you find yourself editing `combat.ts` for anything other than a visual hook, stop.

A player opens the title, walks Thornwall for a minute, and enters one battle. At the end of ninety seconds they either think *"this is a GBA cartridge I've never heard of"* or *"this is a browser prototype with coloured blocks in it."* Everything below serves that single judgment.

Two rules that override everything else in this document:

If a requirement in this brief conflicts with making a frame read better at 384×216, break the requirement. Record the deviation in `DECISIONS.md` with a one-line rationale. You have full authority to change generation techniques, restructure `sprites.ts`, or discard any prescription here that is not paying for its pixels.

**The current look is the defect specification.** Anything that reads like the screenshots in `docs/` as of this writing is a defect, not a stepping stone. Specifically, all of the following are defects:

- Characters that read as a coloured rectangle with a head on it.
- Two shades per material, derived by brightness alone with no hue shift.
- A uniform dark keyline around every sprite — the paper-doll look.
- Enemies rendered as flat single-colour silhouettes with no internal form.
- Backgrounds built from flat horizontal colour bands.
- Ground planes tiled with a uniform dot pattern that reads as noise rather than texture.
- No discernible light direction anywhere in the frame.
- A saturated pure-blue UI panel that reads as a debug overlay rather than a game window.

Do not stop at "the sprites are improved." Stop when a still frame pulled from any scene would not look out of place in a screenshot gallery next to Golden Sun.

## 1. Stack and hard constraints

| Field | Value |
|---|---|
| Language | TypeScript 5.5, strict. `npm run build` (tsc + vite build) stays clean. |
| Engine | Phaser 3.90 |
| Build | Vite 5, `npm run dev` on :5173 |
| Tests | vitest. `npm test` stays green. |
| Internal resolution | 384×216 (`main.ts`). Note this is **not** the 320×180 the style guide assumes; the guide's pixel rules still apply, the canvas is simply wider. |
| Character palette budget | 15 colours per character, transparency included |
| Shades per material | Minimum 3: shadow, base, highlight |
| Light direction | Top-left. Every sprite. No exceptions. |
| Frame target | 60 FPS with no frame over 16.6 ms |

**All art remains procedural.** No PNG, no sprite sheet, no external asset, ever. This is a stated identity of the project, not a convenience — generated art is what makes the palette globally editable and what makes this pass possible at all. An imported asset would freeze the thing this brief exists to iterate on.

**No anti-aliasing.** `pixelArt: true` stays on. If a transform produces a fractional destination coordinate, that is a defect (§3).

**Integer scaling is currently NOT enforced, and fixing that is in scope.** `main.ts` uses `Phaser.Scale.FIT`, which scales the canvas to arbitrary fractional multiples of 384×216 — so on most window sizes every pixel in the game is resampled to a non-integer size before it reaches the screen. No amount of sprite work survives that. Move to an integer-multiple scale mode (`Phaser.Scale.NONE` with a computed integer zoom, or `ScaleModes.ZOOM` pinned to `Math.floor`) and letterbox the remainder. This is milestone 1 work, not polish: until it lands, nothing rendered can be judged fairly, because what you see is not what was drawn.

`docs/sprite_style_guide.md` in the Godot Vanguard repo is the authoritative art specification. Its palette rules, hue-shift helpers, sel-out rule, anatomy ratios, animation timings, and pitfall list are **already-decided constraints**, not suggestions. This brief does not restate them; read that document before writing a pixel. Where this brief and the style guide disagree, the style guide wins and you note the conflict in `DECISIONS.md`.

## 2. Systems

### 2.1 The shade derivation layer

**This is the most important code in the project. Budget accordingly.**

Every colour in the game must come from one place. Port `_shadow()` and `_highlight()` from the style guide's GDScript into a single TypeScript module, and derive every shade in the entire codebase from a base colour through those two functions.

**No shadow or highlight colour is ever written by hand.** A literal hex for a shade is a defect even when it looks correct, because it will drift from its neighbours the first time the base colour is tuned. This single rule is what makes a global palette adjustment a one-line edit rather than an archaeology expedition.

Shadows shift toward blue-violet and desaturate. Highlights shift toward yellow and saturate slightly. Brightness-only scaling reads as plastic and is the most visible single failure in the current build.

Every character gets a declared palette object of named base colours — skin, hair, tunic, and so on — from which all shades derive. `sprites.ts` is currently 457 lines of mixed palette and geometry; separate them. Geometry describes where a material is; the palette decides what colour it becomes.

### 2.2 Party sprites

Seen constantly, at rest, in every scene. They carry the identity of the whole project.

**Three shades minimum on every material**, placed per the style guide's top-left rule: highlight on top and left edges, shadow on bottom and right, base filling the interior.

**Selective outlining.** The outline adjacent to a material uses that material's darkest shade. Pure black appears only on the outer silhouette against transparency, and interior boundaries between two of the character's own materials are never black. The current uniform keyline is the single fastest tell that these are not real GBA sprites.

**Cast shadows are what create depth at 32px**: below hair onto the forehead, below chin onto chest, below belt onto legs. Three cast shadows do more than twenty extra pixels of detail.

**Silhouette test.** Fill each party member with one flat colour and confirm they remain distinguishable. Maren's staff and satchel, Kael's sword and shield, Lida's robe — the key identifiers must survive at silhouette level. Two confusable party members is a defect, and the fix is proportion and stance, never a brighter accessory.

Respect the anatomy ratios in the style guide (head 8–9px, ~2.5–3 heads tall). Deviating makes them read as a different game from the one the guide describes.

### 2.3 Enemy sprites

Currently the weakest element in the frame by a wide margin — flat silhouettes with no internal form, which makes every battle look unfinished regardless of how good the party looks.

Enemies get the same treatment as party members: three shades, hue-shifted, top-left light, selective outlining. **A dark creature is not a black creature.** The Shadow Creeper needs a full purple-violet ramp with visible form, not a single fill.

Enemies may exceed the party's 15-colour budget where the creature genuinely needs it, but not by more than a few, and never by adding a fourth shade to a material that only needs three.

### 2.4 Backgrounds and battle stages

**Do not skip this and do not do it last.** Excellent sprites on a flat colour-band background look pasted on — the sprites will actually appear *worse* after §2.2 lands if the background stays flat, because the fidelity gap becomes visible. Budget this alongside sprites, not after.

Required behaviours:

**Depth through value, not detail.** Three or more distinct depth planes per battle stage — far, mid, near — separated by value and saturation. Distance desaturates and lifts toward the sky colour. Both existing backgrounds are two flat bands and a silhouette.

**Break the tiling.** The current ground is a uniform dot pattern that reads as noise. Ground needs irregular clustering, occasional larger forms, and value variation across the plane. No visible repeat within a single screen.

**Ground meets the horizon with a transition**, not a hard colour change. A band of intermediate value, some scatter of the near colour into the far, or an occluding treeline row.

**Anchor every actor with a contact shadow.** A small elliptical shadow under each sprite. Without it, characters float, and this is the cheapest depth cue available.

Per-region colour identity comes from the story bible's regions — Thornwall, Emberreach, Frosthollow, the Hollows, Stonemantle, Valcrest. Each gets a distinguishable palette and sky treatment, so location is readable from a still frame.

### 2.5 UI

The panel style is currently a saturated pure-blue box with a white border, which reads as a debug overlay. GBA-era UI panels use a darker, desaturated ground with a two-tone bevel: a lighter edge on the top-left, darker on the bottom-right, matching the world's light direction.

Required:

- **Text needs a 1px drop shadow or dark outline**, always. Unshadowed light text over a light background is illegible at 384×216, and that combination will occur.
- **Selection highlight must survive a greyscale check.** Colour alone is not enough.
- **HP and MP bars need a border, a dark trough, and a value-shifted fill** rather than a flat rectangle. Colour the fill by threshold so state is readable at a glance.
- The turn-order strip stays. Give its frames the same bevel treatment as panels so it belongs to the same UI system.

Negative spec: no gradients, no rounded corners, no partial alpha on any UI element, and no font that is not the existing bitmap font. Alpha is binary at this resolution.

### 2.6 Animation and impact

Timings are already specified in the style guide (§5.3) — walk ~200 ms, idle breathe ~600 ms, attack ~100 ms. Use them.

**Impact needs three simultaneous cues or it reads as nothing happened:** a white flash on the struck sprite, a 1–2px knockback, and a 2-frame hitstop. One cue alone is invisible at this resolution. Keep the shake at 2px maximum; if it looks dramatic, it is too much.

**Idle animations must not loop in phase.** Offset each actor by a per-instance amount, or the whole party breathes as one organism and the scene reads as a sprite sheet rather than a group of characters.

Secondary motion — hair, satchel, cape lagging one frame behind the body — is specified in the style guide and is disproportionately effective for how little code it costs.

## 3. The named enemy: the pixel grid

At 384×216 upscaled, a single sprite drawn at a fractional coordinate is resampled, and one soft sprite among twenty crisp ones is more visible than any other defect in this project.

Rules, all checkable by reading a diff:

- **Round at the draw boundary, not the physics boundary.** Keep sub-pixel precision in movement and tweens; floor it where it reaches a sprite position. Rounding in the simulation causes visible stutter, which is a different defect.
- **Every tween that drives a position floors its output at the consumer.** Phaser tweens produce floats by default; this is the most likely source of drift.
- **Camera position is floored before any world-to-screen transform.**
- **No sprite is ever scaled by a non-integer factor.** Size variation uses separately generated sprites.

Measurement: add a debug toggle that highlights any sprite whose position has a fractional component. Do not trust the eye — at integer zoom a half-pixel offset reads as a slightly soft edge, and you will normalise to it within an hour of looking at it.

## 4. Anticipated failure modes

**The "just add more colours" trap.** Every sprite looks improvable by adding a shade. Fifteen well-chosen hue-shifted colours look better than thirty flat ones, and the budget is what produces cohesion across the cast. Fix: assert the palette budget in a test that counts distinct colours in each generated sprite buffer and fails over 15. Run it in CI, not on request.

**Tuning at 8× on a transparent background.** A sprite polished in isolation looks wrong in the frame, because at 384×216 what matters is how it reads against its actual background at actual size. Fix: every visual judgment is made from a full-scene screenshot at 1× and at integer zoom, never from a sprite viewer. This is why §7 milestone 1 is the harness.

**Palette drift across sequential edits.** Sprites get tuned one at a time over days; each looks fine; the cast stops looking like one game. Fix: §2.1's derivation rule plus a contact sheet — one screenshot with every party member and every enemy side by side — regenerated and inspected at every milestone.

**The background gap.** Landing §2.2 without §2.4 makes the game look *worse*, because good sprites on flat bands read as pasted-on. Fix: milestones 2 and 3 are adjacent and neither ships alone.

**The reason this stalled before.** In the Godot version, the style guide itself concedes: *"The developer serves as the visual reviewer since the AI cannot see the rendered result."* That constraint is gone here — this is the entire reason vanguard-web exists. If you find yourself asking the user what something looks like instead of screenshotting it, you have reintroduced the bottleneck this port was built to remove.

## 5. The screenshot harness

The evidence channel. **Build it first — milestone 1, before touching a single sprite.** Every gate in this document is checked through it, and building it later means the early milestones are inspected by guesswork.

A script that boots the game headless and captures a fixed set of scenes to `docs/shots/<milestone>/`:

1. Title screen.
2. Thornwall overworld, Maren at a fixed position.
3. Battle against Shadow Creepers, first turn, menu open.
4. Party menu, Maren selected.
5. A contact sheet: every party member and every enemy, side by side, on a neutral mid-value ground.

Requirements:

- **The same scenes at the same positions every run.** Comparison is the whole point; a harness that captures slightly different framing each time is worthless.
- Every shot at 1× and at 4×.
- A greyscale variant of shots 2 and 3, for the value-structure check in §8.
- Committed at every milestone, so the visual history is reviewable in the diff.

Also add the runtime debug toggle: fractional-position highlighting (§3), a palette strip showing every colour in the current frame with over-budget sprites flagged, and a frame-time readout with the 1% low. Hidden by default, and never present in a normal build.

## 6. Project structure

Additions to the existing layout — do not restructure what works:

```
/src
  /art
    palette.ts       named base colours per character and region
    shading.ts       shadow()/highlight() derivation. The only source of shades.
    sprites.ts       geometry only; consumes palette + shading
  /debug
    overlay.ts       fractional-position, palette audit, frame time
/tools
  shots.ts           the screenshot harness
/docs/shots/         committed captures, one directory per milestone
DECISIONS.md         every deviation from this brief, one line each
```

## 7. Milestones

Run the harness at every milestone and commit the output.

1. **The harness.** Screenshot script, all five scenes, 1× and 4×, greyscale variants, debug overlay. No art changes. Commit the baseline captures — they are the before-shot for everything that follows.

2. **Shade derivation and one character.** `shading.ts`, `palette.ts`, and Maren fully rebuilt: three hue-shifted shades per material, top-left light, selective outlining, cast shadows. **Gate — all five must be true of Maren at 4×, checked against a harness capture, before anything else is built:** every material shows three hue-shifted shades; a cast shadow falls below the hair and below the chin; no interior boundary uses black; he remains identifiable in flat-fill silhouette; and a search for colour literals outside `palette.ts` returns nothing. **Do not proceed until all five hold.**

3. **Backgrounds.** Battle stages and overworld ground: depth planes, broken tiling, horizon transition, contact shadows. **Gate: the greyscale capture of the battle scene shows a readable value structure — background darkest, actors mid, UI highest contrast. Do not proceed until this is true.**

4. **The rest of the cast.** Remaining party members, then enemies. Contact sheet inspected at every commit for palette cohesion.

5. **UI.** Panel bevels, text shadows, bar treatment, selection highlight, turn strip.

6. **Animation and impact.** Timings, three-cue impact, idle phase offsets, secondary motion.

7. **Grid hardening and polish.** Fractional-position audit across every scene, palette-budget test in CI, frame time verified.

Milestones 2 and 3 carry the weight. If the frame does not look right with one character on one finished background, nothing downstream will fix it.

## 8. Acceptance criteria

Verify each against fresh harness output, at 1× and 4×, and in motion.

- Every character shows internal form at 1× — at least two distinct shades are visible on the torso alone, without zooming.
- Every material on every sprite shows at least three shades.
- No shade anywhere is a hand-written literal; every one derives through `shading.ts`.
- Shadows are hue-shifted cool and highlights hue-shifted warm — no material is shaded by brightness alone.
- No sprite carries a uniform black keyline. Interior boundaries use the material's darkest shade.
- Light falls from the top-left on every sprite in the game without exception.
- No character exceeds 15 colours; the CI palette test passes.
- Every party member is distinguishable in a flat-fill silhouette.
- On the contact sheet, no sprite differs from the rest of the cast in light direction, outline treatment, or shade count.
- Every enemy has visible internal form; none is a single-colour fill.
- Every battle background shows three or more depth planes separated by value.
- No ground texture visibly repeats within a single screen.
- Every actor has a contact shadow.
- The greyscale capture reads correctly: background darkest, actors mid, UI highest contrast.
- No UI panel is a flat saturated fill; every one has a two-tone bevel lit from the top-left.
- All text is legible over its actual background, with shadow or outline.
- The selection highlight is identifiable in the greyscale capture.
- Every hit shows flash, knockback, and hitstop together.
- No two actors' idle animations are in phase.
- No sprite is drawn at a fractional coordinate; the debug audit is clean in all five scenes.
- 60 FPS with no frame over 16.6 ms.
- `npm run build` is clean and `npm test` is green.

## 9. Working agreement

**Look at your own output constantly.** This is the whole reason this project exists in the browser. Run the harness, open the captures, compare against the previous milestone's. Most of the gap between "coloured blocks" and "GBA cartridge" is palette and placement tuning, and tuning is only possible by looking. Never ask the user what something looks like — take the screenshot.

**Build, don't test-loop.** The existing combat tests stay green; do not extend the suite except for the palette-budget assertion in §4. Time spent asserting pixel values is time not spent looking at them.

**Do not move on from an ugly milestone.** Milestones 2 and 3 are hard gates. Both are cheap to fix now and ruinous to fix after the whole cast is built on top of them.

**When a technique is not reading, replace it rather than layering another effect on top.** Additive fixes are how a 384×216 frame turns to mush.

**Do not touch gameplay.** No mechanic, no balance number, no story flag, no new content. If a visual change requires a hook into `combat.ts`, add the smallest possible hook and note it in `DECISIONS.md`.

Record every deviation in `DECISIONS.md`. One line is sufficient.

Make it look like a cartridge.
