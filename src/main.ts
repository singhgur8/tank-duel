import './styles.css';
import { DT } from './config';
import { Rng, clamp } from './core/rng';
import { CpuController } from './game/ai';
import { Game, type GameOptions } from './game/game';
import { getWeapon } from './game/weapons';
import type { GameCommand } from './net/commands';
import { Audio } from './render/audio';
import { Effects } from './render/effects';
import { Renderer } from './render/renderer';
import { weaponIcon } from './render/icons';
import { gameOptions, initLobby, runDraft, type MatchSettings } from './ui/lobby';

declare const __SINGLE_FILE__: boolean;

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const canvas = $<HTMLCanvasElement>('#game');
const audio = new Audio();
const fx = new Effects(audio);

let game: Game | null = null;
let renderer: Renderer | null = null;
let cpus: (CpuController | null)[] = [];
let demo = false;
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

// ── lobby & match flow ──
const stored = loadSettings();
if (stored.muted) audio.setMuted(true);
const lobby = initLobby(
  stored.lobby ?? {},
  (s) => saveSettings({ ...loadSettings(), lobby: s }),
  () => {
    audio.unlock();
    audio.suppressed = false;
    audio.click();
  },
);
function syncMenu() {
  $('#mute-btn').classList.toggle('muted', audio.muted);
}
syncMenu();

interface Match {
  settings: MatchSettings;
  round: number;
  wins: number[];
  totals: number[];
  firstPicker: number;
}
let match: Match | null = null;
let draft: { cancel: () => void } | null = null;

$('#start-btn').addEventListener('click', () => {
  audio.unlock();
  const settings = lobby.get();
  saveSettings({ ...loadSettings(), lobby: settings });
  const n = settings.count;
  match = { settings, round: 1, wins: Array(n).fill(0), totals: Array(n).fill(0), firstPicker: Math.floor(Math.random() * n) };
  startRound();
});

function startRound() {
  if (!match) return;
  const m = match;
  const seed = (Math.random() * 2 ** 31) | 0;
  const opts = gameOptions(m.settings, seed);
  $('#menu').classList.add('hidden');
  $('#gameover').classList.add('hidden');
  if (m.settings.selection === 'draft') {
    paused = true; // freeze whatever is behind the draft
    audio.suppressed = false;
    draft = runDraft({
      players: opts.players,
      perPlayer: m.settings.weapons,
      pool: opts.pool,
      first: (m.firstPicker + m.round - 1) % opts.players.length,
      rng: new Rng(seed ^ 0xd4af7),
      onPick: () => audio.click(),
      onDone: (hands) => {
        draft = null;
        startGame({ ...opts, hands });
      },
    });
  } else startGame(opts);
}

function startGame(opts: GameOptions) {
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
  for (const id of ['#menu', '#gameover', '#pause', '#picker', '#draft', '#arsenal']) $(id).classList.add('hidden');
  $('#p2card').classList.toggle('hidden', opts.players.length < 3);
  document.body.classList.toggle('three', opts.players.length > 2);
  document.body.classList.toggle('four', opts.players.length > 3);
  $('#p3card').classList.toggle('hidden', opts.players.length < 4);
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
    case 'a+': return nudge(1, 0);
    case 'a-': return nudge(-1, 0);
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

// Angle and power: a slider under each readout, and the readout itself takes typed numbers.
function syncDial(name: 'angle' | 'power', v: number, min: number, max: number, label: string) {
  const range = $<HTMLInputElement>(`#${name}-range`);
  const box = $<HTMLInputElement>(`#${name}-val`);
  if (range.min !== String(min)) range.min = String(min);
  if (range.max !== String(max)) range.max = String(max);
  if (document.activeElement !== range && Number(range.value) !== v) range.value = String(v);
  range.parentElement!.style.setProperty('--pct', String(Math.max(0, Math.min(1, (v - min) / (max - min)))));
  if (document.activeElement !== box && box.value !== label) box.value = label;
}
function setAim(angle: number, power: number) {
  if (!game) return;
  send({ t: 'aim', angle: Math.round(angle * 10) / 10, power: Math.round(power * 10) / 10 });
}
for (const name of ['angle', 'power'] as const) {
  const range = $<HTMLInputElement>(`#${name}-range`);
  range.addEventListener('input', () => {
    if (!game) return;
    audio.unlock();
    const v = Number(range.value);
    if (name === 'angle') setAim(v, game.player.power);
    else setAim(game.player.angle, v);
  });
  const box = $<HTMLInputElement>(`#${name}-val`);
  box.addEventListener('focus', () => {
    if (!human()) return box.blur();
    box.value = box.value.replace('°', '');
    box.select();
  });
  const commit = () => {
    if (!game) return;
    const v = parseFloat(box.value.replace(',', '.'));
    if (Number.isFinite(v)) {
      if (name === 'angle') setAim(v, game.player.power);
      else setAim(game.player.angle, v);
    }
    hudCache.clear();
  };
  box.addEventListener('change', commit);
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      commit();
      box.blur();
    } else if (e.key === 'Escape') {
      hudCache.clear();
      box.blur();
    }
    e.stopPropagation();
  });
  box.addEventListener('blur', () => hudCache.clear());
}

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
  if (ang < 0) ang += 360; // full circle
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
    b.innerHTML = `<img class="wicon" alt="" src="${weaponIcon(w)}" /><div class="wtext"><span class="cat">${w.category}</span><b>${w.name}</b><small>${w.description}</small></div>`;
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
$('#rematch-btn').addEventListener('click', () => {
  if (!match) return;
  match = { ...match, round: 1, wins: match.wins.map(() => 0), totals: match.totals.map(() => 0) };
  startRound();
});
$('#next-btn').addEventListener('click', () => {
  if (!match) return;
  match.round++;
  startRound();
});
function toMenu() {
  draft?.cancel();
  draft = null;
  match = null;
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
    const sc = Math.round(p.score) < 0 ? `−${-Math.round(p.score)}` : String(Math.round(p.score));
    $(`${card} .pscore`).classList.toggle('neg', Math.round(p.score) < 0);
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
  const pct = g.maxWind > 0 ? (Math.abs(w) / g.maxWind) * 50 : 0;
  fill.style.left = w >= 0 ? '50%' : `${50 - pct}%`;
  fill.style.width = `${pct}%`;
  setText('#wind-val', g.maxWind === 0 ? 'off' : w === 0 ? 'calm' : `${w > 0 ? '→' : '←'} ${Math.abs(w)}`);
  setText('#turn-info', g.phase === 'gameover' ? 'Game over' : `Turn ${g.turn} · ${g.player.name}`);

  const p = g.player;
  // While a shot is flying, keep showing the weapon that was fired until everything has settled.
  const inFlight = g.phase === 'flight' && !!g.lastWeapon;
  const wpn = inFlight ? g.lastWeapon : g.currentWeapon;
  setText('#weapon-name', wpn ? wpn.name : 'No weapons');
  setText('#weapon-count', inFlight ? 'fired' : p.weapons.length ? `${p.selected + 1} of ${p.weapons.length}` : '');
  const icon = $<HTMLImageElement>('#weapon-icon');
  const src = wpn ? weaponIcon(wpn) : '';
  if (icon.dataset.k !== (wpn?.id ?? '')) {
    icon.dataset.k = wpn?.id ?? '';
    if (src) icon.src = src;
    icon.style.visibility = src ? 'visible' : 'hidden';
  }
  const [amin, amax] = g.angleRange();
  syncDial('angle', p.angle, amin, amax, `${Math.round(p.angle)}°`);
  syncDial('power', p.power, 5, 100, `${Math.round(p.power)}`);
  setText('#moves-left', `${p.moves}`);
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
    setTimeout(() => showRoundResult(g), 900);
  }
}

function showRoundResult(g: Game) {
  const win = g.winner;
  const m = match;
  const rounds = m?.settings.rounds ?? 1;
  if (m) {
    if (win >= 0) m.wins[win]++;
    g.players.forEach((p, i) => (m.totals[i] += Math.round(p.score)));
  }
  const need = Math.floor(rounds / 2) + 1;
  const over = !m || rounds === 1 || m.wins.some((w) => w >= need) || m.round >= rounds;
  $('#go-round').textContent = rounds > 1 && m ? `Round ${m.round} of ${rounds}` : '';
  let title = win < 0 ? 'Draw!' : `${g.players[win].name} wins!`;
  let color = win < 0 ? '#fff' : g.players[win].color;
  if (over && m && rounds > 1) {
    // match winner: most round wins, then most total points
    const key = m.wins.map((w, i) => w * 1e6 + m.totals[i]);
    const top = Math.max(...key);
    const mw = key.filter((k) => k === top).length > 1 ? -1 : key.indexOf(top);
    title = mw < 0 ? 'The match is a draw!' : `${g.players[mw].name} wins the match!`;
    color = mw < 0 ? '#fff' : g.players[mw].color;
  }
  $('#go-title').textContent = title;
  $('#go-title').style.color = color;
  $('#go-scores').innerHTML = g.players.map((pl) => `<div><span>${pl.name}</span><b style="color:${pl.color}">${Math.round(pl.score) < 0 ? '−' + -Math.round(pl.score) : Math.round(pl.score)}</b></div>`).join('');
  $('#go-match').textContent = m && rounds > 1 ? `Rounds won: ${g.players.map((pl, i) => `${pl.name} ${m.wins[i]}`).join(' · ')}` : '';
  $('#next-btn').classList.toggle('hidden', over);
  $('#rematch-btn').classList.toggle('hidden', !over);
  $('#gameover').classList.remove('hidden');
  audio.fanfare();
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
  draft?.cancel();
  draft = null;
  startGame({ players: [{ name: 'Blue', cpuLevel: 7 }, { name: 'Orange', cpuLevel: 7 }], weaponsPerPlayer: 30, seed: (Math.random() * 2 ** 31) | 0 });
  demo = true;
  audio.suppressed = true;
  $('#menu').classList.remove('hidden');
}
startDemo();
