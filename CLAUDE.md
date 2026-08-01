# Vanguard (web)

## Build brief

The authoritative spec for the current work is [BRIEF.md](BRIEF.md). Read it before
making visual changes. Its prime directive settles ambiguity, and its §8 acceptance
criteria define done. Record every deviation in `DECISIONS.md`, one line each.

The art specification it defers to is `docs/sprite_style_guide.md` in the sibling
Godot repo (`../vanguard/docs/sprite_style_guide.md`). Where the two disagree, the
style guide wins.

## Look at your own output

This project exists in the browser specifically so an agent can see what it drew.
Never ask the user what something looks like — capture it.

```bash
npm run shots
```

Writes `docs/shots/<label>/` with each fixed scene at 1×, 4×, and greyscale for the
scenes that need a value-structure check. Output is byte-identical across runs
(seeded RNG, manually stepped clock, no randomness in sprite generation), so any
pixel difference between two runs is a real change, not noise.

Compare against `docs/shots/00-baseline/` — captured before any art work began.

Individual scenes can be opened directly in a browser:
`http://localhost:5173/?shot=battle&seed=1&frames=90` (`title`, `overworld`,
`battle`, `party`). In the page, `window.VG_SHOT.advance(n)` steps further and
`window.VG_SHOT.capture()` returns a PNG data URL.

Shot mode is inert without the `?shot=` parameter and never writes to localStorage,
so it cannot disturb a real save.
