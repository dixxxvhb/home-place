import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { installAtmosphere, makeSky, SUN, SUN_COLOR, SKY_LIGHT, GROUND_LIGHT } from './atmosphere.js';
import { detectQuality } from './quality.js';
import { loadTerrain, buildFarMesh, buildMidMesh, buildLocalMesh } from './terrain.js';
import { paintGround } from './groundmap.js';
import { buildBuildings } from './buildings.js';
import { buildTrees } from './trees.js';
import { WIND, gustAt } from './foliage.js';
import { buildGrass } from './grass.js';
import { buildProps } from './props.js';
import { buildWater } from './water.js';
import { Player } from './player.js';
import { buildHorses } from './horses.js';
import { buildLife } from './life.js';
import { Soundscape } from './audio.js';

installAtmosphere();
const Q = detectQuality();
if (Q.touch) document.body.classList.add('touch');
const params = new URLSearchParams(location.search);
const PREVIEW = params.has('view');

const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: Q.msaa, powerPreference: 'high-performance' });
renderer.setPixelRatio(Q.dpr);
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.autoClear = false;

// Two passes: the far pass (sky, mountains) with a deep depth range, then the near pass
// (everything you can walk to) with a tight one. No z-fighting at 30 km or at 3 cm.
const farScene = new THREE.Scene();
const nearScene = new THREE.Scene();
farScene.fog = new THREE.FogExp2(0xffffff, 0.0001);
nearScene.fog = new THREE.FogExp2(0xffffff, 0.0001);

const camera = new THREE.PerspectiveCamera(Q.touch ? 70 : 66, innerWidth / innerHeight, 0.08, 4000);
const farCamera = new THREE.PerspectiveCamera(camera.fov, innerWidth / innerHeight, 120, 160000);

const sky = makeSky(Q);
farScene.add(sky.mesh);

function addLights(scene, withShadow) {
  scene.add(new THREE.HemisphereLight(SKY_LIGHT, GROUND_LIGHT, 1.5));
  const sun = new THREE.DirectionalLight(SUN_COLOR, 4.4);
  sun.position.copy(SUN).multiplyScalar(300);
  scene.add(sun, sun.target);
  if (withShadow) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(Q.shadowSize, Q.shadowSize);
    const r = Q.shadowRadius;
    Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 700 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
  }
  return sun;
}
addLights(farScene, false);
const sunLight = addLights(nearScene, true);

const world = { colliders: [], platforms: [] };
const sound = new Soundscape();
let player = null;
const tick = () => new Promise((r) => setTimeout(r, 0));

async function buildWorld() {
  const status = $('status');
  status.textContent = 'Laying out the ground';
  const T = await loadTerrain();
  const maps = paintGround(Q);
  Object.assign(world, { T, maps });
  farScene.add(buildFarMesh(T, Q));
  nearScene.add(buildMidMesh(T, Q));
  nearScene.add(buildLocalMesh(T, maps, Q));
  status.textContent = 'Putting up the house';
  await tick();
  const B = buildBuildings(T);
  nearScene.add(B.group);
  world.colliders.push(...B.colliders);
  world.platforms.push(...B.platforms);
  status.textContent = 'Planting the trees';
  await tick();
  world.grass = buildGrass(T, maps, Q);
  nearScene.add(world.grass.group);
  const trees = buildTrees(T, Q);
  nearScene.add(trees.group);
  world.colliders.push(...trees.colliders);
  status.textContent = 'Turning on the sprinklers';
  await tick();
  const props = buildProps(T);
  nearScene.add(props.group);
  world.colliders.push(...props.colliders);
  world.water = buildWater(T, props);
  nearScene.add(world.water.group);
  world.water.resize(camera, innerHeight);
  status.textContent = 'Letting the horses out';
  await tick();
  world.horses = buildHorses(T);
  nearScene.add(world.horses.group);
  world.colliders.push(...world.horses.colliders);
  world.life = buildLife(T, Q);
  nearScene.add(world.life.group);
  player = new Player({ camera, world, quality: Q, canvas });
  player.onStep = (cls, speed) => sound.step(cls, speed);
}

// Fixed viewpoints for previews and screenshots: ?view=name
const VIEWS = {
  lawn: { pos: [16, 1.68, 7], look: [-2, 2.4, -1] },
  house: { pos: [26, 2.2, 14], look: [-4, 2.6, -4] },
  shop: { pos: [14, 1.68, -12], look: [-6, 3, -24] },
  back: { pos: [-34, 1.68, 6], look: [-8, 2.4, -2] },
  east: { pos: [4, 1.68, 2], look: [60, 4, -14] },
  pasture: { pos: [-62, 1.68, 6], look: [-5, 3, -4] },
  air: { pos: [70, 46, 70], look: [-15, 0, -2] },
  road: { pos: [23, 1.68, 30], look: [10, 3, -6] },
  sprinkler: { pos: [17.5, 1.68, 10.5], look: [8, 1.0, 4] },
  arena: { pos: [-6, 1.68, 20], look: [-40, 1.5, 34] },
  spawn: { pos: [17.5, 1.66, 8.5], look: [0, 2.2, 5] },
  horses: { pos: [-48, 1.68, 18], look: [-62, 0.8, 14] },
  horseclose: { pos: [-56.5, 1.5, 7.2], look: [-60, 0.9, 4] },
};
let currentView = params.get('view') || 'house';
function setView(name) {
  currentView = VIEWS[name] ? name : 'house';
  const v = VIEWS[currentView];
  const gy = world.T ? world.T.heightAt(v.pos[0], v.pos[2]) : 0;
  const ly = world.T ? world.T.heightAt(v.look[0], v.look[2]) : 0;
  camera.position.set(v.pos[0], v.pos[1] + gy, v.pos[2]);
  camera.lookAt(v.look[0], v.look[1] + ly, v.look[2]);
}

// ---------- the opening: a slow drift up the drive while the title is up ----------
const intro = { t: 0, a: new THREE.Vector3(30, 2.6, 26), b: new THREE.Vector3(21.5, 2.1, 17), look: new THREE.Vector3(-2, 2.4, 2) };
function introCamera(dt) {
  intro.t += dt;
  const k = 1 - Math.exp(-intro.t / 40);
  camera.position.lerpVectors(intro.a, intro.b, k);
  camera.position.y += world.T ? world.T.heightAt(camera.position.x, camera.position.z) : 0;
  const ly = world.T ? world.T.heightAt(intro.look.x, intro.look.z) : 0;
  camera.lookAt(intro.look.x + Math.sin(intro.t * 0.05) * 2, intro.look.y + ly, intro.look.z);
}

// mode: preview (fixed view), intro (title up), enter (camera handing off), walk, paused
let mode = PREVIEW ? 'preview' : 'intro';
let handoff = 0;
const fromPos = new THREE.Vector3(), fromQuat = new THREE.Quaternion();
const tmpPos = new THREE.Vector3(), tmpQuat = new THREE.Quaternion();

// Opacity fades driven by timers, so they also run where CSS transitions stall.
function fade(el, to, ms, done) {
  const from = parseFloat(getComputedStyle(el).opacity);
  const t0 = performance.now();
  el.style.transition = 'none';
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    el.style.opacity = String(from + (to - from) * (k * k * (3 - 2 * k)));
    if (k < 1) setTimeout(step, 16);
    else if (done) done();
  };
  step();
}

const enterBtn = $('enter');
async function enter() {
  if (!player) return;
  enterBtn.disabled = true;
  try { await sound.start(Q, world); } catch (e) { console.warn('audio', e); }
  sound.duck(false);
  if (!Q.touch) canvas.requestPointerLock?.();
  if (mode === 'intro') {
    fromPos.copy(camera.position);
    fromQuat.copy(camera.quaternion);
    handoff = 0;
    mode = 'enter';
  } else mode = 'walk';
  player.active = true;
  const el = $('intro');
  fade(el, 0, 700, () => { el.style.display = 'none'; enterBtn.disabled = false; });
  if (!Q.touch) toast('Esc to stop. M for sound.', 4200);
}
enterBtn.addEventListener('click', enter);
canvas.addEventListener('click', () => {
  if ((mode === 'walk' || mode === 'enter') && !Q.touch && document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas || Q.touch) return;
  if (mode === 'walk' || mode === 'enter') pause();
});
function pause() {
  if (mode === 'enter') mode = 'walk';
  mode = 'paused';
  player.active = false;
  player.keys.clear();
  sound.duck(true);
  const el = $('intro');
  el.style.display = '';
  $('status').textContent = 'Still here when you are.';
  enterBtn.textContent = 'Keep walking';
  fade(el, 1, 400);
}
addEventListener('keydown', (e) => {
  if (e.code === 'KeyM' && sound.started) { sound.setMuted(!sound.muted); toast(sound.muted ? 'Sound off' : 'Sound on', 1500); }
});
document.addEventListener('visibilitychange', () => {
  if (!sound.started) return;
  if (document.hidden) sound.ctx.suspend();
  else sound.ctx.resume();
});

let toastTimer = 0;
function toast(text, ms) {
  const el = $('toast');
  el.textContent = text;
  el.style.transition = 'none';
  el.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => fade(el, 0, 800), ms);
}

// ---------- rendering ----------
let composer = null;
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = farCamera.aspect = w / h;
  camera.updateProjectionMatrix();
  farCamera.updateProjectionMatrix();
  if (composer) composer.setSize(w, h);
  if (world.water) world.water.resize(camera, h);
}
addEventListener('resize', resize);

class WorldPass extends Pass {
  constructor() { super(); this.needsSwap = false; }
  render(r, writeBuffer, readBuffer) {
    r.setRenderTarget(this.renderToScreen ? null : readBuffer);
    drawWorld();
  }
}
function drawWorld() {
  renderer.clear(true, true, true);
  renderer.render(farScene, farCamera);
  renderer.clearDepth();
  renderer.render(nearScene, camera);
}
if (Q.bloom) {
  const rt = new THREE.WebGLRenderTarget(innerWidth * Q.dpr, innerHeight * Q.dpr, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(Q.dpr);
  composer.addPass(new WorldPass());
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.2, 0.4, 1.6));
  composer.addPass(new OutputPass());
}

const fwd = new THREE.Vector3();
function render() {
  farCamera.position.copy(camera.position);
  farCamera.quaternion.copy(camera.quaternion);
  farCamera.updateMatrixWorld();
  if (world.grass) world.grass.update(camera, player && player.active ? player.pos : null);
  // shadows cover what's in front of you, snapped to texels so edges don't crawl
  const r = Q.shadowRadius, texel = (2 * r) / Q.shadowSize;
  fwd.set(0, 0, -1).applyQuaternion(camera.quaternion).setY(0).normalize().multiplyScalar(r * 0.45);
  const tx = Math.round((camera.position.x + fwd.x) / texel) * texel, tz = Math.round((camera.position.z + fwd.z) / texel) * texel;
  sunLight.target.position.set(tx, camera.position.y - 1.6, tz);
  sunLight.position.copy(sunLight.target.position).addScaledVector(SUN, 300);
  sunLight.target.updateMatrixWorld();
  if (composer) composer.render();
  else { renderer.setRenderTarget(null); drawWorld(); }
}

const clock = new THREE.Timer();
const eul = new THREE.Euler();
let elapsed = 0;
function frame() {
  clock.update();
  const dt = Math.min(clock.getDelta(), 0.1);
  elapsed += dt;
  const gust = gustAt(elapsed);
  WIND.uTime.value = elapsed;
  WIND.uGust.value = gust;
  sound.gust = gust;
  sky.update(elapsed);
  if (world.water) world.water.update(dt);
  if (world.horses) world.horses.update(dt, player && player.active ? player.pos : null, sound);
  if (world.life) world.life.update(dt, camera, innerHeight);

  if (mode === 'intro') introCamera(dt);
  else if (mode === 'enter') {
    handoff = Math.min(1, handoff + dt / 1.8);
    player.update(dt);
    player.applyCamera();
    tmpPos.copy(camera.position);
    tmpQuat.copy(camera.quaternion);
    const k = handoff * handoff * (3 - 2 * handoff);
    camera.position.lerpVectors(fromPos, tmpPos, k);
    camera.quaternion.slerpQuaternions(fromQuat, tmpQuat, k);
    if (handoff >= 1) mode = 'walk';
  } else if (mode === 'walk') {
    player.update(dt);
    player.applyCamera();
  }
  if (sound.started) {
    eul.setFromQuaternion(camera.quaternion, 'YXZ');
    sound.update(dt, { x: camera.position.x, y: camera.position.y, z: camera.position.z, yaw: eul.y, pitch: eul.x }, player);
  }
  render();
  requestAnimationFrame(frame);
}

if (PREVIEW) {
  $('intro').style.display = 'none';
  $('veil').style.display = 'none';
}
buildWorld().then(() => {
  if (PREVIEW) setView(currentView);
  else introCamera(0);
  render();
  window.__hp.ready = true;
  requestAnimationFrame(frame);
  if (!PREVIEW) fade($('veil'), 0, 2200, () => { $('veil').style.display = 'none'; });
  $('status').textContent = 'A Saturday in July, a little before eight.';
  enterBtn.disabled = false;
}).catch((e) => { console.error(e); $('status').textContent = 'Something broke: ' + e.message; });

window.__hp = { THREE, renderer, camera, setView, render, nearScene, farScene, world, sound, enter, get player() { return player; }, get mode() { return mode; } };
