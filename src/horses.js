import * as THREE from 'three';
import { PASTURE_WEST } from './layout.js';
import { srgb } from './materials.js';

// ---------- signed distance modeling, meshed with surface nets ----------
const sdCapsule = (px, py, pz, ax, ay, az, bx, by, bz, ra, rb) => {
  const pax = px - ax, pay = py - ay, paz = pz - az, bax = bx - ax, bay = by - ay, baz = bz - az;
  const h = Math.max(0, Math.min(1, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)));
  const dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h;
  return Math.hypot(dx, dy, dz) - (ra + (rb - ra) * h);
};
const sdEllipsoid = (px, py, pz, cx, cy, cz, rx, ry, rz) => {
  const x = (px - cx) / rx, y = (py - cy) / ry, z = (pz - cz) / rz;
  const k0 = Math.hypot(x, y, z);
  const k1 = Math.hypot(x / rx, y / ry, z / rz);
  return k1 > 0 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
};
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };

function surfaceNets(sdf, min, max, step, colorFn) {
  const nx = Math.ceil((max[0] - min[0]) / step) + 1, ny = Math.ceil((max[1] - min[1]) / step) + 1, nz = Math.ceil((max[2] - min[2]) / step) + 1;
  const field = new Float32Array(nx * ny * nz);
  const I = (i, j, k) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    field[I(i, j, k)] = sdf(min[0] + i * step, min[1] + j * step, min[2] + k * step);
  }
  const vid = new Int32Array(nx * ny * nz).fill(-1);
  const pos = [], nrm = [], col = [], idx = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const v = corners.map(([a, b, c]) => field[I(i + a, j + b, k + c)]);
    let inside = 0;
    for (const d of v) if (d < 0) inside++;
    if (inside === 0 || inside === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [e0, e1] of edges) {
      const d0 = v[e0], d1 = v[e1];
      if ((d0 < 0) === (d1 < 0)) continue;
      const t = d0 / (d0 - d1);
      const c0 = corners[e0], c1 = corners[e1];
      sx += c0[0] + (c1[0] - c0[0]) * t; sy += c0[1] + (c1[1] - c0[1]) * t; sz += c0[2] + (c1[2] - c0[2]) * t; n++;
    }
    const x = min[0] + (i + sx / n) * step, y = min[1] + (j + sy / n) * step, z = min[2] + (k + sz / n) * step;
    vid[I(i, j, k)] = pos.length / 3;
    pos.push(x, y, z);
    const e = step * 0.5;
    const gx = sdf(x + e, y, z) - sdf(x - e, y, z), gy = sdf(x, y + e, z) - sdf(x, y - e, z), gz = sdf(x, y, z + e) - sdf(x, y, z - e);
    const gl = Math.hypot(gx, gy, gz) || 1;
    nrm.push(gx / gl, gy / gl, gz / gl);
    const c = colorFn(x, y, z);
    col.push(c.r, c.g, c.b);
  }
  // quads across sign-changing grid edges
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const d0 = field[I(i, j, k)];
    for (const axis of [0, 1, 2]) {
      const [di, dj, dk] = axis === 0 ? [1, 0, 0] : axis === 1 ? [0, 1, 0] : [0, 0, 1];
      if (i + di >= nx || j + dj >= ny || k + dk >= nz) continue;
      const d1 = field[I(i + di, j + dj, k + dk)];
      if ((d0 < 0) === (d1 < 0)) continue;
      // the four cells around this edge
      let q;
      if (axis === 0) q = [I(i, j, k), I(i, j - 1, k), I(i, j - 1, k - 1), I(i, j, k - 1)];
      else if (axis === 1) q = [I(i, j, k), I(i, j, k - 1), I(i - 1, j, k - 1), I(i - 1, j, k)];
      else q = [I(i, j, k), I(i - 1, j, k), I(i - 1, j - 1, k), I(i, j - 1, k)];
      const vs = q.map((c) => vid[c]);
      if (vs.some((v) => v < 0)) continue;
      if (d0 < 0) idx.push(vs[0], vs[1], vs[2], vs[0], vs[2], vs[3]);
      else idx.push(vs[0], vs[3], vs[2], vs[0], vs[2], vs[1]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

// ---------- one horse ----------
// Facing +x. Origin on the ground under the barrel.
const COATS = {
  bay: { body: srgb(108, 56, 30), points: srgb(26, 20, 18), mane: srgb(22, 18, 16), socks: null },
  sorrel: { body: srgb(150, 78, 36), points: srgb(140, 72, 34), mane: srgb(196, 160, 104), socks: srgb(232, 226, 214) },
  gray: { body: srgb(196, 192, 184), points: srgb(110, 108, 104), mane: srgb(170, 166, 160), socks: null },
};

function buildHorseGeometry(coat) {
  const C = COATS[coat];
  const step = 0.03;
  const bodySdf = (x, y, z) => {
    let d = sdEllipsoid(x, y, z, 0.0, 1.13, 0, 0.72, 0.39, 0.34);
    d = smin(d, sdEllipsoid(x, y, z, 0.55, 1.2, 0, 0.33, 0.36, 0.28), 0.22);
    d = smin(d, sdEllipsoid(x, y, z, -0.58, 1.23, 0, 0.4, 0.38, 0.31), 0.22);
    d = smin(d, sdEllipsoid(x, y, z, 0.42, 1.44, 0, 0.27, 0.14, 0.13), 0.15);
    d = smin(d, sdEllipsoid(x, y, z, -0.68, 1.42, 0, 0.3, 0.12, 0.2), 0.14);
    for (const sz of [-1, 1]) {
      d = smin(d, sdEllipsoid(x, y, z, 0.47, 1.12, sz * 0.16, 0.2, 0.3, 0.13), 0.1);
      d = smin(d, sdEllipsoid(x, y, z, -0.55, 1.08, sz * 0.17, 0.3, 0.32, 0.14), 0.12);
    }
    // tops of the legs blend into the body
    for (const sz of [-0.15, 0.15]) {
      d = smin(d, sdCapsule(x, y, z, 0.5, 1.05, sz, 0.52, 0.75, sz, 0.12, 0.08), 0.12);
      d = smin(d, sdCapsule(x, y, z, -0.6, 1.1, sz, -0.66, 0.78, sz, 0.15, 0.09), 0.14);
    }
    return d;
  };
  // neck frame: pivot at the withers, poll at (0.62, 0.72)
  const neckMain = (x, y, z) => sdCapsule(x, y, z, 0, 0, 0, 0.62, 0.72, 0, 0.24, 0.125);
  const crest = (x, y, z) => sdCapsule(x, y, z, -0.06, 0.2, 0, 0.54, 0.83, 0, 0.055, 0.035);
  const neckSdf = (x, y, z) => Math.min(neckMain(x, y, z), crest(x, y, z));
  // head frame: pivot at the poll, muzzle down and forward
  const headSdf = (x, y, z) => {
    let d = sdCapsule(x, y, z, 0, 0, 0, 0.3, -0.52, 0, 0.115, 0.075);
    d = smin(d, sdEllipsoid(x, y, z, 0.07, -0.11, 0, 0.15, 0.13, 0.105), 0.06);
    d = smin(d, sdEllipsoid(x, y, z, 0.3, -0.55, 0, 0.085, 0.065, 0.078), 0.04);
    for (const sz of [-0.055, 0.055]) d = smin(d, sdCapsule(x, y, z, -0.02, 0.05, sz, -0.07, 0.2, sz * 1.6, 0.032, 0.008), 0.02);
    // forelock
    d = Math.min(d, sdCapsule(x, y, z, -0.01, 0.06, 0, 0.06, -0.06, 0, 0.03, 0.02));
    return d;
  };
  const legSdf = (x, y, z, hind) => {
    // leg frame: pivot at origin (top), straight down to the hoof at y=-1.0
    let d = hind
      ? smin(sdCapsule(x, y, z, 0, 0, 0, -0.06, -0.48, 0, 0.085, 0.055), sdCapsule(x, y, z, -0.06, -0.48, 0, 0.0, -0.92, 0, 0.05, 0.043), 0.04)
      : smin(sdCapsule(x, y, z, 0, 0, 0, 0.0, -0.5, 0, 0.08, 0.055), sdCapsule(x, y, z, 0.0, -0.5, 0, 0.02, -0.92, 0, 0.048, 0.043), 0.04);
    d = smin(d, sdCapsule(x, y, z, 0.01, -0.92, 0, 0.02, -1.0, 0, 0.06, 0.065), 0.03);
    return d;
  };
  const bodyColor = () => C.body;
  const neckColor = (x, y, z) => (crest(x, y, z) < neckMain(x, y, z) + 0.01 ? C.mane : C.body);
  const headColor = (x, y, z) => {
    if (x < 0.06 && y > -0.08 && Math.abs(z) < 0.035) return C.mane;
    if (coat === 'sorrel' && Math.abs(z) < 0.03 && x > 0.08) return C.socks;
    if (y < -0.45) return C.body.clone().lerp(srgb(30, 26, 24), coat === 'gray' ? 0.4 : 0.55);
    return C.body;
  };
  const legColor = (x, y) => {
    if (y < -0.93) return srgb(40, 34, 30);
    if (C.socks && y < -0.7) return C.socks;
    if (y < -0.45) return C.points;
    return C.body.clone().lerp(C.points, Math.min(1, Math.max(0, (-0.3 - y) / 0.2)));
  };
  return {
    body: surfaceNets(bodySdf, [-1.05, 0.65, -0.4], [0.95, 1.65, 0.4], step, bodyColor),
    neck: surfaceNets(neckSdf, [-0.3, -0.3, -0.28], [0.85, 0.95, 0.28], step * 0.85, neckColor),
    head: surfaceNets(headSdf, [-0.2, -0.68, -0.18], [0.45, 0.28, 0.18], step * 0.6, headColor),
    fore: surfaceNets((x, y, z) => legSdf(x, y, z, false), [-0.15, -1.06, -0.12], [0.15, 0.1, 0.12], step * 0.6, legColor),
    hind: surfaceNets((x, y, z) => legSdf(x, y, z, true), [-0.18, -1.06, -0.12], [0.12, 0.1, 0.12], step * 0.6, legColor),
    tail: (() => {
      const g = new THREE.ConeGeometry(0.07, 0.8, 7, 4);
      g.translate(0, -0.4, 0);
      const c = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < c.length; i += 3) { c[i] = C.mane.r; c[i + 1] = C.mane.g; c[i + 2] = C.mane.b; }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      return g;
    })(),
  };
}

class Horse {
  constructor(coat, x, z, T, mat) {
    this.T = T;
    const G = buildHorseGeometry(coat);
    this.root = new THREE.Group();
    const add = (geo, parent = this.root) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
    add(G.body);
    this.neck = new THREE.Group();
    this.neck.position.set(0.6, 1.25, 0);
    this.root.add(this.neck);
    add(G.neck, this.neck);
    this.head = new THREE.Group();
    this.head.position.set(0.62, 0.72, 0);
    this.neck.add(this.head);
    add(G.head, this.head);
    this.legs = [];
    for (const [lx, hind] of [[0.51, false], [-0.62, true]]) {
      for (const lz of [-0.15, 0.15]) {
        const pivot = new THREE.Group();
        pivot.position.set(lx, 1.0, lz);
        this.root.add(pivot);
        add(hind ? G.hind : G.fore, pivot);
        this.legs.push({ pivot, phase: (hind ? Math.PI : 0) + (lz > 0 ? Math.PI : 0) });
      }
    }
    this.tail = new THREE.Group();
    this.tail.position.set(-0.98, 1.36, 0);
    this.tail.rotation.z = -0.25;
    this.root.add(this.tail);
    const strands = [];
    for (let i = 0; i < 4; i++) {
      const s = add(G.tail, this.tail);
      s.position.set(0, -0.05 * i, (i - 1.5) * 0.025);
      s.scale.set(1 - i * 0.12, 1 + i * 0.05, 1);
      strands.push(s);
    }
    this.x = x; this.z = z;
    this.heading = Math.random() * Math.PI * 2;
    this.state = 'graze';
    this.timer = 5 + Math.random() * 10;
    this.headDown = 1;
    this.walkPhase = 0;
    this.speed = 0;
    this.target = null;
    this.swish = 0;
    this.swishT = Math.random() * 5;
    this.lookYaw = 0;
    this.noticed = false;
    this.colliders = [{ c: [x, z], r: 0.55 }, { c: [x, z], r: 0.55 }];
  }

  update(dt, t, playerPos, sound) {
    const P = PASTURE_WEST;
    const dPlayer = playerPos ? Math.hypot(playerPos.x - this.x, playerPos.z - this.z) : 1e9;
    this.timer -= dt;
    if (this.state === 'graze') {
      this.headDown += (1 - this.headDown) * Math.min(1, dt * 1.5);
      if (this.timer <= 0) {
        const r = Math.random();
        if (r < 0.55) {
          // a few steps to fresher grass
          const a = this.heading + (Math.random() - 0.5) * 1.6;
          const d = 1.2 + Math.random() * 3;
          this.target = [this.x + Math.cos(a) * d, this.z - Math.sin(a) * d];
          this.state = 'walk';
          this.speed = 0.55;
        } else if (r < 0.75) {
          this.state = 'look';
          this.timer = 3 + Math.random() * 5;
        } else this.timer = 4 + Math.random() * 8;
        if (this.state === 'graze') this.timer = 4 + Math.random() * 8;
      }
      if (dPlayer < 9 && sound && Math.random() < dt * 0.35) sound.horse(this.emitter(sound), 'chew');
    } else if (this.state === 'look') {
      this.headDown += (0 - this.headDown) * Math.min(1, dt * 1.8);
      if (this.timer <= 0) { this.state = 'graze'; this.timer = 5 + Math.random() * 10; }
    } else if (this.state === 'walk' || this.state === 'move') {
      this.headDown += ((this.state === 'move' ? 0 : 0.55) - this.headDown) * Math.min(1, dt * 2);
      const dx = this.target[0] - this.x, dz = this.target[1] - this.z;
      const d = Math.hypot(dx, dz);
      const want = Math.atan2(-dz, dx);
      let da = ((want - this.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      this.heading += Math.max(-dt * 1.2, Math.min(dt * 1.2, da));
      if (Math.abs(da) < 0.8) {
        this.x += Math.cos(this.heading) * this.speed * dt;
        this.z -= Math.sin(this.heading) * this.speed * dt;
        this.walkPhase += dt * this.speed * 4.2;
        if (sound && Math.floor(this.walkPhase / Math.PI) !== Math.floor((this.walkPhase - dt * this.speed * 4.2) / Math.PI)) sound.horse(this.emitter(sound), 'hoof');
      }
      if (d < 0.3) { this.state = 'graze'; this.timer = 4 + Math.random() * 10; this.speed = 0; }
    }
    // if you walk right up, they notice, maybe say something, and ease away
    if (dPlayer < 10 && !this.noticed) {
      this.noticed = true;
      if (sound && Math.random() < 0.7) sound.horse(this.emitter(sound), Math.random() < 0.5 ? 'nicker' : 'snort');
      if (this.state === 'graze') { this.state = 'look'; this.timer = 4 + Math.random() * 3; }
    }
    if (dPlayer > 16) this.noticed = false;
    if (dPlayer < 2.6 && this.state !== 'move') {
      const a = Math.atan2(-(this.z - playerPos.z), this.x - playerPos.x) + (Math.random() - 0.5) * 0.6;
      this.target = [this.x + Math.cos(a) * 4, this.z - Math.sin(a) * 4];
      this.state = 'move';
      this.speed = 1.1;
    }
    if (sound && Math.random() < dt / 40) sound.horse(this.emitter(sound), 'snort');
    this.x = Math.max(P[0] + 2, Math.min(P[2] - 2, this.x));
    this.z = Math.max(P[1] + 2, Math.min(P[3] - 2, this.z));
    if (this.target) { this.target[0] = Math.max(P[0] + 2, Math.min(P[2] - 2, this.target[0])); this.target[1] = Math.max(P[1] + 2, Math.min(P[3] - 2, this.target[1])); }

    // pose
    const y = this.T.heightAt(this.x, this.z);
    this.root.position.set(this.x, y, this.z);
    this.root.rotation.y = this.heading;
    const breathe = Math.sin(t * 1.6 + this.x) * 0.004;
    this.root.position.y += breathe;
    // head: grazing puts the muzzle in the grass
    const wantYaw = this.state === 'look' && dPlayer < 25 ? Math.max(-0.6, Math.min(0.6, ((Math.atan2(-(playerPos.z - this.z), playerPos.x - this.x) - this.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI)) : 0;
    this.lookYaw += (wantYaw - this.lookYaw) * Math.min(1, dt * 2);
    this.neck.rotation.set(0, this.lookYaw, -this.headDown * 1.55 + Math.sin(t * 0.9 + this.z) * 0.02, 'YXZ');
    this.head.rotation.z = this.headDown * 1.1 + (this.state === 'graze' ? Math.sin(t * 2.3 + this.x) * 0.05 : 0);
    // legs
    const moving = this.state === 'walk' || this.state === 'move';
    for (const l of this.legs) l.pivot.rotation.z = moving ? Math.sin(this.walkPhase + l.phase) * 0.28 : l.pivot.rotation.z * 0.9;
    // tail swishes at flies
    this.swishT -= dt;
    if (this.swishT <= 0) { this.swish = 1; this.swishT = 2 + Math.random() * 7; }
    this.swish = Math.max(0, this.swish - dt * 0.9);
    this.tail.rotation.x = Math.sin(t * 7) * 0.5 * this.swish;
    this.tail.rotation.z = -0.25 - this.swish * 0.25;
    // collision circles at chest and hip
    const cx = Math.cos(this.heading), cz = -Math.sin(this.heading);
    this.colliders[0].c[0] = this.x + cx * 0.6; this.colliders[0].c[1] = this.z + cz * 0.6;
    this.colliders[1].c[0] = this.x - cx * 0.55; this.colliders[1].c[1] = this.z - cz * 0.55;
    if (this.em) this.em.set(this.x + cx * 1.3, y + (this.headDown > 0.5 ? 0.3 : 1.8), this.z + cz * 1.3);
  }

  emitter(sound) {
    if (!this.em) this.em = sound.emitter(this.x, 1.5, this.z, { ref: 3 });
    return this.em;
  }
}

export function buildHorses(T) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.0 });
  const horses = [new Horse('bay', -60, 4, T, mat), new Horse('sorrel', -72, 24, T, mat), new Horse('gray', -56, 36, T, mat)];
  const group = new THREE.Group();
  for (const h of horses) group.add(h.root);
  const colliders = horses.flatMap((h) => h.colliders);
  let t = 0;
  const update = (dt, playerPos, sound) => {
    t += dt;
    for (const h of horses) h.update(dt, t, playerPos, sound && sound.started ? sound : null);
  };
  update(0.016, null, null);
  return { group, colliders, update, horses };
}
