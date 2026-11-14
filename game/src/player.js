// The human fighter: one entry in the same `fighters` array the bots use, so damage, sight
// and sound treat everyone alike. Movement is acceleration-based — velocity chases the wish
// direction under a fixed acceleration and ground friction — which is what makes stopping
// to shoot a real decision: spread reads the actual speed every shot. This module owns the
// player's physics and camera state; main.js owns what the player does with a gun.
//
// One facing convention everywhere in the game: yaw is the camera's Y rotation (order
// 'YXZ'), so the ground-plane forward is (-sin yaw, -cos yaw) in (x, z) and pitch is the
// X rotation, positive looking up. Bots store their facing in the same yaw.

import { PLAYER } from './config.js';
import { collideCircle } from './collision.js';

export function createPlayer(spawn) {
  return {
    isPlayer: true,
    team: 0,
    name: 'You',
    x: spawn.x, z: spawn.z, y: 0,
    vx: 0, vz: 0, vy: 0,
    yaw: spawn.yaw, pitch: 0,
    crouch: false,
    grounded: true,
    hp: 100,
    alive: true,
    loadout: null, // set by main.js each round
    money: 0,
    kills: 0, deaths: 0,
    speedNow: 0,
    bobPhase: 0,
    kick: 0, // viewmodel + camera recoil, decays
    recoilPitch: 0, // accumulated aim punch, recovered between shots
    adsK: 0, // 0 hip, 1 fully aimed
    hasCharge: false,
    blindUntil: 0,
    hurtAt: -10,
    lastAttacker: null,
  };
}

export function eyeHeight(p) {
  return p.crouch ? PLAYER.eyeCrouch : PLAYER.eyeStand;
}

// Advance the player one fixed step. Mouse look is applied by main.js before the step (it
// owns sensitivity and the screenshot-mode override); this function reads only keys.
export function stepPlayer(p, keys, dt) {
  p.crouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
  const walking = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const maxSpeed = p.crouch ? PLAYER.crouchSpeed : walking ? PLAYER.walkSpeed : PLAYER.runSpeed;

  let fwd = 0, str = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) fwd += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) fwd -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) str += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) str -= 1;
  const len = Math.hypot(fwd, str) || 1;
  fwd /= len; str /= len;
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw); // forward on the ground plane
  const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw); // right on the ground plane
  const wishX = fx * fwd + rx * str;
  const wishZ = fz * fwd + rz * str;

  const accel = p.grounded ? PLAYER.accel : PLAYER.airAccel;
  p.vx += wishX * accel * dt;
  p.vz += wishZ * accel * dt;
  const sp = Math.hypot(p.vx, p.vz);
  if (sp > maxSpeed) {
    // Ease toward the cap rather than clamping hard, so direction changes stay smooth.
    const target = Math.max(maxSpeed, sp - 26 * dt);
    p.vx *= target / sp;
    p.vz *= target / sp;
  }
  if (fwd === 0 && str === 0 && p.grounded) {
    const f = Math.max(0, 1 - 11 * dt);
    p.vx *= f;
    p.vz *= f;
  }

  if (keys.has('Space') && p.grounded && !p.crouch) {
    p.vy = PLAYER.jumpSpeed;
    p.grounded = false;
  }
  p.vy -= PLAYER.gravity * dt;
  p.y += p.vy * dt;
  if (p.y <= 0) {
    p.y = 0;
    p.vy = 0;
    p.grounded = true;
  }

  p.x += p.vx * dt;
  p.z += p.vz * dt;
  collideCircle(p, PLAYER.radius);
  p.speedNow = Math.hypot(p.vx, p.vz);
  if (p.grounded && p.speedNow > 0.4) p.bobPhase += dt * p.speedNow * 1.6;
  p.kick = Math.max(0, p.kick - dt * 7);
  p.recoilPitch *= Math.max(0, 1 - dt * 5.5);
}
