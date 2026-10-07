import * as THREE from 'three';
import { GLSL_NOISE } from '../core/noise.js';
import { WORLD, STORM, FOG } from '../config.js';
import { clamp, lerp, TAU } from '../core/math.js';

const BASE_RADIUS = 1.0; // multiplied by coreRadius

// Normalized funnel silhouette: near-constant column that flares into the wall cloud.
function funnelProfile(y01) {
  const bulge = 1.0 + 0.35 * Math.sin(Math.min(1, y01 / 0.75) * Math.PI);
  const flare = Math.pow(Math.max(0, y01 - 0.35) / 0.65, 2.6) * 2.6;
  return bulge + flare;
}

function buildFunnelGeometry(height, rings, radialSeg) {
  const positions = [];
  const y01s = [];
  const indices = [];
  for (let i = 0; i <= rings; i++) {
    const y01 = i / rings;
    const y = y01 * height;
    const R = funnelProfile(y01);
    for (let j = 0; j <= radialSeg; j++) {
      const a = (j / radialSeg) * TAU;
      positions.push(Math.cos(a) * R, y, Math.sin(a) * R);
      y01s.push(y01);
    }
  }
  const stride = radialSeg + 1;
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < radialSeg; j++) {
      const a = i * stride + j;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('aY01', new THREE.Float32BufferAttribute(y01s, 1));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export class Tornado {
  constructor(terrain, rng, opts = {}) {
    this.terrain = terrain;
    this.rng = rng;
    this.x = opts.x || 0;
    this.z = opts.z || 0;
    this.heading = opts.heading !== undefined ? opts.heading : 0;
    this.speed = opts.speed || 15;
    this.life = opts.life || 110;
    this.delay = opts.delay || 20;
    this.peakVmax = opts.peakVmax || 62;

    this.age = 0;
    this.time = 0;
    this.phase = 'waiting'; // waiting -> genesis -> mature -> rope -> gone
    this.vmax = 0;
    this.coreRadius = STORM.coreRadius;
    this.active = false;
    this.group = new THREE.Group();
    this.group.name = 'tornado';
    this._wobbleT = this.rng.range(0, 100);
    this._build();
    this.setVisible(false);
  }

  get intensity01() {
    return clamp(this.vmax / STORM.maxVmax, 0, 1);
  }

  get position() {
    return { x: this.x, z: this.z };
  }

  distanceTo(x, z) {
    return Math.hypot(x - this.x, z - this.z);
  }

  // ---------------------------------------------------------------
  _build() {
    const height = WORLD.cloudBase;

    const funnelUniforms = () => ({
      uTime: { value: 0 },
      uChaos: { value: 0.2 },
      uLean: { value: new THREE.Vector2(0, 0) },
      uOpacity: { value: 0.9 },
      uRadiusScale: { value: 1 },
      uDark: { value: new THREE.Color(0x1a1b1e) },
      uLight: { value: new THREE.Color(0x5d5854) },
      uFogColor: { value: new THREE.Color(FOG.color) },
      uFogDensity: { value: FOG.density },
      uFlash: { value: 0 },
    });

    const funnelVert = /* glsl */ `
      uniform float uTime;
      uniform float uChaos;
      uniform vec2 uLean;
      uniform float uRadiusScale;
      attribute float aY01;
      varying float vY;
      varying float vChurn;
      varying vec3 vViewPos;
      ${GLSL_NOISE}
      void main() {
        vec3 p = position;
        float ang = atan(p.z, p.x);
        float spin = uTime * (1.15 + 1.5 * (1.0 - aY01));
        float ang2 = ang + spin;
        vec2 c = vec2(cos(ang2), sin(ang2));
        float n = fbm2(c * 1.7 + vec2(0.0, aY01 * 4.0 - uTime * 0.75));
        float n2 = fbm2(c * 3.6 + vec2(11.0, aY01 * 9.0 - uTime * 1.45));
        float churn = (n - 0.5) * 0.72 + (n2 - 0.5) * 0.42;

        float r = length(p.xz) * uRadiusScale * (1.0 + churn * uChaos);
        float y = p.y * (0.94 + 0.06 * sin(uTime * 0.6));
        vec3 np = vec3(cos(ang) * r, y, sin(ang) * r);
        np.xz += uLean * (aY01 * aY01);

        vY = aY01;
        vChurn = churn;
        vec4 wp = modelMatrix * vec4(np, 1.0);
        vec4 mv = viewMatrix * wp;
        vViewPos = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `;

    const funnelFrag = /* glsl */ `
      uniform float uOpacity;
      uniform vec3 uDark;
      uniform vec3 uLight;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      uniform float uFlash;
      varying float vY;
      varying float vChurn;
      varying vec3 vViewPos;
      ${GLSL_NOISE}
      void main() {
        float a = uOpacity * (0.26 + 0.92 * (1.0 - smoothstep(0.10, 0.98, vY)));
        a *= 0.80 + 0.55 * vChurn;
        a *= smoothstep(0.0, 0.06, vY);
        vec3 col = mix(uLight, uDark, clamp(smoothstep(-0.45, 0.45, vChurn) * 0.85 + vY * 0.35, 0.0, 1.0));
        col += vec3(0.72, 0.76, 0.95) * uFlash * 0.55;
        col = applyFog(col, length(vViewPos), uFogColor, uFogDensity);
        gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
      }
    `;

    const commonFunnelMat = () =>
      new THREE.ShaderMaterial({
        uniforms: funnelUniforms(),
        vertexShader: funnelVert,
        fragmentShader: funnelFrag,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });

    // outer sheath + inner core (slightly narrower, counter-rotating feel)
    this.outerMat = commonFunnelMat();
    const outerGeo = buildFunnelGeometry(height, 30, 56);
    this.outer = new THREE.Mesh(outerGeo, this.outerMat);

    this.innerMat = commonFunnelMat();
    this.innerMat.uniforms.uDark.value = new THREE.Color(0x101113);
    this.innerMat.uniforms.uLight.value = new THREE.Color(0x3a3736);
    const innerGeo = buildFunnelGeometry(height, 24, 40);
    this.inner = new THREE.Mesh(innerGeo, this.innerMat);

    // condensation / debris cloud hugging the funnel
    this.cloudMat = commonFunnelMat();
    this.cloudMat.uniforms.uDark.value = new THREE.Color(0x2b2724);
    this.cloudMat.uniforms.uLight.value = new THREE.Color(0x6a635c);
    this.cloudMat.uniforms.uOpacity.value = 0.45;
    this.cloudMat.uniforms.uChaos.value = 0.55;
    this.cloudMat.uniforms.uRadiusScale.value = 1.35;
    const cloudGeo = buildFunnelGeometry(height * 0.85, 20, 36);
    this.cloud = new THREE.Mesh(cloudGeo, this.cloudMat);

    this.group.add(this.outer, this.inner, this.cloud);

    // ---- base dust ring ----
    const ringGeo = new THREE.CircleGeometry(1, 48);
    ringGeo.rotateX(-Math.PI / 2);
    this.ringMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uFlash: { value: 0 },
        uOpacity: { value: 0.7 },
        uFogColor: { value: new THREE.Color(FOG.color) },
        uFogDensity: { value: FOG.density },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vViewPos;
        void main() {
          vUv = uv;
          vec4 mv = viewMatrix * modelMatrix * vec4(position, 1.0);
          vViewPos = mv.xyz;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uOpacity;
        uniform float uFlash;
        uniform vec3 uFogColor;
        uniform float uFogDensity;
        varying vec2 vUv;
        varying vec3 vViewPos;
        ${GLSL_NOISE}
        void main() {
          vec2 p = vUv - 0.5;
          float r = length(p) * 2.0;
          float ang = atan(p.y, p.x);
          vec2 c = vec2(cos(ang + uTime * 1.3), sin(ang + uTime * 1.3));
          float n = fbm2(c * 1.9 + vec2(0.0, r * 2.4 - uTime * 0.6));
          float a = (1.0 - smoothstep(0.0, 0.95, r)) * (0.10 + 0.90 * smoothstep(0.22, 0.78, n));
          vec3 col = mix(vec3(0.20, 0.17, 0.14), vec3(0.085, 0.078, 0.072), n);
          col += vec3(0.7, 0.72, 0.9) * uFlash * 0.4;
          col = applyFog(col, length(vViewPos), uFogColor, uFogDensity);
          gl_FragColor = vec4(col, clamp(a * uOpacity, 0.0, 1.0));
        }
      `,
    });
    this.ring = new THREE.Mesh(ringGeo, this.ringMat);
    this.group.add(this.ring);

    // ---- orbiting debris particles ----
    const COUNT = 1500;
    const pos = new Float32Array(COUNT * 3);
    const radius = new Float32Array(COUNT);
    const angle = new Float32Array(COUNT);
    const topY = new Float32Array(COUNT);
    const spin = new Float32Array(COUNT);
    const phase = new Float32Array(COUNT);
    const size = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      radius[i] = this.rng.range(0.25, 3.3);
      angle[i] = this.rng.range(0, TAU);
      topY[i] = this.rng.range(20, 260);
      spin[i] = this.rng.range(2.2, 5.4);
      phase[i] = this.rng.range(0, 1);
      size[i] = this.rng.range(1.2, 4.4);
    }
    const debrisGeo = new THREE.BufferGeometry();
    debrisGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    debrisGeo.setAttribute('aRadius', new THREE.BufferAttribute(radius, 1));
    debrisGeo.setAttribute('aAngle', new THREE.BufferAttribute(angle, 1));
    debrisGeo.setAttribute('aTopY', new THREE.BufferAttribute(topY, 1));
    debrisGeo.setAttribute('aSpin', new THREE.BufferAttribute(spin, 1));
    debrisGeo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    debrisGeo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    debrisGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 200, 0), 600);

    this.debrisMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uTime: { value: 0 },
        uRadius: { value: 55 },
        uFlash: { value: 0 },
        uOpacity: { value: 0.85 },
        uFogColor: { value: new THREE.Color(FOG.color) },
        uFogDensity: { value: FOG.density },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uRadius;
        attribute float aRadius;
        attribute float aAngle;
        attribute float aTopY;
        attribute float aSpin;
        attribute float aPhase;
        attribute float aSize;
        varying float vRise;
        varying vec3 vViewPos;
        void main() {
          float rise = fract(uTime * 0.055 + aPhase);
          float ang = aAngle + uTime * aSpin * (1.0 - 0.5 * rise);
          float r = aRadius * uRadius * (1.0 - 0.5 * rise) * (1.0 + 0.07 * sin(uTime * 3.0 + aPhase * 12.0));
          float y = rise * aTopY + 3.0;
          vec3 p = vec3(cos(ang) * r, y, sin(ang) * r);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vViewPos = mv.xyz;
          vRise = rise;
          gl_PointSize = clamp(aSize * (420.0 / max(-mv.z, 1.0)), 1.0, 60.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;
        uniform float uFlash;
        uniform vec3 uFogColor;
        uniform float uFogDensity;
        varying float vRise;
        varying vec3 vViewPos;
        ${GLSL_NOISE}
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float m = 1.0 - smoothstep(0.18, 0.5, length(d));
          float a = m * uOpacity * (1.0 - smoothstep(0.55, 1.0, vRise)) * smoothstep(0.0, 0.06, vRise);
          float n = vnoise(gl_PointCoord * 6.0 + vRise * 20.0);
          vec3 col = mix(vec3(0.14, 0.12, 0.10), vec3(0.30, 0.26, 0.21), n);
          col += vec3(0.7, 0.72, 0.9) * uFlash * 0.4;
          col = applyFog(col, length(vViewPos), uFogColor, uFogDensity);
          gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
        }
      `,
    });
    this.debris = new THREE.Points(debrisGeo, this.debrisMat);
    this.debris.frustumCulled = false;
    this.group.add(this.debris);

    // ---- mesocyclone collar: the lowered, rotating cloud base above the funnel ----
    const collarGeo = new THREE.CircleGeometry(1250, 56);
    collarGeo.rotateX(-Math.PI / 2);
    this.collarMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0.95 },
        uFogColor: { value: new THREE.Color(FOG.color) },
        uFogDensity: { value: FOG.density },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vViewPos;
        void main() {
          vUv = uv;
          vec4 mv = viewMatrix * modelMatrix * vec4(position, 1.0);
          vViewPos = mv.xyz;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uOpacity;
        uniform vec3 uFogColor;
        uniform float uFogDensity;
        varying vec2 vUv;
        varying vec3 vViewPos;
        ${GLSL_NOISE}
        void main() {
          vec2 p = vUv - 0.5;
          float r = length(p) * 2.0;
          float ang = atan(p.y, p.x);
          vec2 c = vec2(cos(ang + uTime * 0.5), sin(ang + uTime * 0.5));
          float n = fbm2(c * 1.5 + vec2(r * 1.6, uTime * 0.05));
          float n2 = fbm2(c * 3.2 + vec2(r * 3.0, uTime * 0.03));
          float a = (1.0 - smoothstep(0.06, 1.0, r)) * (0.42 + 0.62 * n + 0.2 * n2);
          vec3 col = mix(vec3(0.075, 0.082, 0.095), vec3(0.20, 0.21, 0.24), n);
          col = applyFog(col, length(vViewPos), uFogColor, uFogDensity);
          gl_FragColor = vec4(col, clamp(a * uOpacity, 0.0, 1.0));
        }
      `,
    });
    this.collar = new THREE.Mesh(collarGeo, this.collarMat);
    this.collar.position.y = WORLD.cloudBase + 6;
    this.group.add(this.collar);
  }

  setVisible(v) {
    this.group.visible = v;
  }

  // ---------------------------------------------------------------
  update(dt) {
    this.time += dt;
    if (this.phase === 'gone') {
      this.setVisible(false);
      this.active = false;
      return;
    }

    this.age += dt;
    const t = this.age - this.delay;

    if (t < 0) {
      this.phase = 'waiting';
      this.vmax = 0;
      this.active = false;
      this.setVisible(false);
      return;
    }

    this.active = true;
    this.setVisible(true);

    const life = this.life;
    // piecewise intensity envelope: genesis -> mature -> rope-out
    let env;
    if (t < 22) {
      this.phase = 'genesis';
      env = clamp(t / 22, 0, 1);
      env = env * env * (3 - 2 * env);
    } else if (t < life - 30) {
      this.phase = 'mature';
      env = 1;
    } else if (t < life) {
      this.phase = 'rope';
      env = clamp((life - t) / 30, 0, 1);
    } else {
      this.phase = 'gone';
      env = 0;
    }

    const pulse = 0.82 + 0.18 * Math.sin(this.time * 0.9 + this._wobbleT);
    this.vmax = this.peakVmax * env * pulse;

    // radius: slim during genesis, wide wedge at maturity, ropes out at the end
    const wedge = this.phase === 'rope' ? 0.35 : lerp(0.75, 1.35, clamp((t - 6) / 30, 0, 1));
    this.coreRadius = STORM.coreRadius * wedge * (0.85 + 0.3 * env);

    // movement: drifts with its own heading plus lateral wobble
    this.heading += Math.sin(this.time * 0.11 + this._wobbleT) * 0.09 * dt;
    const spd = this.speed * (this.phase === 'rope' ? 0.75 : 1);
    this.x += Math.cos(this.heading) * spd * dt;
    this.z += Math.sin(this.heading) * spd * dt;

    this._syncUniforms();
    this._layout();
  }

  _syncUniforms() {
    const inten = this.intensity01;
    const mats = [this.outerMat, this.innerMat, this.cloudMat];
    mats.forEach((m, i) => {
      m.uniforms.uTime.value = this.time + i * 3.1;
      m.uniforms.uChaos.value = (i === 2 ? 0.55 : 0.30) * (0.5 + inten) * (this.phase === 'rope' ? 1.5 : 1);
    });
    this.outerMat.uniforms.uOpacity.value = 0.92 * (0.45 + 0.55 * inten);
    this.innerMat.uniforms.uOpacity.value = 0.95 * (0.4 + 0.6 * inten);
    this.ringMat.uniforms.uTime.value = this.time;
    this.ringMat.uniforms.uOpacity.value = 0.28 + 0.30 * inten;
    this.debrisMat.uniforms.uTime.value = this.time;
    this.debrisMat.uniforms.uRadius.value = this.coreRadius;
    this.debrisMat.uniforms.uOpacity.value = 0.35 + 0.6 * inten;
    this.collarMat.uniforms.uTime.value = this.time;
  }

  _layout() {
    const groundY = this.terrain.height(this.x, this.z);
    const scale = this.coreRadius;
    this.group.position.set(this.x, groundY - 1.5, this.z);
    this.outer.scale.set(scale, 1, scale);
    this.inner.scale.set(scale * 0.62, 1, scale * 0.62);
    this.cloud.scale.set(scale, 1, scale);
    this.ring.scale.set(scale * 4.2, 1, scale * 4.2);
    this.ring.position.y = 1.6;
    this.debris.position.y = 0;
    // lean the column with the shear (local units; the mesh scale is applied by the model matrix)
    const lean = 1.4 + 1.2 * this.intensity01;
    this.outerMat.uniforms.uLean.value.set(lean, -lean * 0.62);
    this.innerMat.uniforms.uLean.value.set(lean, -lean * 0.62);
    this.cloudMat.uniforms.uLean.value.set(lean, -lean * 0.62);
    this.collar.position.y = WORLD.cloudBase + 6 - (groundY - 1.5);
  }

  flashValue(v) {
    this.outerMat.uniforms.uFlash.value = v;
    this.innerMat.uniforms.uFlash.value = v;
    this.cloudMat.uniforms.uFlash.value = v;
    this.ringMat.uniforms.uFlash.value = v;
    this.debrisMat.uniforms.uFlash.value = v;
  }

  // Rankine-combined vortex: tangential + radial inflow.
  windAt(x, z) {
    if (!this.active || this.vmax <= 0) return { x: 0, z: 0 };
    const rx = x - this.x;
    const rz = z - this.z;
    const r = Math.max(Math.hypot(rx, rz), 1);
    const rc = Math.max(this.coreRadius, 5);
    const vt = r < rc ? this.vmax * (r / rc) : this.vmax * (rc / r);
    const vr = -this.vmax * 0.42 * Math.exp(-r / (rc * 3.2));
    // tangential direction is perpendicular to the radius (cyclonic)
    const tx = rz / r;
    const tz = -rx / r;
    const ux = rx / r;
    const uz = rz / r;
    return {
      x: tx * vt + ux * vr,
      z: tz * vt + uz * vr,
    };
  }

  speedAt(x, z) {
    const w = this.windAt(x, z);
    return Math.hypot(w.x, w.z);
  }
}

export { funnelProfile, buildFunnelGeometry };
