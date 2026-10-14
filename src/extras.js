import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ROCK_WALL, ROCKS, SIGN, HOOP } from './layout.js';
import { rng, smoothLine, samplePolyline, pointInPoly } from './geo.js';
import { patternMaterial, srgb } from './materials.js';

// A fieldstone: a lumpy, slightly flattened ball.
function stone(R, rx, ry, rz, detail = 1) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  const f1 = 1.5 + R() * 2, f2 = 3 + R() * 3, ph = R() * 10;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = 1 + 0.16 * Math.sin(x * f1 + ph) * Math.sin(y * f1 * 1.3 + ph) + 0.07 * Math.sin(z * f2 + x * f2 + ph);
    p.setXYZ(i, x * rx * n, y * ry * n, z * rz * n);
  }
  g.computeVertexNormals();
  const c = new Float32Array(p.count * 3);
  const palette = [[124, 120, 112], [142, 132, 116], [104, 102, 98], [150, 144, 134], [118, 106, 92], [96, 92, 88]];
  const base = palette[(R() * palette.length) | 0];
  for (let i = 0; i < p.count; i++) {
    const v = 0.85 + R() * 0.2;
    const col = srgb(base[0] * v, base[1] * v, base[2] * v);
    c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g.index ? g.toNonIndexed() : g;
}

function signTexture(lines) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 440;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f3ee';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#1f3561';
  g.lineWidth = 14;
  g.strokeRect(22, 22, c.width - 44, c.height - 44);
  g.fillStyle = '#1f3561';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const fit = (text, weight, size, maxW) => {
    let px = size;
    do { g.font = `${weight} ${px}px Arial, Helvetica, sans-serif`; px -= 2; } while (g.measureText(text).width > maxW && px > 20);
  };
  fit(lines[0], 900, 104, c.width - 130);
  g.fillText(lines[0], c.width / 2, 150);
  g.fillStyle = '#b3261e';
  g.fillRect(120, 222, c.width - 240, 12);
  g.fillStyle = '#1f3561';
  fit(lines[1], 700, 86, c.width - 170);
  g.fillText(lines[1], c.width / 2, 318);
  // a little weather on it
  for (let i = 0; i < 1600; i++) {
    g.fillStyle = `rgba(90,80,60,${Math.random() * 0.05})`;
    g.fillRect(Math.random() * c.width, Math.random() * c.height, 2 + Math.random() * 6, 2 + Math.random() * 6);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function buildExtras(T) {
  const R = rng(44);
  const group = new THREE.Group();
  const colliders = [];
  const stoneMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });

  // ---------- the fieldstone wall in the front island ----------
  {
    const line = smoothLine(ROCK_WALL, 8);
    const parts = [];
    let k = 0;
    for (const p of samplePolyline(line, 0.36)) {
      k++;
      const y = T.heightAt(p.x, p.z);
      const r = 0.2 + R() * 0.12;
      const g = stone(R, r * (1.1 + R() * 0.3), r * 0.75, r, 2);
      g.rotateY(R() * Math.PI);
      g.translate(p.x + (R() - 0.5) * 0.08, y + r * 0.55, p.z + (R() - 0.5) * 0.08);
      parts.push(g);
      if (k % 9 !== 0) {
        const r2 = 0.15 + R() * 0.09;
        const g2 = stone(R, r2 * 1.2, r2 * 0.8, r2, 2);
        g2.rotateY(R() * Math.PI);
        g2.translate(p.x + Math.cos(p.ang) * 0.18, y + r * 1.15 + r2 * 0.5, p.z + Math.sin(p.ang) * 0.18);
        parts.push(g2);
      }
    }
    for (let i = 0; i < line.length - 1; i++) colliders.push({ seg: [line[i][0], line[i][1], line[i + 1][0], line[i + 1][1]], r: 0.3 });
    const wall = new THREE.Mesh(mergeGeometries(parts), stoneMat);
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);
  }

  // ---------- river rock along the neighbors' side of the slab ----------
  {
    const parts = [];
    const xs = ROCKS.map((p) => p[0]), zs = ROCKS.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    let n = 0;
    for (let i = 0; i < 6000 && n < 700; i++) {
      const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0);
      if (!pointInPoly(x, z, ROCKS)) continue;
      n++;
      const r = 0.04 + R() * R() * 0.12;
      const g = stone(R, r * 1.3, r * 0.6, r, 0);
      g.rotateY(R() * Math.PI);
      g.translate(x, T.heightAt(x, z) + r * 0.25, z);
      parts.push(g);
    }
    // a few landscaping boulders
    for (const [x, z, r] of [[8, -30, 0.5], [15.5, -33, 0.65], [21, -29.5, 0.45]]) {
      const g = stone(R, r * 1.3, r * 0.8, r);
      g.translate(x, T.heightAt(x, z) + r * 0.45, z);
      parts.push(g);
      colliders.push({ c: [x, z], r: r * 1.2 });
    }
    const rocks = new THREE.Mesh(mergeGeometries(parts), stoneMat);
    rocks.receiveShadow = true;
    rocks.castShadow = true;
    group.add(rocks);
  }

  // ---------- the sign out by the road ----------
  {
    const { x, z } = SIGN;
    const y = T.heightAt(x, z);
    const white = patternMaterial({ color: [240, 238, 232], rough: 0.6 });
    const posts = [];
    for (const dz of [-1.45, 1.45]) posts.push(new THREE.BoxGeometry(0.12, 2.75, 0.12).translate(x, y + 1.25, z + dz));
    posts.push(new THREE.BoxGeometry(0.1, 1.55, 3.5).translate(x, y + 1.95, z));
    const frame = new THREE.Mesh(mergeGeometries(posts), white);
    frame.castShadow = true;
    frame.receiveShadow = true;
    group.add(frame);
    const face = new THREE.MeshStandardMaterial({ map: signTexture(SIGN.lines), roughness: 0.65 });
    const front = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.45), face);
    front.position.set(x + 0.056, y + 1.95, z);
    front.rotation.y = Math.PI / 2;
    const back = front.clone();
    back.position.x = x - 0.056;
    back.rotation.y = -Math.PI / 2;
    front.receiveShadow = back.receiveShadow = true;
    group.add(front, back);
    colliders.push({ c: [x, z - 1.45], r: 0.15 }, { c: [x, z + 1.45], r: 0.15 });
  }

  // ---------- the hoop at the garage ----------
  {
    const [x, z] = HOOP;
    const y = T.heightAt(x, z);
    const steel = patternMaterial({ color: [60, 64, 66], rough: 0.5, metal: 0.6 });
    const g = [
      new THREE.CylinderGeometry(0.06, 0.07, 3.3, 10).translate(x, y + 1.65, z),
      new THREE.BoxGeometry(0.08, 0.08, 0.7).translate(x, y + 3.1, z + 0.32),
    ];
    const pole = new THREE.Mesh(mergeGeometries(g.map((q) => q.toNonIndexed())), steel);
    pole.castShadow = true;
    group.add(pole);
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.05, 0.04), patternMaterial({ color: [244, 244, 240], rough: 0.4 }));
    board.position.set(x, y + 3.35, z + 0.7);
    board.castShadow = true;
    group.add(board);
    const square = new THREE.Mesh(new THREE.PlaneGeometry(0.59, 0.45), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.06, 0.04) }));
    square.position.set(x, y + 3.25, z + 0.722);
    group.add(square);
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(0.53, 0.39), patternMaterial({ color: [244, 244, 240], rough: 0.4 }));
    inner.position.set(x, y + 3.25, z + 0.723);
    group.add(inner);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.01, 6, 24).rotateX(Math.PI / 2), patternMaterial({ color: [220, 90, 30], rough: 0.4, metal: 0.4 }));
    rim.position.set(x, y + 3.05, z + 0.95);
    group.add(rim);
    const net = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.15, 0.42, 12, 3, true), new THREE.MeshLambertMaterial({ color: 0xf2f2ee, wireframe: true, transparent: true, opacity: 0.8 }));
    net.position.set(x, y + 2.84, z + 0.95);
    group.add(net);
    colliders.push({ c: [x, z], r: 0.15 });
  }

  return { group, colliders };
}
