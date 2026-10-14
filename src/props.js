import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FENCES, LAMP_POST, MAILBOX, SPRINKLERS, WHEEL_LINE, polePositions, HOUSE, roadX } from './layout.js';
import { patternMaterial } from './materials.js';
import { rng } from './geo.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

function boxAt(cx, cy, cz, sx, sy, sz, rotY = 0) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  if (rotY) g.rotateY(rotY);
  g.translate(cx, cy, cz);
  return g;
}
function rod(a, b, r, seg = 6) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, b.clone().sub(a).normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

export function buildProps(T) {
  const groups = new Map();
  const add = (k, g) => { if (!groups.has(k)) groups.set(k, []); groups.get(k).push(g); };
  const wires = [];
  const colliders = [];
  const R = rng(5);
  const H = (x, z) => T.heightAt(x, z);

  // ---------- fences ----------
  for (const f of FENCES) {
    for (let i = 0; i < f.pts.length - 1; i++) {
      const [x0, z0] = f.pts[i], [x1, z1] = f.pts[i + 1];
      const len = Math.hypot(x1 - x0, z1 - z0);
      const ang = Math.atan2(z1 - z0, x1 - x0);
      const spacing = f.type === 'wire' ? 4.6 : f.type === 'pipe' ? 3.05 : f.type === 'white' ? 2.45 : 2.45;
      const n = Math.max(1, Math.round(len / spacing));
      colliders.push({ seg: [x0, z0, x1, z1], r: 0.12 });
      for (let k = 0; k <= n; k++) {
        if (k === n && i < f.pts.length - 2) continue;
        const t = k / n;
        const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
        const y = H(x, z);
        if (f.type === 'board') add('woodPost', boxAt(x, y + 0.55, z, 0.15, 1.9, 0.15, -ang));
        else if (f.type === 'pipe') add('steel', rod(V(x, y - 0.3, z), V(x, y + 1.55, z), 0.045, 8));
        else if (f.type === 'white') add('vinyl', boxAt(x, y + 0.5, z, 0.13, 1.3, 0.13, -ang));
        else {
          const tpost = k % 3 !== 0;
          if (tpost) add('tpost', boxAt(x, y + 0.5, z, 0.05, 1.3, 0.035, -ang));
          else add('woodPost', rod(V(x, y - 0.2, z), V(x, y + 1.35, z), 0.065, 6));
        }
        if (k < n) {
          const t2 = (k + 1) / n;
          const xb = x0 + (x1 - x0) * t2, zb = z0 + (z1 - z0) * t2;
          const yb = H(xb, zb);
          const mx = (x + xb) / 2, mz = (z + zb) / 2;
          const segLen = Math.hypot(xb - x, zb - z);
          const pitch = Math.atan2(yb - y, segLen);
          const nx = -Math.sin(ang) * 0.09, nz = Math.cos(ang) * 0.09;
          if (f.type === 'board') {
            for (const hgt of [0.42, 0.8, 1.18]) {
              const g = new THREE.BoxGeometry(segLen + 0.12, 0.14, 0.035);
              g.rotateZ(pitch);
              g.rotateY(-ang);
              g.translate(mx + nx, (y + yb) / 2 + hgt, mz + nz);
              add('board', g);
            }
          } else if (f.type === 'pipe') {
            for (const hgt of [0.35, 0.68, 1.01, 1.34]) add('steel', rod(V(x, y + hgt, z), V(xb, yb + hgt, zb), 0.026, 6));
          } else if (f.type === 'white') {
            for (const hgt of [0.45, 0.95]) {
              const g = new THREE.BoxGeometry(segLen, 0.14, 0.04);
              g.rotateZ(pitch);
              g.rotateY(-ang);
              g.translate(mx, (y + yb) / 2 + hgt, mz);
              add('vinyl', g);
            }
          } else {
            for (const hgt of [0.35, 0.65, 0.95, 1.22]) {
              const sag = 0.03;
              wires.push(x, y + hgt, z, mx, (y + yb) / 2 + hgt - sag, mz, mx, (y + yb) / 2 + hgt - sag, mz, xb, yb + hgt, zb);
            }
          }
        }
      }
    }
  }
  // the pipe gate into the west pasture, swung open
  {
    const hx = -45, hz = 9, y = H(hx, hz), a = -2.0, L = 4.2;
    const ex = hx + Math.cos(a) * L, ez = hz + Math.sin(a) * L;
    for (const hgt of [0.3, 0.62, 0.94, 1.26]) add('steel', rod(V(hx, y + hgt, hz), V(ex, y + hgt, ez), 0.028, 6));
    add('steel', rod(V(hx, y + 0.25, hz), V(hx, y + 1.3, hz), 0.032, 6));
    add('steel', rod(V(ex, y + 0.25, ez), V(ex, y + 1.3, ez), 0.032, 6));
    add('woodPost', boxAt(hx, y + 0.55, hz + 0.05, 0.2, 1.9, 0.2));
    add('woodPost', boxAt(-45, H(-45, 4.5) + 0.55, 4.45, 0.2, 1.9, 0.2));
    colliders.push({ seg: [hx, hz, ex, ez], r: 0.1 });
  }

  // ---------- power line along the road ----------
  const poles = polePositions();
  const arm = (p) => {
    const [x, z] = p;
    const y = H(x, z);
    return { x, z, y, top: y + 10.2 };
  };
  const P = poles.map(arm);
  for (const p of P) {
    add('pole', rod(V(p.x, p.y - 0.5, p.z), V(p.x, p.top, p.z), 0.15, 8));
    add('pole', boxAt(p.x, p.top - 0.55, p.z, 0.1, 0.12, 2.4));
    for (const dz of [-1.05, 0.0, 1.05]) add('insulator', rod(V(p.x, p.top - 0.48, p.z + dz), V(p.x, p.top - 0.2, p.z + dz), 0.045, 6));
    colliders.push({ c: [p.x, p.z], r: 0.25 });
  }
  const catenary = (a, b, sag, n = 10) => {
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const f = (t) => V(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t), a.z + (b.z - a.z) * t);
      const p0 = f(t0), p1 = f(t1);
      wires.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
    }
  };
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1];
    for (const dz of [-1.05, 0.0, 1.05]) catenary(V(a.x, a.top - 0.2, a.z + dz), V(b.x, b.top - 0.2, b.z + dz), 0.9);
    catenary(V(a.x, a.top - 1.9, a.z), V(b.x, b.top - 1.9, b.z), 0.8);
  }
  // transformer and service drop to the house
  const near = P.reduce((best, p) => (Math.hypot(p.x - 10, p.z - 10) < Math.hypot(best.x - 10, best.z - 10) ? p : best), P[0]);
  add('transformer', rod(V(near.x - 0.35, near.top - 2.9, near.z), V(near.x - 0.35, near.top - 2.0, near.z), 0.26, 12));
  const hy = T.pads[0].y + HOUSE.eaveY - 0.1;
  catenary(V(near.x - 0.3, near.top - 2.3, near.z), V(0.15, hy, HOUSE.main[3] - 0.6), 0.7, 14);
  add('iron', rod(V(0.12, hy - 0.4, HOUSE.main[3] - 0.6), V(0.12, hy + 0.6, HOUSE.main[3] - 0.6), 0.025, 6));

  // ---------- lamp post and mailbox ----------
  {
    const [x, z] = LAMP_POST, y = H(x, z);
    add('vinyl', boxAt(x, y + 0.95, z, 0.11, 1.9, 0.11));
    add('vinyl', boxAt(x, y + 0.1, z, 0.22, 0.2, 0.22));
    add('iron', boxAt(x, y + 1.93, z, 0.26, 0.06, 0.26));
    add('lampGlass', boxAt(x, y + 2.13, z, 0.21, 0.34, 0.21));
    add('iron', boxAt(x, y + 2.33, z, 0.3, 0.05, 0.3));
    add('iron', new THREE.ConeGeometry(0.2, 0.16, 4).rotateY(Math.PI / 4).translate(x, y + 2.43, z));
    colliders.push({ c: [x, z], r: 0.15 });
  }
  {
    const [x, z] = MAILBOX, y = H(x, z);
    add('woodPost', boxAt(x, y + 0.55, z, 0.1, 1.15, 0.1));
    add('woodPost', boxAt(x, y + 1.12, z, 0.55, 0.05, 0.22));
    add('mailbox', boxAt(x, y + 1.24, z, 0.5, 0.17, 0.19));
    add('mailbox', new THREE.CylinderGeometry(0.095, 0.095, 0.5, 12).rotateZ(Math.PI / 2).translate(x, y + 1.32, z));
    add('flag', boxAt(x - 0.05, y + 1.35, z + 0.11, 0.035, 0.18, 0.012));
    colliders.push({ c: [x, z], r: 0.15 });
  }

  // ---------- troughs, feeder ----------
  const trough = (x, z, len = 1.8, w = 0.75) => {
    const y = H(x, z);
    const g = new THREE.CylinderGeometry(1, 1, 0.6, 20, 1, true);
    g.scale(len / 2, 1, w / 2);
    g.translate(x, y + 0.3, z);
    add('galv', g);
    const water = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
    water.scale(len / 2 - 0.03, 1, w / 2 - 0.03);
    water.translate(x, y + 0.52, z);
    add('water', water);
    colliders.push({ c: [x, z], r: len / 2 });
  };
  trough(-49.5, 11.5);
  trough(-27, 26.5, 1.4, 0.7);
  {
    const x = 2.0, z = 34.0, y = H(x, z);
    const bale = new THREE.CylinderGeometry(0.8, 0.8, 1.25, 20).rotateZ(Math.PI / 2).translate(x, y + 0.8, z);
    add('hay', bale);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      add('steel', rod(V(x + Math.cos(a) * 1.05, y, z + Math.sin(a) * 1.05), V(x + Math.cos(a) * 1.05, y + 1.2, z + Math.sin(a) * 1.05), 0.022, 5));
    }
    for (const hgt of [0.25, 1.2]) add('steel', new THREE.TorusGeometry(1.05, 0.025, 5, 28).rotateX(Math.PI / 2).translate(x, y + hgt, z));
    colliders.push({ c: [x, z], r: 1.15 });
  }

  // ---------- hoses from the spigots out to the sprinklers ----------
  for (const s of SPRINKLERS) {
    const [bx, bz] = s.bib;
    const pts = [];
    const dx = s.x - bx, dz = s.z - bz;
    const nx = -dz, nz = dx;
    const L = Math.hypot(dx, dz);
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const wig = Math.sin(t * Math.PI * 2.2 + R() * 0.3) * 0.12 * L / Math.max(L, 1);
      const x = bx + dx * t + nx / L * wig * 4, z = bz + dz * t + nz / L * wig * 4;
      const y = (i === 0 ? T.pads[0].y + 0.5 : H(x, z) + 0.018);
      pts.push(V(x, y, z));
    }
    pts.splice(1, 0, V(bx + dx / L * 0.25, H(bx, bz) + 0.05, bz + dz / L * 0.25));
    add('hose', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.012, 5, false));
    // the spike base under the head
    const y = H(s.x, s.z);
    add('brass', rod(V(s.x, y - 0.05, s.z), V(s.x, y + 0.3, s.z), 0.012, 6));
    add('steel', boxAt(s.x, y + 0.04, s.z, 0.18, 0.012, 0.05));
  }

  // ---------- wheel line in the field across the road ----------
  const wheelParts = [];
  const WL = WHEEL_LINE;
  const wheelR = 0.92;
  for (let z = WL.z0; z <= WL.z1 + 0.01; z += WL.spacing) {
    const x = WL.x, y = H(x, z);
    add('alu', new THREE.TorusGeometry(wheelR, 0.03, 5, 26).translate(x, y + wheelR, z));
    const hub = V(x, y + wheelR, z);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      add('alu', rod(hub, V(x + Math.cos(a) * wheelR, y + wheelR + Math.sin(a) * wheelR, z), 0.012, 4));
    }
    wheelParts.push({ x, z, y: y + wheelR });
  }
  for (let i = 0; i < wheelParts.length - 1; i++) {
    const a = wheelParts[i], b = wheelParts[i + 1];
    add('alu', rod(V(a.x, a.y, a.z), V(b.x, b.y, b.z), 0.06, 8));
    const mz = (a.z + b.z) / 2, my = (a.y + b.y) / 2;
    add('alu', rod(V(a.x, my, mz), V(a.x, my + 0.55, mz), 0.015, 5));
    add('brass', boxAt(a.x, my + 0.6, mz, 0.12, 0.06, 0.05));
  }
  // the mover
  {
    const mid = wheelParts[Math.floor(wheelParts.length / 2)];
    add('mover', boxAt(mid.x, mid.y + 0.15, mid.z + 1.6, 0.9, 0.7, 1.2));
    add('iron', boxAt(mid.x, mid.y - 0.3, mid.z + 1.6, 0.7, 0.2, 1.0));
  }

  const M = {
    woodPost: patternMaterial({ color: [116, 100, 82], pattern: 'concrete', rough: 1 }),
    board: patternMaterial({ color: [138, 124, 106], pattern: 'concrete', rough: 1 }),
    steel: patternMaterial({ color: [150, 152, 150], rough: 0.5, metal: 0.55 }),
    vinyl: patternMaterial({ color: [244, 243, 238], rough: 0.5 }),
    tpost: patternMaterial({ color: [52, 74, 54], rough: 0.6, metal: 0.4 }),
    pole: patternMaterial({ color: [92, 76, 60], pattern: 'concrete', rough: 1 }),
    insulator: patternMaterial({ color: [120, 132, 128], rough: 0.3 }),
    transformer: patternMaterial({ color: [128, 132, 130], rough: 0.5, metal: 0.5 }),
    iron: patternMaterial({ color: [26, 26, 26], rough: 0.6, metal: 0.4 }),
    lampGlass: patternMaterial({ color: [236, 230, 200], rough: 0.2 }),
    mailbox: patternMaterial({ color: [30, 30, 32], rough: 0.45, metal: 0.4 }),
    flag: patternMaterial({ color: [178, 36, 30], rough: 0.5 }),
    galv: patternMaterial({ color: [168, 172, 170], rough: 0.4, metal: 0.7, side: THREE.DoubleSide }),
    water: new THREE.MeshStandardMaterial({ color: new THREE.Color(0.06, 0.08, 0.07), roughness: 0.05, metalness: 0.0 }),
    hay: patternMaterial({ color: [186, 164, 100], pattern: 'hay', rough: 1 }),
    hose: patternMaterial({ color: [40, 108, 52], rough: 0.4 }),
    brass: patternMaterial({ color: [176, 140, 70], rough: 0.35, metal: 0.8 }),
    alu: patternMaterial({ color: [196, 198, 200], rough: 0.35, metal: 0.75 }),
    mover: patternMaterial({ color: [180, 52, 34], rough: 0.5 }),
  };
  const group = new THREE.Group();
  for (const [k, geos] of groups) {
    const mesh = new THREE.Mesh(mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g))), M[k]);
    mesh.castShadow = k !== 'water';
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
  const wireLines = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: new THREE.Color(0.05, 0.05, 0.05), transparent: true, opacity: 0.85 }));
  group.add(wireLines);
  return { group, colliders, poles: P, wheelLine: wheelParts };
}

export { roadX };
