# Vanguard (web)

A GBA/SNES-era turn-based JRPG built in **TypeScript + Phaser 3 + Vite**, with hand-baked
pixel-art sprites and a sim-tuned combat engine. A web port of the Godot "Vanguard" project.

You play **Maren**, a support-focused "Conduit" who amplifies allies, defending the village of
Thornwall and the shattered continent of Aethara from the Ashguard.

## Features
- **Connected, walkable world** (FF4 / Golden Sun style): regions linked by gates that unlock
  with story progress; story beats fire in place as you reach a spot or talk to an NPC.
- **Classic-JRPG combat**: physical/magical formulas, elements & weaknesses, statuses, crits,
  a tick-rate turn queue, boss phase changes, and the Conduit Pulse free-action system.
- **Random encounters** in the wild; visible nodes for bosses/forced fights.
- **Towns with enterable buildings** — consumable + equipment shops, homes — and a **Marks** economy.
- **Party menu**: equip/unequip gear, browse skills and classes.
- **Repeatable bounty quest** in a starter grinding field.
- **Headless balance simulator** (`sim/sim.ts`) that reuses the real combat code to report
  difficulty curves by level.
- Saves to `localStorage`.

## Run it
```bash
npm install
npm run dev      # Vite dev server on http://localhost:5173
```
On Windows you can also double-click **`play.bat`** to launch the game in its own window.

## Balance sim
```bash
node_modules/.bin/esbuild sim/sim.ts --bundle --platform=node --outfile=sim/out.cjs && node sim/out.cjs
```

## Project layout
- `src/main.ts` — Phaser bootstrap + scene list
- `src/OverworldScene.ts` — the connected walkable world (regions, gates, story beats, encounters)
- `src/BattleScene.ts` — turn-based battle UI
- `src/DialogueScene.ts` — visual-novel dialogue boxes (FF-style window)
- `src/PartyMenuScene.ts` / `src/ShopScene.ts` — menus
- `src/combat.ts` / `src/data.ts` — combat engine + all game data
- `src/story.ts` — world graph, story beats, dialogue, save/load
- `src/sprites.ts` — procedural pixel-art sprite baker
