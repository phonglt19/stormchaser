import * as THREE from 'three';
import { FOG, CAMERA_MODES, SCORE } from './config.js';
import { makeRng } from './core/rng.js';
import { clamp } from './core/math.js';
import { Input } from './core/input.js';
import { Terrain } from './world/terrain.js';
import { Scenery } from './world/scenery.js';
import { Sky } from './world/sky.js';
import { StormSystem } from './weather/storm.js';
import { Vehicle } from './entities/vehicle.js';
import { ProbeManager } from './entities/probes.js';
import { Game } from './gameplay/game.js';
import { HUD } from './ui/hud.js';
import { Radar } from './ui/radar.js';
import { Menu } from './ui/menu.js';
import { StormAudio } from './audio/audio.js';

const START = { x: -400, z: 700 };
const params = new URLSearchParams(location.search);

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.38;

const scene = new THREE.Scene();
scene.background = new THREE.Color(FOG.color);
scene.fog = new THREE.FogExp2(FOG.color, FOG.density);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 20000);
camera.position.set(START.x - 60, 18, START.z + 60);

// ---------------------------------------------------------------- lights
const hemi = new THREE.HemisphereLight(0x6b7a88, 0x2a2c24, 0.55);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xc3cbd6, 0.85);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 1500;
sun.shadow.camera.left = -180;
sun.shadow.camera.right = 180;
sun.shadow.camera.top = 180;
sun.shadow.camera.bottom = -180;
sun.shadow.bias = -0.0007;
sun.shadow.normalBias = 0.6;
scene.add(sun);
scene.add(sun.target);

// ---------------------------------------------------------------- systems
const rng = makeRng(Number(new URLSearchParams(location.search).get('seed')) || 20240521);
const terrain = new Terrain(20240521);
const scenery = new Scenery(terrain, 4242);
const sky = new Sky();
scene.add(sky.group);

const vehicle = new Vehicle(terrain, scenery);
vehicle.reset(START);
scene.add(vehicle.group);

const audio = new StormAudio();
const storms = new StormSystem(scene, terrain, sky, audio, rng);
const probes = new ProbeManager(terrain, scene);

const hud = new HUD();
const radar = new Radar(document.getElementById('radar'));
const input = new Input(canvas);

let state = 'menu';
let menuAngle = 0;

const menu = new Menu({
  onStart: () => startRun(),
  onResume: () => resumeGame(),
  onRestart: () => startRun(),
});

const game = new Game(vehicle, storms, probes, hud, audio);

probes.onEvent = (e) => {
  if (e.type === 'deploy') {
    game.deploys++;
  } else if (e.type === 'intercept') {
    game.intercepts++;
    game.addScore(e.bonus, `PROBE INTERCEPT — EF${e.ef < 0 ? 0 : e.ef}`, 'good');
    audio.chime(true);
  }
};

// ---------------------------------------------------------------- loading
const stages = [
  ['Surveying the plains…', () => {
    terrain.build(renderer);
    scene.add(terrain.group);
  }],
  ['Planting windbreaks and fences…', () => {
    scenery.build();
    scene.add(scenery.group);
  }],
  ['Seeding the supercell…', () => {
    storms.spawn({ x: 0, z: 0 });
  }],
  ['Warming up the chase rig…', () => {
    // radars, probes, audio graph ready
  }],
];

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

async function boot() {
  for (let i = 0; i < stages.length; i++) {
    menu.setLoading(i / stages.length, stages[i][0]);
    await nextFrame();
    stages[i][1]();
  }
  menu.setLoading(1, 'Ready — chase responsibly');
  await nextFrame();
  menu.hideLoading();
  if (params.has('autostart')) {
    startRun();
    applyDevOverrides();
  } else {
    menu.showMain(true);
  }
  frame();
}

// ---------------------------------------------------------------- dev shortcuts
// ?autostart  skip the menu · ?quick  touchdown in ~2s · ?close  storm right ahead
function applyDevOverrides() {
  if (params.has('quick')) {
    for (const st of storms.storms) st.tornado.delay = 2;
  }
  if (params.has('close')) {
    const s = storms.strongest;
    if (s) {
      s.center.x = vehicle.pos.x;
      s.center.z = vehicle.pos.z - 950;
      s.tornado.x = s.center.x;
      s.tornado.z = s.center.z;
      vehicle.heading = Math.atan2(
        s.tornado.z - vehicle.pos.z,
        s.tornado.x - vehicle.pos.x
      );
    }
  }
}

// ---------------------------------------------------------------- run control
function startRun() {
  audio.init();
  audio.resume();
  vehicle.reset(START);
  probes.reset();
  storms.reset(vehicle.pos);
  const s = storms.strongest;
  if (s) {
    vehicle.heading = Math.atan2(s.tornado.z - vehicle.pos.z, s.tornado.x - vehicle.pos.x);
  }
  game.reset();
  hud.show();
  hud.setPromptVisible(true);
  menu.showMain(false);
  menu.hideGameOver();
  menu.showPause(false);
  hud.toast('STORM CHASER ONLINE — intercept the cell', 'info');
  state = 'playing';
}

function pauseGame() {
  state = 'paused';
  menu.showPause(true, game.stats());
}

function resumeGame() {
  state = 'playing';
  menu.showPause(false);
}

function endRun(title) {
  state = 'over';
  hud.stormBanner(false);
  hud.setPromptVisible(false);
  menu.showGameOver(title, game.stats());
  audio.setRumble(0, 0);
  audio.setWind(0);
  audio.setEngine(0, 0);
}

function deployProbe() {
  if (!probes.canDeploy()) {
    hud.toast(probes.count >= probes.max ? 'PROBE RACK EMPTY' : 'PROBE RACK CYCLING', 'bad');
    return;
  }
  const f = vehicle.forward;
  const p = probes.deploy(vehicle.pos.x + f.x * 2.6, vehicle.pos.z + f.z * 2.6, vehicle.heading);
  if (p) {
    game.addScore(SCORE.probeDeploy, 'PROBE DEPLOYED', 'info');
    audio.probeBeep();
  }
}

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
const menuLook = new THREE.Vector3();

function updateLights() {
  const flash = storms.flashBoost || 0;
  hemi.intensity = 0.82 + flash * 1.9;
  sun.intensity = 1.15 + flash * 0.8;
  const px = vehicle.pos.x;
  const pz = vehicle.pos.z;
  sun.position.set(px + 260, 470, pz + 200);
  sun.target.position.set(px, 0, pz);
  sun.target.updateMatrixWorld();
}

function menuCamera(dt) {
  menuAngle += dt * 0.045;
  const r = 1500;
  camera.position.set(START.x + Math.cos(menuAngle) * r, 320, START.z + Math.sin(menuAngle) * r);
  const s = storms.strongest;
  if (s) menuLook.set(s.tornado.x, 420, s.tornado.z);
  else menuLook.set(0, 200, 0);
  camera.lookAt(menuLook);
  camera.fov = 58;
  camera.updateProjectionMatrix();
}

function frame() {
  requestAnimationFrame(frame);
  stepSimulation(Math.min(clock.getDelta(), 0.05));
  renderer.render(scene, camera);
  input.endFrame();
}

function stepSimulation(dt) {
  if (input.pressed('Escape', 'KeyP')) {
    if (state === 'playing') pauseGame();
    else if (state === 'paused') resumeGame();
  }
  if (input.pressed('KeyM')) {
    audio.setMuted(!audio.muted);
    hud.toast(audio.muted ? 'AUDIO MUTED' : 'AUDIO ON', 'info');
  }

  if (state === 'menu' || state === 'over') {
    storms.update(dt, vehicle.pos, camera, { x: 0, z: 0 });
    if (state === 'menu') menuCamera(dt);
    vehicle.update(dt, NEUTRAL_INPUT, { x: 0, z: 0 }, null);
    updateLights();
    return;
  }

  if (state === 'paused') return;

  if (input.pressed('KeyC')) {
    const m = vehicle.cycleCamera();
    hud.toast(`CAMERA: ${m}`, 'info');
  }
  if (input.pressed('KeyE')) deployProbe();
  if (input.pressed('KeyR')) {
    vehicle.reset(vehicle.pos);
    hud.toast('VEHICLE RECOVERED', 'info');
  }

  storms.update(dt, vehicle.pos, camera, vehicle.velocity);
  const vortex = storms.vortexWindAt(vehicle.pos.x, vehicle.pos.z);
  vehicle.update(dt, input, vortex, audio);
  vehicle.camModeName = CAMERA_MODES[vehicle.camMode];
  vehicle.cameraUpdate(dt, camera, input);
  probes.update(dt, storms);
  game.update(dt, input, camera);
  updateLights();

  hud.update(dt, game, vehicle, storms, camera);

  const t = storms.tornado;
  if (t) radar.setRange(clamp(t.distanceTo(vehicle.pos.x, vehicle.pos.z) * 1.7, 2600, 15000));
  else radar.setRange(4200);
  radar.update(dt, vehicle, storms, probes, document.getElementById('radarRange'));

  if (game.state === 'over') endRun('CHASSIS DESTROYED');
}

// A stub input used while parked on the menu / game-over screens.
const NEUTRAL_INPUT = {
  isDown: () => false,
  pressed: () => false,
  axis: () => 0,
  mouse: { dx: 0, dy: 0, down: false },
  wheel: 0,
};

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Dev-only handle for automated smoke tests (?autostart, ?quick, ?close).
if (import.meta.env.DEV) {
  window.__keysota = {
    get state() {
      return state;
    },
    input,
    vehicle,
    storms,
    game,
    probes,
    camera,
    scene,
    renderer,
    terrain,
    start: () => startRun(),
    pause: () => pauseGame(),
    resume: () => resumeGame(),
    press: (code) => {
      input.down.add(code);
      input.pressedThisFrame.add(code);
    },
    release: (code) => input.down.delete(code),
    async step(frames = 60, dt = 1 / 60) {
      for (let i = 0; i < frames; i++) {
        stepSimulation(dt);
        input.endFrame();
      }
      renderer.render(scene, camera);
      await Promise.race([
        new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
        new Promise((r) => setTimeout(r, 500)),
      ]);
      renderer.render(scene, camera);
    },
    info: () => ({
      state,
      tornadoes: storms.storms.map((s) => ({
        phase: s.tornado.phase,
        active: s.tornado.active,
        vmax: Math.round(s.tornado.vmax),
        x: Math.round(s.tornado.x),
        z: Math.round(s.tornado.z),
        dist: Math.round(s.tornado.distanceTo(vehicle.pos.x, vehicle.pos.z)),
      })),
      vehicle: {
        x: Math.round(vehicle.pos.x),
        z: Math.round(vehicle.pos.z),
        speed: Number(vehicle.speed.toFixed(1)),
        integrity: Number(vehicle.integrity.toFixed(2)),
      },
      vortexMph: Math.round(
        Math.hypot(
          storms.vortexWindAt(vehicle.pos.x, vehicle.pos.z).x,
          storms.vortexWindAt(vehicle.pos.x, vehicle.pos.z).z
        ) * 2.23694
      ),
      render: {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        programs: renderer.info.programs ? renderer.info.programs.length : 0,
      },
      score: Math.round(game.score),
      footage: Number(game.footage.toFixed(1)),
      intercepts: game.intercepts,
      gameState: game.state,
      destroyed: game.destroyedCount || 0,
      vehicleDisabled: vehicle.disabled,
      windMph: Math.round(storms.speedAt(vehicle.pos.x, vehicle.pos.z) * 2.23694),
      probes: probes.count,
    }),
  };
}

void boot();
