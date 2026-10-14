import * as THREE from 'three';
import { WALK_BOUNDS, SPAWN } from './layout.js';
import { clamp } from './geo.js';

const EYE = 1.66;
const RADIUS = 0.3;
const WALK = 1.55;
const HURRY = 3.3;

export class Player {
  constructor({ camera, world, quality, canvas }) {
    this.camera = camera;
    this.world = world;
    this.Q = quality;
    this.canvas = canvas;
    this.pos = new THREE.Vector3(SPAWN.x, 0, SPAWN.z);
    this.vel = new THREE.Vector2();
    this.yaw = SPAWN.yaw;
    this.pitch = -0.04;
    this.footY = world.T.heightAt(this.pos.x, this.pos.z);
    this.keys = new Set();
    this.stride = 0;
    this.phase = 0;
    this.bob = 0;
    this.active = false;
    this.onStep = null;
    this.look = { dx: 0, dy: 0 };
    this.stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.lookTouch = { id: null, x: 0, y: 0 };
    this._bind();
  }

  _bind() {
    addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault();
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    document.addEventListener('mousemove', (e) => {
      if (!this.active || document.pointerLockElement !== this.canvas) return;
      this.yaw -= e.movementX * 0.0021;
      this.pitch = clamp(this.pitch - e.movementY * 0.0021, -1.35, 1.35);
    });
    // touch: left half walks, right half looks
    const stickEl = document.getElementById('stick');
    const knob = document.getElementById('stick-knob');
    const ts = (e) => {
      if (!this.active) return;
      for (const t of e.changedTouches) {
        if (t.clientX < innerWidth * 0.45 && this.stick.id === null) {
          this.stick = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: 0, y: 0 };
          stickEl.style.left = t.clientX + 'px';
          stickEl.style.top = t.clientY + 'px';
          knob.style.transform = 'translate(0px, 0px)';
          stickEl.classList.add('on');
        } else if (this.lookTouch.id === null) {
          this.lookTouch = { id: t.identifier, x: t.clientX, y: t.clientY };
        }
      }
      e.preventDefault();
    };
    const tm = (e) => {
      if (!this.active) return;
      for (const t of e.changedTouches) {
        if (t.identifier === this.stick.id) {
          let dx = t.clientX - this.stick.ox, dy = t.clientY - this.stick.oy;
          const d = Math.hypot(dx, dy), max = 48;
          if (d > max) { dx *= max / d; dy *= max / d; }
          this.stick.x = dx / max; this.stick.y = dy / max;
          knob.style.transform = `translate(${dx}px, ${dy}px)`;
        } else if (t.identifier === this.lookTouch.id) {
          this.yaw -= (t.clientX - this.lookTouch.x) * 0.0052;
          this.pitch = clamp(this.pitch - (t.clientY - this.lookTouch.y) * 0.0052, -1.3, 1.3);
          this.lookTouch.x = t.clientX; this.lookTouch.y = t.clientY;
        }
      }
      e.preventDefault();
    };
    const te = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.stick.id) { this.stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 }; stickEl.classList.remove('on'); }
        if (t.identifier === this.lookTouch.id) this.lookTouch = { id: null, x: 0, y: 0 };
      }
    };
    this.canvas.addEventListener('touchstart', ts, { passive: false });
    this.canvas.addEventListener('touchmove', tm, { passive: false });
    this.canvas.addEventListener('touchend', te);
    this.canvas.addEventListener('touchcancel', te);
  }

  input() {
    let f = 0, s = 0;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) f += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) f -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) s -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) s += 1;
    let hurry = k.has('ShiftLeft') || k.has('ShiftRight');
    if (this.stick.id !== null) {
      f = -this.stick.y; s = this.stick.x;
      hurry = Math.hypot(f, s) > 0.92;
    }
    const m = Math.hypot(f, s);
    if (m > 1) { f /= m; s /= m; }
    return { f, s, hurry };
  }

  groundAt(x, z) {
    let y = this.world.T.heightAt(x, z);
    let surface = null;
    for (const p of this.world.platforms) {
      if (x > p.r[0] && x < p.r[2] && z > p.r[1] && z < p.r[3] && p.y > y && p.y - this.footY < 0.42) { y = p.y; surface = 'hard'; }
    }
    return { y, surface };
  }

  collide() {
    const p = this.pos;
    for (let iter = 0; iter < 3; iter++) {
      for (const c of this.world.colliders) {
        if (c.c) {
          const dx = p.x - c.c[0], dz = p.z - c.c[1];
          const min = c.r + RADIUS;
          const d2 = dx * dx + dz * dz;
          if (d2 < min * min && d2 > 1e-8) { const d = Math.sqrt(d2); p.x = c.c[0] + (dx / d) * min; p.z = c.c[1] + (dz / d) * min; }
        } else if (c.rect) {
          const r = c.rect;
          if (p.x < r[0] - RADIUS || p.x > r[2] + RADIUS || p.z < r[1] - RADIUS || p.z > r[3] + RADIUS) continue;
          const cx = clamp(p.x, r[0], r[2]), cz = clamp(p.z, r[1], r[3]);
          const dx = p.x - cx, dz = p.z - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 > 1e-8) {
            if (d2 < RADIUS * RADIUS) { const d = Math.sqrt(d2); p.x = cx + (dx / d) * RADIUS; p.z = cz + (dz / d) * RADIUS; }
          } else {
            const pushes = [[p.x - r[0], -1, 0], [r[2] - p.x, 1, 0], [p.z - r[1], 0, -1], [r[3] - p.z, 0, 1]];
            pushes.sort((a, b) => a[0] - b[0]);
            const [d, sx, sz] = pushes[0];
            p.x += sx * (d + RADIUS); p.z += sz * (d + RADIUS);
          }
        } else if (c.seg) {
          const [ax, az, bx, bz] = c.seg;
          const vx = bx - ax, vz = bz - az;
          const L = vx * vx + vz * vz;
          const t = clamp(((p.x - ax) * vx + (p.z - az) * vz) / L, 0, 1);
          const qx = ax + vx * t, qz = az + vz * t;
          const dx = p.x - qx, dz = p.z - qz;
          const min = c.r + RADIUS;
          const d2 = dx * dx + dz * dz;
          if (d2 < min * min && d2 > 1e-8) { const d = Math.sqrt(d2); p.x = qx + (dx / d) * min; p.z = qz + (dz / d) * min; }
        }
      }
    }
    p.x = clamp(p.x, WALK_BOUNDS[0], WALK_BOUNDS[2]);
    p.z = clamp(p.z, WALK_BOUNDS[1], WALK_BOUNDS[3]);
  }

  update(dt) {
    const { f, s, hurry } = this.input();
    const speed = hurry ? HURRY : WALK;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // forward is -z at yaw 0
    const tx = (-sin * f + cos * s) * speed, tz = (-cos * f - sin * s) * speed;
    const accel = (f || s) ? 7 : 9;
    this.vel.x += (tx - this.vel.x) * Math.min(1, accel * dt);
    this.vel.y += (tz - this.vel.y) * Math.min(1, accel * dt);
    const ox = this.pos.x, oz = this.pos.z;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.y * dt;
    this.collide();
    const moved = Math.hypot(this.pos.x - ox, this.pos.z - oz);
    const g = this.groundAt(this.pos.x, this.pos.z);
    // step up quickly, settle down gently
    this.footY += (g.y - this.footY) * Math.min(1, (g.y > this.footY ? 18 : 10) * dt);
    const sp = moved / Math.max(dt, 1e-4);
    const strideLen = sp > 2.4 ? 0.98 : 0.74;
    this.stride += moved;
    this.phase += (moved / strideLen) * Math.PI;
    if (this.stride >= strideLen) {
      this.stride -= strideLen;
      if (this.onStep) this.onStep(g.surface || this.world.maps.classAt(this.pos.x, this.pos.z), sp, this.pos);
    }
    const bobAmt = clamp(sp / 1.6, 0, 1.4);
    this.bob += ((Math.abs(Math.sin(this.phase)) * 0.045 - 0.02) * bobAmt - this.bob) * Math.min(1, 10 * dt);
    if (this.look.dx || this.look.dy) {
      this.yaw += this.look.dx * dt;
      this.pitch = clamp(this.pitch + this.look.dy * dt, -1.35, 1.35);
    }
    this.speed = sp;
  }

  applyCamera() {
    const c = this.camera;
    c.position.set(this.pos.x, this.footY + EYE + this.bob, this.pos.z);
    c.rotation.set(this.pitch, this.yaw, Math.sin(this.phase * 0.5) * 0.004 * clamp(this.speed / 1.6, 0, 1), 'YXZ');
  }
}
