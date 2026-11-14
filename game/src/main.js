// Cinderline: a round-based tactical FPS in a dusk freight yard. Ember (the player and three
// bots) attack: carry the charge to the Crane Yard (A) or Fuel Row (B), plant it and hold.
// Sable (four bots) defend the sites and retake. Between rounds, money earned from kills,
// plants and round wins buys rifles, armour and grenades.
//
// This module is the simulation's one home: the match state lives in `sim`, advanced in
// fixed steps of 1/60 s from the render loop, and every shot — the player's or a bot's — is
// resolved by the same fireGun, so spread, falloff, headshots and armour behave identically
// for everyone. Rendering (camera, meshes, viewmodel, effects) reads the state after each
// step and never writes it.

import * as THREE from 'three';
import { WEAPONS, GRENADES, ROUND, ECONOMY, ARMOR_BODY_FACTOR } from './config.js';
import { SITES, SPAWNS } from './layout.js';
import { raycastWorld, lineOfSight, SOLIDS } from './collision.js';
import { buildWorld } from './world.js';
import { createEffects } from './effects.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createPlayer, stepPlayer, eyeHeight } from './player.js';
import { createBot, buildBotMesh, updateBot, syncBotMesh, botEyeY } from './bots.js';
import { createLoadout, gunState, givePrimary, createViewmodels } from './weapons.js';
import { createHud, BUY_CATALOG } from './hud.js';

const STEP = 1 / 60;
const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');

// --- Renderer and scene -------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 220);
camera.rotation.order = 'YXZ';
scene.add(camera);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const { rings } = buildWorld(scene);
// A soft warm fill on the camera so the viewmodel and nearby faces read against the dusk.
const fill = new THREE.PointLight(0xffe0b8, 2.4, 6, 1.8);
fill.position.set(0.12, -0.04, -0.25);
camera.add(fill);
const effects = createEffects(scene);
const audio = createAudio();
const hud = createHud();
const viewmodels = createViewmodels(camera);

// The charge: a dark case with an amber telltale. Carried hidden (the HUD and the carrier's
// back show it), visible on the ground when dropped or planted.
const chargeMesh = new THREE.Group();
{
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.24, 0.28), new THREE.MeshStandardMaterial({ color: 0x23262c, roughness: 0.5 }));
  body.position.y = 0.12;
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.1), new THREE.MeshStandardMaterial({ color: 0xff5030, emissive: 0xff2a18, emissiveIntensity: 2 }));
  lamp.position.y = 0.27;
  lamp.name = 'lamp';
  chargeMesh.add(body, lamp);
  chargeMesh.visible = false;
  scene.add(chargeMesh);
}

// --- State --------------------------------------------------------------------
const EMBER_NAMES = ['Vex', 'Ondo', 'Pell'];
const SABLE_NAMES = ['Rusk', 'Hale', 'Mira', 'Tonn'];
const DEFEND_HOLDS = [
  { site: 0, node: 15, yaw: 2.36, crouch: true },
  { site: 0, node: 13, yaw: 1.57, crouch: false },
  { site: 1, node: 7, yaw: 1.91, crouch: false },
  { site: 1, node: 22, yaw: Math.PI, crouch: true },
];
const HOLD_OFFSETS = [{ x: 5.5, z: 3 }, { x: -6, z: 2.5 }, { x: 4, z: -5.5 }, { x: -4.5, z: -6 }];

const sim = {
  now: 0,
  started: false,
  phase: 'buy',
  phaseAt: 0,
  round: 1,
  roundsWon: [0, 0],
  fighters: [],
  player: null,
  planted: null, // { site, x, z, fuseAt, beepAt }
  chargeDropped: null, // { x, z }
  siteChoice: 0,
  noise: [],
  noiseId: 0,
  buyOpen: false,
  prevFiring: false,
  selectedGrenade: null,
  winner: -1,
};
const projectiles = [];

function pushNoise(x, z, kind, team) {
  sim.noise.push({ id: ++sim.noiseId, x, z, kind, team, at: sim.now });
  if (sim.noise.length > 28) sim.noise.splice(0, sim.noise.length - 28);
}

function makeFighters() {
  const player = createPlayer(SPAWNS[0][0]);
  player.money = ECONOMY.start;
  player.kit = { primaryId: null, armor: false };
  player.kitKept = false;
  sim.player = player;
  sim.fighters = [player];
  EMBER_NAMES.forEach((name, i) => {
    const b = createBot(0, name, SPAWNS[0][i + 1], 0.45 + i * 0.1);
    b.money = ECONOMY.start;
    b.kit = { primaryId: null, armor: false };
    b.kitKept = false;
    b.mesh = buildBotMesh(0);
    scene.add(b.mesh);
    sim.fighters.push(b);
  });
  SABLE_NAMES.forEach((name, i) => {
    const b = createBot(1, name, SPAWNS[1][i], 0.5 + (i % 3) * 0.1);
    b.money = ECONOMY.start;
    b.kit = { primaryId: null, armor: false };
    b.kitKept = false;
    b.mesh = buildBotMesh(1);
    scene.add(b.mesh);
    const hold = DEFEND_HOLDS[i];
    b.plan = { job: 'defend', site: hold.site, holdNode: hold.node, crouch: hold.crouch };
    b.holdYaw = hold.yaw;
    sim.fighters.push(b);
  });
}

function buildLoadout(f) {
  const lo = createLoadout();
  if (f.kitKept && f.kit.primaryId) givePrimary(lo, f.kit.primaryId);
  lo.armor = Boolean(f.kitKept && f.kit.armor);
  lo.current = lo.primary ? 'primary' : 'pistol';
  return lo;
}

function botBuy(b) {
  const lo = b.loadout;
  if (!lo.primary) {
    if (b.money >= WEAPONS.rifle.price && Math.random() < 0.75) { b.money -= WEAPONS.rifle.price; givePrimary(lo, 'rifle'); }
    else if (b.money >= WEAPONS.smg.price) { b.money -= WEAPONS.smg.price; givePrimary(lo, Math.random() < 0.5 ? 'smg' : 'shotgun'); }
  }
  if (!lo.armor && b.money >= 650 + 300) { b.money -= 650; lo.armor = true; }
  if (Math.random() < 0.4 && b.money >= GRENADES.frag.price) { b.money -= GRENADES.frag.price; lo.grenades.frag = 1; }
  b.kit = { primaryId: lo.primary?.id ?? null, armor: lo.armor };
}

function startMatch() {
  sim.round = 1;
  sim.roundsWon = [0, 0];
  sim.winner = -1;
  for (const f of sim.fighters) {
    f.money = ECONOMY.start;
    f.kills = 0; f.deaths = 0;
    f.kit = { primaryId: null, armor: false };
    f.kitKept = false;
  }
  startRound();
}

function startRound() {
  sim.planted = null;
  sim.chargeDropped = null;
  sim.siteChoice = Math.random() < 0.5 ? 0 : 1;
  projectiles.length = 0;
  chargeMesh.visible = false;
  let emberSlot = 0, sableSlot = 0;
  for (const f of sim.fighters) {
    const spawn = f.team === 0 ? SPAWNS[0][emberSlot++] : SPAWNS[1][sableSlot++];
    f.x = spawn.x; f.z = spawn.z; f.y = 0;
    f.vx = 0; f.vz = 0; f.vy = 0;
    f.yaw = spawn.yaw; f.pitch = 0;
    f.hp = 100; f.alive = true; f.crouch = false;
    f.blindUntil = 0; f.hurtAt = -10; f.lastAttacker = null;
    f.hasCharge = false;
    f.loadout = buildLoadout(f);
    if (!f.isPlayer) {
      f.seenRef = null; f.seenAt = -10; f.investigateUntil = -1;
      f.wantPlant = false; f.wantDefuse = false;
      f.burstLeft = 0; f.burstPauseUntil = 0; f.nextShotAt = 0;
      if (f.mesh) { f.mesh.rotation.x = 0; f.mesh.position.y = 0; f.mesh.visible = true; }
      if (f.team === 0) f.plan = { job: 'attack', site: sim.siteChoice, holdNode: -1, crouch: false };
    }
  }
  sim.player.hasCharge = true;
  for (const f of sim.fighters) if (!f.isPlayer) botBuy(f);
  sim.phase = 'buy';
  sim.phaseAt = sim.now + ROUND.buySeconds;
  sim.buyOpen = true;
  sim.selectedGrenade = null;
  hud.banner(`ROUND ${sim.round}`, `Ember attacks ${sim.siteChoice === 0 ? 'the Crane Yard (A)' : 'Fuel Row (B)'} — buy your gear`, 2.6, sim.now);
}

function endRound(winner, reason) {
  sim.roundsWon[winner]++;
  for (const f of sim.fighters) {
    f.money = Math.min(ECONOMY.max, f.money + (f.team === winner ? ECONOMY.win : ECONOMY.loss));
    f.kitKept = f.alive;
    if (!f.alive) f.kit = { primaryId: null, armor: false };
    f.channelK = 0;
  }
  sim.phase = 'end';
  sim.phaseAt = sim.now + ROUND.endSeconds;
  sim.buyOpen = false;
  const playerWon = winner === 0;
  hud.banner(playerWon ? 'ROUND WON' : 'ROUND LOST', reason, ROUND.endSeconds - 0.4, sim.now);
  if (playerWon) audio.roundWin(); else audio.roundLose();
}

function aliveCount(team) {
  return sim.fighters.reduce((n, f) => n + (f.alive && f.team === team ? 1 : 0), 0);
}

// --- Sight and damage ---------------------------------------------------------
function fighterEyeY(f) { return f.isPlayer ? eyeHeight(f) : botEyeY(f); }
function headY(f) { return f.crouch ? 1.3 : 1.52; }
function chestY(f) { return f.crouch ? 1.0 : 1.25; }

function canSee(a, b) {
  const ay = fighterEyeY(a) + (a.y ?? 0);
  if (!lineOfSight(a.x, ay, a.z, b.x, chestY(b), b.z)) return false;
  return !effects.smokeBlocks(a.x, ay, a.z, b.x, chestY(b), b.z, sim.now);
}

// Ray vs one fighter, as three spheres that match the bot meshes: head, chest and hips.
// The nearest hit wins, and the part names the damage row. Returns { t, part } or null.
function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, maxT) {
  const ex = cx - ox, ey = cy - oy, ez = cz - oz;
  const t = ex * dx + ey * dy + ez * dz;
  if (t <= 0 || t >= maxT) return -1;
  const px = ox + dx * t - cx, py = oy + dy * t - cy, pz = oz + dz * t - cz;
  return px * px + py * py + pz * pz < r * r ? t : -1;
}

function hitFighter(ox, oy, oz, dx, dy, dz, f, maxT) {
  let best = null;
  const th = raySphere(ox, oy, oz, dx, dy, dz, f.x, headY(f), f.z, 0.24, maxT);
  if (th > 0) best = { t: th, part: 'head' };
  const tc = raySphere(ox, oy, oz, dx, dy, dz, f.x, f.crouch ? 0.82 : 1.08, f.z, 0.42, best ? best.t : maxT);
  if (tc > 0) best = { t: tc, part: 'body' };
  const tl = raySphere(ox, oy, oz, dx, dy, dz, f.x, 0.45, f.z, 0.38, best ? best.t : maxT);
  if (tl > 0) best = { t: tl, part: 'legs' };
  return best;
}

function applyDamage(target, dmg, attacker, part) {
  if (!target.alive || sim.phase !== 'live') return;
  if (part === 'body' && target.loadout?.armor) dmg *= ARMOR_BODY_FACTOR;
  if (part === 'legs') dmg *= 0.75;
  target.hp -= dmg;
  target.hurtAt = sim.now;
  target.lastAttacker = attacker;
  if (!target.isPlayer) target.flashAt = sim.now;
  if (attacker?.isPlayer) {
    hud.hitmark(sim.now, target.hp <= 0);
    audio.hit(part === 'head');
  }
  if (target.isPlayer) audio.hurt();
  if (target.hp > 0) return;
  target.alive = false;
  target.deaths++;
  target.hp = 0;
  if (attacker && attacker !== target) {
    attacker.kills++;
    attacker.money = Math.min(ECONOMY.max, attacker.money + ECONOMY.kill);
    const aTeam = attacker.team === 0 ? 'ember' : 'sable';
    const tTeam = target.team === 0 ? 'ember' : 'sable';
    hud.feed(`<b class="${aTeam}">${attacker.name}</b> ▸ <b class="${tTeam}">${target.name}</b>${part === 'head' ? ' · headshot' : ''}`);
    if (attacker.isPlayer) audio.kill();
  }
  if (target.hasCharge) {
    target.hasCharge = false;
    sim.chargeDropped = { x: target.x, z: target.z };
    chargeMesh.visible = true;
    chargeMesh.position.set(target.x, 0, target.z);
    hud.feed('The charge is down', '#f0a830');
  }
}

// Fire one pellet of one shot and resolve it against the world and every enemy fighter.
function resolvePellet(shooter, ox, oy, oz, dx, dy, dz, def, hostile) {
  const range = 130;
  let bestT = raycastWorld(ox, oy, oz, dx, dy, dz, range);
  let bestFighter = null, bestPart = null;
  for (const o of sim.fighters) {
    if (o === shooter || !o.alive || o.team === shooter.team) continue;
    const hit = hitFighter(ox, oy, oz, dx, dy, dz, o, bestT);
    if (hit) { bestT = hit.t; bestFighter = o; bestPart = hit.part; }
  }
  const ex = ox + dx * bestT, ey = oy + dy * bestT, ez = oz + dz * bestT;
  effects.tracer(ox, oy, oz, ex, ey, ez, hostile);
  if (bestFighter) {
    const fall = 1 / (1 + Math.max(0, bestT - def.falloff) / def.falloff);
    applyDamage(bestFighter, def.damage * fall, shooter, bestPart);
    effects.sparks(ex, ey, ez, true);
  } else if (bestT < range) {
    effects.sparks(ex, ey, ez, false);
  }
}

// One trigger pull for fighter f with explicit aim direction (unit vector components).
function fireGun(f, dirX, dirY, dirZ, spreadScale) {
  const lo = f.loadout;
  const gun = gunState(lo);
  const def = WEAPONS[gun.id];
  if (sim.now < lo.reloadingUntil) return false;
  if (sim.now - lo.lastShotAt < 60 / def.rpm) return false;
  if (gun.mag <= 0) {
    lo.lastShotAt = sim.now;
    if (f.isPlayer) audio.dryFire();
    startReload(f);
    return false;
  }
  lo.lastShotAt = sim.now;
  gun.mag--;
  lo.bloom = Math.min(0.02, lo.bloom + def.bloom);
  const speedK = Math.min(1, (f.speedNow ?? 0) / 4.6);
  let spread = (def.spread + def.moveSpread * speedK + lo.bloom) * spreadScale;
  if (f.crouch) spread *= 0.75;
  const ox = f.x, oy = (f.y ?? 0) + fighterEyeY(f) - 0.08, oz = f.z;
  // Orthonormal basis around the aim direction for the spread cone.
  const upX = 0, upY = 1, upZ = 0;
  let rx = dirY * upZ - dirZ * upY, ry = dirZ * upX - dirX * upZ, rz = dirX * upY - dirY * upX;
  const rl = Math.hypot(rx, ry, rz) || 1;
  rx /= rl; ry /= rl; rz /= rl;
  const ux = ry * dirZ - rz * dirY, uy = rz * dirX - rx * dirZ, uz = rx * dirY - ry * dirX;
  for (let p = 0; p < def.pellets; p++) {
    const a = (Math.random() * 2 - 1) * spread;
    const b = (Math.random() * 2 - 1) * spread;
    let px = dirX + rx * a + ux * b;
    let py = dirY + ry * a + uy * b;
    let pz = dirZ + rz * a + uz * b;
    const pl = Math.hypot(px, py, pz) || 1;
    resolvePellet(f, ox, oy, oz, px / pl, py / pl, pz / pl, def, !f.isPlayer);
  }
  effects.muzzle(ox + dirX * 0.7, oy + dirY * 0.7, oz + dirZ * 0.7);
  audio.shot(def.kind, f.isPlayer ? 0 : Math.hypot(f.x - sim.player.x, f.z - sim.player.z));
  pushNoise(f.x, f.z, 'shot', f.team);
  if (gun.mag === 0) startReload(f);
  return true;
}

function startReload(f) {
  const lo = f.loadout;
  const gun = gunState(lo);
  const def = WEAPONS[gun.id];
  if (gun.reserve <= 0 || gun.mag >= def.mag || sim.now < lo.reloadingUntil) return;
  lo.reloadingUntil = sim.now + def.reloadMs / 1000;
  lo.reloadPending = true;
  if (f.isPlayer) audio.reload();
}

function finishReloads() {
  for (const f of sim.fighters) {
    const lo = f.loadout;
    if (!lo?.reloadPending || sim.now < lo.reloadingUntil) continue;
    lo.reloadPending = false;
    const gun = gunState(lo);
    const def = WEAPONS[gun.id];
    const take = Math.min(def.mag - gun.mag, gun.reserve);
    gun.mag += take;
    gun.reserve -= take;
  }
}

// --- Grenades -------------------------------------------------------------------
function throwGrenade(f, type) {
  const lo = f.loadout;
  if (lo.grenades[type] <= 0) return;
  lo.grenades[type]--;
  const cp = Math.cos(f.pitch);
  const dx = -Math.sin(f.yaw) * cp, dy = Math.sin(f.pitch) + 0.32, dz = -Math.cos(f.yaw) * cp;
  const dl = Math.hypot(dx, dy, dz);
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshStandardMaterial({ color: type === 'frag' ? 0x51603a : type === 'flash' ? 0xd8d8d8 : 0x707880, roughness: 0.5 }),
  );
  scene.add(mesh);
  projectiles.push({
    x: f.x, y: (f.y ?? 0) + fighterEyeY(f) - 0.15, z: f.z,
    vx: (dx / dl) * 13.5, vy: (dy / dl) * 13.5, vz: (dz / dl) * 13.5,
    type, team: f.team, from: f, fuseAt: sim.now + GRENADES[type].fuse, mesh,
  });
  audio.throwIt();
}

function detonate(p) {
  const def = GRENADES[p.type];
  if (p.type === 'frag') {
    effects.explosion(p.x, Math.max(0.4, p.y), p.z);
    audio.explosion(Math.hypot(p.x - sim.player.x, p.z - sim.player.z));
    for (const o of sim.fighters) {
      if (!o.alive) continue;
      const d = Math.hypot(o.x - p.x, o.z - p.z);
      if (d > def.radius + 0.5) continue;
      const seen = lineOfSight(p.x, 0.9, p.z, o.x, chestY(o), o.z);
      const dmg = def.damage * Math.max(0, 1 - d / (def.radius + 0.5)) * (seen ? 1 : 0.3);
      if (dmg > 1) applyDamage(o, dmg, p.from === o ? null : p.from, 'body');
    }
  } else if (p.type === 'flash') {
    audio.flashbang(Math.hypot(p.x - sim.player.x, p.z - sim.player.z));
    effects.muzzle(p.x, p.y, p.z);
    for (const o of sim.fighters) {
      if (!o.alive) continue;
      const dx = p.x - o.x, dz = p.z - o.z;
      const d = Math.hypot(dx, dz);
      if (d > def.radius) continue;
      const fx = -Math.sin(o.yaw), fz = -Math.cos(o.yaw);
      const facing = (dx * fx + dz * fz) / (d || 1);
      if (facing < -0.15) continue; // looking away
      if (!lineOfSight(o.x, fighterEyeY(o), o.z, p.x, Math.max(0.4, p.y), p.z)) continue;
      const strength = (0.35 + 0.65 * Math.max(0, facing)) * (1 - d / (def.radius + 6));
      o.blindUntil = Math.max(o.blindUntil, sim.now + 0.8 + 3.6 * strength);
    }
  } else {
    effects.smoke(p.x, 1.15, p.z, def.radius, def.duration, sim.now);
    audio.throwIt();
  }
}

function stepProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    if (sim.now >= p.fuseAt) {
      detonate(p);
      scene.remove(p.mesh);
      projectiles.splice(i, 1);
      continue;
    }
    p.vy -= 10.5 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.y < 0.1) { p.y = 0.1; p.vy = Math.abs(p.vy) > 1.2 ? -p.vy * 0.38 : 0; p.vx *= 0.7; p.vz *= 0.7; }
    bounceOffWalls(p);
    p.mesh.position.set(p.x, p.y, p.z);
  }
}

// A thrown grenade bounces off the solids: a point test against each box, leaving by the
// shallowest face with its velocity reflected and damped.
function bounceOffWalls(p) {
  for (const b of SOLIDS) {
    if (p.y > b.h + 0.1) continue;
    if (p.x > b.x1 - 0.1 && p.x < b.x2 + 0.1 && p.z > b.z1 - 0.1 && p.z < b.z2 + 0.1) {
      const dl = p.x - (b.x1 - 0.1), dr = (b.x2 + 0.1) - p.x;
      const dn = p.z - (b.z1 - 0.1), ds = (b.z2 + 0.1) - p.z;
      const m = Math.min(dl, dr, dn, ds);
      if (m === dl) { p.x = b.x1 - 0.1; p.vx = -Math.abs(p.vx) * 0.42; }
      else if (m === dr) { p.x = b.x2 + 0.1; p.vx = Math.abs(p.vx) * 0.42; }
      else if (m === dn) { p.z = b.z1 - 0.1; p.vz = -Math.abs(p.vz) * 0.42; }
      else { p.z = b.z2 + 0.1; p.vz = Math.abs(p.vz) * 0.42; }
    }
  }
}

// --- Planting and defusing ------------------------------------------------------
function channelStep(f, dt) {
  // Returns the active channel view for the HUD (player only uses it).
  let active = null;
  if (sim.planted) {
    if (f.team === 1 && f.wantDefuse && f.alive) {
      f.channelK = (f.channelK ?? 0) + dt / ROUND.defuseSeconds;
      if (f === sim.player) active = { k: f.channelK, label: 'DEFUSING' };
      if (f.channelK >= 1) {
        sim.planted = null;
        chargeMesh.visible = false;
        f.money = Math.min(ECONOMY.max, f.money + ECONOMY.defusePersonal);
        endRound(1, `${f.name} defused the charge`);
      }
    } else if (f.channelK) f.channelK = 0;
    return active;
  }
  const site = SITES.find((s) => Math.hypot(s.x - f.x, s.z - f.z) < s.r);
  const wants = f.isPlayer
    ? f.hasCharge && site && input.state.keys.has('KeyE')
    : f.hasCharge && f.wantPlant && site;
  if (wants && f.alive && sim.phase === 'live') {
    f.channelK = (f.channelK ?? 0) + dt / ROUND.plantSeconds;
    if (f.isPlayer) active = { k: f.channelK, label: `PLANTING AT ${site.id}` };
    if (f.channelK >= 1) doPlant(f, site);
  } else if (f.channelK) f.channelK = 0;
  return active;
}

function doPlant(f, site) {
  f.hasCharge = false;
  f.channelK = 0;
  sim.planted = { site, x: f.x, z: f.z, fuseAt: sim.now + ROUND.fuseSeconds, beepAt: sim.now + 0.5 };
  sim.chargeDropped = null;
  chargeMesh.visible = true;
  chargeMesh.position.set(f.x, 0, f.z);
  f.money = Math.min(ECONOMY.max, f.money + ECONOMY.plantPersonal);
  for (const o of sim.fighters) {
    if (o.team === 0) o.money = Math.min(ECONOMY.max, o.money + ECONOMY.plantTeam);
  }
  let i = 0;
  for (const o of sim.fighters) {
    if (o.team === 0 && o.alive) o.holdOff = HOLD_OFFSETS[i++ % HOLD_OFFSETS.length];
  }
  pushNoise(f.x, f.z, 'plant', f.team);
  audio.plantDone();
  hud.feed(`Charge planted at ${site.id} — ${site.name}`, '#f0a830');
  hud.banner('CHARGE PLANTED', `${site.name} — ${ROUND.fuseSeconds} seconds`, 2, sim.now);
}

// --- Bot shooting (burst discipline lives here; the AI only asks) ----------------
function botTryShoot(b) {
  if (sim.phase !== 'live' || !b.alive) return;
  if (sim.now < b.engageAt || sim.now < b.burstPauseUntil) return;
  const lo = b.loadout;
  const gun = gunState(lo);
  if (gun.mag <= 0) { startReload(b); return; }
  if (sim.now < lo.reloadingUntil) return;
  if (b.burstLeft <= 0) b.burstLeft = 2 + Math.floor(Math.random() * 3) + (b.skill > 0.62 ? 1 : 0);
  const t = b.seenRef;
  if (!t?.alive) return;
  const dx = t.x - b.x, dz = t.z - b.z;
  const dist = Math.hypot(dx, dz) || 0.01;
  const aimHead = Math.random() < b.skill * 0.3;
  const ty = aimHead ? headY(t) : chestY(t);
  const err = (0.052 - b.skill * 0.033) + Math.min(1, (t.speedNow ?? 0) / 4.6) * 0.02 + Math.min(1, b.speedNow / 3.7) * 0.012;
  const yawE = (Math.random() + Math.random() - 1) * err;
  const pitchE = (Math.random() + Math.random() - 1) * err;
  const yaw = Math.atan2(-dx, -dz) + yawE;
  const pitch = Math.atan2(ty - (botEyeY(b) - 0.08), dist) + pitchE;
  const cp = Math.cos(pitch);
  const fired = fireGun(b, -Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp, 1);
  if (fired) {
    b.burstLeft--;
    if (b.burstLeft <= 0) b.burstPauseUntil = sim.now + (0.78 - b.skill * 0.42) * (0.8 + Math.random() * 0.5);
  }
}

// --- Buying ---------------------------------------------------------------------
function tryBuy(item) {
  const p = sim.player;
  const lo = p.loadout;
  const deny = () => audio.denied();
  if (item.kind === 'weapon' && item.id === 'rifle_ammo') {
    const guns = [lo.pistol, lo.primary].filter(Boolean);
    if (guns.every((g) => g.reserve >= WEAPONS[g.id].reserve) || p.money < item.price) return deny();
    p.money -= item.price;
    for (const g of guns) g.reserve = WEAPONS[g.id].reserve;
    return audio.buy();
  }
  if (p.money < item.price) return deny();
  if (item.kind === 'weapon') {
    if (lo.primary?.id === item.id) return deny();
    p.money -= item.price;
    givePrimary(lo, item.id);
  } else if (item.kind === 'armor') {
    if (lo.armor) return deny();
    p.money -= item.price;
    lo.armor = true;
  } else if (item.kind === 'grenade') {
    if (lo.grenades[item.id] >= GRENADES[item.id].max) return deny();
    p.money -= item.price;
    lo.grenades[item.id]++;
  }
  p.kit = { primaryId: lo.primary?.id ?? null, armor: lo.armor };
  audio.buy();
}

// --- Input wiring -----------------------------------------------------------------
const input = createInput(renderer.domElement, (locked) => {
  if (!locked && sim.started && sim.phase !== 'matchover') {
    hud.el.startOverlay.hidden = false;
    hud.el.startTitle.innerHTML = 'PAUSED';
    hud.el.startCopy.textContent = 'The match is waiting. Click to jump back in.';
    hud.el.playBtn.textContent = 'Resume';
  }
});
hud.el.playBtn.addEventListener('click', () => {
  audio.unlock();
  hud.el.startOverlay.hidden = true;
  if (!sim.started) {
    makeFighters();
    sim.started = true;
    startMatch();
    if (SHOT) stageShot(SHOT);
  }
  input.lock();
});
document.getElementById('again').addEventListener('click', () => {
  hud.el.endOverlay.hidden = true;
  startMatch();
  input.lock();
});

// In screenshot mode there is no human: start at once, staged, with the overlay hidden.
if (SHOT) {
  hud.el.startOverlay.hidden = true;
  makeFighters();
  sim.started = true;
  startMatch();
  stageShot(SHOT);
}

function processPressed() {
  const p = sim.player;
  for (const code of input.takePressed()) {
    if (sim.phase === 'buy' && p.alive) {
      if (code === 'KeyB') { sim.buyOpen = !sim.buyOpen; continue; }
      if (sim.buyOpen) {
        const item = BUY_CATALOG.find((i) => i.key === code);
        if (item) { tryBuy(item); continue; }
      }
    }
    if (!p.alive) continue;
    if (code === 'Digit1' && p.loadout.primary) { p.loadout.current = 'primary'; p.loadout.reloadPending = false; p.loadout.reloadingUntil = 0; sim.selectedGrenade = null; }
    if (code === 'Digit2') { p.loadout.current = 'pistol'; p.loadout.reloadPending = false; p.loadout.reloadingUntil = 0; sim.selectedGrenade = null; }
    if (code === 'Digit4') sim.selectedGrenade = p.loadout.grenades.frag > 0 ? 'frag' : sim.selectedGrenade;
    if (code === 'Digit5') sim.selectedGrenade = p.loadout.grenades.flash > 0 ? 'flash' : sim.selectedGrenade;
    if (code === 'Digit6') sim.selectedGrenade = p.loadout.grenades.smoke > 0 ? 'smoke' : sim.selectedGrenade;
    if (code === 'KeyR') startReload(p);
  }
}

// --- The fixed step ---------------------------------------------------------------
function step(dt) {
  sim.now += dt;
  const p = sim.player;
  if (!p) return;

  // Phase clock.
  if (sim.phase === 'buy' && sim.now >= sim.phaseAt) {
    sim.phase = 'live';
    sim.phaseAt = sim.now + ROUND.liveSeconds;
    sim.buyOpen = false;
    hud.banner('ROUND LIVE', '', 1.2, sim.now);
  } else if (sim.phase === 'end' && sim.now >= sim.phaseAt) {
    if (sim.roundsWon[0] >= ROUND.winsNeeded || sim.roundsWon[1] >= ROUND.winsNeeded || sim.round >= ROUND.maxRounds) {
      sim.phase = 'matchover';
      sim.winner = sim.roundsWon[0] > sim.roundsWon[1] ? 0 : 1;
      hud.el.endTitle.textContent = sim.winner === 0 ? 'EMBER TAKES THE YARD' : 'SABLE HOLDS THE YARD';
      hud.el.endSub.textContent = `Final score ${sim.roundsWon[0]} — ${sim.roundsWon[1]}. Your line: ${p.kills} kills, ${p.deaths} deaths.`;
      hud.el.endOverlay.hidden = false;
      document.exitPointerLock?.();
    } else {
      sim.round++;
      startRound();
    }
  }

  processPressed();

  // Player movement and look.
  if (p.alive) {
    const look = input.takeLook();
    if (!SHOT) {
      p.yaw -= look.x * 0.0021;
      p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch - look.y * 0.0021));
    }
    stepPlayer(p, input.state.keys, dt);
    const gun = gunState(p.loadout);
    const def = WEAPONS[gun.id];
    const wantAds = input.state.aiming && !sim.selectedGrenade;
    p.adsK += ((wantAds ? 1 : 0) - p.adsK) * Math.min(1, dt * 11);
    // Trigger.
    const firing = input.state.firing && (sim.phase === 'live');
    if (sim.selectedGrenade) {
      if (firing && !sim.prevFiring) {
        throwGrenade(p, sim.selectedGrenade);
        sim.selectedGrenade = null;
      }
    } else if (firing && (def.auto || !sim.prevFiring)) {
      const cp = Math.cos(p.pitch + p.recoilPitch);
      const fired = fireGun(
        p,
        -Math.sin(p.yaw) * cp, Math.sin(p.pitch + p.recoilPitch), -Math.cos(p.yaw) * cp,
        p.adsK > 0.6 ? 0.5 : 1,
      );
      if (fired) {
        p.kick = Math.min(1.2, p.kick + def.kick * 0.4);
        p.recoilPitch += def.kick * 0.0042;
        viewmodels.muzzleFlash(sim.now);
      }
    }
    sim.prevFiring = input.state.firing;
  }

  // Bots.
  const ctx = {
    now: sim.now,
    fighters: sim.fighters,
    sites: SITES,
    state: sim,
    noise: sim.noise,
    canSee,
    tryShoot: botTryShoot,
  };
  if (sim.phase === 'live') {
    for (const f of sim.fighters) {
      if (!f.isPlayer) updateBot(f, dt, ctx);
    }
  }
  // Charge pickup for any attacker walking over a dropped one.
  if (sim.chargeDropped && !sim.planted) {
    for (const f of sim.fighters) {
      if (f.alive && f.team === 0 && Math.hypot(f.x - sim.chargeDropped.x, f.z - sim.chargeDropped.z) < 0.9) {
        f.hasCharge = true;
        sim.chargeDropped = null;
        chargeMesh.visible = false;
        if (f.isPlayer) hud.feed('You picked up the charge', '#f0a830');
        break;
      }
    }
  }
  // Channels (plant / defuse) for everyone.
  let playerChannel = null;
  for (const f of sim.fighters) {
    if (!f.alive) continue;
    const c = channelStep(f, dt);
    if (f.isPlayer) playerChannel = c;
  }
  sim.playerChannel = playerChannel;

  // The planted charge: beeps, then the fuse decides.
  if (sim.planted) {
    const left = sim.planted.fuseAt - sim.now;
    if (sim.now >= sim.planted.beepAt) {
      sim.planted.beepAt = sim.now + Math.max(0.22, left / 14);
      audio.beep(left < 3);
      pushNoise(sim.planted.x, sim.planted.z, 'plant', 0);
    }
    if (left <= 0) {
      const { x, z } = sim.planted;
      sim.planted = null;
      chargeMesh.visible = false;
      effects.explosion(x, 0.8, z);
      audio.explosion(Math.hypot(x - p.x, z - p.z));
      for (const o of sim.fighters) {
        if (!o.alive) continue;
        const d = Math.hypot(o.x - x, o.z - z);
        if (d < 11) applyDamage(o, 130 * (1 - d / 12), null, 'body');
      }
      endRound(0, 'The charge detonated');
    }
  }

  // Round-end conditions while live.
  if (sim.phase === 'live') {
    const ember = aliveCount(0), sable = aliveCount(1);
    if (sim.planted) {
      if (sable === 0) endRound(0, 'Sable eliminated — the charge is safe');
    } else if (ember === 0) endRound(1, 'Ember eliminated');
    else if (sable === 0) endRound(0, 'Sable eliminated');
    else if (sim.now >= sim.phaseAt) endRound(1, 'Time expired — Sable holds');
  }

  stepProjectiles(dt);
  finishReloads();
  for (const f of sim.fighters) {
    if (f.loadout) f.loadout.bloom = Math.max(0, f.loadout.bloom - dt * 0.02);
  }
}

// --- Screenshot staging -----------------------------------------------------------
// The maker's own staging hook (the kit's shots.json pattern): ?shot=<name> starts a staged,
// real game state — real fighters, real weapons, the real simulation — posed for the cover
// and gallery renders. Nothing here draws anything the game itself would not.
function stageShot(name) {
  const p = sim.player;
  const bots = sim.fighters.filter((f) => !f.isPlayer);
  const sable = bots.filter((f) => f.team === 1);
  const ember = bots.filter((f) => f.team === 0);
  const give = (f, id) => { givePrimary(f.loadout, id); f.kit = { primaryId: id, armor: true }; };
  // Every bot holds a post and holds fire (bots.js: a holdHere bot aims but never shoots
  // or drifts); the posed shooter in 'fight' is the one exception. The capture driver
  // waits on the exposed sim clock below, so each render is taken at a known sim moment.
  const post = (b, x, z, yaw) => {
    b.x = x; b.z = z; b.yaw = yaw; b.holdYaw = yaw;
    b.holdHere = { x, z, yaw };
    b.engageAt = Infinity;
  };
  for (const b of bots) post(b, b.x, b.z, b.yaw); // default: hold the spawn post
  sim.phase = 'live';
  sim.phaseAt = sim.now + 97; // a believable mid-round clock for the staged renders
  sim.buyOpen = false;
  if (name === 'buy') {
    sim.phase = 'buy';
    sim.phaseAt = sim.now + ROUND.buySeconds;
    sim.buyOpen = true;
    give(p, 'rifle');
    p.loadout.grenades.frag = 1;
    p.money = 4650; // staging: a mid-match wallet so the menu shows owned and affordable rows
    p.x = -26; p.z = 16; p.yaw = -1.02; p.pitch = 0; // face the yard behind the open menu
  } else if (name === 'cover') {
    give(p, 'rifle');
    p.x = 2; p.z = 17; p.yaw = -Math.PI / 2; p.pitch = 0; // looking east down the dock lane
    const e = sable[0];
    post(e, 14, 16, 1.65); // down the lane, aiming at the player, holding fire
    e.seenRef = p; e.seenAt = sim.now;
    post(ember[0], -4, 21, -Math.PI / 2); // escort, behind the player's shoulder
  } else if (name === 'site') {
    give(p, 'rifle');
    p.x = -15.5; p.z = -4.5; p.yaw = 0.96; p.pitch = -0.02; // looking south-west into A
    p.hasCharge = false;
    sim.planted = { site: SITES[0], x: -21.5, z: -8.6, fuseAt: sim.now + 31, beepAt: sim.now + 1 };
    chargeMesh.visible = true;
    chargeMesh.position.set(-21.5, 0, -8.6);
    post(ember[0], -18.5, -12.5, 2.6);
    post(sable[1], -24, -18.5, 2.8);
  } else if (name === 'fight') {
    give(p, 'rifle');
    p.loadout.armor = true; // a kitted player, so the staged exchange lasts the capture
    p.x = 6; p.z = 18; p.yaw = -Math.PI / 2; p.pitch = 0; // east down the dock lane
    const e = sable[2];
    give(e, 'smg'); // the Raptor's lighter hits keep the exchange readable at capture time
    e.x = 19; e.z = 15.5; e.yaw = 1.76; e.seenRef = p; e.seenAt = sim.now; e.engageAt = sim.now - 1;
    e.holdHere = null; // the one free fighter: he strafes and shoots for real
    post(ember[1], 0, 22, -Math.PI / 2);
    // A burst already in the air: tracers and a muzzle flash from the enemy's gun.
    botTryShoot(e);
  }
  hud.banner('', '', 0, sim.now); // no round banner across the staged renders
  for (const f of sim.fighters) if (f.mesh) syncBotMesh(f, sim.now);
  window.__cinderline = { get now() { return sim.now; } };
  window.__shotReady = true;
}

// --- Render -----------------------------------------------------------------------
const view = {
  hp: 100, armor: false, mag: 0, reserve: 0, weaponName: '', money: 0,
  timeLeft: 0, phase: 'buy', rounds: [0, 0], round: 1, alive: [4, 4],
  objective: '', hasCharge: false, channel: null, spreadPx: 8, hurtK: 0, blindK: 0, scoped: false,
};
let last = performance.now();
let acc = 0;

function render(nowMs) {
  requestAnimationFrame(render);
  const frameDt = Math.min(0.1, (nowMs - last) / 1000);
  last = nowMs;
  acc += frameDt;
  while (acc >= STEP) {
    step(STEP);
    acc -= STEP;
  }
  const p = sim.player;
  if (!p) {
    renderer.render(scene, camera);
    return;
  }
  // Camera: the player's eyes, or a slow orbit over their body once they are down.
  if (p.alive) {
    camera.position.set(p.x, p.y + eyeHeight(p) + Math.sin(p.bobPhase * 2) * 0.012 * Math.min(1, p.speedNow / 3), p.z);
    camera.rotation.set(p.pitch + p.recoilPitch + p.kick * 0.012, p.yaw, Math.sin(p.bobPhase) * 0.0011 * Math.min(1, p.speedNow / 3));
  } else {
    const t = sim.now * 0.25;
    camera.position.set(p.x + Math.cos(t) * 4.5, 3.4, p.z + Math.sin(t) * 4.5);
    camera.lookAt(p.x, 0.6, p.z);
  }
  // Viewmodel and FOV.
  const gun = gunState(p.loadout);
  const def = WEAPONS[gun.id];
  const kind = sim.selectedGrenade ? null : def.kind;
  viewmodels.show(p.alive && sim.phase !== 'matchover' ? kind : null);
  if (p.alive) {
    viewmodels.update(sim.now, p.bobPhase, Math.min(1, p.speedNow / 4), p.kick, sim.now < p.loadout.reloadingUntil, p.adsK);
    const targetFov = 75 / (1 + (def.zoom - 1) * p.adsK);
    if (Math.abs(camera.fov - targetFov) > 0.1) {
      camera.fov += (targetFov - camera.fov) * 0.35;
      camera.updateProjectionMatrix();
    }
  }
  // Bots, charge telltale, site rings.
  for (const f of sim.fighters) if (f.mesh) syncBotMesh(f, sim.now);
  const lamp = chargeMesh.getObjectByName('lamp');
  if (lamp) {
    const rate = sim.planted ? Math.max(2, (sim.planted.fuseAt - sim.now)) : 6;
    lamp.material.emissiveIntensity = (Math.sin(sim.now * rate * 2.2) > 0 ? 2.4 : 0.2);
  }
  if (sim.planted) {
    const ring = rings[sim.planted.site.id];
    ring.material.opacity = 0.65 + Math.sin(sim.now * 6) * 0.3;
    ring.material.color.set('#e5484d');
  }
  effects.update(frameDt, sim.now);
  // HUD.
  view.hp = p.hp;
  view.armor = p.loadout.armor;
  view.mag = gun.mag;
  view.reserve = gun.reserve;
  view.weaponName = sim.selectedGrenade ? `${GRENADES[sim.selectedGrenade].name} — click to throw` : def.name.toUpperCase();
  view.money = p.money;
  view.phase = sim.phase;
  view.timeLeft = sim.planted ? sim.planted.fuseAt - sim.now : sim.phaseAt - sim.now;
  view.rounds = sim.roundsWon;
  view.round = sim.round;
  view.alive = [aliveCount(0), aliveCount(1)];
  view.hasCharge = p.hasCharge;
  view.channel = sim.playerChannel ?? null;
  const spreadNow = def.spread + def.moveSpread * Math.min(1, p.speedNow / 4.6) + p.loadout.bloom;
  view.spreadPx = spreadNow * 950;
  view.hurtK = Math.max(0, 0.75 - (sim.now - p.hurtAt) * 1.4);
  view.blindK = Math.max(0, Math.min(1, (p.blindUntil - sim.now) / 1.2));
  view.scoped = p.adsK > 0.75 && def.kind === 'sniper';
  view.objective =
    sim.phase === 'buy' ? 'Buy phase — gear up (B)' :
    sim.phase === 'end' ? '' :
    sim.phase === 'matchover' ? '' :
    sim.planted ? (p.team === 0 ? `Charge at ${sim.planted.site.id} — hold the site` : 'Defuse the charge') :
    p.hasCharge ? `Plant the charge at ${sim.siteChoice === 0 ? 'A — Crane Yard' : 'B — Fuel Row'}` :
    'Escort the charge carrier';
  hud.update(sim.now, view);
  if (sim.phase === 'buy' && sim.buyOpen && p.alive) {
    hud.showBuy(true);
    hud.renderBuy(p, sim.phaseAt - sim.now);
  } else {
    hud.showBuy(false);
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(render);
