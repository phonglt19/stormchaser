import * as THREE from 'three';
import { PROBE, SCORE } from '../config.js';
import { clamp, efScale } from '../core/math.js';

// Deployable instrument probes: measure the wind they endure and score on intercepts.
export class ProbeManager {
  constructor(terrain, scene) {
    this.terrain = terrain;
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.probes = [];
    this.cooldown = 0;
    this.onEvent = null;
  }

  get count() {
    return this.probes.length;
  }

  get max() {
    return PROBE.max;
  }

  canDeploy() {
    return this.cooldown <= 0 && this.probes.length < PROBE.max;
  }

  reset() {
    for (const p of this.probes) this.group.remove(p.group);
    this.probes.length = 0;
    this.cooldown = 0;
  }

  deploy(x, z, heading) {
    if (!this.canDeploy()) return null;
    const y = this.terrain.height(x, z);
    const g = makeProbeMesh();
    g.position.set(x, y, z);
    g.rotation.y = heading;
    this.group.add(g);
    const probe = {
      x,
      z,
      y,
      group: g,
      beacon: g.userData.beacon,
      mast: g.userData.mast,
      peakWind: 0,
      currentWind: 0,
      intercepted: false,
      ef: -1,
      scored: 0,
      age: 0,
      blink: Math.random() * 10,
    };
    this.probes.push(probe);
    this.cooldown = PROBE.cooldown;
    if (this.onEvent) this.onEvent({ type: 'deploy', probe });
    return probe;
  }

  update(dt, stormSystem) {
    if (this.cooldown > 0) this.cooldown -= dt;

    for (const p of this.probes) {
      p.age += dt;
      p.blink += dt;
      const wind = stormSystem.speedAt(p.x, p.z);
      p.currentWind = wind;
      if (wind > p.peakWind) p.peakWind = wind;

      if (!p.intercepted) {
        const near = stormSystem.nearestTornado({ x: p.x, z: p.z });
        if (near && near.tornado.active && near.dist < PROBE.interceptRadius + near.tornado.coreRadius) {
          p.intercepted = true;
          p.ef = efScale(near.tornado.vmax);
          const bonus = SCORE.probeIntercept + (p.ef >= 0 ? SCORE.efBonus[Math.min(5, p.ef)] * 0.5 : 0);
          p.scored = bonus;
          if (this.onEvent) this.onEvent({ type: 'intercept', probe: p, bonus, ef: p.ef, vmax: near.tornado.vmax });
        }
      }

      // lean the mast with the wind, flash the beacon faster when it's howling
      const lean = clamp(wind / 70, 0, 1) * 0.5;
      if (p.mast) p.mast.rotation.z = lean;
      const blinkRate = 2 + clamp(wind / 30, 0, 1) * 12;
      const on = Math.sin(p.blink * blinkRate) > 0;
      if (p.beacon) {
        p.beacon.material.emissiveIntensity = on ? 3.0 : 0.15;
        p.beacon.material.emissive.setHex(p.intercepted ? 0x33ff88 : 0x38c8ff);
      }
    }
  }
}

function makeProbeMesh() {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0xcfd6db, roughness: 0.4, metalness: 0.6, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x22282d, roughness: 0.7, metalness: 0.3, flatShading: true });

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.3, 8), dark);
  hub.position.y = 0.16;
  hub.castShadow = true;
  g.add(hub);

  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.9, 5), steel);
    leg.position.set(Math.cos(a) * 0.26, 0.4, Math.sin(a) * 0.26);
    leg.rotation.z = Math.cos(a) * 0.42;
    leg.rotation.x = -Math.sin(a) * 0.42;
    g.add(leg);
  }

  const mast = new THREE.Group();
  mast.position.y = 0.3;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.5, 6), steel);
  pole.position.y = 0.75;
  mast.add(pole);
  const cups = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.06, 8), steel);
  cups.position.y = 1.5;
  mast.add(cups);
  g.add(mast);

  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0x0a1a24, emissive: 0x38c8ff, emissiveIntensity: 2 })
  );
  beacon.position.y = 1.62;
  mast.add(beacon);

  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.08), dark);
  panel.position.set(0, 1.05, 0.2);
  panel.rotation.x = -0.4;
  mast.add(panel);

  g.userData.beacon = beacon;
  g.userData.mast = mast;
  return g;
}
