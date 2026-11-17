import './styles.css';
import { DT, MAX_WIND } from './config';
import { Rng, clamp } from './core/rng';
import { THEMES } from './core/themes';
import { CpuController } from './game/ai';
import { Game, type GameOptions } from './game/game';
import { getWeapon } from './game/weapons';
import type { GameCommand } from './net/commands';
import { Audio } from './render/audio';
import { Effects } from './render/effects';
import { Renderer } from './render/renderer';

declare const __SINGLE_FILE__: boolean;

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const canvas = $<HTMLCanvasElement>('#game');
const audio = new Audio();
const fx = new Effects(audio);

let game: Game | null = null;
let renderer: Renderer | null = null;
let cpus: (CpuController | null)[] = [];
let demo = false;
let lastOpts: GameOptions | null = null;
let paused = false;
let lastTurnKey = '';
let gameOverShown = false;

// ── settings persistence (best effort) ──
const SETTINGS_KEY = 'tank-duel:settings';
function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  } catch {
    return {};
  }
}
function saveSettings(s: object) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

// ── menu ──
let mode: 'hotseat' | 'cpu' = 'hotseat';
const themeSel = $<HTMLSelectElement>('#theme');
for (const t of THEMES) themeSel.add(new Option(t.name, t.id));
const settings = loadSettings();
if (settings.mode) mode = settings.mode;
if (settings.name0) $<HTMLInputElement>('#name0').value = settings.name0;
if (settings.name1) $<HTMLInputElement>('#name1').value = settings.name1;
if (settings.cpuLevel) $<HTMLInputElement>('#cpu-level').value = String(settings.cpuLevel);
if (settings.wcount) $<HTMLSelectElement>('#wcount').value = String(settings.wcount);
if (settings.theme !== undefined) themeSel.value = settings.theme;
if (settings.muted) audio.setMuted(true);

function syncMenu() {
  document.querySelectorAll<HTMLButtonElement>('.mode[data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  $('#name1-wrap').classList.toggle('hidden', mode === 'cpu');
  $('#cpu-wrap').classList.toggle('hidden', mode !== 'cpu');
  $('#cpu-level-val').textContent = $<HTMLInputElement>('#cpu-level').value;
  $('#mute-btn').textContent = audio.muted ? '🔇' : '🔊';
}
document.querySelectorAll<HTMLButtonElement>('.mode[data-mode]').forEach((b) =>
  b.addEventListener('click', () => {
    mode = b.dataset.mode as 'hotseat' | 'cpu';
    audio.unlock();
    audio.click();
    syncMenu();
  }),
);
$('#cpu-level').addEventListener('input', syncMenu);
syncMenu();

$('#start-btn').addEventListener('click', () => {
  audio.unlock();
  const name0 = $<HTMLInputElement>('#name0').value.trim() || 'Player 1';
  const name1 = $<HTMLInputElement>('#name1').value.trim() || 'Player 2';
  const cpuLevel = Number($<HTMLInputElement>('#cpu-level').value);
  const wcount = Number($<HTMLSelectElement>('#wcount').value);
  saveSettings({ mode, name0, name1, cpuLevel, wcount, theme: themeSel.value, muted: audio.muted });
  startGame({
    players: [{ name: name0 }, mode === 'cpu' ? { name: `CPU ${cpuLevel}`, cpuLevel } : { name: name1 }],
    weaponsPerPlayer: wcount,
    seed: (Math.random() * 2 ** 31) | 0,
    themeId: themeSel.value || undefined,
  });
});

function startGame(opts: GameOptions) {
  lastOpts = opts;
  game = new Game(opts, fx);
  fx.reset(game);
  renderer = new Renderer(canvas, game, fx);
  const g = game;
  cpus = opts.players.map((p, i) => (p.cpuLevel ? new CpuController(g, i, p.cpuLevel, new Rng(opts.seed ^ (0x5eed + i))) : null));
  demo = false;
  audio.suppressed = false;
  lastTurnKey = '';
  gameOverShown = false;
  paused = false;
  for (const id of ['#menu', '#gameover', '#pause', '#picker']) $(id).classList.add('hidden');
  hudCache.clear();
}

// ── input → commands ──
function human(): boolean {
  return !!game && game.phase === 'aim' && !game.player.cpuLevel && !paused;
}
function send(cmd: GameCommand) {
  if (!game || !human()) return false;
  return game.apply(cmd);
}
function nudge(da: number, dp: number) {
  if (!game) return;
  const p = game.player;
  send({ t: 'aim', angle: Math.round((p.angle + da) * 10) / 10, power: Math.round((p.power + dp) * 10) / 10 });
}
function act(a: string, fine = false) {
  if (!game) return;
  const k = fine ? 0.2 : 1;
  const p = game.player;
  switch (a) {
    case 'a+': return nudge(k, 0);
    case 'a-': return nudge(-k, 0);
    case 'p+': return nudge(0, k);
    case 'p-': return nudge(0, -k);
    case 'wprev': if (p.weapons.length) { send({ t: 'weapon', index: (p.selected - 1 + p.weapons.length) % p.weapons.length }); audio.click(); } return;
    case 'wnext': if (p.weapons.length) { send({ t: 'weapon', index: (p.selected + 1) % p.weapons.length }); audio.click(); } return;
    case 'mleft': if (send({ t: 'move', dir: -1 })) audio.move(); return;
    case 'mright': if (send({ t: 'move', dir: 1 })) audio.move(); return;
  }
}

// press-and-hold repeat for the step buttons
document.querySelectorAll<HTMLButtonElement>('#controls .step').forEach((b) => {
  let timer = 0;
  const stop = () => {
    clearTimeout(timer);
    clearInterval(timer);
  };
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    audio.unlock();
    act(b.dataset.act!);
    if (b.hasAttribute('data-hold')) {
      stop();
      timer = window.setTimeout(() => (timer = window.setInterval(() => act(b.dataset.act!), 40)), 320);
    }
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, stop);
});

const angleIn = $<HTMLInputElement>('#angle');
const powerIn = $<HTMLInputElement>('#power');
// The slider runs left→right, the barrel angle runs right→left, so flip it.
angleIn.addEventListener('input', () => game && send({ t: 'aim', angle: 180 - Number(angleIn.value), power: game.player.power }));
powerIn.addEventListener('input', () => game && send({ t: 'aim', angle: game.player.angle, power: Number(powerIn.value) }));

function fire() {
  audio.unlock();
  send({ t: 'fire' });
}
$('#fire-btn').addEventListener('click', fire);

// drag on the battlefield to aim: direction = angle, distance = power
let dragging = false;
canvas.addEventListener('pointerdown', (e) => {
  if (!human() || !renderer) return;
  dragging = true;
  canvas.setPointerCapture(e.pointerId);
  aimAt(e);
});
canvas.addEventListener('pointermove', (e) => dragging && aimAt(e));
canvas.addEventListener('pointerup', () => (dragging = false));
canvas.addEventListener('pointercancel', () => (dragging = false));
function aimAt(e: PointerEvent) {
  if (!game || !renderer) return;
  const r = canvas.getBoundingClientRect();
  const w = renderer.toWorld(e.clientX - r.left, e.clientY - r.top);
  const pv = game.pivot(game.current);
  const dx = w.x - pv.x,
    dy = pv.y - w.y;
  let ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (ang < -90) ang += 360; // game clamps to the weapon's allowed range
  const power = clamp((Math.hypot(dx, dy) - 30) / 2.6, 5, 100);
  send({ t: 'aim', angle: Math.round(ang * 10) / 10, power: Math.round(power) });
}

// Held arrow keys repeat at a fixed rate (deg or power per second), Shift for fine control.
const held = new Map<string, number>(); // action -> seconds held
let shiftDown = false;
const HOLD_DELAY = 0.25;
function applyHeld(dt: number) {
  for (const [k, t] of held) {
    const nt = t + dt;
    held.set(k, nt);
    if (nt < HOLD_DELAY) continue;
    const rate = (shiftDown ? 4 : 28) * Math.min(1, (nt - HOLD_DELAY) * 3 + 0.4) * dt;
    if (k === 'a+') nudge(rate, 0);
    else if (k === 'a-') nudge(-rate, 0);
    else if (k === 'p+') nudge(0, rate);
    else if (k === 'p-') nudge(0, -rate);
  }
}
window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'INPUT' && (e.target as HTMLInputElement).type !== 'range') return;
  if (e.key === 'Escape') return togglePause();
  if (!game || !$('#menu').classList.contains('hidden')) return;
  if (!$('#picker').classList.contains('hidden')) {
    if (e.key === 'Escape' || e.key === 'w' || e.key === 'W') $('#picker').classList.add('hidden');
    return;
  }
  const fine = e.shiftKey;
  shiftDown = e.shiftKey;
  const arrow: Record<string, string> = { ArrowLeft: 'a+', ArrowRight: 'a-', ArrowUp: 'p+', ArrowDown: 'p-' };
  if (arrow[e.key]) {
    e.preventDefault();
    if (e.repeat) return; // our own repeat handles holding
    held.set(arrow[e.key], 0);
    act(arrow[e.key], fine);
    return;
  }
  switch (e.key) {
    case 'a': case 'A': act('mleft'); break;
    case 'd': case 'D': act('mright'); break;
    case 'q': case 'Q': case '[': act('wprev'); break;
    case 'e': case 'E': case ']': act('wnext'); break;
    case 'w': case 'W': openPicker(); break;
    case ' ': case 'Enter': fire(); break;
    case 'm': case 'M': toggleMute(); break;
    default: return;
  }
  e.preventDefault();
});
window.addEventListener('keyup', (e) => {
  const map: Record<string, string> = { ArrowLeft: 'a+', ArrowRight: 'a-', ArrowUp: 'p+', ArrowDown: 'p-' };
  if (map[e.key]) held.delete(map[e.key]);
  shiftDown = e.shiftKey;
});

// weapon picker
function openPicker() {
  if (!game || !human()) return;
  const p = game.player;
  const grid = $('#picker-grid');
  grid.innerHTML = '';
  p.weapons.forEach((id, i) => {
    const w = getWeapon(id);
    const b = document.createElement('button');
    b.className = 'wcard' + (i === p.selected ? ' sel' : '');
    const col = w.projectile?.glow ?? w.projectile?.color ?? w.beam?.color ?? '#fff';
    b.innerHTML = `<span class="cat">${w.category}</span><b><span class="dot" style="background:${col};color:${col}"></span>${w.name}</b><small>${w.description}</small>`;
    b.addEventListener('click', () => {
      send({ t: 'weapon', index: i });
      audio.click();
      $('#picker').classList.add('hidden');
    });
    grid.appendChild(b);
  });
  $('#picker').classList.remove('hidden');
}
$('#weapon-btn').addEventListener('click', openPicker);
$('#picker-close').addEventListener('click', () => $('#picker').classList.add('hidden'));

// pause / mute / game over
function togglePause() {
  if (!game || !$('#menu').classList.contains('hidden') || game.phase === 'gameover') return;
  if (!$('#picker').classList.contains('hidden')) return $('#picker').classList.add('hidden');
  paused = !paused;
  $('#pause').classList.toggle('hidden', !paused);
}
function toggleMute() {
  audio.setMuted(!audio.muted);
  syncMenu();
  saveSettings({ ...loadSettings(), muted: audio.muted });
}
$('#pause-btn').addEventListener('click', togglePause);
$('#resume-btn').addEventListener('click', togglePause);
$('#mute-btn').addEventListener('click', () => {
  audio.unlock();
  toggleMute();
});
$('#quit-btn').addEventListener('click', toMenu);
$('#menu-btn').addEventListener('click', toMenu);
$('#rematch-btn').addEventListener('click', () => lastOpts && startGame({ ...lastOpts, seed: (Math.random() * 2 ** 31) | 0 }));
function toMenu() {
  paused = false;
  $('#pause').classList.add('hidden');
  $('#gameover').classList.add('hidden');
  startDemo();
}

// ── HUD ──
const hudCache = new Map<string, string>();
function setText(sel: string, v: string) {
  if (hudCache.get(sel) === v) return;
  hudCache.set(sel, v);
  $(sel).textContent = v;
}
function updateHud() {
  if (!game) return;
  const g = game;
  g.players.forEach((p, i) => {
    const card = `#p${i}card`;
    setText(`${card} .pname`, p.name);
    const sc = String(Math.round(p.score));
    if (hudCache.get(`${card} .pscore`) !== sc && hudCache.has(`${card} .pscore`)) {
      const el = $(`${card} .pscore`);
      el.classList.remove('bump');
      void el.offsetWidth;
      el.classList.add('bump');
    }
    setText(`${card} .pscore`, sc);
    setText(`${card} .pmeta`, `${p.weapons.length} weapons · ${p.moves} moves`);
    $(card).classList.toggle('active', g.current === i && g.phase !== 'gameover');
  });
  const w = g.wind;
  const fill = $('#wind-fill');
  const pct = (Math.abs(w) / MAX_WIND) * 50;
  fill.style.left = w >= 0 ? '50%' : `${50 - pct}%`;
  fill.style.width = `${pct}%`;
  setText('#wind-val', w === 0 ? 'calm' : `${w > 0 ? '→' : '←'} ${Math.abs(w)}`);
  setText('#turn-info', g.phase === 'gameover' ? 'Game over' : `Turn ${g.turn} · ${g.player.name}`);

  const p = g.player;
  const wpn = g.currentWeapon;
  setText('#weapon-name', wpn ? wpn.name : 'No weapons');
  setText('#weapon-count', `${p.weapons.length ? p.selected + 1 : 0}/${p.weapons.length}`);
  const col = wpn ? wpn.projectile?.glow ?? wpn.projectile?.color ?? wpn.beam?.color ?? '#fff' : '#555';
  const dot = $('#weapon-dot');
  if (dot.dataset.c !== col) {
    dot.dataset.c = col;
    dot.style.background = col;
    dot.style.color = col;
  }
  setText('#angle-val', `${Math.round(p.angle * 10) / 10}°`);
  setText('#power-val', `${Math.round(p.power)}`);
  setText('#moves-left', `(${p.moves})`);
  const [alo, ahi] = g.angleRange();
  if (angleIn.min !== String(180 - ahi)) {
    angleIn.min = String(180 - ahi);
    angleIn.max = String(180 - alo);
  }
  if (document.activeElement !== angleIn) angleIn.value = String(180 - p.angle);
  if (document.activeElement !== powerIn) powerIn.value = String(p.power);
  $('#controls').classList.toggle('disabled', !human());
  $('#cpu-thinking').classList.toggle('hidden', !(g.phase === 'aim' && g.player.cpuLevel));

  // new turn banner
  const key = `${g.turn}:${g.current}:${g.phase === 'aim'}`;
  if (g.phase === 'aim' && key !== lastTurnKey) {
    lastTurnKey = key;
    const b = $('#banner');
    b.textContent = `${p.name}'s turn`;
    b.style.color = p.color;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
    if (!demo) audio.turn();
    cpus[g.current]?.beginTurn();
  }
  if (g.phase === 'gameover' && demo) {
    startDemo();
    return;
  }
  if (g.phase === 'gameover' && !gameOverShown) {
    gameOverShown = true;
    setTimeout(() => {
      const win = g.winner;
      $('#go-title').textContent = win < 0 ? 'Draw!' : `${g.players[win].name} wins!`;
      $('#go-title').style.color = win < 0 ? '#fff' : g.players[win].color;
      $('#go-scores').innerHTML = g.players.map((pl) => `<div><span>${pl.name}</span><b style="color:${pl.color}">${Math.round(pl.score)}</b></div>`).join('');
      $('#gameover').classList.remove('hidden');
      audio.fanfare();
    }, 900);
  }
}

// ── main loop: fixed-step simulation, variable-rate rendering ──
let acc = 0;
let last = performance.now();
function frame(now: number) {
  const real = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (game && renderer) {
    if (!paused) {
      applyHeld(real);
      cpus[game.current]?.update(real);
      acc += real * fx.timeScale;
      let steps = 0;
      while (acc >= DT && steps < 24) {
        game.update(DT);
        acc -= DT;
        steps++;
      }
      fx.update(real * (fx.timeScale < 1 ? 0.35 : 1), game, real);
    }
    renderer.draw(paused ? 0 : real);
    updateHud();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.addEventListener('resize', () => renderer?.resize());
window.addEventListener('blur', () => held.clear());

// Test hook used by automated QA (read-only access to the live game and effects).
(window as unknown as { __tankDuel: object }).__tankDuel = {
  get game() {
    return game;
  },
  fx,
  get demo() {
    return demo;
  },
};

// ── PWA: offline cache + install prompt ──
if (!__SINGLE_FILE__ && 'serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
let installEvt: (Event & { prompt: () => void }) | null = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvt = e as Event & { prompt: () => void };
  $('#install-btn').classList.remove('hidden');
});
$('#install-btn').addEventListener('click', () => {
  installEvt?.prompt();
  $('#install-btn').classList.add('hidden');
});

// Idle CPU-vs-CPU demo behind the menu so the title screen is alive (silent).
function startDemo() {
  startGame({ players: [{ name: 'Blue', cpuLevel: 7 }, { name: 'Orange', cpuLevel: 7 }], weaponsPerPlayer: 30, seed: (Math.random() * 2 ** 31) | 0 });
  demo = true;
  audio.suppressed = true;
  $('#menu').classList.remove('hidden');
}
startDemo();
