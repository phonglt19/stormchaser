// Central tuning constants for KEYSOTA: Storm Chaser.

export const WORLD = {
  size: 6400,          // meters across (square)
  segments: 256,       // terrain resolution
  roadSpacing: 800,    // meters between roads in the grid
  roadWidth: 9,        // asphalt width (m)
  cloudBase: 780,      // wall-cloud / funnel-top altitude (m)
};

export const VEHICLE = {
  maxSpeed: 64,        // m/s  (~143 mph)
  boostSpeed: 80,
  reverseSpeed: 14,
  accel: 15,
  brakeForce: 30,
  engineDrag: 0.0022,  // quadratic drag coefficient
  rollResist: 0.75,
  steerRate: 2.15,     // rad/s at reference speed
  steerFalloff: 0.55,  // steering reduction at top speed
  handbrakeGrip: 0.35,
  grip: 7.5,           // lateral velocity recovery
  rideHeight: 0.95,
  integrityMax: 100,
  crashSpeed: 26,      // impact speed that starts hurting (m/s)
};

export const STORM = {
  spawnInterval: [30, 60],   // seconds between supercell spawns
  maxActive: 2,
  lifeRange: [110, 190],     // supercell lifetime (s)
  tornadoDelay: [14, 34],    // s after spawn before tornado touches down
  tornadoLife: [70, 150],
  maxVmax: 96,               // m/s (~215 mph) upper bound
  coreRadius: 55,            // meters, radius of max winds
  influenceRadius: 2200,     // wind influence falloff radius
  damageRadius: 130,         // chassis damage begins inside this radius
};

export const PROBE = {
  max: 8,
  cooldown: 0.9,
  interceptRadius: 70,   // tornado core passing this close = intercept
  measureInterval: 0.15,
};

export const SCORE = {
  probeDeploy: 25,
  probeIntercept: 750,
  footagePerSecond: 12,
  closePass: 200,
  survivalPerSecond: 1.5,
  efBonus: [0, 150, 350, 700, 1200, 2000],
};

export const CAMERA_MODES = ['CHASE', 'HOOD', 'CINEMA', 'FREE'];

export const FOG = {
  color: 0x2e363d,
  density: 0.00048,
};
