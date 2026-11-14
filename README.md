# Cinderline

A round-based tactical FPS for the browser, built on three.js 0.187.0 (vendored, no build
step, no network). You lead **Ember**, four fighters attacking a dusk freight yard: buy gear
between rounds, plant the charge at the Crane Yard (A) or Fuel Row (B) and hold it while it
burns. **Sable**, four defending bots, hold the sites, react to sight and gunfire, retake
after a plant and defuse.

## Play

```sh
node serve.ts          # serves game/ at http://localhost:8080
```

Open the page, click to play. WASD moves, the mouse looks, click fires, right-click aims,
`R` reloads, `B` opens the buy menu during the buy phase, hold `E` in a site to plant.
Weapons: Kestrel P9 pistol, Raptor-9 SMG, Breacher-12 shotgun, Longbow AR, Farreach SR —
plus Shard frag, Flare flash and Veil smoke grenades, and a Kevlar vest. Accuracy is the
game: spread grows with your speed and sustained fire, so stop, crouch or walk to shoot
straight. Headshots hit up to 3.6× harder. First team to 7 rounds takes the yard.

## Layout of the entry

- `main.ts` — the hand-in program: copies `game/` and `screenshots/` to the output
  directory and writes `dossier.json` with the kit's `buildDossier`
  (`vendor/makefun-threejs.ts`, the kit's copy, unchanged).
- `game/index.html` — the page, HUD and the one import map (`three` →
  `./vendor/three/three.module.min.js`, three.js 0.187.0 byte for byte).
- `game/src/` — the game, one job per module:
  - `layout.js` the map as data (walls, props, sites, spawns, waypoint graph);
  - `world.js` builds the scene from that data; `collision.js` walks the same tables;
  - `config.js` weapons, grenades, economy and timings;
  - `player.js` the human's movement; `bots.js` bot perception, routing and plans;
  - `weapons.js` loadouts and viewmodels; `effects.js` tracers, sparks, smoke, explosions;
  - `hud.js` the DOM HUD and buy menu; `audio.js` procedural WebAudio sound;
  - `main.js` the simulation: fixed-step state, shared hitscan, rounds, plant/defuse.
- `screenshots/` — renders of the game itself, staged with the `?shot=` hook in `main.js`
  (see `shots.json`).

MIT licensed (see `LICENSE`). Everything — map, names, art, sound — is original to this
entry; the style is the genre's, the content is nobody else's.
