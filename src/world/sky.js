import * as THREE from 'three';
import { GLSL_NOISE } from '../core/noise.js';
import { WORLD, FOG } from '../config.js';

// Stormy sky: gradient dome + a huge animated cloud deck that swirls around the mesocyclone.
export class Sky {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'sky';
    this.fogColor = new THREE.Color(FOG.color);
    this.time = 0;
    this.flashLevel = 0;

    this._makeDome();
    this._makeCloudDeck();
  }

  _makeDome() {
    const geo = new THREE.SphereGeometry(12000, 32, 20);
    this.domeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uFlash: { value: 0 },
        uHorizon: { value: new THREE.Color(FOG.color) },
        uZenith: { value: new THREE.Color(0x1a2026) },
        uStormDir: { value: new THREE.Vector3(1, 0, 0) },
        uStormIntensity: { value: 0.0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uFlash;
        uniform vec3 uHorizon;
        uniform vec3 uZenith;
        uniform vec3 uStormDir;
        uniform float uStormIntensity;
        varying vec3 vDir;
        ${GLSL_NOISE}
        void main() {
          vec3 d = normalize(vDir);
          float h = clamp(d.y, -1.0, 1.0);
          vec3 col = mix(uHorizon, uZenith, smoothstep(-0.02, 0.55, h));
          if (h < 0.0) {
            col = mix(uHorizon, uHorizon * 0.72, smoothstep(0.0, -0.35, h));
          }
          // distant anvil mottling
          vec2 uv = d.xz / max(abs(h) + 0.16, 0.16);
          float n = fbm2(uv * 0.9 + vec2(uTime * 0.004, uTime * 0.002));
          col *= 0.86 + 0.24 * n;
          // darker toward the storm core
          float toward = dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(uStormDir.x, 0.0, uStormDir.z)));
          float core = smoothstep(-0.1, 1.0, toward) * uStormIntensity;
          col = mix(col, vec3(0.10, 0.11, 0.13), core * 0.55 * smoothstep(-0.05, 0.5, h));
          col += vec3(0.75, 0.78, 0.92) * uFlash * 0.85;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const dome = new THREE.Mesh(geo, this.domeMat);
    dome.renderOrder = -20;
    dome.frustumCulled = false;
    this.dome = dome;
    this.group.add(dome);
  }

  _makeCloudDeck() {
    const size = 40000;
    const geo = new THREE.PlaneGeometry(size, size, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.deckMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uFlash: { value: 0 },
        uStormCenter: { value: new THREE.Vector2(0, 0) },
        uStormIntensity: { value: 0.0 },
        uFogColor: { value: new THREE.Color(FOG.color) },
        uFogDensity: { value: FOG.density },
        uCamPos: { value: new THREE.Vector3() },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uFlash;
        uniform vec2 uStormCenter;
        uniform float uStormIntensity;
        uniform vec3 uFogColor;
        uniform float uFogDensity;
        uniform vec3 uCamPos;
        varying vec3 vWorld;
        ${GLSL_NOISE}
        void main() {
          vec2 p = vWorld.xz;
          vec2 rel = p - uStormCenter;
          float rr = length(rel);
          float swirl = uTime * 0.05 + 0.75 * log(1.0 + rr * 0.0012);
          float ca = cos(swirl);
          float sa = sin(swirl);
          vec2 rot = vec2(rel.x * ca - rel.y * sa, rel.x * sa + rel.y * ca);
          vec2 sp = rot * 0.0011;
          float n = fbm2(sp + vec2(uTime * 0.0035, uTime * 0.0018));
          float n2 = fbm2(sp * 3.2 - vec2(uTime * 0.02, uTime * 0.008));
          float cover = smoothstep(0.30, 0.72, n * 0.78 + n2 * 0.42);

          float core = 1.0 - smoothstep(250.0, 2600.0, rr);
          cover = clamp(cover + core * (0.30 + uStormIntensity * 0.5), 0.0, 1.0);

          vec3 dark = vec3(0.135, 0.148, 0.17);
          vec3 light = vec3(0.52, 0.54, 0.58);
          vec3 col = mix(light, dark, clamp(core * uStormIntensity * 0.72 + n2 * 0.5, 0.0, 1.0));
          col *= 0.78 + 0.5 * n;

          float dist = length(vWorld - uCamPos);
          float edge = 1.0 - smoothstep(7000.0, 15000.0, dist);
          col = applyFog(col, dist, uFogColor, uFogDensity);

          col += vec3(0.8, 0.82, 1.0) * uFlash * (0.45 + 0.55 * n);
          gl_FragColor = vec4(col, cover * edge * 0.97);
        }
      `,
    });
    const deck = new THREE.Mesh(geo, this.deckMat);
    deck.renderOrder = -15;
    deck.frustumCulled = false;
    this.deck = deck;
    this.group.add(deck);
  }

  update(dt, camera, storm) {
    this.time += dt;
    this.flashLevel = Math.max(0, this.flashLevel - dt * 6.5);

    const center = storm ? storm.center : { x: 0, z: 0 };
    const intensity = storm ? storm.intensity : 0;

    this.dome.position.copy(camera.position);
    this.deck.position.set(camera.position.x, WORLD.cloudBase, camera.position.z);
    this.deckMat.uniforms.uCamPos.value.copy(camera.position);

    const dir = storm ? storm.driftDir : { x: 1, z: 0 };
    const u = this.domeMat.uniforms;
    u.uTime.value = this.time;
    u.uFlash.value = this.flashLevel;
    u.uStormDir.value.set(dir.x, 0, dir.z).normalize();
    u.uStormIntensity.value = intensity;

    const d = this.deckMat.uniforms;
    d.uTime.value = this.time;
    d.uFlash.value = this.flashLevel;
    d.uStormCenter.value.set(center.x, center.z);
    d.uStormIntensity.value = intensity;
  }

  flash(intensity = 1) {
    this.flashLevel = Math.min(1.4, this.flashLevel + intensity);
  }
}
