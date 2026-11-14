// Builds the three.js scene from layout.js: ground with painted markings, every wall and
// prop as a box (barrels and fuel tanks as cylinders), the warehouse roof, the site rings,
// the crane over Site A, lamp posts and the dusk sky. Materials are flat-shaded colours from
// palette.js; the only texture is a canvas-generated asphalt, drawn once at load. Trim boxes
// along wall tops and container ribs give the flat colours their readability in screenshots.

import * as THREE from 'three';
import { WALLS, PROPS, SITES, LAMPS } from './layout.js';
import { PALETTE } from './palette.js';

function asphaltTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = PALETTE.ground;
  g.fillRect(0, 0, 256, 256);
  // Speckle and stains, deterministic so two loads draw the same yard.
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 2600; i++) {
    const v = 46 + Math.floor(rnd() * 26);
    g.fillStyle = `rgb(${v},${v + 3},${v + 7})`;
    g.fillRect(Math.floor(rnd() * 256), Math.floor(rnd() * 256), 2, 2);
  }
  for (let i = 0; i < 12; i++) {
    g.fillStyle = 'rgba(20,22,26,0.16)';
    g.beginPath();
    g.ellipse(rnd() * 256, rnd() * 256, 18 + rnd() * 42, 10 + rnd() * 26, rnd() * 3, 0, 7);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(17, 13);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function containerTexture(base, label) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  for (let x = 8; x < 256; x += 24) g.fillRect(x, 0, 7, 128); // corrugation ribs
  g.fillStyle = 'rgba(255,255,255,0.10)';
  for (let x = 16; x < 256; x += 24) g.fillRect(x, 0, 3, 128);
  g.fillStyle = 'rgba(236,232,222,0.75)';
  g.font = 'bold 17px system-ui, sans-serif';
  g.fillText(label, 18, 34);
  g.font = '11px system-ui, sans-serif';
  g.fillText('CINDERLINE FREIGHT CO.', 18, 54);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildWorld(scene) {
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.sky, 42, 125);

  const hemi = new THREE.HemisphereLight(0x8fa5c8, 0x2a241d, 1.15);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xa9c2e8, 1.35);
  moon.position.set(-30, 42, -18);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -40; moon.shadow.camera.right = 40;
  moon.shadow.camera.top = 34; moon.shadow.camera.bottom = -34;
  moon.shadow.camera.far = 120;
  moon.shadow.bias = -0.0006;
  scene.add(moon);
  const warm = new THREE.DirectionalLight(0xf0a830, 0.28); // low sun remnant from the west
  warm.position.set(-40, 9, 10);
  scene.add(warm);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(68, 52),
    new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.96, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Painted yard markings: lane lines and the two site circles' ground paint.
  const paintMat = new THREE.MeshBasicMaterial({ color: PALETTE.groundLine, transparent: true, opacity: 0.4 });
  const lineGeo = new THREE.PlaneGeometry(1, 0.18);
  const paint = (x, z, len, rot) => {
    const m = new THREE.Mesh(lineGeo, paintMat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = rot;
    m.position.set(x, 0.02, z);
    m.scale.x = len;
    scene.add(m);
  };
  paint(0, 19, 56, 0);
  paint(0, -19, 56, 0);
  paint(-28, 0, 38, Math.PI / 2);
  paint(28, 0, 38, Math.PI / 2);

  const mats = {};
  const matFor = (name) => {
    if (!mats[name]) {
      mats[name] = new THREE.MeshStandardMaterial({ color: PALETTE[name] ?? '#888888', roughness: 0.88, metalness: 0.05 });
    }
    return mats[name];
  };
  const containerMats = {};
  const containerMatFor = (name, label) => {
    if (!containerMats[name]) {
      containerMats[name] = new THREE.MeshStandardMaterial({ map: containerTexture(PALETTE[name], label), roughness: 0.8, metalness: 0.12 });
    }
    return containerMats[name];
  };
  const trimMat = new THREE.MeshStandardMaterial({ color: PALETTE.steelDark, roughness: 0.7, metalness: 0.2 });

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  let containerCount = 0;
  const addBox = (b, material, trim = true) => {
    const w = b.x2 - b.x1, d = b.z2 - b.z1;
    const mesh = new THREE.Mesh(boxGeo, material);
    mesh.scale.set(w, b.h, d);
    mesh.position.set(b.x1 + w / 2, b.h / 2, b.z1 + d / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    if (trim && b.h >= 2) {
      const cap = new THREE.Mesh(boxGeo, trimMat);
      cap.scale.set(w + 0.12, 0.14, d + 0.12);
      cap.position.set(b.x1 + w / 2, b.h + 0.07, b.z1 + d / 2);
      cap.castShadow = true;
      scene.add(cap);
    }
    return mesh;
  };

  for (const b of WALLS) {
    if (b.mat === 'tank') continue; // collider only — the cylinder pass below draws these
    const isContainer = ['rust', 'teal', 'mustard', 'slate'].includes(b.mat);
    if (isContainer) {
      containerCount++;
      addBox(b, containerMatFor(b.mat, `CL-${2040 + containerCount * 17}`), false);
    } else {
      addBox(b, matFor(b.mat));
    }
  }

  const crateMat = matFor('crate');
  const barrelGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
  const tankGeo = new THREE.CylinderGeometry(1.8, 1.8, 1, 22);
  for (const p of PROPS) {
    if (p.kind === 'barrel') {
      const mesh = new THREE.Mesh(barrelGeo, matFor('barrel'));
      mesh.scale.y = p.h;
      mesh.position.set((p.x1 + p.x2) / 2, p.h / 2, (p.z1 + p.z2) / 2);
      mesh.castShadow = true;
      scene.add(mesh);
    } else {
      addBox(p, crateMat, false);
    }
  }
  // The Site B tanks stand on their square colliders from WALLS (mat 'tank').
  for (const b of WALLS) {
    if (b.mat !== 'tank') continue;
    const mesh = new THREE.Mesh(tankGeo, matFor('tank'));
    mesh.scale.y = b.h;
    mesh.position.set((b.x1 + b.x2) / 2, b.h / 2, (b.z1 + b.z2) / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.84, 1.84, 0.3, 22), new THREE.MeshStandardMaterial({ color: PALETTE.rust, roughness: 0.7 }));
    band.position.set(mesh.position.x, b.h - 0.5, mesh.position.z);
    scene.add(band);
  }

  // Warehouse roof slab (visual only; the walls carry the collision).
  const roof = new THREE.Mesh(boxGeo, trimMat);
  roof.scale.set(22.6, 0.25, 14.6);
  roof.position.set(0, 3.72, 0);
  roof.castShadow = true;
  scene.add(roof);

  // The crane over Site A: two legs and a beam, visual dressing above the plant zone.
  const craneMat = new THREE.MeshStandardMaterial({ color: PALETTE.mustard, roughness: 0.6, metalness: 0.35 });
  const legGeo = new THREE.BoxGeometry(0.5, 8, 0.5);
  for (const [lx, lz] of [[-28.5, -14.5], [-28.5, -3.5], [-16.5, -14.5], [-16.5, -3.5]]) {
    const leg = new THREE.Mesh(legGeo, craneMat);
    leg.position.set(lx, 4, lz);
    leg.castShadow = true;
    scene.add(leg);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(13.5, 0.6, 0.6), craneMat);
  beam.position.set(-22.5, 8, -14.5);
  scene.add(beam);
  const beam2 = beam.clone();
  beam2.position.z = -3.5;
  scene.add(beam2);
  const trolley = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 1.2), trimMat);
  trolley.position.set(-22.5, 7.5, -9);
  scene.add(trolley);
  const cable = new THREE.Mesh(new THREE.BoxGeometry(0.06, 3.4, 0.06), trimMat);
  cable.position.set(-22.5, 5.6, -9);
  scene.add(cable);
  const hook = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 1.6), craneMat);
  hook.position.set(-22.5, 3.6, -9);
  hook.castShadow = true;
  scene.add(hook);

  // Site rings: a painted circle plus a low emissive ring that brightens when armed.
  const rings = {};
  for (const s of SITES) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(s.r - 0.35, s.r, 40),
      new THREE.MeshBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(s.x, 0.03, s.z);
    scene.add(ring);
    rings[s.id] = ring;
    // Corner posts so the zone reads from across the yard.
    const postGeo = new THREE.BoxGeometry(0.16, 1.5, 0.16);
    const postMat = new THREE.MeshStandardMaterial({ color: PALETTE.steelDark, emissive: PALETTE.accent, emissiveIntensity: 0.35 });
    for (const a of [0.4, 2.2, 3.9, 5.7]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(s.x + Math.cos(a) * s.r, 0.75, s.z + Math.sin(a) * s.r);
      scene.add(post);
    }
  }

  // Lamps: pole, emissive head, and a real light on every other post (perf).
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.4, 8);
  const poleMat = matFor('steelDark');
  const headMat = new THREE.MeshStandardMaterial({ color: '#ffd9a0', emissive: PALETTE.accent, emissiveIntensity: 2.2 });
  LAMPS.forEach((l, i) => {
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(l.x, 2.7, l.z);
    pole.castShadow = true;
    scene.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.3), headMat);
    head.position.set(l.x, 5.45, l.z);
    scene.add(head);
    if (i % 2 === 0) {
      const light = new THREE.PointLight(0xf0a830, 60, 26, 1.9);
      light.position.set(l.x, 5.3, l.z);
      scene.add(light);
    }
  });

  return { rings };
}
