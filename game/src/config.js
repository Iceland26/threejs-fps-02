// The game's numbers: weapons, grenades, money and round timings, in one table the rest of
// the code reads. Damage is per bullet at point blank; `falloff` is the distance at which a
// bullet keeps only half of it. Spread is in radians at the muzzle and grows with the
// shooter's speed and with sustained fire — standing still and tapping is the accurate way
// to shoot, which is the whole tactical point.

export const WEAPONS = {
  pistol: {
    name: 'Kestrel P9', kind: 'pistol', price: 0, damage: 30, headMult: 3.2,
    rpm: 320, auto: false, mag: 12, reserve: 60, reloadMs: 1100,
    spread: 0.011, moveSpread: 0.05, bloom: 0.004, falloff: 28, pellets: 1,
    zoom: 1.15, kick: 0.55,
  },
  smg: {
    name: 'Raptor-9 SMG', kind: 'smg', price: 1400, damage: 24, headMult: 2.8,
    rpm: 780, auto: true, mag: 32, reserve: 128, reloadMs: 1500,
    spread: 0.02, moveSpread: 0.055, bloom: 0.0035, falloff: 20, pellets: 1,
    zoom: 1.15, kick: 0.32,
  },
  shotgun: {
    name: 'Breacher-12', kind: 'shotgun', price: 1100, damage: 11, headMult: 2.2,
    rpm: 68, auto: false, mag: 6, reserve: 30, reloadMs: 2400,
    spread: 0.055, moveSpread: 0.05, bloom: 0.0, falloff: 11, pellets: 8,
    zoom: 1.1, kick: 1.6,
  },
  rifle: {
    name: 'Longbow AR', kind: 'rifle', price: 2500, damage: 34, headMult: 3.6,
    rpm: 600, auto: true, mag: 30, reserve: 120, reloadMs: 1900,
    spread: 0.007, moveSpread: 0.06, bloom: 0.0032, falloff: 46, pellets: 1,
    zoom: 1.25, kick: 0.5,
  },
  sniper: {
    name: 'Farreach SR', kind: 'sniper', price: 3200, damage: 96, headMult: 2.4,
    rpm: 44, auto: false, mag: 5, reserve: 25, reloadMs: 2600,
    spread: 0.0012, moveSpread: 0.12, bloom: 0.0, falloff: 90, pellets: 1,
    zoom: 2.6, kick: 2.2,
  },
};

export const GRENADES = {
  frag: { name: 'Shard Frag', price: 300, max: 2, fuse: 1.7, radius: 6.5, damage: 96 },
  flash: { name: 'Flare Flash', price: 200, max: 2, fuse: 1.3, radius: 19 },
  smoke: { name: 'Veil Smoke', price: 300, max: 1, fuse: 0.9, radius: 3.4, duration: 14 },
};

export const ARMOR_PRICE = 650;
export const ARMOR_BODY_FACTOR = 0.55; // armoured torsos take this share of body damage

export const ECONOMY = {
  start: 800,
  kill: 300,
  win: 3250,
  loss: 1400,
  plantTeam: 800,
  plantPersonal: 300,
  defusePersonal: 300,
  max: 16000,
};

export const ROUND = {
  buySeconds: 12,
  liveSeconds: 100,
  endSeconds: 4.5,
  plantSeconds: 3.2,
  defuseSeconds: 5,
  fuseSeconds: 40,
  winsNeeded: 7,
  maxRounds: 13,
};

export const PLAYER = {
  radius: 0.42,
  eyeStand: 1.62,
  eyeCrouch: 1.12,
  runSpeed: 4.6,
  walkSpeed: 2.4,
  crouchSpeed: 1.7,
  accel: 42,
  airAccel: 6,
  jumpSpeed: 4.4,
  gravity: 11.5,
};

export const BOT = {
  radius: 0.42,
  speed: 3.7,
  crouchSpeed: 1.8,
  eyeStand: 1.62,
  eyeCrouch: 1.12,
  viewRange: 62,
  viewCos: 0.42, // ~65 degrees half-angle
  hearShot: 30,
  hearPlant: 18,
};
