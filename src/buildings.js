import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patternMaterial, glassMaterial } from './materials.js';
import { HOUSE, SHOP, HORSE_SHED, UTILITY_SHED, NEIGHBORS, FRONT_DOOR_Z, PIT, DECK } from './layout.js';

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
  const M = HOUSE.main, G = HOUSE.garage, B = HOUSE.bump;
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
  // back wall: the slider opens onto the deck
  const back = { axis: 'x', sign: -1, at: M[0] };
  addWindow(add, back, 9.6, 1.4, 1.2, 1.4, { base: y });
  addWindow(add, back, -0.6, 1.2, 1.1, 1.5, { base: y });
  addDoor(add, back, 4.2, 2.4, 2.05, fl, 'glass');
  add('trim', onWall(back).wbox(4.18, 4.22, fl, fl + 2.05, 0.02, 0.06));
  // north side: a window and the side door, which lines up with the shop's walk door
  const north = { axis: 'z', sign: -1, at: M[1] };
  const sd = HOUSE.sideDoorX;
  addWindow(add, north, -3.0, 1.2, 1.1, 1.5, { base: y });
  addDoor(add, north, sd, 0.9, 2.03, fl, 'door');
  add('found', box(sd - 0.6, y - 0.2, M[1] - 1.0, sd + 0.6, fl, M[1]));
  add('found', box(sd - 0.6, y - 0.2, M[1] - 1.25, sd + 0.6, y + 0.275, M[1] - 1.0));
  platforms.push({ r: [sd - 0.6, M[1] - 1.0, sd + 0.6, M[1]], y: fl }, { r: [sd - 0.6, M[1] - 1.25, sd + 0.6, M[1] - 1.0], y: y + 0.275 });
  addWindow(add, { axis: 'z', sign: -1, at: G[1] }, -14.8, 1.2, 0.9, 1.6, { base: y });
  // the garage doors face west, onto the gravel, with the hoop off to the north side
  const gWest = { axis: 'x', sign: -1, at: G[0] };
  addDoor(add, gWest, -10.15, 4.9, 2.3, y, 'garage');
  addDoor(add, gWest, -5.45, 2.7, 2.3, y, 'garage');
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
  addDoor(add, { axis: 'z', sign: 1, at: R[3] }, SHOP.walkDoorX, 0.95, 2.05, y, 'steelDoor');
  addWindow(add, { axis: 'z', sign: 1, at: R[3] }, -2.2, 1.1, 0.95, 1.55, { base: y, rail: false });
  addWindow(add, { axis: 'z', sign: 1, at: R[3] }, -12.6, 1.1, 0.95, 1.55, { base: y, rail: false });
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

// ---------- the utility shed at the end of the sand: mowers and four-wheelers ----------
function buildUtilityShed(add, y, colliders) {
  const R = UTILITY_SHED.rect;
  const hi = y + 3.5, lo = y + 2.8;
  const wallTop = (x) => lo + ((x - R[0]) / (R[2] - R[0])) * (hi - lo);
  const t = 0.1;
  add('steelTan', box(R[0], y, R[1], R[0] + t, lo, R[3]));
  for (const z of [R[1], R[3] - t]) {
    add('steelTan', box(R[0], y, z, R[2], lo, z + t));
    for (const s2 of [-1, 1]) {
      const zz = s2 < 0 ? z : z + t;
      add('steelTan', tri(V(R[0], lo, zz), V(R[2], lo, zz), V(R[2], wallTop(R[2]), zz), V(0, 0, s2)));
    }
  }
  // east wall with a wide door, rolled up
  const dz0 = R[1] + 4.2, dz1 = R[1] + 8.4, dh = 2.6;
  add('steelTan', box(R[2] - t, y, R[1], R[2], hi, dz0));
  add('steelTan', box(R[2] - t, y, dz1, R[2], hi, R[3]));
  add('steelTan', box(R[2] - t, y + dh, dz0, R[2], hi, dz1));
  add('steelTrim', box(R[2] - 0.02, y, dz0 - 0.1, R[2] + 0.05, y + dh + 0.1, dz0));
  add('steelTrim', box(R[2] - 0.02, y, dz1, R[2] + 0.05, y + dh + 0.1, dz1 + 0.1));
  add('garage', cyl(R[2] - 0.3, y + dh + 0.25, dz0, R[2] - 0.3, y + dh + 0.25, dz1, 0.2, 12));
  add('found', box(R[0], y - 0.1, R[1], R[2], y + 0.06, R[3]));
  for (const [cx, cz] of [[R[0], R[1]], [R[0], R[3]], [R[2], R[1]], [R[2], R[3]]]) add('steelTrim', box(cx - 0.06, y, cz - 0.06, cx + 0.06, cx === R[0] ? lo : hi, cz + 0.06));
  roofPlane(add, 'steelRoofLight', 'steelTrim', V(R[2] + 0.35, hi + 0.04, R[1] - 0.3), V(R[2] + 0.35, hi + 0.04, R[3] + 0.3), V(R[0] - 0.35, lo - 0.02, R[3] + 0.3), V(R[0] - 0.35, lo - 0.02, R[1] - 0.3), 0.08);

  // a red four-wheeler, nosed toward the door
  const atv = (x, z) => {
    const b = y + 0.06;
    add('atvRed', box(x - 0.55, b + 0.42, z - 0.33, x + 0.55, b + 0.62, z + 0.33));
    add('atvRed', box(x + 0.25, b + 0.55, z - 0.42, x + 0.75, b + 0.66, z + 0.42));
    add('atvRed', box(x - 0.75, b + 0.55, z - 0.42, x - 0.3, b + 0.66, z + 0.42));
    add('seat', box(x - 0.35, b + 0.62, z - 0.16, x + 0.2, b + 0.74, z + 0.16));
    add('iron', box(x + 0.35, b + 0.66, z - 0.03, x + 0.42, b + 0.92, z + 0.03));
    add('iron', cyl(x + 0.4, b + 0.92, z - 0.38, x + 0.4, b + 0.92, z + 0.38, 0.016, 6));
    add('iron', box(x + 0.6, b + 0.66, z - 0.45, x + 0.8, b + 0.7, z + 0.45));
    add('iron', box(x - 0.85, b + 0.66, z - 0.45, x - 0.6, b + 0.7, z + 0.45));
    for (const [wx, wz] of [[x + 0.48, z - 0.42], [x + 0.48, z + 0.42], [x - 0.48, z - 0.42], [x - 0.48, z + 0.42]]) {
      add('tire', cyl(wx, b + 0.27, wz - 0.12, wx, b + 0.27, wz + 0.12, 0.27, 14));
    }
  };
  // a riding mower, green with a yellow seat
  const mower = (x, z) => {
    const b = y + 0.06;
    add('mowerGreen', box(x - 0.55, b + 0.12, z - 0.5, x + 0.4, b + 0.24, z + 0.5));
    add('mowerGreen', box(x - 0.6, b + 0.32, z - 0.28, x + 0.75, b + 0.55, z + 0.28));
    add('mowerGreen', box(x + 0.2, b + 0.55, z - 0.24, x + 0.75, b + 0.72, z + 0.24));
    add('seatYellow', box(x - 0.55, b + 0.55, z - 0.22, x - 0.12, b + 0.68, z + 0.22));
    add('seatYellow', box(x - 0.6, b + 0.68, z - 0.22, x - 0.5, b + 0.95, z + 0.22));
    add('iron', cyl(x + 0.1, b + 0.6, z, x + 0.02, b + 0.95, z, 0.02, 6));
    add('iron', new THREE.TorusGeometry(0.16, 0.015, 5, 16).rotateX(Math.PI / 2).rotateZ(0.3).translate(x + 0.02, b + 0.96, z));
    add('tire', cyl(x - 0.45, b + 0.33, z - 0.42, x - 0.45, b + 0.33, z - 0.24, 0.33, 14));
    add('tire', cyl(x - 0.45, b + 0.33, z + 0.24, x - 0.45, b + 0.33, z + 0.42, 0.33, 14));
    add('tire', cyl(x + 0.55, b + 0.19, z - 0.36, x + 0.55, b + 0.19, z - 0.24, 0.19, 12));
    add('tire', cyl(x + 0.55, b + 0.19, z + 0.24, x + 0.55, b + 0.19, z + 0.36, 0.19, 12));
  };
  atv(R[0] + 4.3, R[1] + 5.4);
  mower(R[0] + 4.4, R[1] + 7.4);
  atv(R[0] + 1.6, R[1] + 1.6);
  // shelves and gas cans along the back
  add('board', box(R[0] + 0.1, y + 0.9, R[1] + 9, R[0] + 0.6, y + 0.94, R[3] - 0.3));
  add('board', box(R[0] + 0.1, y + 1.6, R[1] + 9, R[0] + 0.6, y + 1.64, R[3] - 0.3));
  for (let i = 0; i < 3; i++) add('atvRed', box(R[0] + 0.2, y + 0.06, R[1] + 9.2 + i * 0.4, R[0] + 0.45, y + 0.42, R[1] + 9.5 + i * 0.4));
  colliders.push({ rect: [R[0], R[1], R[0] + 0.15, R[3]] });
  colliders.push({ rect: [R[0], R[1], R[2], R[1] + 0.15] });
  colliders.push({ rect: [R[0], R[3] - 0.15, R[2], R[3]] });
  colliders.push({ rect: [R[2] - 0.15, R[1], R[2], dz0] });
  colliders.push({ rect: [R[2] - 0.15, dz1, R[2], R[3]] });
  colliders.push({ c: [R[0] + 4.3, R[1] + 5.4], r: 0.75 }, { c: [R[0] + 4.4, R[1] + 7.4], r: 0.8 }, { c: [R[0] + 1.6, R[1] + 1.6], r: 0.75 });
  colliders.push({ rect: [R[0], R[1] + 9, R[0] + 0.65, R[3]] });
}

// ---------- the horse shed: small and square, open to the north pasture ----------
function buildHorseShed(add, y, colliders) {
  const R = HORSE_SHED.rect;
  const eave = y + 2.6;
  const rz = (R[1] + R[3]) / 2;
  const ridgeY = eave + ((R[3] - R[1]) / 2) * (4 / 12);
  const t = 0.09;
  // north wall with our door, east and south walls closed, west side open to the pasture
  add('weathered', box(R[0], y, R[1], R[2], eave, R[1] + t));
  add('weathered', box(R[0], y, R[3] - t, R[2], eave, R[3]));
  add('weathered', box(R[2] - t, y, R[1], R[2], eave, R[3]));
  for (const x of [R[0], R[2] - t]) {
    add('weathered', tri(V(x, eave, R[1]), V(x, eave, R[3]), V(x, ridgeY, rz), V(-1, 0, 0)));
    add('weathered', tri(V(x + t, eave, R[1]), V(x + t, eave, R[3]), V(x + t, ridgeY, rz), V(1, 0, 0)));
  }
  for (const z of [R[1] + 0.1, rz, R[3] - 0.1]) {
    add('post', box(R[0], y, z - 0.08, R[0] + 0.16, eave, z + 0.08));
    colliders.push({ c: [R[0] + 0.08, z], r: 0.14 });
  }
  add('post', box(R[0], eave - 0.25, R[1], R[0] + 0.16, eave, R[3]));
  const oh = 0.35;
  roofPlane(add, 'steelTeal', 'steelTrim', V(R[0] - oh, ridgeY + 0.03, rz), V(R[2] + oh, ridgeY + 0.03, rz), V(R[2] + oh, eave - oh * 0.333, R[3] + oh), V(R[0] - oh, eave - oh * 0.333, R[3] + oh), 0.07);
  roofPlane(add, 'steelTeal', 'steelTrim', V(R[2] + oh, ridgeY + 0.03, rz), V(R[0] - oh, ridgeY + 0.03, rz), V(R[0] - oh, eave - oh * 0.333, R[1] - oh), V(R[2] + oh, eave - oh * 0.333, R[1] - oh), 0.07);
  addDoor(add, { axis: 'z', sign: -1, at: R[1] }, (R[0] + R[2]) / 2 + 1.0, 1.1, 2.05, y, 'woodDoor');
  // a hay feeder on the back wall and straw on the floor
  add('board', box(R[2] - 0.9, y + 0.6, R[1] + 1.2, R[2] - t, y + 1.2, R[3] - 1.2));
  add('hay', box(R[2] - 0.8, y + 0.9, R[1] + 1.3, R[2] - 0.2, y + 1.15, R[3] - 1.3));
  add('hay', box(R[0] + 0.3, y, R[1] + 0.3, R[2] - 0.3, y + 0.04, R[3] - 0.3));
  colliders.push({ rect: [R[0], R[1], R[2], R[1] + 0.12] });
  colliders.push({ rect: [R[0], R[3] - 0.12, R[2], R[3]] });
  colliders.push({ rect: [R[2] - 0.12, R[1], R[2], R[3]] });
  colliders.push({ rect: [R[2] - 0.9, R[1] + 1.2, R[2], R[3] - 1.2] });
}

// ---------- out back: the deck and the walkout pit ----------
function buildBackyard(add, y, colliders, platforms, pits) {
  const P = PIT.rect, D = DECK, S = PIT.stairs;
  const fl = y + HOUSE.floorY;
  const floor = y - PIT.depth;
  const top = y + 0.06;
  pits.push({ r: P, y: floor });
  // floor slab and retaining walls (the house's foundation is the east wall)
  add('found', box(P[0], floor - 0.2, P[1], P[2], floor, P[3]));
  add('found', box(P[0] - 0.25, floor - 0.2, P[1] - 0.25, P[2], top, P[1]));
  add('found', box(P[0] - 0.25, floor - 0.2, P[3], P[2], top, P[3] + 0.25));
  add('found', box(P[0] - 0.25, floor - 0.2, P[1], P[0], top, S[1]));
  add('found', box(P[2] - 0.02, floor - 0.2, P[1], P[2] + 0.3, y - 0.3, P[3]));
  // the basement opens onto the pit: a slider under the deck and two windows
  const wall = { axis: 'x', sign: -1, at: P[2] - 0.02 };
  addDoor(add, wall, 3.8, 2.2, 2.05, floor, 'glass');
  add('trim', onWall(wall).wbox(3.78, 3.82, floor, floor + 2.05, 0.02, 0.06));
  addWindow(add, wall, 8.8, 1.3, 1.1, 1.0, { base: floor });
  addWindow(add, wall, -0.4, 1.1, 1.0, 1.1, { base: floor });
  // stairs down on the south end, from the yard at the west edge
  const n = Math.round(PIT.depth / 0.165);
  const run = (S[2] - S[0]) / n;
  for (let i = 0; i < n; i++) {
    const x0 = S[0] + i * run, x1 = x0 + run;
    const ty = y - (i + 1) * (PIT.depth / n);
    add('found', box(x0, floor, S[1], x1, ty, S[3]));
    platforms.push({ r: [x0, S[1], x1, S[3]], y: ty });
  }
  // handrail on the open side of the stairs
  for (const [x, yy] of [[S[0] + 0.1, y], [(S[0] + S[2]) / 2, (y + floor) / 2], [S[2] - 0.1, floor + 0.2]]) add('iron', cyl(x, yy - 0.15, S[1] + 0.05, x, yy + 0.9, S[1] + 0.05, 0.022, 6));
  add('iron', cyl(S[0] + 0.1, y + 0.9, S[1] + 0.05, S[2] - 0.1, floor + 1.1, S[1] + 0.05, 0.025, 6));
  colliders.push({ seg: [S[0], S[1], S[0] + (S[2] - S[0]) * 0.75, S[1]], r: 0.08 });
  // railing around the top of the pit
  const rail = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const k = Math.max(1, Math.round(len / 1.6));
    for (let i = 0; i <= k; i++) {
      const x = x0 + ((x1 - x0) * i) / k, z = z0 + ((z1 - z0) * i) / k;
      add('post', box(x - 0.05, top, z - 0.05, x + 0.05, top + 1.0, z + 0.05));
    }
    for (const h of [0.5, 0.95]) add('post', box(Math.min(x0, x1) - 0.03, top + h, Math.min(z0, z1) - 0.03, Math.max(x0, x1) + 0.03, top + h + 0.06, Math.max(z0, z1) + 0.03));
    colliders.push({ seg: [x0, z0, x1, z1], r: 0.12 });
  };
  rail(P[0] - 0.12, P[1] - 0.12, P[2], P[1] - 0.12);
  rail(P[0] - 0.12, P[1] - 0.12, P[0] - 0.12, S[1]);
  rail(P[0] - 0.12, P[3] + 0.12, P[2], P[3] + 0.12);

  // the deck off the sliding door, hanging over the pit
  add('deck', box(D[0], fl - 0.05, D[1], D[2], fl, D[3]));
  add('post', box(D[0], fl - 0.3, D[1], D[2], fl - 0.05, D[1] + 0.06));
  add('post', box(D[0], fl - 0.3, D[3] - 0.06, D[2], fl - 0.05, D[3]));
  add('post', box(D[0], fl - 0.3, D[1], D[0] + 0.06, fl - 0.05, D[3]));
  for (const [px, pz] of [[D[0] + 0.1, D[1] + 0.1], [D[0] + 0.1, D[3] - 0.1], [D[0] + 0.1, (D[1] + D[3]) / 2]]) {
    add('post', box(px - 0.07, floor, pz - 0.07, px + 0.07, fl - 0.05, pz + 0.07));
    colliders.push({ c: [px, pz], r: 0.12 });
  }
  const balusters = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const k = Math.round(len / 0.13);
    for (let i = 0; i <= k; i++) {
      const x = x0 + ((x1 - x0) * i) / k, z = z0 + ((z1 - z0) * i) / k;
      add('trim', box(x - 0.018, fl, z - 0.018, x + 0.018, fl + 0.92, z + 0.018));
    }
    add('trim', box(Math.min(x0, x1) - 0.05, fl + 0.92, Math.min(z0, z1) - 0.05, Math.max(x0, x1) + 0.05, fl + 0.97, Math.max(z0, z1) + 0.05));
  };
  balusters(D[0] + 0.03, D[1] + 0.03, D[0] + 0.03, D[3] - 0.03);
  balusters(D[0] + 0.03, D[1] + 0.03, D[2], D[1] + 0.03);
  balusters(D[0] + 0.03, D[3] - 0.03, D[2], D[3] - 0.03);
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
  const wallKey = n.shop ? 'steelWhite' : ['sidingTan', 'sidingGray', 'sidingWhite'][i % 3];
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
  const pits = [];
  buildHouse(add, T.pads[0].y, colliders, platforms);
  buildBackyard(add, T.pads[0].y, colliders, platforms, pits);
  buildShop(add, T.pads[1].y, colliders);
  buildUtilityShed(add, T.pads[2].y, colliders);
  {
    const R = HORSE_SHED.rect;
    let lo = Infinity;
    for (const [x, z] of [[R[0], R[1]], [R[2], R[1]], [R[0], R[3]], [R[2], R[3]]]) lo = Math.min(lo, T.heightAt(x, z));
    buildHorseShed(add, lo + 0.02, colliders);
  }
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
    brick: patternMaterial({ color: [118, 56, 42], pattern: 'brick', rough: 0.9 }),
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
    steel: patternMaterial({ color: [150, 34, 30], pattern: 'ribs', rough: 0.5, metal: 0.15 }),
    steelWhite: patternMaterial({ color: [226, 226, 220], pattern: 'ribs', rough: 0.45, metal: 0.2 }),
    steelTan: patternMaterial({ color: [204, 190, 160], pattern: 'ribs', rough: 0.5, metal: 0.15 }),
    steelTrim: patternMaterial({ color: [242, 242, 238], rough: 0.45, metal: 0.1 }),
    steelRoof: patternMaterial({ color: [196, 198, 196], pattern: 'roofribs', ribAxis: 'x', rough: 0.38, metal: 0.45 }),
    steelTeal: patternMaterial({ color: [150, 178, 172], pattern: 'roofribs', ribAxis: 'z', rough: 0.4, metal: 0.35 }),
    weathered: patternMaterial({ color: [134, 120, 104], pattern: 'board', rough: 1, side: THREE.DoubleSide }),
    woodDoor: patternMaterial({ color: [110, 90, 70], pattern: 'board', rough: 0.9 }),
    deck: patternMaterial({ color: [150, 116, 84], pattern: 'deck', rough: 0.85 }),
    atvRed: patternMaterial({ color: [168, 30, 26], rough: 0.35, metal: 0.1 }),
    mowerGreen: patternMaterial({ color: [38, 104, 46], rough: 0.35, metal: 0.1 }),
    seatYellow: patternMaterial({ color: [226, 184, 40], rough: 0.5 }),
    seat: patternMaterial({ color: [30, 30, 32], rough: 0.6 }),
    tire: patternMaterial({ color: [26, 26, 26], rough: 0.9 }),
    steelRoofLight: patternMaterial({ color: [196, 198, 196], pattern: 'roofribs', ribAxis: 'z', rough: 0.4, metal: 0.4 }),
    steelDoor: patternMaterial({ color: [240, 240, 236], rough: 0.45, metal: 0.1 }),
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
  return { group, colliders, platforms, pits };
}
