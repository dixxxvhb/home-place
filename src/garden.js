import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GARDEN } from './layout.js';
import { rng } from './geo.js';
import { foliageMaterial, foliageDepthMaterial } from './foliage.js';
import { getLeafAtlas } from './trees.js';
import { patternMaterial, srgb } from './materials.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// The back half of the yard, nearly every summer: peas on the west side,
// squash sprawling in the middle, potatoes in hilled rows toward the house.
export function buildGarden(T, quality) {
  const R = rng(77);
  const pos = [], nrm = [], uv = [], wind = [], col = [], idx = [];
  const card = (p, ax, ay, n, cell, flex, tint) => {
    const base = pos.length / 3;
    const cu = (cell % 2) * 0.5, cv = cell < 2 ? 0 : 0.5;
    for (const [i, j] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      pos.push(p.x + ax.x * i + ay.x * j, p.y + ax.y * i + ay.y * j, p.z + ax.z * i + ay.z * j);
      nrm.push(n.x, n.y, n.z);
      uv.push(cu + (i < 0 ? 0 : 0.5), 1 - (cv + (j < 0 ? 0.5 : 0)));
      wind.push(flex, R() * 6.28, 0.8);
      col.push(tint[0], tint[1], tint[2]);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const randAxes = (n, size) => {
    const tmp = Math.abs(n.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0);
    const ax = new THREE.Vector3().crossVectors(n, tmp).normalize();
    const ay = new THREE.Vector3().crossVectors(n, ax).normalize();
    const a = R() * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    return [ax.clone().multiplyScalar(c).addScaledVector(ay, s).multiplyScalar(size / 2), ay.clone().multiplyScalar(c).addScaledVector(ax, -s).multiplyScalar(size / 2)];
  };
  const z0 = GARDEN[1] + 0.6, z1 = GARDEN[3] - 0.6;
  const solid = [];
  const wood = [];
  const twine = [];

  // peas, climbing stakes and twine
  for (const x of [GARDEN[0] + 0.45, GARDEN[0] + 1.35]) {
    for (let z = z0; z <= z1 + 0.01; z += (z1 - z0) / 10) {
      const y = T.heightAt(x, z);
      wood.push(new THREE.BoxGeometry(0.04, 1.6, 0.04).translate(x, y + 0.62, z).toNonIndexed());
    }
    for (const h of [0.35, 0.75, 1.15]) {
      for (let z = z0; z < z1; z += 1) {
        const za = z, zb = Math.min(z1, z + 1);
        twine.push(x, T.heightAt(x, za) + h, za, x, T.heightAt(x, zb) + h, zb);
      }
    }
    for (let z = z0; z <= z1; z += 0.034) {
      const y = T.heightAt(x, z);
      const h = Math.pow(R(), 0.7) * 1.3 + 0.04;
      const side = R() < 0.5 ? -1 : 1;
      const p = V(x + side * (0.03 + R() * 0.05), y + h, z + (R() - 0.5) * 0.04);
      const n = V(side, 0.35, (R() - 0.5) * 0.6).normalize();
      const [ax, ay] = randAxes(V(side * 0.8, (R() - 0.5) * 0.6, (R() - 0.5)).normalize(), 0.2 + R() * 0.07);
      const v = 0.95 + R() * 0.15;
      card(p, ax, ay, n, 2, 0.18 + h * 0.15, [v * 0.95, v, v * 0.85]);
    }
  }
  // squash hills, big leaves held up and out, fruit lying underneath
  for (const [x, off] of [[GARDEN[0] + 2.55, 0], [GARDEN[0] + 3.95, 0.65]]) {
    for (let z = z0 + off; z <= z1; z += 1.35) {
      const y = T.heightAt(x, z);
      const center = V(x, y + 0.1, z);
      const nLeaves = 9 + ((R() * 4) | 0);
      for (let i = 0; i < nLeaves; i++) {
        const a = (i / nLeaves) * Math.PI * 2 + R() * 0.5;
        const r = 0.18 + R() * 0.5;
        const h = 0.12 + R() * 0.38 * (1 - r * 0.6);
        const p = V(x + Math.cos(a) * r, y + h, z + Math.sin(a) * r);
        const out = V(Math.cos(a), 0, Math.sin(a));
        const n = out.clone().multiplyScalar(0.45).add(V(0, 1, 0)).normalize();
        const size = 0.42 + R() * 0.16;
        const ax = new THREE.Vector3().crossVectors(n, out).normalize().multiplyScalar(size / 2);
        const ay = new THREE.Vector3().crossVectors(ax, n).normalize().multiplyScalar(size / 2);
        const v = 0.85 + R() * 0.2;
        card(p, ax, ay, p.clone().sub(center).normalize().add(V(0, 0.8, 0)).normalize(), 1, 0.12, [v * 0.95, v * 1.05, v * 0.8]);
      }
      for (let f = 0; f < 2; f++) {
        if (R() < 0.35) continue;
        const a = R() * Math.PI * 2, r = 0.2 + R() * 0.35;
        const fx = x + Math.cos(a) * r, fz = z + Math.sin(a) * r;
        const yellow = R() < 0.4;
        const g = yellow ? new THREE.SphereGeometry(0.06, 10, 8).scale(1.6, 1, 1) : new THREE.CapsuleGeometry(0.042, 0.22, 4, 10).rotateZ(Math.PI / 2);
        g.rotateY(R() * Math.PI);
        g.translate(fx, T.heightAt(fx, fz) + 0.045, fz);
        const c = yellow ? srgb(226, 180, 50) : srgb(42, 76, 34);
        const ca = new Float32Array(g.attributes.position.count * 3);
        for (let i = 0; i < ca.length; i += 3) { ca[i] = c.r; ca[i + 1] = c.g; ca[i + 2] = c.b; }
        g.setAttribute('color', new THREE.BufferAttribute(ca, 3));
        solid.push(g.index ? g.toNonIndexed() : g);
      }
    }
  }
  // potatoes, hilled rows of bushy plants
  for (let k = 0; k < 4; k++) {
    const x = GARDEN[0] + 5.25 + k * 0.9;
    for (let z = z0; z <= z1; z += 0.42) {
      const y = T.heightAt(x, z) + 0.06;
      const center = V(x, y + 0.18, z);
      for (let i = 0; i < 9; i++) {
        const a = R() * Math.PI * 2, r = R() * 0.2;
        const p = V(x + Math.cos(a) * r, y + 0.08 + R() * 0.34, z + Math.sin(a) * r);
        const n = p.clone().sub(center).normalize().add(V(0, 0.6, 0)).normalize();
        const [ax, ay] = randAxes(V(R() - 0.5, 0.5 + R(), R() - 0.5).normalize(), 0.3 + R() * 0.1);
        const v = 0.78 + R() * 0.15;
        card(p, ax, ay, n, 0, 0.14, [v, v * 1.05, v * 0.85]);
      }
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aWind', new THREE.Float32BufferAttribute(wind, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const atlas = getLeafAtlas(quality);
  const mat = foliageMaterial(atlas, { translucency: 0.6, a2c: quality.tier === 'high' });
  mat.vertexColors = true;
  const plants = new THREE.Mesh(g, mat);
  plants.castShadow = true;
  plants.receiveShadow = true;
  plants.customDepthMaterial = foliageDepthMaterial(atlas);

  const group = new THREE.Group();
  group.add(plants);
  if (solid.length) {
    const fruit = new THREE.Mesh(mergeGeometries(solid), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45 }));
    fruit.castShadow = true;
    group.add(fruit);
  }
  const stakes = new THREE.Mesh(mergeGeometries(wood), patternMaterial({ color: [140, 116, 84], rough: 0.95 }));
  stakes.castShadow = true;
  group.add(stakes);
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.Float32BufferAttribute(twine, 3));
  group.add(new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ color: new THREE.Color(0.75, 0.68, 0.52) })));
  return { group };
}
