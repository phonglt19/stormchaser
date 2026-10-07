import { clamp, TAU } from '../core/math.js';

// North-up doppler sweep showing storm cores, the tornado hook, probes and the chase vehicle.
export class Radar {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.size = 240;
    this.range = 3600;
    this.sweep = 0;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = this.size * this.dpr;
    canvas.height = this.size * this.dpr;
    this.ctx.scale(this.dpr, this.dpr);
  }

  setRange(meters) {
    this.range = meters;
  }

  update(dt, vehicle, storms, probes, hudRangeLabel) {
    const ctx = this.ctx;
    const S = this.size;
    const c = S / 2;
    const R = c - 6;
    this.sweep = (this.sweep + dt * 1.6) % TAU;
    const px = vehicle.pos.x;
    const pz = vehicle.pos.z;
    const toX = (wx) => c + clamp((wx - px) / this.range, -1.4, 1.4) * R;
    const toY = (wz) => c + clamp((wz - pz) / this.range, -1.4, 1.4) * R;

    ctx.clearRect(0, 0, S, S);

    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, R, 0, TAU);
    ctx.clip();

    ctx.fillStyle = '#050a08';
    ctx.fillRect(0, 0, S, S);

    // range rings
    ctx.strokeStyle = 'rgba(120,255,170,0.14)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(c, c, (R * i) / 3, 0, TAU);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(c, c - R);
    ctx.lineTo(c, c + R);
    ctx.moveTo(c - R, c);
    ctx.lineTo(c + R, c);
    ctx.stroke();

    // storm reflectivity
    for (const s of storms.storms) {
      const sx = toX(s.center.x);
      const sy = toY(s.center.z);
      const rr = (820 / this.range) * R;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, rr);
      const a = 0.28 + 0.3 * s.intensity;
      g.addColorStop(0, `rgba(255,120,40,${a})`);
      g.addColorStop(0.45, `rgba(180,110,50,${a * 0.45})`);
      g.addColorStop(1, 'rgba(120,140,90,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx, sy, rr, 0, TAU);
      ctx.fill();

      if (s.tornado.active) {
        const tx = toX(s.tornado.x);
        const ty = toY(s.tornado.z);
        const pulse = 0.6 + 0.4 * Math.sin(performance.now() * 0.006);
        ctx.fillStyle = `rgba(255,40,40,${0.75 * pulse + 0.2})`;
        ctx.beginPath();
        ctx.arc(tx, ty, 5.5, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = `rgba(255,80,80,${0.5 * pulse})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(tx, ty, 9 + pulse * 3, 0, TAU);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(tx, ty, 14 + pulse * 5, 0, TAU);
        ctx.stroke();
        // hook echo trail
        ctx.strokeStyle = 'rgba(255,60,60,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(tx, ty, rr * 0.34, Math.PI * 0.6, Math.PI * 1.5);
        ctx.stroke();
      }
    }

    // probes
    for (const p of probes.probes) {
      const x = toX(p.x);
      const y = toY(p.z);
      ctx.fillStyle = p.intercepted ? '#7dff9b' : '#63e6ff';
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = p.intercepted ? 'rgba(125,255,155,0.5)' : 'rgba(99,230,255,0.4)';
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, TAU);
      ctx.stroke();
    }

    // sweep wedge
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(this.sweep);
    const sweepGrad = ctx.createLinearGradient(0, 0, R, 0);
    sweepGrad.addColorStop(0, 'rgba(120,255,170,0.20)');
    sweepGrad.addColorStop(1, 'rgba(120,255,170,0)');
    ctx.fillStyle = sweepGrad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, R, -0.42, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.restore();

    // rim + cardinals
    ctx.strokeStyle = 'rgba(120,255,170,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(c, c, R, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = 'rgba(160,255,200,0.75)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('N', c, 12);
    ctx.fillText('S', c, S - 6);

    // vehicle arrow (heading-up)
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(vehicle.heading);
    ctx.fillStyle = '#c9ffd8';
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, 4.5);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-5, -4.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    if (hudRangeLabel) hudRangeLabel.textContent = `${(this.range / 1000).toFixed(1)} km`;
  }
}
