import * as THREE from 'three';
import { installAtmosphere, makeSky, SUN, SUN_COLOR, SKY_LIGHT, GROUND_LIGHT } from './atmosphere.js';
import { detectQuality } from './quality.js';
import { loadTerrain, buildFarMesh, buildMidMesh, buildLocalMesh } from './terrain.js';
import { paintGround } from './groundmap.js';
import { buildBuildings } from './buildings.js';
import { buildTrees } from './trees.js';
import { WIND } from './foliage.js';
import { buildGrass } from './grass.js';

installAtmosphere();
const Q = detectQuality();
if (Q.touch) document.body.classList.add('touch');

const canvas = document.getElementById('scene');
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

const camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, 0.08, 4000);
const farCamera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, 120, 160000);

const sky = makeSky(Q);
farScene.add(sky.mesh);

function addLights(scene, withShadow) {
  const hemi = new THREE.HemisphereLight(SKY_LIGHT, GROUND_LIGHT, 1.35);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(SUN_COLOR, 3.6);
  sun.position.copy(SUN).multiplyScalar(300);
  scene.add(sun);
  scene.add(sun.target);
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

const world = {};
async function buildWorld() {
  const T = await loadTerrain();
  const maps = paintGround(Q);
  world.T = T;
  world.maps = maps;
  farScene.add(buildFarMesh(T, Q));
  nearScene.add(buildMidMesh(T, Q));
  nearScene.add(buildLocalMesh(T, maps, Q));
  const B = buildBuildings(T);
  nearScene.add(B.group);
  world.colliders = B.colliders;
  world.platforms = B.platforms;
  world.grass = buildGrass(T, maps, Q);
  nearScene.add(world.grass.group);
  const trees = buildTrees(T, Q);
  nearScene.add(trees.group);
  world.colliders.push(...trees.colliders);
  const v = VIEWS[currentView];
  camera.position.y = T.heightAt(camera.position.x, camera.position.z) + v.pos[1];
}

// Fixed viewpoints for previews and screenshots: ?view=lawn|east|pasture|air
const VIEWS = {
  lawn: { pos: [16, 1.68, 7], look: [-2, 2.4, -1] },
  house: { pos: [26, 2.2, 14], look: [-4, 2.6, -4] },
  shop: { pos: [14, 1.68, -12], look: [-6, 3, -24] },
  back: { pos: [-34, 1.68, 6], look: [-8, 2.4, -2] },
  east: { pos: [4, 1.68, 2], look: [60, 4, -14] },
  pasture: { pos: [-62, 1.68, 6], look: [-5, 3, -4] },
  air: { pos: [70, 46, 70], look: [-15, 0, -2] },
  road: { pos: [23, 1.68, 30], look: [10, 3, -6] },
};
let currentView = 'lawn';
function setView(name) {
  currentView = VIEWS[name] ? name : 'lawn';
  const v = VIEWS[currentView];
  const gy = world.T ? world.T.heightAt(v.pos[0], v.pos[2]) : 0;
  const ly = world.T ? world.T.heightAt(v.look[0], v.look[2]) : 0;
  camera.position.set(v.pos[0], v.pos[1] + gy, v.pos[2]);
  camera.lookAt(v.look[0], v.look[1] + ly, v.look[2]);
}
setView(new URLSearchParams(location.search).get('view') || 'lawn');

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = farCamera.aspect = w / h;
  camera.updateProjectionMatrix();
  farCamera.updateProjectionMatrix();
}
addEventListener('resize', resize);

const clock = new THREE.Timer();
let elapsed = 0;

function render() {
  if (world.grass) world.grass.update(camera, null);
  farCamera.position.copy(camera.position);
  farCamera.quaternion.copy(camera.quaternion);
  farCamera.updateMatrixWorld();
  sunLight.target.position.set(camera.position.x, 0, camera.position.z);
  sunLight.position.copy(sunLight.target.position).addScaledVector(SUN, 300);
  renderer.setRenderTarget(null);
  renderer.clear(true, true, true);
  renderer.render(farScene, farCamera);
  renderer.clearDepth();
  renderer.render(nearScene, camera);
}

function frame() {
  clock.update();
  const dt = Math.min(clock.getDelta(), 0.1);
  elapsed += dt;
  sky.update(elapsed);
  WIND.uTime.value = elapsed;
  if (world.grass) world.grass.update(camera, null);
  render();
  requestAnimationFrame(frame);
}

buildWorld().then(() => {
  setView(currentView);
  render();
  window.__hp.ready = true;
  requestAnimationFrame(frame);
  document.getElementById('veil').classList.add('lifted');
}).catch((e) => { console.error(e); document.getElementById('status').textContent = 'Something broke: ' + e.message; });
document.getElementById('status').textContent = 'Building. Not walkable yet.';
if (!new URLSearchParams(location.search).has('intro')) {
  document.getElementById('intro').style.display = 'none';
  document.getElementById('veil').style.display = 'none';
}

window.__hp = { THREE, renderer, camera, setView, render, nearScene, farScene, world };
