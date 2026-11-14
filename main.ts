// Cinderline — entry program for the threejs-fps-02 bounty (Node 22, standard library only).
//
// The game itself is the static site under game/: plain ES modules, three.js 0.187.0 vendored
// beside it, no build step and no network. This program hands it in. It copies game/ and
// screenshots/ from beside this file into the output directory and writes dossier.json there
// with buildDossier from the kit's library (vendor/makefun-threejs.ts, copied unchanged), so
// the dossier the judge reads is exactly the one the gate rebuilds and compares byte for byte.
//
// Run it the way the grader does, or locally with an override:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Two runs over the same repository write the same bytes: the copy is a plain recursive copy
// and buildDossier sorts everything it lists.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The gate's own caps, passed to buildDossier so an entry the scorer would refuse is refused
// here first: at most 4 screenshots of 256 KiB, at most 993 entries and 48 MiB under game/,
// and the judge's source text capped at 160 KiB.
const CAPS = {
  text_max_bytes: 163_840,
  screenshots: { max: 4, max_bytes: 262_144 },
  game_max_files: 993,
  game_max_bytes: 50_331_648,
} as const;

mkdirSync(outDir, { recursive: true });
cpSync(join(repoDir, 'game'), join(outDir, 'game'), { recursive: true });

const shotsDir = join(repoDir, 'screenshots');
if (existsSync(shotsDir)) {
  cpSync(shotsDir, join(outDir, 'screenshots'), { recursive: true });
}

writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, CAPS));
