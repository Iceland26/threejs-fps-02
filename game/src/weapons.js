// Weapon state and the first-person viewmodels. A loadout is plain data — the two guns a
// fighter carries, their magazines and reserves, armour and grenade counts — created fresh
// each round and mutated by main.js (shooting, buying, reloading). The viewmodel is a small
// kit of boxes per gun, built once and swapped on weapon change; it bobs with movement,
// kicks with recoil and drops during a reload, all driven from the same state the HUD reads.

import * as THREE from 'three';
import { WEAPONS } from './config.js';
import { PALETTE } from './palette.js';

export function createLoadout() {
  return {
    primary: null, // weapon id once bought; round 1 starts pistol-only
    pistol: { id: 'pistol', mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve },
    current: 'pistol', // 'pistol' or 'primary'
    armor: false,
    grenades: { frag: 0, flash: 0, smoke: 0 },
    grenadeOrder: ['frag', 'flash', 'smoke'],
    reloadingUntil: 0,
    lastShotAt: -10,
    bloom: 0,
  };
}

export function gunState(loadout) {
  return loadout.current === 'primary' && loadout.primary
    ? loadout.primary
    : loadout.pistol;
}

export function givePrimary(loadout, id) {
  loadout.primary = { id, mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
  loadout.current = 'primary';
}

// --- Viewmodels -------------------------------------------------------------
// One group per gun kind, parented to the camera. Built from boxes in two materials: dark
// polymer and gunmetal, with a team-coloured accent stripe so your own gun reads as yours.

const polymer = new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.6, metalness: 0.3 });
const gunmetal = new THREE.MeshStandardMaterial({ color: 0x3d454f, roughness: 0.35, metalness: 0.7 });
const accentMat = new THREE.MeshStandardMaterial({ color: PALETTE.accent, roughness: 0.5, metalness: 0.2 });

function box(w, h, d, x, y, z, mat = polymer) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

function buildViewmodel(kind) {
  const g = new THREE.Group();
  if (kind === 'pistol') {
    g.add(box(0.055, 0.09, 0.24, 0, 0, -0.1, gunmetal)); // slide
    g.add(box(0.05, 0.13, 0.07, 0, -0.09, 0.0)); // grip
    g.add(box(0.012, 0.03, 0.012, 0, 0.06, -0.2, accentMat)); // front post
  } else if (kind === 'smg') {
    g.add(box(0.06, 0.1, 0.42, 0, 0, -0.16, polymer)); // receiver
    g.add(box(0.045, 0.05, 0.2, 0, 0.01, -0.44, gunmetal)); // barrel + shroud
    g.add(box(0.04, 0.16, 0.06, 0, -0.12, -0.08)); // magazine
    g.add(box(0.05, 0.07, 0.16, 0, -0.03, 0.1)); // stock
    g.add(box(0.014, 0.035, 0.014, 0, 0.07, -0.3, accentMat));
  } else if (kind === 'shotgun') {
    g.add(box(0.07, 0.11, 0.5, 0, 0, -0.2, polymer));
    g.add(box(0.055, 0.055, 0.3, 0, -0.02, -0.52, gunmetal)); // barrel
    g.add(box(0.06, 0.07, 0.18, 0, -0.06, -0.38, new THREE.MeshStandardMaterial({ color: 0x6e5136, roughness: 0.8 }))); // pump, wood
    g.add(box(0.016, 0.03, 0.016, 0, 0.07, -0.62, accentMat));
  } else if (kind === 'sniper') {
    g.add(box(0.06, 0.1, 0.62, 0, 0, -0.26, polymer));
    g.add(box(0.035, 0.035, 0.42, 0, 0.02, -0.72, gunmetal)); // long barrel
    g.add(box(0.05, 0.07, 0.16, 0, 0.09, -0.22, gunmetal)); // scope tube
    g.add(box(0.045, 0.12, 0.06, 0, -0.1, -0.18)); // magazine
    g.add(box(0.05, 0.08, 0.2, 0, -0.02, 0.16)); // stock
  } else {
    // rifle
    g.add(box(0.06, 0.11, 0.52, 0, 0, -0.2, polymer)); // receiver
    g.add(box(0.04, 0.04, 0.3, 0, 0.02, -0.58, gunmetal)); // barrel
    g.add(box(0.045, 0.17, 0.07, 0, -0.13, -0.12)); // magazine
    g.add(box(0.05, 0.06, 0.1, 0, 0.09, -0.3, gunmetal)); // carry sight
    g.add(box(0.05, 0.08, 0.18, 0, -0.03, 0.14)); // stock
    g.add(box(0.014, 0.03, 0.014, 0, 0.075, -0.44, accentMat));
  }
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.34),
    new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
  );
  flash.position.set(0, 0.02, kind === 'sniper' ? -0.95 : kind === 'pistol' ? -0.24 : -0.72);
  flash.name = 'flash';
  g.add(flash);
  g.position.set(0.25, -0.235, -0.5);
  g.scale.setScalar(0.78);
  return g;
}

export function createViewmodels(camera) {
  const models = {};
  for (const kind of ['pistol', 'smg', 'shotgun', 'rifle', 'sniper']) {
    models[kind] = buildViewmodel(kind);
    models[kind].visible = false;
    camera.add(models[kind]);
  }
  let current = null;
  let flashUntil = 0;
  return {
    show(kind) {
      if (current) models[current].visible = false;
      current = kind;
      if (kind) models[kind].visible = true;
    },
    // Called every frame: bob from movement, kick from recoil, dip while reloading.
    update(now, bobPhase, bobAmount, kick, reloading, adsK) {
      if (!current) return;
      const m = models[current];
      const targetX = 0.25 - 0.25 * adsK;
      const targetY = -0.235 + 0.16 * adsK;
      m.position.x = targetX;
      m.position.y = targetY + Math.sin(bobPhase * 2) * 0.008 * bobAmount - (reloading ? 0.09 : 0);
      m.position.z = -0.5 + kick * 0.06;
      m.rotation.x = kick * 0.5 - (reloading ? 0.5 : 0) + Math.sin(bobPhase) * 0.004 * bobAmount;
      const flash = m.getObjectByName('flash');
      if (flash) {
        flash.material.opacity = now < flashUntil ? 0.95 : 0;
        flash.rotation.z = now * 37 % Math.PI;
      }
    },
    muzzleFlash(now) { flashUntil = now + 0.045; },
  };
}
