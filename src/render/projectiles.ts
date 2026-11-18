import type { ProjectileDef, ProjectileLook } from '../game/types';

/**
 * Projectile sprites, drawn in code. Each look is sized from the projectile's `radius` and drawn at the
 * origin pointing along +x (callers rotate to the flight direction or a tumble angle).
 */

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

/** The look to use: the definition's own, or one that fits what the projectile does. */
export function lookOf(d: ProjectileDef): ProjectileLook {
  if (d.look) return d.look;
  if (d.burrow) return 'drill';
  if (d.crawl) return 'crawler';
  if (d.homing) return 'missile';
  if (d.trail === 'dirt') return 'clod';
  if (d.onImpact.some((a) => a.type === 'napalm')) return 'canister';
  if (d.fuse !== undefined || (d.bounces && !d.roll)) return 'grenade';
  if (d.roll) return 'ball';
  if (d.trail === 'plasma' || d.phase) return 'orb';
  if ((d.radius ?? 3.5) <= 2.8) return 'pellet';
  if ((d.radius ?? 3.5) >= 6) return 'bomb';
  return 'shell';
}

/** Whether the sprite points along its flight path (true) or tumbles/spins (false). */
export function pointsForward(look: ProjectileLook) {
  return look === 'shell' || look === 'missile' || look === 'drill' || look === 'pellet';
}

function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1, 7), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

function metal(c: Ctx, w: number, light: string, mid: string, dark: string) {
  const g = c.createLinearGradient(0, -w, 0, w);
  g.addColorStop(0, light);
  g.addColorStop(0.4, mid);
  g.addColorStop(1, dark);
  return g;
}

export function drawLook(c: Ctx, look: ProjectileLook, d: ProjectileDef, r: number, time: number) {
  const col = d.color.startsWith('#') ? d.color : '#cccccc';
  const glow = d.glow ?? d.color;
  switch (look) {
    case 'shell': {
      const L = r * 3.2,
        w = r * 1.05;
      c.fillStyle = metal(c, w, '#ffffff', col, shade(col, 0.45));
      c.beginPath();
      c.moveTo(-L / 2, -w);
      c.lineTo(L * 0.1, -w);
      c.quadraticCurveTo(L / 2, -w, L / 2, 0);
      c.quadraticCurveTo(L / 2, w, L * 0.1, w);
      c.lineTo(-L / 2, w);
      c.closePath();
      c.fill();
      c.fillStyle = '#b8862e';
      c.fillRect(-L * 0.22, -w, L * 0.12, w * 2);
      c.fillStyle = '#2b2f35';
      c.fillRect(-L / 2, -w, L * 0.1, w * 2);
      return;
    }
    case 'missile': {
      const L = r * 4,
        w = r * 0.8;
      // exhaust
      const fl = L * (0.5 + 0.2 * Math.sin(time * 40));
      const fg = c.createLinearGradient(-L / 2, 0, -L / 2 - fl, 0);
      fg.addColorStop(0, '#fff6c0');
      fg.addColorStop(0.4, glow);
      fg.addColorStop(1, 'rgba(255,60,0,0)');
      c.fillStyle = fg;
      c.beginPath();
      c.moveTo(-L / 2, -w * 0.7);
      c.lineTo(-L / 2 - fl, 0);
      c.lineTo(-L / 2, w * 0.7);
      c.fill();
      c.fillStyle = metal(c, w, '#ffffff', '#c9ced4', '#4a5058');
      c.beginPath();
      c.moveTo(-L / 2, -w);
      c.lineTo(L * 0.25, -w);
      c.lineTo(L / 2, 0);
      c.lineTo(L * 0.25, w);
      c.lineTo(-L / 2, w);
      c.closePath();
      c.fill();
      c.fillStyle = col;
      c.beginPath();
      c.moveTo(L * 0.25, -w);
      c.lineTo(L / 2, 0);
      c.lineTo(L * 0.25, w);
      c.closePath();
      c.fill();
      c.fillStyle = shade(col, 0.7);
      for (const s of [-1, 1]) {
        c.beginPath();
        c.moveTo(-L * 0.45, s * w);
        c.lineTo(-L * 0.62, s * w * 2.3);
        c.lineTo(-L * 0.22, s * w);
        c.closePath();
        c.fill();
      }
      return;
    }
    case 'grenade': {
      const rx = r * 1.25,
        ry = r * 1.6;
      c.fillStyle = metal(c, ry, '#a9b87a', '#5f6e3a', '#28301a');
      c.beginPath();
      c.ellipse(0, 0, rx, ry, 0, 0, TAU);
      c.fill();
      // segment grooves
      c.strokeStyle = 'rgba(20,26,12,0.7)';
      c.lineWidth = Math.max(0.6, r * 0.18);
      for (const k of [-0.45, 0, 0.45]) {
        c.beginPath();
        c.moveTo(-rx, k * ry);
        c.lineTo(rx, k * ry);
        c.stroke();
      }
      c.beginPath();
      c.moveTo(0, -ry);
      c.lineTo(0, ry);
      c.stroke();
      // fuse head + lever
      c.fillStyle = '#9aa1a8';
      c.fillRect(-r * 0.5, -ry - r * 0.7, r, r * 0.8);
      c.fillStyle = '#c3c9cf';
      c.beginPath();
      c.moveTo(r * 0.4, -ry - r * 0.5);
      c.lineTo(rx + r * 0.3, -ry * 0.1);
      c.lineTo(rx, ry * 0.15);
      c.lineTo(r * 0.2, -ry - r * 0.2);
      c.closePath();
      c.fill();
      // light on the fuse that blinks when fused
      if (d.fuse !== undefined) {
        c.fillStyle = Math.sin(time * 18) > 0 ? '#ff4a3a' : '#7a1a14';
        c.beginPath();
        c.arc(0, -ry - r * 0.35, r * 0.28, 0, TAU);
        c.fill();
      }
      return;
    }
    case 'bomb': {
      const R = r * 1.25;
      c.fillStyle = (() => {
        const g = c.createRadialGradient(-R * 0.35, -R * 0.35, R * 0.1, 0, 0, R);
        g.addColorStop(0, '#6b7178');
        g.addColorStop(0.5, '#2a2e33');
        g.addColorStop(1, '#0d0f11');
        return g;
      })();
      c.beginPath();
      c.arc(0, 0, R, 0, TAU);
      c.fill();
      c.strokeStyle = col;
      c.lineWidth = R * 0.22;
      c.beginPath();
      c.arc(0, 0, R * 0.8, -0.5, 0.5);
      c.stroke();
      c.fillStyle = '#4a4f55';
      c.fillRect(-R * 0.25, -R * 1.2, R * 0.5, R * 0.35);
      c.strokeStyle = '#c9a26a';
      c.lineWidth = R * 0.12;
      c.beginPath();
      c.moveTo(0, -R * 1.2);
      c.quadraticCurveTo(R * 0.4, -R * 1.6, R * 0.2, -R * 1.85);
      c.stroke();
      c.fillStyle = Math.sin(time * 30) > 0 ? '#fff4b0' : '#ff9a3a';
      c.beginPath();
      c.arc(R * 0.2, -R * 1.9, R * 0.22, 0, TAU);
      c.fill();
      return;
    }
    case 'orb': {
      const g = c.createRadialGradient(0, 0, 0, 0, 0, r * 1.3);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.45, col);
      g.addColorStop(1, glow);
      c.fillStyle = g;
      c.beginPath();
      c.arc(0, 0, r * 1.2, 0, TAU);
      c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.7)';
      c.lineWidth = Math.max(0.8, r * 0.2);
      c.beginPath();
      c.ellipse(0, 0, r * 2, r * 0.7, time * 3, 0, TAU);
      c.stroke();
      return;
    }
    case 'ball': {
      const R = r * 1.15;
      const g = c.createRadialGradient(-R * 0.35, -R * 0.35, R * 0.1, 0, 0, R);
      g.addColorStop(0, shade(col, 1.4));
      g.addColorStop(0.6, col);
      g.addColorStop(1, shade(col, 0.4));
      c.fillStyle = g;
      c.beginPath();
      c.arc(0, 0, R, 0, TAU);
      c.fill();
      c.strokeStyle = 'rgba(30,30,30,0.6)';
      c.lineWidth = R * 0.25;
      c.beginPath();
      c.moveTo(-R, 0);
      c.lineTo(R, 0);
      c.stroke();
      return;
    }
    case 'canister': {
      const L = r * 2.8,
        w = r * 1.1;
      c.fillStyle = metal(c, w, shade(col, 1.4), col, shade(col, 0.4));
      c.beginPath();
      c.roundRect(-L / 2, -w, L, w * 2, w * 0.5);
      c.fill();
      c.fillStyle = '#2b2f35';
      c.fillRect(-L / 2 - r * 0.3, -w * 0.6, r * 0.5, w * 1.2);
      c.fillStyle = '#ffd84a';
      c.fillRect(-L * 0.1, -w, L * 0.18, w * 2);
      c.fillStyle = '#1a1a1a';
      c.beginPath();
      c.moveTo(-L * 0.01, -w * 0.45);
      c.lineTo(L * 0.06, w * 0.35);
      c.lineTo(-L * 0.08, w * 0.35);
      c.closePath();
      c.fill();
      return;
    }
    case 'clod': {
      c.fillStyle = col;
      c.beginPath();
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * TAU;
        const rr = r * (1.1 + 0.25 * Math.sin(k * 2.7));
        c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      c.closePath();
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.18)';
      c.beginPath();
      c.arc(-r * 0.35, -r * 0.35, r * 0.45, 0, TAU);
      c.fill();
      return;
    }
    case 'drill': {
      const L = r * 3.4,
        w = r * 1.05;
      c.fillStyle = metal(c, w, '#ffffff', '#b8bec4', '#4a5058');
      c.fillRect(-L / 2, -w, L * 0.45, w * 2);
      c.fillStyle = metal(c, w, '#fff3c0', col, shade(col, 0.4));
      c.beginPath();
      c.moveTo(-L * 0.05, -w);
      c.lineTo(L / 2, 0);
      c.lineTo(-L * 0.05, w);
      c.closePath();
      c.fill();
      c.strokeStyle = 'rgba(40,30,20,0.6)';
      c.lineWidth = Math.max(0.6, r * 0.15);
      const sp = (time * 20) % 1;
      for (let k = 0; k < 3; k++) {
        const x = -L * 0.05 + (k + sp) * L * 0.17;
        const h = w * (1 - (x + L * 0.05) / (L * 0.55));
        c.beginPath();
        c.moveTo(x, -h);
        c.lineTo(x + L * 0.06, h);
        c.stroke();
      }
      return;
    }
    case 'kernel': {
      for (const [dx, dy, k] of [[0, 0, 1], [-0.7, 0.35, 0.75], [0.7, 0.3, 0.8], [0.1, -0.65, 0.75]] as const) {
        const R = r * 0.95 * k;
        const g = c.createRadialGradient(dx * r - R * 0.3, dy * r - R * 0.3, R * 0.1, dx * r, dy * r, R);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(1, '#ecd29a');
        c.fillStyle = g;
        c.beginPath();
        c.arc(dx * r, dy * r, R, 0, TAU);
        c.fill();
      }
      c.fillStyle = '#e8a63a';
      c.beginPath();
      c.arc(r * 0.25, r * 0.65, r * 0.35, 0, TAU);
      c.fill();
      return;
    }
    case 'crawler': {
      const L = r * 2.8,
        h = r * 1.1;
      c.fillStyle = metal(c, h, '#e6eaee', col, '#4a5058');
      c.beginPath();
      c.roundRect(-L / 2, -h * 1.4, L, h * 1.2, h * 0.3);
      c.fill();
      c.fillStyle = '#22262a';
      c.beginPath();
      c.roundRect(-L / 2 - r * 0.2, -h * 0.35, L + r * 0.4, h * 0.75, h * 0.37);
      c.fill();
      c.fillStyle = Math.sin(time * 14) > 0 ? glow : shade(glow, 0.4);
      c.beginPath();
      c.arc(L * 0.3, -h * 1.4, r * 0.35, 0, TAU);
      c.fill();
      return;
    }
    case 'pellet':
    default: {
      c.fillStyle = col;
      c.beginPath();
      c.ellipse(0, 0, r * 1.4, r * 0.9, 0, 0, TAU);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.75)';
      c.beginPath();
      c.ellipse(r * 0.3, -r * 0.3, r * 0.6, r * 0.3, 0, 0, TAU);
      c.fill();
    }
  }
}
