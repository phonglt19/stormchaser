import * as THREE from 'three';
import { Noise2D } from '../core/noise.js';
import { WORLD } from '../config.js';

// Rolling plains heightfield + asphalt road grid that conforms to the terrain.
export class Terrain {
  constructor(seed = 20240521) {
    this.noise = new Noise2D(seed);
    this.size = WORLD.size;
    this.half = this.size / 2;
    this.seg = WORLD.segments;
    this.spacing = WORLD.roadSpacing;
    this._firstRoad = -this.half + this.spacing / 2;
    this.group = new THREE.Group();
    this.group.name = 'terrain';
  }

  height(x, z) {
    const n = this.noise;
    let h = n.fbm(x * 0.00032, z * 0.00032, 4) * 42;
    h += n.perlin(x * 0.0011, z * 0.0011) * 8.5;
    h += n.perlin(x * 0.0055 + 31.2, z * 0.0055 - 11.7) * 1.6;
    return h;
  }

  normal(x, z, e = 6) {
    const hL = this.height(x - e, z);
    const hR = this.height(x + e, z);
    const hD = this.height(x, z - e);
    const hU = this.height(x, z + e);
    return new THREE.Vector3(hL - hR, 2 * e, hD - hU).normalize();
  }

  slope(x, z, e = 8) {
    return 1 - this.normal(x, z, e).y;
  }

  distanceToRoad(x, z) {
    const s = this.spacing;
    const f = this._firstRoad;
    const ax = ((((x - f) % s) + s) % s);
    const az = ((((z - f) % s) + s) % s);
    const dx = Math.min(ax, s - ax);
    const dz = Math.min(az, s - az);
    return Math.min(dx, dz);
  }

  build(renderer) {
    this._buildGround(renderer);
    this._buildRoads();
    return this.group;
  }

  _buildGround(renderer) {
    const geo = new THREE.PlaneGeometry(this.size, this.size, this.seg, this.seg);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const col = new THREE.Color();
    const n = this.noise;

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, this.height(x, z));
      pos.setX(i, x);
      pos.setZ(i, z);

      const clump = n.perlin(x * 0.018, z * 0.018) * 0.5 + 0.5;
      const field = n.fbm(x * 0.0015 + 100, z * 0.0015 - 70, 3);
      const dry = n.perlin(x * 0.0009 - 40, z * 0.0009 + 22) * 0.5 + 0.5;

      // grass -> dry pasture -> tilled farmland
      const g = 0.16 + clump * 0.1;
      col.setRGB(0.13 + clump * 0.07, 0.19 + g * 0.38, 0.095 + clump * 0.05);

      if (field > 0.22) {
        const t = Math.min(1, (field - 0.22) * 2.4) * (0.55 + dry * 0.45);
        col.lerp(new THREE.Color(0.30, 0.24, 0.13), t);
      } else if (field < -0.26) {
        const t = Math.min(1, (-field - 0.26) * 2.2);
        col.lerp(new THREE.Color(0.085, 0.105, 0.07), t);
      }

      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const tex = makeGroundTexture();
    if (renderer) tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(this.size / 26, this.size / 26);
    tex.colorSpace = THREE.SRGBColorSpace;

    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      vertexColors: true,
      roughness: 0.98,
      metalness: 0.0,
      color: 0xffffff,
    });

    const ground = new THREE.Mesh(geo, mat);
    ground.receiveShadow = true;
    ground.name = 'ground';
    this.group.add(ground);
  }

  _buildRoads() {
    const hw = WORLD.roadWidth / 2;
    const pos = [];
    const idx = [];
    const lanePos = [];
    const laneIdx = [];
    const step = 14;
    const yOff = 0.5;
    const h = (x, z) => this.height(x, z) + yOff;

    const strip = (ax, az, bx, bz) => {
      const dx = bx - ax;
      const dz = bz - az;
      const len = Math.hypot(dx, dz);
      if (len < 1) return;
      const ux = dx / len;
      const uz = dz / len;
      const px = -uz;
      const pz = ux;
      const n = Math.ceil(len / step);
      const base = pos.length / 3;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = ax + dx * t;
        const z = az + dz * t;
        for (const s of [-1, 1]) {
          const vx = x + px * hw * s;
          const vz = z + pz * hw * s;
          pos.push(vx, h(vx, vz), vz);
        }
      }
      for (let i = 0; i < n; i++) {
        const a = base + i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    };

    const dashes = (ax, az, bx, bz) => {
      const dx = bx - ax;
      const dz = bz - az;
      const len = Math.hypot(dx, dz);
      const ux = dx / len;
      const uz = dz / len;
      const px = -uz;
      const pz = ux;
      const dashLen = 3.5;
      const gap = 7.5;
      const w = 0.22;
      for (let d = 2; d < len - dashLen; d += dashLen + gap) {
        const x0 = ax + ux * d;
        const z0 = az + uz * d;
        const x1 = ax + ux * (d + dashLen);
        const z1 = az + uz * (d + dashLen);
        const base = lanePos.length / 3;
        const yh = (x, z) => this.height(x, z) + yOff + 0.05;
        const ax0 = x0 + px * w, az0 = z0 + pz * w;
        const bx0 = x0 - px * w, bz0 = z0 - pz * w;
        const ax1 = x1 + px * w, az1 = z1 + pz * w;
        const bx1 = x1 - px * w, bz1 = z1 - pz * w;
        lanePos.push(ax0, yh(ax0, az0), az0, bx0, yh(bx0, bz0), bz0, ax1, yh(ax1, az1), az1, bx1, yh(bx1, bz1), bz1);
        laneIdx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    };

    const lo = this._firstRoad;
    const hi = this.half;
    for (let x = lo; x <= hi; x += this.spacing) {
      strip(x, -this.half, x, this.half);
      dashes(x, -this.half, x, this.half);
    }
    for (let z = lo; z <= hi; z += this.spacing) {
      strip(-this.half, z, this.half, z);
      dashes(-this.half, z, this.half, z);
    }

    const roadGeo = new THREE.BufferGeometry();
    roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    roadGeo.setIndex(idx);
    roadGeo.computeVertexNormals();
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x3c4044,
      roughness: 0.92,
      metalness: 0.0,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    const roads = new THREE.Mesh(roadGeo, roadMat);
    roads.receiveShadow = true;
    roads.name = 'roads';
    this.group.add(roads);

    const laneGeo = new THREE.BufferGeometry();
    laneGeo.setAttribute('position', new THREE.Float32BufferAttribute(lanePos, 3));
    laneGeo.setIndex(laneIdx);
    laneGeo.computeVertexNormals();
    const laneMat = new THREE.MeshStandardMaterial({
      color: 0xb9a86a,
      roughness: 1,
      metalness: 0,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -6,
      polygonOffsetUnits: -6,
    });
    this.group.add(new THREE.Mesh(laneGeo, laneMat));
  }
}

// Procedural grass/stubble detail texture (tiled across the ground mesh).
function makeGroundTexture() {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(S, S);
  const n = new Noise2D(9042);

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      let g = 0.78;
      g += n.perlin(u * 22, v * 22) * 0.14;
      g += n.perlin(u * 70 + 5, v * 70 - 3) * 0.09;
      const speck = n.perlin(u * 150, v * 150);
      if (speck > 0.42) g -= 0.18;
      g = Math.max(0.35, Math.min(1, g));
      const i = (y * S + x) * 4;
      img.data[i] = g * 255;
      img.data[i + 1] = g * 255;
      img.data[i + 2] = g * 250;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.needsUpdate = true;
  return tex;
}
