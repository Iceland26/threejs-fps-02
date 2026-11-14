// Transient visuals, all pooled: tracers, impact sparks, muzzle flashes, the charge's
// blinking light, explosions and smoke clouds. Nothing here allocates in the frame loop —
// pools are filled at load and recycled. Smoke clouds are also gameplay: main.js asks
// `smokeBlocks` before any sight check, so a Veil cloud genuinely hides what is behind it.

import * as THREE from 'three';
import { segmentHitsSphere } from './collision.js';

const MAX_TRACERS = 40;
const MAX_SPARKS = 24;
const MAX_CLOUDS = 6;

export function createEffects(scene) {
  const tracers = [];
  const tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  for (let i = 0; i < MAX_TRACERS; i++) {
    const mat = new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0 });
    const geo = tracerGeo.clone();
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    line.visible = false;
    scene.add(line);
    tracers.push({ line, geo, mat, life: 0 });
  }
  let tracerAt = 0;

  const sparks = [];
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 14), 3));
  for (let i = 0; i < MAX_SPARKS; i++) {
    const mat = new THREE.PointsMaterial({ color: 0xffc46b, size: 0.09, transparent: true, opacity: 0 });
    const geo = sparkGeo.clone();
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.visible = false;
    scene.add(points);
    sparks.push({ points, geo, mat, vel: new Float32Array(3 * 14), life: 0 });
  }
  let sparkAt = 0;

  const clouds = [];
  const cloudGeo = new THREE.SphereGeometry(1, 18, 14);
  for (let i = 0; i < MAX_CLOUDS; i++) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xb9c0c7, transparent: true, opacity: 0, roughness: 1, depthWrite: false });
    const mesh = new THREE.Mesh(cloudGeo, mat);
    mesh.visible = false;
    scene.add(mesh);
    clouds.push({ mesh, mat, x: 0, y: 0, z: 0, r: 0, targetR: 0, until: 0, active: false });
  }

  const boomLight = new THREE.PointLight(0xffa040, 0, 30, 1.6);
  scene.add(boomLight);
  const boomBall = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 16),
    new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0 }),
  );
  boomBall.visible = false;
  scene.add(boomBall);
  let boomT = -1;

  const flashLight = new THREE.PointLight(0xffd9a0, 0, 9, 2);
  scene.add(flashLight);
  let flashT = -1;
  const flashPos = new THREE.Vector3();

  let seed = 1234567;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  return {
    tracer(x1, y1, z1, x2, y2, z2, hostile) {
      const t = tracers[tracerAt];
      tracerAt = (tracerAt + 1) % MAX_TRACERS;
      const p = t.geo.getAttribute('position');
      p.setXYZ(0, x1, y1, z1);
      p.setXYZ(1, x2, y2, z2);
      p.needsUpdate = true;
      t.mat.color.set(hostile ? 0xff7a5c : 0xffd9a0);
      t.mat.opacity = 0.85;
      t.line.visible = true;
      t.life = 0.055;
    },
    sparks(x, y, z, blood) {
      const s = sparks[sparkAt];
      sparkAt = (sparkAt + 1) % MAX_SPARKS;
      const p = s.geo.getAttribute('position');
      for (let i = 0; i < 14; i++) {
        p.setXYZ(i, x, y, z);
        s.vel[i * 3] = (rnd() - 0.5) * 2.6;
        s.vel[i * 3 + 1] = rnd() * 2.4;
        s.vel[i * 3 + 2] = (rnd() - 0.5) * 2.6;
      }
      p.needsUpdate = true;
      s.mat.color.set(blood ? 0xc23b3b : 0xffc46b);
      s.mat.opacity = 1;
      s.points.visible = true;
      s.life = 0.32;
    },
    muzzle(x, y, z) {
      flashPos.set(x, y, z);
      flashLight.position.copy(flashPos);
      flashT = 0.045;
    },
    smoke(x, y, z, radius, duration, now) {
      const c = clouds.find((k) => !k.active) ?? clouds[0];
      c.x = x; c.y = y; c.z = z;
      c.r = radius * 0.3;
      c.targetR = radius;
      c.until = now + duration;
      c.active = true;
      c.mesh.position.set(x, y, z);
      c.mesh.visible = true;
    },
    smokeBlocks(x1, y1, z1, x2, y2, z2, now) {
      for (const c of clouds) {
        if (!c.active || now > c.until) continue;
        if (segmentHitsSphere(x1, y1, z1, x2, y2, z2, c.x, c.y, c.z, c.r * 0.95)) return true;
      }
      return false;
    },
    explosion(x, y, z) {
      boomT = 0;
      boomBall.position.set(x, y, z);
      boomBall.visible = true;
      boomLight.position.set(x, y + 1, z);
      for (let i = 0; i < 3; i++) this.sparks(x, y + 0.5, z, false);
    },
    update(dt, now) {
      for (const t of tracers) {
        if (t.life <= 0) continue;
        t.life -= dt;
        t.mat.opacity = Math.max(0, t.life / 0.055) * 0.85;
        if (t.life <= 0) t.line.visible = false;
      }
      for (const s of sparks) {
        if (s.life <= 0) continue;
        s.life -= dt;
        const p = s.geo.getAttribute('position');
        for (let i = 0; i < 14; i++) {
          s.vel[i * 3 + 1] -= 6.5 * dt;
          p.setXYZ(i, p.getX(i) + s.vel[i * 3] * dt, Math.max(0.03, p.getY(i) + s.vel[i * 3 + 1] * dt), p.getZ(i) + s.vel[i * 3 + 2] * dt);
        }
        p.needsUpdate = true;
        s.mat.opacity = Math.max(0, s.life / 0.32);
        if (s.life <= 0) s.points.visible = false;
      }
      for (const c of clouds) {
        if (!c.active) continue;
        if (now > c.until) {
          c.mat.opacity = Math.max(0, c.mat.opacity - dt * 0.5);
          c.r = Math.max(0.1, c.r - dt * 0.6);
          if (c.mat.opacity <= 0) { c.active = false; c.mesh.visible = false; }
        } else {
          c.r = Math.min(c.targetR, c.r + dt * 2.4);
          c.mat.opacity = Math.min(0.88, c.mat.opacity + dt * 1.8);
        }
        c.mesh.scale.setScalar(Math.max(0.1, c.r));
      }
      if (flashT >= 0) {
        flashT -= dt;
        flashLight.intensity = flashT > 0 ? 26 : 0;
      }
      if (boomT >= 0) {
        boomT += dt;
        const k = boomT / 0.55;
        if (k >= 1) {
          boomT = -1;
          boomBall.visible = false;
          boomLight.intensity = 0;
        } else {
          boomBall.scale.setScalar(0.5 + k * 6.5);
          boomBall.material.opacity = 0.85 * (1 - k);
          boomLight.intensity = 900 * (1 - k);
        }
      }
    },
  };
}
