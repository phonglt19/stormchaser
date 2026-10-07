import * as THREE from 'three';
import { WORLD } from '../config.js';

// Camera-anchored rain built from line segments so drops read as streaks.
export class Rain {
  constructor(seedRng = Math.random) {
    this.count = 6000;
    this.boxR = 130;
    this.boxH = 190;
    this.dropLen = 2.6;
    this.time = 0;
    this.intensity = 0;

    const rng = seedRng;
    const pos = new Float32Array(this.count * 2 * 3);
    const tail = new Float32Array(this.count * 2);
    const speed = new Float32Array(this.count * 2);
    const phase = new Float32Array(this.count * 2);

    for (let i = 0; i < this.count; i++) {
      const x = (rng() * 2 - 1) * this.boxR;
      const y = rng() * this.boxH;
      const z = (rng() * 2 - 1) * this.boxR;
      const sp = 55 + rng() * 45;
      const ph = rng();
      for (let k = 0; k < 2; k++) {
        const idx = i * 2 + k;
        pos[idx * 3] = x;
        pos[idx * 3 + 1] = y;
        pos[idx * 3 + 2] = z;
        tail[idx] = k;
        speed[idx] = sp;
        phase[idx] = ph;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aTail', new THREE.BufferAttribute(tail, 1));
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uOrigin: { value: new THREE.Vector3() },
        uRelWind: { value: new THREE.Vector2() },
        uBoxR: { value: this.boxR },
        uBoxH: { value: this.boxH },
        uLen: { value: this.dropLen },
        uOpacity: { value: 0.0 },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uOrigin;
        uniform vec2 uRelWind;
        uniform float uBoxR;
        uniform float uBoxH;
        uniform float uLen;
        attribute float aTail;
        attribute float aSpeed;
        attribute float aPhase;
        varying float vFade;
        void main() {
          vec3 p = position;
          float fall = fract(p.y / uBoxH - uTime * aSpeed / uBoxH + aPhase);
          float y = fall * uBoxH;
          float remain = uBoxH - y;
          vec2 slant = uRelWind * (remain * 0.02);
          vec2 base = p.xz + slant;
          vec2 size = vec2(uBoxR * 2.0);
          vec2 rel = mod(base - uOrigin.xz + uBoxR, size) - uBoxR;
          vec3 wp = vec3(uOrigin.x + rel.x, uOrigin.y + y - uBoxH * 0.30, uOrigin.z + rel.y);
          vec3 dir = normalize(vec3(-uRelWind.x * 0.02, -1.0, -uRelWind.y * 0.02));
          wp += dir * (aTail * uLen);
          vec4 mv = viewMatrix * vec4(wp, 1.0);
          float dist = length(mv.xyz);
          vFade = (1.0 - clamp(dist / (uBoxR * 1.35), 0.0, 1.0)) * smoothstep(1.2, 7.0, dist);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;
        varying float vFade;
        void main() {
          gl_FragColor = vec4(vec3(0.72, 0.79, 0.86), vFade * uOpacity);
        }
      `,
    });

    this.mesh = new THREE.LineSegments(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
  }

  update(dt, camera, relWind, intensity) {
    this.time += dt;
    this.intensity = intensity;
    this.mat.uniforms.uTime.value = this.time;
    this.mat.uniforms.uOrigin.value.copy(camera.position);
    this.mat.uniforms.uRelWind.value.set(relWind.x, relWind.z);
    this.mat.uniforms.uOpacity.value = 0.5 * Math.min(1, intensity);
  }
}

// Forked cloud-to-ground lightning with a brief scene flash.
export class Lightning {
  constructor(terrain) {
    this.terrain = terrain;
    this.segments = 18;
    const pos = new Float32Array(this.segments * 2 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.positions = pos;
    this.mat = new THREE.LineBasicMaterial({ color: 0xe8f0ff, transparent: true, opacity: 0 });
    this.mesh = new THREE.LineSegments(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    this.mesh.visible = false;

    this.light = new THREE.PointLight(0xcfe0ff, 0, 6000, 1.4);
    this.light.visible = false;

    this.ttl = 0;
    this.duration = 0.22;
    this.boost = 0;
    this.onStrike = null;
  }

  strike(x, z, onFlash) {
    const groundY = this.terrain.height(x, z);
    const top = WORLD.cloudBase;
    let cx = x;
    let cz = z;
    for (let i = 0; i < this.segments; i++) {
      const u0 = i / this.segments;
      const u1 = (i + 1) / this.segments;
      const jitter = 34 * (1 - u0);
      const x0 = x + (Math.random() - 0.5) * jitter;
      const z0 = z + (Math.random() - 0.5) * jitter;
      const x1 = x + (Math.random() - 0.5) * jitter;
      const z1 = z + (Math.random() - 0.5) * jitter;
      const y0 = top + (groundY - top) * u0;
      const y1 = top + (groundY - top) * u1;
      const a = i * 6;
      this.positions[a] = x0;
      this.positions[a + 1] = y0;
      this.positions[a + 2] = z0;
      this.positions[a + 3] = x1;
      this.positions[a + 4] = y1;
      this.positions[a + 5] = z1;
      cx = x1;
      cz = z1;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.visible = true;
    this.light.position.set(cx, groundY + 60, cz);
    this.light.visible = true;
    this.light.intensity = 45000;
    this.ttl = this.duration;
    this.boost = 1;
    if (onFlash) onFlash();
  }

  update(dt) {
    this.boost = 0;
    if (this.ttl > 0) {
      this.ttl -= dt;
      const k = Math.max(0, this.ttl / this.duration);
      // flicker
      const f = k > 0.5 ? 1 : k * 2;
      this.mat.opacity = f;
      this.light.intensity = 45000 * f;
      this.boost = f;
      if (this.ttl <= 0) {
        this.mesh.visible = false;
        this.light.visible = false;
        this.mat.opacity = 0;
        this.light.intensity = 0;
      }
    }
  }
}
