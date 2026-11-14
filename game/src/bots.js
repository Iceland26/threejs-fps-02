// The bot fighters: mesh, perception, pathfinding and the round plan. A bot is the same
// shape of fighter as the player (position, hp, loadout, team) plus a memory and a job.
// Bots walk the layout's waypoint graph (breadth-first next-hop, computed once here), steer
// the last stretch directly when they can see their goal, and fight with the same hitscan
// the player uses — main.js resolves every shot, so a bot's bullets obey the same spread,
// falloff and armour rules. They hear through main.js's noise events: a shot or a plant
// beep inside their hearing radius gives them a place to investigate.

import * as THREE from 'three';
import { BOT } from './config.js';
import { WAYPOINTS, EDGES } from './layout.js';
import { PALETTE, TEAM_COLORS } from './palette.js';
import { collideCircle, lineOfSight } from './collision.js';

// --- Waypoint routing -------------------------------------------------------
const NEXT = (() => {
  const n = WAYPOINTS.length;
  const adj = Array.from({ length: n }, () => []);
  for (const [a, b] of EDGES) { adj[a].push(b); adj[b].push(a); }
  const table = [];
  for (let src = 0; src < n; src++) {
    const prev = new Array(n).fill(-1);
    const dist = new Array(n).fill(-1);
    dist[src] = 0;
    const queue = [src];
    while (queue.length) {
      const cur = queue.shift();
      for (const nb of adj[cur]) {
        if (dist[nb] === -1) { dist[nb] = dist[cur] + 1; prev[nb] = cur; queue.push(nb); }
      }
    }
    const row = new Array(n).fill(src);
    for (let dst = 0; dst < n; dst++) {
      if (dst === src) continue;
      let cur = dst;
      while (prev[cur] !== -1 && prev[cur] !== src) cur = prev[cur];
      row[dst] = cur;
    }
    table.push(row);
  }
  return table;
})();

function nearestNode(x, z, needSight) {
  let best = -1, bestD = Infinity;
  for (let i = 0; i < WAYPOINTS.length; i++) {
    const w = WAYPOINTS[i];
    const d = (w.x - x) ** 2 + (w.z - z) ** 2;
    if (d >= bestD) continue;
    if (needSight && !lineOfSight(x, 1.2, z, w.x, 1.2, w.z)) continue;
    bestD = d; best = i;
  }
  return best;
}

// The point a bot at (x, z) should run toward to reach (gx, gz): the goal itself when the
// straight walk is clear, else the next waypoint on the graph route.
export function pathTarget(x, z, gx, gz) {
  if (lineOfSight(x, 1.2, z, gx, 1.2, gz)) return { x: gx, z: gz };
  let a = nearestNode(x, z, true);
  if (a === -1) a = nearestNode(x, z, false);
  let b = nearestNode(gx, gz, true);
  if (b === -1) b = nearestNode(gx, gz, false);
  if (a === b) return { x: gx, z: gz };
  const hop = NEXT[a][b];
  const w = WAYPOINTS[hop];
  return { x: w.x, z: w.z };
}

// --- Meshes -----------------------------------------------------------------
const skinMat = new THREE.MeshStandardMaterial({ color: 0xc9a186, roughness: 0.8 });
const darkMat = new THREE.MeshStandardMaterial({ color: 0x23262c, roughness: 0.7 });
const legMat = new THREE.MeshStandardMaterial({ color: 0x31363d, roughness: 0.85 });

function part(w, h, d, x, y, z, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// A low-poly soldier facing -z (the game's forward convention), built per team colour. The
// head, torso and legs sit where main.js's analytic hit test expects them: head centre at
// 1.52 standing, torso spanning 0.75..1.45, legs below.
export function buildBotMesh(team) {
  const g = new THREE.Group();
  const teamMat = new THREE.MeshStandardMaterial({ color: TEAM_COLORS[team], roughness: 0.65 });
  const vestMat = new THREE.MeshStandardMaterial({ color: team === 0 ? 0x8a3d16 : 0x14524b, roughness: 0.8 });
  const legL = part(0.17, 0.78, 0.2, -0.13, 0.39, 0, legMat);
  const legR = part(0.17, 0.78, 0.2, 0.13, 0.39, 0, legMat);
  const torso = part(0.52, 0.72, 0.3, 0, 1.1, 0, teamMat);
  const vest = part(0.56, 0.5, 0.36, 0, 1.08, 0, vestMat);
  const head = part(0.3, 0.3, 0.3, 0, 1.52, 0, skinMat);
  const helmet = part(0.36, 0.16, 0.36, 0, 1.68, 0, vestMat);
  const armR = part(0.13, 0.13, 0.52, 0.3, 1.28, -0.24, teamMat);
  const armL = part(0.13, 0.13, 0.4, -0.28, 1.22, -0.2, teamMat);
  const gun = part(0.07, 0.14, 0.72, 0.3, 1.3, -0.5, darkMat);
  const pack = part(0.4, 0.44, 0.16, 0, 1.12, 0.24, vestMat);
  g.add(legL, legR, torso, vest, head, helmet, armR, armL, gun, pack);
  g.userData = { legL, legR, head, torso };
  return g;
}

// --- Fighters ---------------------------------------------------------------
let botSerial = 0;

export function createBot(team, name, spawn, skill) {
  botSerial++;
  return {
    isPlayer: false,
    team,
    name,
    x: spawn.x, z: spawn.z, y: 0,
    vx: 0, vz: 0,
    yaw: spawn.yaw, pitch: 0,
    crouch: false,
    hp: 100,
    alive: true,
    loadout: null,
    money: 0,
    kills: 0, deaths: 0,
    speedNow: 0,
    hasCharge: false,
    blindUntil: 0,
    hurtAt: -10,
    lastAttacker: null,
    skill, // 0..1: reaction time, aim error and burst discipline all read it
    // Plan, set by main.js at round start:
    //   { job: 'attack' | 'defend' | 'roam', site: 0|1, holdNode: waypoint index }
    plan: null,
    holdHere: null, // an exact post to hold (set by main.js's screenshot staging)
    // Perception and intent, rewritten as the round unfolds.
    seenRef: null, seenAt: -10, seenX: 0, seenZ: 0,
    investigateX: 0, investigateZ: 0, investigateUntil: -1,
    noiseSeen: 0,
    wantPlant: false,
    wantDefuse: false,
    // Combat state.
    engageAt: 0, burstLeft: 0, nextShotAt: 0, burstPauseUntil: 0,
    strafeDir: 1, strafeUntil: 0, aimYaw: spawn.yaw, aimPitch: 0,
    // Bookkeeping.
    checkAt: (botSerial % 7) * 0.017, // stagger perception checks across steps
    walkPhase: 0, flashAt: -10, holdYaw: spawn.yaw,
    mesh: null,
  };
}

export function botEyeY(b) {
  return b.crouch ? BOT.eyeCrouch : BOT.eyeStand;
}

// One fixed step of one bot. ctx is main.js's view of the round:
//   { now, fighters, canSee(bot, other), tryShoot(bot), state, noise }
export function updateBot(b, dt, ctx) {
  const now = ctx.now;
  b.wantPlant = false;
  b.wantDefuse = false;
  if (!b.alive) return;
  if (now < b.blindUntil) {
    // Blinded: stop, face the last known direction, fire nothing.
    b.vx *= 0.8; b.vz *= 0.8;
    move(b, dt);
    return;
  }

  // Perception, a few times a second per bot, staggered.
  if (now >= b.checkAt) {
    b.checkAt = now + 0.12;
    perceive(b, ctx);
  }
  // Hearing: the newest unprocessed noise inside earshot becomes an investigation.
  for (const n of ctx.noise) {
    if (n.id <= b.noiseSeen) continue;
    b.noiseSeen = n.id;
    const d = Math.hypot(n.x - b.x, n.z - b.z);
    const range = n.kind === 'shot' ? BOT.hearShot : BOT.hearPlant;
    if (d < range && now - n.at < 3.5 && n.team !== b.team) {
      b.investigateX = n.x; b.investigateZ = n.z;
      b.investigateUntil = now + 5;
    }
  }

  const visible = b.seenRef && b.seenRef.alive && now - b.seenAt < 0.35;
  let moveX = 0, moveZ = 0, wantSpeed = BOT.speed;

  if (visible) {
    const t = b.seenRef;
    const dx = t.x - b.x, dz = t.z - b.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    b.aimYaw = Math.atan2(-dx, -dz);
    b.aimPitch = Math.atan2((t.crouch ? 1.0 : 1.25) - botEyeY(b), dist);
    b.yaw = turnToward(b.yaw, b.aimYaw, dt * 10);
    b.pitch = b.aimPitch;
    // Fight movement: close a long gap, back off from a point-blank one, else strafe.
    if (now >= b.strafeUntil) {
      b.strafeDir = Math.random() < 0.5 ? -1 : 1;
      b.strafeUntil = now + 0.7 + Math.random() * 0.8;
    }
    if (dist > 26) { moveX = dx / dist; moveZ = dz / dist; }
    else if (dist < 5) { moveX = -dx / dist; moveZ = -dz / dist; }
    else {
      moveX = (-dz / dist) * b.strafeDir;
      moveZ = (dx / dist) * b.strafeDir;
      wantSpeed = 2.1;
    }
    if (b.holdHere) { moveX = 0; moveZ = 0; } // on a staged post: aim, never drift
    b.crouch = dist > 17 && b.skill > 0.45 && (b.serialCrouch ?? false);
    if (Math.random() < dt * 0.25) b.serialCrouch = !b.serialCrouch;
    ctx.tryShoot(b);
  } else {
    b.pitch = 0;
    const goal = goalFor(b, ctx);
    if (goal.hold) {
      // On station: settle, scan the lane, stay low sometimes.
      b.crouch = goal.crouch;
      b.yaw = turnToward(b.yaw, goal.yaw + Math.sin(now * 0.45 + b.holdYaw) * 0.55, dt * 3);
      b.vx *= 0.7; b.vz *= 0.7;
    } else {
      const p = pathTarget(b.x, b.z, goal.x, goal.z);
      const dx = p.x - b.x, dz = p.z - b.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.25) {
        moveX = dx / dist; moveZ = dz / dist;
        b.yaw = turnToward(b.yaw, Math.atan2(-dx, -dz), dt * 7);
      }
      b.crouch = false;
      // Fresh memory but no eyes on it: hurry.
      if (now - b.seenAt < 4 && b.seenRef) wantSpeed = BOT.speed;
    }
  }

  const accel = 30;
  b.vx += moveX * accel * dt;
  b.vz += moveZ * accel * dt;
  const sp = Math.hypot(b.vx, b.vz);
  const cap = b.crouch ? BOT.crouchSpeed : wantSpeed;
  if (sp > cap) { b.vx *= cap / sp; b.vz *= cap / sp; }
  if (moveX === 0 && moveZ === 0) { const f = Math.max(0, 1 - 10 * dt); b.vx *= f; b.vz *= f; }
  move(b, dt);
}

function move(b, dt) {
  b.x += b.vx * dt;
  b.z += b.vz * dt;
  collideCircle(b, BOT.radius);
  b.speedNow = Math.hypot(b.vx, b.vz);
  b.walkPhase += dt * b.speedNow * 2.2;
}

function perceive(b, ctx) {
  const now = ctx.now;
  let best = null, bestD = Infinity;
  for (const o of ctx.fighters) {
    if (o === b || !o.alive || o.team === b.team) continue;
    const dx = o.x - b.x, dz = o.z - b.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > BOT.viewRange * BOT.viewRange || d2 >= bestD) continue;
    // Facing check: the angle between the bot's forward and the target direction.
    const fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw);
    const d = Math.sqrt(d2) || 0.001;
    if ((dx * fx + dz * fz) / d < BOT.viewCos && d > 4) continue; // peripheral at arm's length
    if (!ctx.canSee(b, o)) continue;
    best = o; bestD = d2;
  }
  if (best) {
    if (b.seenRef !== best || now - b.seenAt > 0.6) b.engageAt = b.holdHere ? Infinity : now + 0.42 - b.skill * 0.22;
    b.seenRef = best;
    b.seenAt = now;
    b.seenX = best.x; b.seenZ = best.z;
    b.investigateUntil = -1;
  }
}

// Where this bot is trying to be, from its plan and the round's state.
function goalFor(b, ctx) {
  const now = ctx.now;
  const st = ctx.state;
  // A staged post (the screenshot hook's holdHere) outranks the plan: stay on it.
  if (b.holdHere) return { x: b.holdHere.x, z: b.holdHere.z, hold: true, yaw: b.holdHere.yaw, crouch: !!b.holdHere.crouch };
  // A fresh sighting outranks the plan: move to where the enemy was.
  if (b.seenRef && now - b.seenAt < 4) return { x: b.seenX, z: b.seenZ, hold: false };
  if (now < b.investigateUntil) return { x: b.investigateX, z: b.investigateZ, hold: false };

  if (st.planted) {
    const site = st.planted;
    if (b.team === 1) {
      // Defenders retake; the first one in starts the defuse when the yard looks clear.
      const d = Math.hypot(site.x - b.x, site.z - b.z);
      if (d < site.r - 0.6) {
        const enemyNear = ctx.fighters.some((o) => o.alive && o.team === 0 && Math.hypot(o.x - site.x, o.z - site.z) < 8);
        b.wantDefuse = !enemyNear;
        return { x: site.x, z: site.z, hold: true, yaw: b.yaw, crouch: false };
      }
      return { x: site.x, z: site.z, hold: false };
    }
    // Attackers hold the plant from just outside the ring.
    const hx = site.x + (b.holdOff?.x ?? 5), hz = site.z + (b.holdOff?.z ?? 3);
    const d = Math.hypot(hx - b.x, hz - b.z);
    if (d < 1.2) return { x: hx, z: hz, hold: true, yaw: Math.atan2(-(site.x - b.x), -(site.z - b.z)), crouch: b.skill > 0.5 };
    return { x: hx, z: hz, hold: false };
  }

  if (b.team === 0) {
    // Attackers. A dropped charge is picked up by whoever is nearest and free.
    if (st.chargeDropped && !b.hasCharge) {
      const d = Math.hypot(st.chargeDropped.x - b.x, st.chargeDropped.z - b.z);
      if (d < 14) return { x: st.chargeDropped.x, z: st.chargeDropped.z, hold: false };
    }
    const site = ctx.sites[b.plan.site];
    if (b.hasCharge) {
      const d = Math.hypot(site.x - b.x, site.z - b.z);
      if (d < site.r - 0.8) {
        b.wantPlant = true;
        return { x: site.x, z: site.z, hold: true, yaw: b.yaw, crouch: true };
      }
      return { x: site.x, z: site.z, hold: false };
    }
    // Escort: gather at the site's edge, then hold angles into it.
    const d = Math.hypot(site.x - b.x, site.z - b.z);
    if (d < site.r + 3.5) {
      return { x: b.x, z: b.z, hold: true, yaw: Math.atan2(-(site.x - b.x), -(site.z - b.z)), crouch: false };
    }
    return { x: site.x, z: site.z, hold: false };
  }

  // Defenders before the plant: walk to the assigned hold and watch the lane.
  const node = WAYPOINTS[b.plan.holdNode];
  const d = Math.hypot(node.x - b.x, node.z - b.z);
  if (d < 1.1) return { x: node.x, z: node.z, hold: true, yaw: b.holdYaw, crouch: b.plan.crouch };
  return { x: node.x, z: node.z, hold: false };
}

export function turnToward(current, target, maxStep) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) <= maxStep) return target;
  return current + Math.sign(diff) * maxStep;
}

// Sync a bot's mesh to its fighter: position, facing, crouch squash, walk swing, hit flash
// and the death fall. Called once per render frame, never from the simulation step.
export function syncBotMesh(b, now) {
  const g = b.mesh;
  if (!g) return;
  g.position.set(b.x, 0, b.z);
  g.rotation.y = b.yaw;
  if (!b.alive) {
    g.rotation.x = Math.max(-Math.PI / 2, g.rotation.x - 0.09);
    g.position.y = 0.12;
    return;
  }
  const targetScaleY = b.crouch ? 0.8 : 1;
  g.scale.y += (targetScaleY - g.scale.y) * 0.3;
  const swing = Math.sin(b.walkPhase * 3.1) * (b.speedNow > 0.3 ? 0.5 : 0);
  g.userData.legL.rotation.x = swing;
  g.userData.legR.rotation.x = -swing;
  const flash = now - b.flashAt < 0.09;
  g.userData.torso.material.emissive?.setHex(flash ? 0x7a1616 : 0x000000);
}
