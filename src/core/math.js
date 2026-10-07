export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
export const smoothstep = (a, b, v) => {
  const t = invLerp(a, b, v);
  return t * t * (3 - 2 * t);
};

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

// Frame-rate independent exponential smoothing.
export function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

export function dampAngle(current, target, lambda, dt) {
  const delta = wrapAngle(target - current);
  return current + delta * (1 - Math.exp(-lambda * dt));
}

// Meters/second -> miles/hour
export const msToMph = (v) => v * 2.23694;
export const msToKmh = (v) => v * 3.6;
export const mToMiles = (m) => m / 1609.34;
export const mToKm = (m) => m / 1000;

export function bearingLabel(dx, dz) {
  // Compass bearing where -Z is north (screen forward).
  const deg = (Math.atan2(dx, -dz) * RAD + 360) % 360;
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return { deg, label: dirs[Math.round(deg / 22.5) % 16] };
}

export function efScale(vmax) {
  // Approximate Enhanced Fujita scale from max 3-second gust (m/s).
  if (vmax < 29) return -1;
  if (vmax < 38) return 0;
  if (vmax < 49) return 1;
  if (vmax < 60) return 2;
  if (vmax < 74) return 3;
  if (vmax < 89) return 4;
  return 5;
}

export function formatClock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
