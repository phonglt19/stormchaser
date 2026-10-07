import { mulberry32 } from './rng.js';

// Classic Perlin noise in 2D with a seeded permutation table, plus fbm helpers.
export class Noise2D {
  constructor(seed = 1337) {
    const rnd = mulberry32(seed);
    const perm = new Uint8Array(256);
    for (let i = 0; i < 256; i++) perm[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = perm[i];
      perm[i] = perm[j];
      perm[j] = t;
    }
    this.p = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.p[i] = perm[i & 255];
  }

  perlin(x, y) {
    const p = this.p;
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);

    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);

    const aa = p[p[X] + Y];
    const ab = p[p[X] + Y + 1];
    const ba = p[p[X + 1] + Y];
    const bb = p[p[X + 1] + Y + 1];

    const g = (h, dx, dy) => {
      switch (h & 7) {
        case 0: return dx + dy;
        case 1: return -dx + dy;
        case 2: return dx - dy;
        case 3: return -dx - dy;
        case 4: return dx;
        case 5: return -dx;
        case 6: return dy;
        default: return -dy;
      }
    };

    const x1 = g(aa, xf, yf);
    const x2 = g(ba, xf - 1, yf);
    const x3 = g(ab, xf, yf - 1);
    const x4 = g(bb, xf - 1, yf - 1);

    const lerp = (a, b, t) => a + (b - a) * t;
    return lerp(lerp(x1, x2, u), lerp(x3, x4, u), v);
  }

  fbm(x, y, octaves = 4, lacunarity = 2.02, gain = 0.5) {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let fx = x;
    let fy = y;
    for (let i = 0; i < octaves; i++) {
      sum += this.perlin(fx, fy) * amp;
      norm += amp;
      amp *= gain;
      fx *= lacunarity;
      fy *= lacunarity;
    }
    return sum / norm;
  }

  ridged(x, y, octaves = 4, lacunarity = 2.05, gain = 0.5) {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let fx = x;
    let fy = y;
    for (let i = 0; i < octaves; i++) {
      const n = 1 - Math.abs(this.perlin(fx, fy));
      sum += n * n * amp;
      norm += amp;
      amp *= gain;
      fx *= lacunarity;
      fy *= lacunarity;
    }
    return sum / norm;
  }
}

// Shared GLSL noise + manual exponential fog, injected into custom shaders.
export const GLSL_NOISE = /* glsl */ `
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float fbm2(vec2 p) {
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      s += a * vnoise(p);
      p = p * 2.03 + 17.3;
      a *= 0.5;
    }
    return s;
  }
  vec3 applyFog(vec3 color, float dist, vec3 fogColor, float fogDensity) {
    float f = 1.0 - exp(-fogDensity * fogDensity * dist * dist);
    return mix(color, fogColor, clamp(f, 0.0, 1.0));
  }
`;
