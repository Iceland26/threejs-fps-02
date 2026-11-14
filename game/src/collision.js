// Collision and sight against the layout's boxes. Characters are circles on the ground
// plane; bullets and sight lines are 3D segments tested against the boxes' full height, so a
// low cover wall hides a crouched player but not a standing one. Everything here is pure
// arithmetic on the layout tables — no three.js, no allocation in the hot paths.

import { WALLS, PROPS } from './layout.js';

export const SOLIDS = [...WALLS, ...PROPS];

// Push a circle of radius r at (x, z) out of every solid it overlaps. Two passes settle
// corners. Returns nothing; x and z are updated through the holder object.
export function collideCircle(holder, r) {
  for (let pass = 0; pass < 2; pass++) {
    for (const b of SOLIDS) {
      const nx = Math.max(b.x1, Math.min(holder.x, b.x2));
      const nz = Math.max(b.z1, Math.min(holder.z, b.z2));
      let dx = holder.x - nx;
      let dz = holder.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        holder.x = nx + (dx / d) * r;
        holder.z = nz + (dz / d) * r;
      } else {
        // Centre inside the box: leave by the shallowest face.
        const left = holder.x - b.x1, right = b.x2 - holder.x;
        const top = holder.z - b.z1, bottom = b.z2 - holder.z;
        const m = Math.min(left, right, top, bottom);
        if (m === left) holder.x = b.x1 - r;
        else if (m === right) holder.x = b.x2 + r;
        else if (m === top) holder.z = b.z1 - r;
        else holder.z = b.z2 + r;
      }
    }
  }
  // The yard's hard edge, inside the perimeter walls.
  holder.x = Math.max(-32.5, Math.min(32.5, holder.x));
  holder.z = Math.max(-24.5, Math.min(24.5, holder.z));
}

// Segment vs one box in 3D (slab test). The box stands on the ground: y from 0 to b.h.
// Returns the entry parameter t in [0, 1], or Infinity when the segment misses.
function segmentBoxT(x1, y1, z1, dx, dy, dz, b) {
  let t0 = 0, t1 = 1;
  // x slab
  if (Math.abs(dx) < 1e-9) { if (x1 < b.x1 || x1 > b.x2) return Infinity; }
  else {
    let ta = (b.x1 - x1) / dx, tb = (b.x2 - x1) / dx;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return Infinity;
  }
  // y slab (ground to h)
  if (Math.abs(dy) < 1e-9) { if (y1 < 0 || y1 > b.h) return Infinity; }
  else {
    let ta = (0 - y1) / dy, tb = (b.h - y1) / dy;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return Infinity;
  }
  // z slab
  if (Math.abs(dz) < 1e-9) { if (z1 < b.z1 || z1 > b.z2) return Infinity; }
  else {
    let ta = (b.z1 - z1) / dz, tb = (b.z2 - z1) / dz;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return Infinity;
  }
  return t0;
}

// True when nothing solid blocks the straight line between two points (sight, grenade arcs'
// endpoints, bot vision). Smoke is tested by the caller, which owns the cloud list.
export function lineOfSight(x1, y1, z1, x2, y2, z2) {
  const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
  for (const b of SOLIDS) {
    if (segmentBoxT(x1, y1, z1, dx, dy, dz, b) <= 1) return false;
  }
  return true;
}

// Cast a ray (origin + direction * range) against the world. Returns the distance to the
// nearest box face, or range when nothing is hit. Used for bullets and bot aim checks.
export function raycastWorld(ox, oy, oz, dx, dy, dz, range) {
  let best = range;
  for (const b of SOLIDS) {
    const t = segmentBoxT(ox, oy, oz, dx * range, dy * range, dz * range, b);
    if (t <= 1) {
      const d = t * range;
      if (d < best) best = d;
    }
  }
  // The ground plane.
  if (dy < -1e-9) {
    const d = -oy / dy;
    if (d > 0 && d < best) best = d;
  }
  return best;
}

// Does the segment pass through a sphere? For smoke clouds blocking sight.
export function segmentHitsSphere(x1, y1, z1, x2, y2, z2, cx, cy, cz, r) {
  const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
  const len2 = dx * dx + dy * dy + dz * dz;
  let t = 0;
  if (len2 > 1e-9) t = Math.max(0, Math.min(1, ((cx - x1) * dx + (cy - y1) * dy + (cz - z1) * dz) / len2));
  const px = x1 + dx * t - cx, py = y1 + dy * t - cy, pz = z1 + dz * t - cz;
  return px * px + py * py + pz * pz < r * r;
}
