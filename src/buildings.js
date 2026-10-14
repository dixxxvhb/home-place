import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patternMaterial, glassMaterial } from './materials.js';
import { HOUSE, SHOP, HORSE_SHED, NEIGHBORS, FRONT_DOOR_Z } from './layout.js';

// ---------- geometry kit ----------
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function fromArrays(pos, nrm, uv, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// Quad from four corners; flips winding so the face points along `out`.
function quad(a, b, c, d, out) {
  let n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize();
  if (out && n.dot(out) < 0) { [b, d] = [d, b]; n.negate(); }
  const ub = new THREE.Vector3().subVectors(b, a), vd = new THREE.Vector3().subVectors(d, a);
  const lu = ub.length(), lv = vd.length();
  ub.normalize(); vd.normalize();
  const uvOf = (p) => { const r = new THREE.Vector3().subVectors(p, a); return [r.dot(ub), r.dot(vd)]; };
  return fromArrays(
    [a, b, c, d].flatMap((p) => [p.x, p.y, p.z]),
    [n, n, n, n].flatMap((p) => [p.x, p.y, p.z]),
    [0, 0, lu, 0, ...uvOf(c), 0, lv],
    [0, 1, 2, 0, 2, 3],
  );
}

function tri(a, b, c, out) {
  let n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
  if (out && n.dot(out) < 0) { [b, c] = [c, b]; n.negate(); }
  return fromArrays([a, b, c].flatMap((p) => [p.x, p.y, p.z]), [n, n, n].flatMap((p) => [p.x, p.y, p.z]), [0, 0, 1, 0, 0, 1], [0, 1, 2]);
}

function box(x0, y0, z0, x1, y1, z1) {
  const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}

function cyl(ax, ay, az, bx, by, bz, r, seg = 8, open = false) {
  const a = V(ax, ay, az), b = V(bx, by, bz);
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, open);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q);
  g.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  return g;
}

// A sloped roof plane with thickness. Corners: r0, r1 along the ridge; e1, e0 along the eave.
// Top gets the roofing material, edges and soffit get trim.
function roofPlane(add, roofKey, trimKey, r0, r1, e1, e0, thick = 0.14) {
  const down = V(0, -thick, 0);
  const n = new THREE.Vector3().subVectors(r1, r0).cross(new THREE.Vector3().subVectors(e0, r0)).normalize();
  const up = n.y > 0 ? n : n.clone().negate();
  add(roofKey, quad(r0.clone(), r1.clone(), e1.clone(), e0.clone(), up));
  const b = [r0, r1, e1, e0].map((p) => p.clone().add(down));
  add(trimKey, quad(b[0], b[1], b[2], b[3], up.clone().negate()));
  const edges = [[0, 1], [1, 2], [2, 3], [3, 0]];
  const top = [r0, r1, e1, e0];
  const c = top.reduce((s, p) => s.add(p), V(0, 0, 0)).multiplyScalar(0.25);
  for (const [i, j] of edges) {
    const mid = top[i].clone().add(top[j]).multiplyScalar(0.5);
    const out = mid.sub(c).setY(0).normalize();
    add(trimKey, quad(top[i].clone(), top[j].clone(), b[j], b[i], out));
  }
}

// Features on an axis-aligned wall. face: { axis: 'x'|'z', sign: ±1, at: plane coordinate }
function onWall(face) {
  const n = face.axis === 'x' ? V(face.sign, 0, 0) : V(0, 0, face.sign);
  const t = face.axis === 'x' ? V(0, 0, 1) : V(1, 0, 0);
  // axis-aligned box spanning t in [c0,c1], y in [y0,y1], depth from offset d0 to d1 outward
  const wbox = (c0, c1, y0, y1, d0, d1) => {
    const a = face.at + face.sign * d0, b = face.at + face.sign * d1;
    if (face.axis === 'x') return box(a, y0, c0, b, y1, c1);
    return box(c0, y0, a, c1, y1, b);
  };
  const wquad = (c0, c1, y0, y1, d) => {
    const at = face.at + face.sign * d;
    const P = (c, y) => (face.axis === 'x' ? V(at, y, c) : V(c, y, at));
    return quad(P(c0, y0), P(c1, y0), P(c1, y1), P(c0, y1), n);
  };
  return { n, t, wbox, wquad };
}

function addWindow(add, face, c, w, h, sill, { shutters = false, rail = true, base = 0 } = {}) {
  const W = onWall(face);
  const y0 = base + sill, y1 = y0 + h, c0 = c - w / 2, c1 = c + w / 2, f = 0.075;
  add('glass', W.wquad(c0, c1, y0, y1, 0.015));
  add('trim', W.wbox(c0 - f, c0, y0, y1, 0, 0.045));
  add('trim', W.wbox(c1, c1 + f, y0, y1, 0, 0.045));
  add('trim', W.wbox(c0 - f, c1 + f, y1, y1 + f * 1.3, 0, 0.05));
  add('trim', W.wbox(c0 - f - 0.04, c1 + f + 0.04, y0 - 0.06, y0, 0, 0.085));
  if (rail) add('trim', W.wbox(c0, c1, y0 + h * 0.5 - 0.022, y0 + h * 0.5 + 0.022, 0, 0.035));
  add('trim', W.wbox(c - 0.018, c + 0.018, y0, y1, 0, 0.03));
  if (shutters) {
    const sw = Math.min(0.48, w * 0.36);
    add('shutter', W.wbox(c0 - f - 0.05 - sw, c0 - f - 0.05, y0 - 0.03, y1 + 0.06, 0, 0.03));
    add('shutter', W.wbox(c1 + f + 0.05, c1 + f + 0.05 + sw, y0 - 0.03, y1 + 0.06, 0, 0.03));
  }
}

function addDoor(add, face, c, w, h, base, key = 'door') {
  const W = onWall(face);
  const f = 0.09;
  add(key, W.wbox(c - w / 2, c + w / 2, base, base + h, 0, 0.03));
  add('trim', W.wbox(c - w / 2 - f, c - w / 2, base, base + h + f, 0, 0.05));
  add('trim', W.wbox(c + w / 2, c + w / 2 + f, base, base + h + f, 0, 0.05));
  add('trim', W.wbox(c - w / 2 - f, c + w / 2 + f, base + h, base + h + f, 0, 0.05));
}

// ---------- the house ----------
function buildHouse(add, y, colliders, platforms) {
  const M = HOUSE.main, G = HOUSE.garage, P = HOUSE.patio, B = HOUSE.bump;
  const eave = y + HOUSE.eaveY;
  const pitch = 5 / 12;
  const ridgeX = (M[0] + M[2]) / 2;
  const ridgeY = eave + ((M[2] - M[0]) / 2) * pitch;
  const fl = y + HOUSE.floorY;

  // bodies
  add('siding', box(M[0], y, M[1], M[2], eave, M[3]));
  add('siding', box(G[0], y, G[1], G[2], eave, G[3]));
  add('siding', box(B[0], y, B[1], B[2] , eave - 0.25, B[3]));
  add('found', box(M[0] - 0.03, y - 0.35, M[1] - 0.03, M[2] + 0.03, fl - 0.04, M[3] + 0.03));
  add('found', box(B[0], y - 0.35, B[1] - 0.03, B[2] + 0.03, fl - 0.04, B[3] + 0.03));
  add('found', box(G[0] - 0.03, y - 0.35, G[1] - 0.03, G[2], y + 0.18, G[3] + 0.03));
  // corner boards
  for (const [cx, cz] of [[M[2], M[3]], [M[2], M[1]], [M[0], M[3]], [G[0], G[1]], [G[0], G[3]]]) {
    add('trim', box(cx - 0.07, fl - 0.04, cz - 0.07, cx + 0.07, eave, cz + 0.07));
  }

  // main gables (north and south ends)
  for (const [z, s] of [[M[1], -1], [M[3], 1]]) {
    add('siding', tri(V(M[0], eave, z), V(M[2], eave, z), V(ridgeX, ridgeY, z), V(0, 0, s)));
  }
  // garage gable (west end), ridge east-west
  const gRidgeZ = (G[1] + G[3]) / 2;
  const gRidgeY = eave + ((G[3] - G[1]) / 2) * pitch;
  add('siding', tri(V(G[0], eave, G[1]), V(G[0], eave, G[3]), V(G[0], gRidgeY, gRidgeZ), V(-1, 0, 0)));

  // roofs
  const oh = 0.45, rk = 0.32, lift = 0.02;
  const slopeY = (d) => eave - d * pitch + lift; // height at distance d beyond the wall line
  roofPlane(add, 'shingle', 'trim', V(ridgeX, ridgeY + lift, M[1] - rk), V(ridgeX, ridgeY + lift, M[3] + rk), V(M[2] + oh, slopeY(oh), M[3] + rk), V(M[2] + oh, slopeY(oh), M[1] - rk));
  roofPlane(add, 'shingle', 'trim', V(ridgeX, ridgeY + lift, M[3] + rk), V(ridgeX, ridgeY + lift, M[1] - rk), V(M[0] - oh, slopeY(oh), M[1] - rk), V(M[0] - oh, slopeY(oh), M[3] + rk));
  const gEnd = ridgeX - 0.25;
  roofPlane(add, 'shingle', 'trim', V(G[0] - rk, gRidgeY + lift, gRidgeZ), V(gEnd, gRidgeY + lift, gRidgeZ), V(gEnd, slopeY(oh), G[1] - oh), V(G[0] - rk, slopeY(oh), G[1] - oh));
  roofPlane(add, 'shingle', 'trim', V(gEnd, gRidgeY + lift, gRidgeZ), V(G[0] - rk, gRidgeY + lift, gRidgeZ), V(G[0] - rk, slopeY(oh), G[3] + oh), V(gEnd, slopeY(oh), G[3] + oh));
  add('ridge', box(ridgeX - 0.13, ridgeY - 0.02, M[1] - rk, ridgeX + 0.13, ridgeY + 0.09, M[3] + rk));
  add('ridge', box(G[0] - rk, gRidgeY - 0.02, gRidgeZ - 0.13, gEnd, gRidgeY + 0.09, gRidgeZ + 0.13));
  // front room roof, a low shed off the main eave
  roofPlane(add, 'shingle', 'trim', V(B[0] - 0.05, eave - 0.05, B[1] - 0.3), V(B[0] - 0.05, eave - 0.05, B[3] + 0.3), V(B[2] + 0.42, eave - 0.48, B[3] + 0.3), V(B[2] + 0.42, eave - 0.48, B[1] - 0.3), 0.1);
  // patio cover, shallow shed roof on posts
  const pEave = eave - 0.7;
  roofPlane(add, 'shingle', 'trim', V(P[2] + 0.05, eave - 0.12, P[1]), V(P[2] + 0.05, eave - 0.12, P[3] + 0.3), V(P[0] - 0.3, pEave, P[3] + 0.3), V(P[0] - 0.3, pEave, P[1]), 0.12);
  for (let z = P[1] + 0.4; z <= P[3] + 0.1; z += (P[3] - P[1] - 0.3) / 4) {
    add('trim', box(P[0] + 0.05, y, z - 0.08, P[0] + 0.21, pEave - 0.1, z + 0.08));
    colliders.push({ c: [P[0] + 0.13, z], r: 0.18 });
  }
  add('trim', box(P[0] - 0.05, pEave - 0.3, P[1], P[0] + 0.3, pEave - 0.05, P[3] + 0.25));

  // gutters along the eaves and downspouts at the corners
  const gy = slopeY(oh) - 0.12;
  add('gutter', cyl(M[2] + oh + 0.05, gy, M[1] - rk, M[2] + oh + 0.05, gy, M[3] + rk, 0.06, 6));
  add('gutter', cyl(M[0] - oh - 0.05, gy, 0.0, M[0] - oh - 0.05, gy, M[3] + rk, 0.06, 6));
  for (const z of [M[1] + 0.2, M[3] - 0.2]) add('gutter', box(M[2] + 0.02, y, z - 0.05, M[2] + 0.1, gy, z + 0.05));

  // front of the house (faces east, the road)
  const front = { axis: 'x', sign: 1, at: M[2] };
  addWindow(add, front, 10.2, 1.55, 1.3, 1.35, { shutters: true, base: y });
  addWindow(add, front, 6.5, 1.55, 1.3, 1.35, { shutters: true, base: y });
  addWindow(add, front, -10.4, 1.2, 1.1, 1.5, { shutters: true, base: y });
  const bumpFace = { axis: 'x', sign: 1, at: B[2] };
  addWindow(add, bumpFace, -1.95, 1.5, 1.45, 1.1, { base: y });
  addWindow(add, bumpFace, -4.1, 1.75, 1.45, 1.1, { base: y, rail: false });
  addWindow(add, bumpFace, -6.25, 1.5, 1.45, 1.1, { base: y });
  // basement windows in their steel wells
  for (const z of [8.4, 4.4, -11.4]) {
    addWindow(add, front, z, 0.9, 0.42, 0.06, { base: y, rail: false });
    const wl = cyl(M[2] + 0.02, y - 0.05, z, M[2] + 0.02, y + 0.42, z, 0.62, 14, true);
    add('well', wl);
  }
  // front door, storm door, steps and rail
  addDoor(add, front, FRONT_DOOR_Z, 0.95, 2.03, fl, 'door');
  const W = onWall(front);
  add('trim', W.wbox(FRONT_DOOR_Z - 0.5, FRONT_DOOR_Z + 0.5, fl, fl + 2.05, 0.03, 0.07));
  add('glass', W.wquad(FRONT_DOOR_Z - 0.4, FRONT_DOOR_Z + 0.4, fl + 0.95, fl + 1.95, 0.075));
  add('found', box(M[2], y - 0.2, 1.55, M[2] + 1.25, fl, 3.65));
  add('found', box(M[2] + 1.25, y - 0.2, 1.55, M[2] + 1.55, y + 0.367, 3.65));
  add('found', box(M[2] + 1.55, y - 0.2, 1.55, M[2] + 1.85, y + 0.183, 3.65));
  platforms.push({ r: [M[2], 1.55, M[2] + 1.25, 3.65], y: fl }, { r: [M[2] + 1.25, 1.55, M[2] + 1.55, 3.65], y: y + 0.367 }, { r: [M[2] + 1.55, 1.55, M[2] + 1.85, 3.65], y: y + 0.183 });
  for (const zr of [1.62, 3.58]) {
    add('iron', cyl(M[2] + 0.2, fl, zr, M[2] + 0.2, fl + 0.9, zr, 0.02, 6));
    add('iron', cyl(M[2] + 1.2, fl, zr, M[2] + 1.2, fl + 0.9, zr, 0.02, 6));
    add('iron', cyl(M[2] + 1.75, y + 0.183, zr, M[2] + 1.75, y + 1.08, zr, 0.02, 6));
    add('iron', cyl(M[2] + 0.2, fl + 0.9, zr, M[2] + 1.2, fl + 0.9, zr, 0.022, 6));
    add('iron', cyl(M[2] + 1.2, fl + 0.9, zr, M[2] + 1.75, y + 1.08, zr, 0.022, 6));
  }
  // brick planter at the south corner, under the birches
  add('brick', box(M[2] + 0.02, y - 0.1, 11.6, M[2] + 1.2, y + 0.55, 13.6));

  // south end
  const south = { axis: 'z', sign: 1, at: M[3] };
  addWindow(add, south, -2.6, 1.3, 1.2, 1.4, { base: y, shutters: true });
  addWindow(add, south, -7.4, 1.3, 1.2, 1.4, { base: y, shutters: true });
  // back wall under the patio: slider and two windows
  const back = { axis: 'x', sign: -1, at: M[0] };
  addWindow(add, back, 9.6, 1.4, 1.2, 1.4, { base: y });
  addWindow(add, back, -0.6, 1.2, 1.1, 1.5, { base: y });
  addDoor(add, back, 4.2, 2.4, 2.05, fl, 'glass');
  add('trim', onWall(back).wbox(4.18, 4.22, fl, fl + 2.05, 0.02, 0.06));
  // north side: side door by the garage, a window, and the garage doors facing the shop
  const north = { axis: 'z', sign: -1, at: M[1] };
  addWindow(add, north, -3.0, 1.2, 1.1, 1.5, { base: y });
  addDoor(add, north, -7.4, 0.9, 2.03, fl, 'door');
  add('found', box(-8.0, y - 0.2, M[1] - 1.0, -6.8, fl, M[1]));
  platforms.push({ r: [-8.0, M[1] - 1.0, -6.8, M[1]], y: fl });
  addDoor(add, north, -17.55, 2.7, 2.3, y, 'garage');
  addDoor(add, north, -12.95, 4.9, 2.3, y, 'garage');
  addWindow(add, { axis: 'x', sign: -1, at: G[0] }, -8.2, 1.1, 0.9, 1.6, { base: y });
  // hose bibs
  add('iron', box(M[2], y + 0.45, 7.35, M[2] + 0.1, y + 0.55, 7.45));
  add('iron', box(-7.05, y + 0.45, M[3], -6.95, y + 0.55, M[3] + 0.1));

  colliders.push({ rect: [M[0] - 0.1, M[1] - 0.1, M[2] + 0.1, M[3] + 0.1] });
  colliders.push({ rect: [B[0], B[1] - 0.05, B[2] + 0.08, B[3] + 0.05] });
  colliders.push({ rect: [G[0] - 0.1, G[1] - 0.1, G[2], G[3] + 0.1] });
  colliders.push({ rect: [M[2] + 0.02, 11.6, M[2] + 1.2, 13.6] });
  colliders.push({ rect: [M[2], 1.4, M[2] + 1.3, 1.6] });
  colliders.push({ rect: [M[2], 3.6, M[2] + 1.3, 3.8] });
}

// ---------- the shop ----------
function buildShop(add, y, colliders) {
  const R = SHOP.rect, L = SHOP.leanTo;
  const eave = y + SHOP.eaveY;
  const pitch = 3 / 12;
  const rz = (R[1] + R[3]) / 2;
  const ridgeY = eave + ((R[3] - R[1]) / 2) * pitch;
  add('steel', box(R[0], y, R[1], R[2], eave, R[3]));
  add('steelTrim', box(R[0] - 0.03, y - 0.2, R[1] - 0.03, R[2] + 0.03, y + 0.12, R[3] + 0.03));
  for (const [x, s] of [[R[0], -1], [R[2], 1]]) add('steel', tri(V(x, eave, R[1]), V(x, eave, R[3]), V(x, ridgeY, rz), V(s, 0, 0)));
  for (const [cx, cz] of [[R[0], R[1]], [R[0], R[3]], [R[2], R[1]], [R[2], R[3]]]) add('steelTrim', box(cx - 0.08, y, cz - 0.08, cx + 0.08, eave, cz + 0.08));
  const oh = 0.35, rk = 0.3;
  const ey = eave - oh * pitch + 0.02;
  roofPlane(add, 'steelRoof', 'steelTrim', V(R[0] - rk, ridgeY + 0.02, rz), V(R[2] + rk, ridgeY + 0.02, rz), V(R[2] + rk, ey, R[3] + oh), V(R[0] - rk, ey, R[3] + oh), 0.08);
  roofPlane(add, 'steelRoof', 'steelTrim', V(R[2] + rk, ridgeY + 0.02, rz), V(R[0] - rk, ridgeY + 0.02, rz), V(R[0] - rk, ey, R[1] - oh), V(R[2] + rk, ey, R[1] - oh), 0.08);
  add('steelTrim', box(R[0] - rk, ridgeY - 0.02, rz - 0.18, R[2] + rk, ridgeY + 0.1, rz + 0.18));
  // big overhead door on the east end, toward the road, and a walk door on the south
  const east = { axis: 'x', sign: 1, at: R[2] };
  addDoor(add, east, rz, 4.3, 4.3, y, 'garage');
  addDoor(add, { axis: 'z', sign: 1, at: R[3] }, 0.6, 0.95, 2.05, y, 'steelDoor');
  addWindow(add, { axis: 'z', sign: 1, at: R[3] }, -5.5, 1.1, 0.95, 1.55, { base: y, rail: false });
  addWindow(add, { axis: 'z', sign: 1, at: R[3] }, -11.5, 1.1, 0.95, 1.55, { base: y, rail: false });
  addWindow(add, { axis: 'z', sign: -1, at: R[1] }, -8.0, 1.1, 0.95, 1.55, { base: y, rail: false });
  // a yard light over the big door
  add('iron', box(R[2], eave - 0.6, rz - 0.08, R[2] + 0.5, eave - 0.52, rz + 0.08));
  add('trim', box(R[2] + 0.35, eave - 0.78, rz - 0.18, R[2] + 0.6, eave - 0.6, rz + 0.18));

  // lean-to on the west, open to the south
  const lHi = y + 4.25, lLo = y + 3.2;
  roofPlane(add, 'steelRoof', 'steelTrim', V(L[2] + 0.05, lHi, L[1] - 0.2), V(L[2] + 0.05, lHi, L[3] + 0.3), V(L[0] - 0.25, lLo, L[3] + 0.3), V(L[0] - 0.25, lLo, L[1] - 0.2), 0.08);
  add('steel', box(L[0], y, L[1], L[2], lLo, L[1] + 0.06));
  add('steel', box(L[0], y, L[1], L[0] + 0.06, lLo, L[3] - 3.5));
  for (const z of [L[3] - 0.1, (L[1] + L[3]) / 2]) {
    add('post', box(L[0] + 0.02, y, z - 0.07, L[0] + 0.16, lLo, z + 0.07));
    colliders.push({ c: [L[0] + 0.09, z], r: 0.15 });
  }
  // hay stacked under it
  const bale = (x, yb, z, rot) => add('hay', rot ? box(x - 0.23, yb, z - 0.45, x + 0.23, yb + 0.36, z + 0.45) : box(x - 0.45, yb, z - 0.23, x + 0.45, yb + 0.36, z + 0.23));
  for (let k = 0; k < 3; k++) for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
    if (k === 2 && i === 3) continue;
    bale(L[0] + 0.8 + j * 0.92, y + k * 0.36, L[1] + 0.6 + i * 0.47, false);
  }
  colliders.push({ rect: [R[0] - 0.05, R[1] - 0.05, R[2] + 0.05, R[3] + 0.05] });
  colliders.push({ rect: [L[0], L[1], L[2], L[1] + 0.1] });
  colliders.push({ rect: [L[0], L[1], L[0] + 0.1, L[3] - 3.5] });
  colliders.push({ rect: [L[0] + 0.3, L[1] + 0.3, L[0] + 2.3, L[1] + 2.4] });
}

// ---------- the horse shed in the arena ----------
function buildHorseShed(add, y, colliders) {
  const R = HORSE_SHED.rect;
  const hi = y + 3.45, lo = y + 2.7;
  const wallTop = (x) => lo + ((x - R[0]) / (R[2] - R[0])) * (hi - lo);
  const t = 0.08;
  add('board', box(R[0], y, R[1], R[0] + t, lo, R[3]));
  // side walls follow the roof slope: build as box to the low height, plus a triangle
  for (const z of [R[1], R[3] - t]) {
    add('board', box(R[0], y, z, R[2], lo, z + t));
    for (const s of [-1, 1]) {
      const zz = s < 0 ? z : z + t;
      add('board', tri(V(R[0], lo, zz), V(R[2], lo, zz), V(R[2], wallTop(R[2]), zz), V(0, 0, s)));
    }
  }
  roofPlane(add, 'steelRoofLight', 'steelTrim', V(R[2] + 0.35, hi + 0.04, R[1] - 0.3), V(R[2] + 0.35, hi + 0.04, R[3] + 0.3), V(R[0] - 0.35, lo - 0.02, R[3] + 0.3), V(R[0] - 0.35, lo - 0.02, R[1] - 0.3), 0.08);
  for (const z of [R[1] + 0.1, R[1] + 4.1, R[1] + 8.2, R[3] - 0.1]) {
    add('post', box(R[2] - 0.16, y, z - 0.08, R[2], hi, z + 0.08));
    colliders.push({ c: [R[2] - 0.08, z], r: 0.14 });
  }
  add('post', box(R[2] - 0.18, hi - 0.25, R[1], R[2], hi, R[3]));
  // hay and a feeder inside
  for (let k = 0; k < 2; k++) for (let i = 0; i < 3; i++) add('hay', box(R[0] + 0.15, y + k * 0.36, R[1] + 0.4 + i * 0.94, R[0] + 0.61, y + k * 0.36 + 0.36, R[1] + 1.3 + i * 0.94));
  add('board', box(R[0] + 0.1, y + 0.5, R[1] + 5.0, R[0] + 0.7, y + 1.1, R[1] + 8.5));
  colliders.push({ rect: [R[0], R[1], R[0] + 0.15, R[3]] });
  colliders.push({ rect: [R[0], R[1], R[2], R[1] + 0.15] });
  colliders.push({ rect: [R[0], R[3] - 0.15, R[2], R[3]] });
  colliders.push({ rect: [R[0], R[1] + 0.3, R[0] + 0.8, R[1] + 3.3] });
  colliders.push({ rect: [R[0], R[1] + 5.0, R[0] + 0.8, R[1] + 8.5] });
}

// ---------- neighbors, simpler ----------
function buildNeighbor(add, n, y, colliders, i) {
  const R = n.rect;
  const w = R[2] - R[0], d = R[3] - R[1];
  const alongX = w > d;
  const eave = y + (n.shop ? 4.2 : 2.9);
  const half = (alongX ? d : w) / 2;
  const pitch = n.shop ? 3 / 12 : 5 / 12;
  const ridgeY = eave + half * pitch;
  const wallKey = n.shop ? 'steel' : ['sidingTan', 'sidingGray', 'sidingWhite'][i % 3];
  const roofKey = n.roof === 'red' ? 'roofRed' : n.roof === 'blue' ? 'roofBlue' : n.roof === 'metal' ? 'steelRoofLight' : 'shingleDark';
  add(wallKey, box(R[0], y - 0.3, R[1], R[2], eave, R[3]));
  const oh = 0.4;
  if (alongX) {
    const rz = (R[1] + R[3]) / 2;
    for (const [x, s] of [[R[0], -1], [R[2], 1]]) add(wallKey, tri(V(x, eave, R[1]), V(x, eave, R[3]), V(x, ridgeY, rz), V(s, 0, 0)));
    roofPlane(add, roofKey, 'trim', V(R[0] - 0.3, ridgeY, rz), V(R[2] + 0.3, ridgeY, rz), V(R[2] + 0.3, eave - oh * pitch, R[3] + oh), V(R[0] - 0.3, eave - oh * pitch, R[3] + oh));
    roofPlane(add, roofKey, 'trim', V(R[2] + 0.3, ridgeY, rz), V(R[0] - 0.3, ridgeY, rz), V(R[0] - 0.3, eave - oh * pitch, R[1] - oh), V(R[2] + 0.3, eave - oh * pitch, R[1] - oh));
  } else {
    const rx = (R[0] + R[2]) / 2;
    for (const [z, s] of [[R[1], -1], [R[3], 1]]) add(wallKey, tri(V(R[0], eave, z), V(R[2], eave, z), V(rx, ridgeY, z), V(0, 0, s)));
    roofPlane(add, roofKey, 'trim', V(rx, ridgeY, R[1] - 0.3), V(rx, ridgeY, R[3] + 0.3), V(R[2] + oh, eave - oh * pitch, R[3] + 0.3), V(R[2] + oh, eave - oh * pitch, R[1] - 0.3));
    roofPlane(add, roofKey, 'trim', V(rx, ridgeY, R[3] + 0.3), V(rx, ridgeY, R[1] - 0.3), V(R[0] - oh, eave - oh * pitch, R[1] - 0.3), V(R[0] - oh, eave - oh * pitch, R[3] + 0.3));
  }
  if (!n.shop) {
    for (const [axis, sign, at, c0, c1] of [['x', 1, R[2], R[1], R[3]], ['x', -1, R[0], R[1], R[3]], ['z', 1, R[3], R[0], R[2]], ['z', -1, R[1], R[0], R[2]]]) {
      const span = c1 - c0;
      const k = Math.max(1, Math.floor(span / 4));
      for (let j = 0; j < k; j++) addWindow(add, { axis, sign, at }, c0 + (span * (j + 0.5)) / k, 1.2, 1.1, 1.0, { base: y });
    }
  } else {
    addDoor(add, { axis: 'z', sign: -1, at: R[1] }, (R[0] + R[2]) / 2, 3.6, 3.6, y, 'garage');
  }
  colliders.push({ rect: [R[0] - 0.1, R[1] - 0.1, R[2] + 0.1, R[3] + 0.1] });
}

export function buildBuildings(T) {
  const groups = new Map();
  const add = (key, geo) => {
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(geo);
  };
  const colliders = [];
  const platforms = [];
  buildHouse(add, T.pads[0].y, colliders, platforms);
  buildShop(add, T.pads[1].y, colliders);
  buildHorseShed(add, T.pads[2].y, colliders);
  NEIGHBORS.forEach((n, i) => {
    const cx = (n.rect[0] + n.rect[2]) / 2, cz = (n.rect[1] + n.rect[3]) / 2;
    let lo = Infinity;
    for (const [x, z] of [[n.rect[0], n.rect[1]], [n.rect[2], n.rect[1]], [n.rect[0], n.rect[3]], [n.rect[2], n.rect[3]], [cx, cz]]) lo = Math.min(lo, T.heightAt(x, z));
    buildNeighbor(add, n, lo + 0.15, colliders, i);
  });

  const M = {
    siding: patternMaterial({ color: [236, 224, 172], pattern: 'lap', rough: 0.7 }),
    sidingTan: patternMaterial({ color: [204, 190, 160], pattern: 'lap', rough: 0.75 }),
    sidingGray: patternMaterial({ color: [168, 172, 170], pattern: 'lap', rough: 0.75 }),
    sidingWhite: patternMaterial({ color: [226, 226, 220], pattern: 'lap', rough: 0.75 }),
    trim: patternMaterial({ color: [246, 245, 240], rough: 0.55 }),
    shutter: patternMaterial({ color: [244, 242, 232], pattern: 'louver', rough: 0.6 }),
    found: patternMaterial({ color: [170, 166, 157], pattern: 'concrete', rough: 0.95 }),
    brick: patternMaterial({ color: [150, 82, 62], pattern: 'concrete', rough: 0.9 }),
    shingle: patternMaterial({ color: [104, 108, 102], pattern: 'shingle', rough: 0.95 }),
    shingleDark: patternMaterial({ color: [76, 76, 78], pattern: 'shingle', rough: 0.95 }),
    roofRed: patternMaterial({ color: [128, 52, 50], pattern: 'roofribs', ribAxis: 'x', rough: 0.55, metal: 0.25 }),
    roofBlue: patternMaterial({ color: [120, 150, 168], pattern: 'roofribs', ribAxis: 'x', rough: 0.55, metal: 0.25 }),
    ridge: patternMaterial({ color: [86, 90, 86], rough: 0.95 }),
    gutter: patternMaterial({ color: [240, 238, 232], rough: 0.4 }),
    well: patternMaterial({ color: [150, 152, 150], pattern: 'roofribs', ribAxis: 'z', rough: 0.4, metal: 0.6, side: THREE.DoubleSide }),
    door: patternMaterial({ color: [122, 46, 38], rough: 0.5 }),
    garage: patternMaterial({ color: [240, 238, 232], pattern: 'paneldoor', rough: 0.5 }),
    iron: patternMaterial({ color: [28, 28, 28], rough: 0.6, metal: 0.4 }),
    steel: patternMaterial({ color: [226, 226, 220], pattern: 'ribs', rough: 0.45, metal: 0.2 }),
    steelTrim: patternMaterial({ color: [150, 176, 170], rough: 0.45, metal: 0.25 }),
    steelRoof: patternMaterial({ color: [158, 182, 176], pattern: 'roofribs', ribAxis: 'x', rough: 0.4, metal: 0.35 }),
    steelRoofLight: patternMaterial({ color: [196, 198, 196], pattern: 'roofribs', ribAxis: 'z', rough: 0.4, metal: 0.4 }),
    steelDoor: patternMaterial({ color: [150, 176, 170], rough: 0.45, metal: 0.25 }),
    board: patternMaterial({ color: [128, 96, 74], pattern: 'board', rough: 0.95, side: THREE.DoubleSide }),
    post: patternMaterial({ color: [120, 100, 80], pattern: 'board', rough: 0.95 }),
    hay: patternMaterial({ color: [196, 176, 112], pattern: 'hay', rough: 1 }),
    glass: glassMaterial(),
  };

  const group = new THREE.Group();
  for (const [key, geos] of groups) {
    const merged = mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)));
    const mesh = new THREE.Mesh(merged, M[key]);
    mesh.castShadow = key !== 'glass';
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return { group, colliders, platforms };
}
