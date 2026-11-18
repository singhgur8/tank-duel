import { THEMES } from '../core/themes';
import type { TerrainStyle } from '../core/terrain';
import { Rng } from '../core/rng';
import type { GameOptions, PlayerSetup } from '../game/game';
import { WEAPONS, getWeapon } from '../game/weapons';
import { weaponIcon } from '../render/icons';

/** Everything the lobby lets players choose before a match. */
export interface Seat {
  name: string;
  /** 0 = human, 1..10 = CPU level. */
  cpu: number;
}

export interface MatchSettings {
  /** How many players take part (2 or 3). */
  count: number;
  /** Always four seats; only the first `count` (2–4) play. */
  seats: Seat[];
  weapons: number;
  selection: 'draft' | 'random';
  terrain: 'random' | TerrainStyle;
  wind: 'off' | 'light' | 'normal' | 'strong';
  theme: string;
  rounds: number;
  /** Weapon ids switched off in "Weapons in play". */
  disabled: string[];
}

export const DEFAULT_SETTINGS: MatchSettings = {
  count: 2,
  seats: [{ name: 'Player 1', cpu: 0 }, { name: 'Player 2', cpu: 0 }, { name: 'Player 3', cpu: 0 }, { name: 'Player 4', cpu: 0 }],
  weapons: 10, selection: 'draft',
  terrain: 'random', wind: 'normal', theme: '', rounds: 1, disabled: [],
};

/** Weapon ids that are switched on. Never empty: if everything is off, the whole arsenal is used. */
export function enabledWeapons(s: Pick<MatchSettings, 'disabled'>): string[] {
  const off = new Set(s.disabled);
  const on = WEAPONS.filter((w) => !off.has(w.id)).map((w) => w.id);
  return on.length ? on : WEAPONS.map((w) => w.id);
}

const PRESETS: Record<string, (rng: Rng) => string[]> = {
  all: () => WEAPONS.map((w) => w.id),
  none: () => [],
  explosive: () => WEAPONS.filter((w) => w.category === 'explosive').map((w) => w.id),
  spread: () => WEAPONS.filter((w) => w.category === 'spread').map((w) => w.id),
  special: () => WEAPONS.filter((w) => w.category === 'special').map((w) => w.id),
  nodirt: () => WEAPONS.filter((w) => w.category !== 'utility').map((w) => w.id),
  random: (rng) => rng.shuffle(WEAPONS.map((w) => w.id)).slice(0, 15),
};

const WIND_MAX: Record<MatchSettings['wind'], number> = { off: 0, light: 4, normal: 10, strong: 15 };

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

/** Wires the lobby form to a settings object. Calls onChange whenever something changes. */
export function initLobby(initial: Partial<MatchSettings>, onChange: (s: MatchSettings) => void, click: () => void) {
  const s: MatchSettings = { ...DEFAULT_SETTINGS, ...initial };
  // Settings saved by older versions had name0/name1/mode/cpuLevel instead of seats.
  const old = initial as Partial<{ name0: string; name1: string; mode: string; cpuLevel: number }>;
  if (!initial.seats) {
    s.seats = DEFAULT_SETTINGS.seats.map((x) => ({ ...x }));
    if (old.name0) s.seats[0].name = old.name0;
    if (old.name1) s.seats[1].name = old.name1;
    if (old.mode === 'cpu') s.seats[1].cpu = old.cpuLevel ?? 5;
  }
  s.seats = [0, 1, 2, 3].map((i) => ({ ...DEFAULT_SETTINGS.seats[i], ...(s.seats[i] ?? {}) }));
  s.count = Math.min(4, Math.max(2, Math.round(Number(s.count) || 2)));
  const seatsEl = $('#seats');
  seatsEl.innerHTML = '';
  s.seats.forEach((seat, i) => {
    const row = document.createElement('div');
    row.className = 'seat';
    row.dataset.seat = String(i);
    const opts = ['<option value="0">Human</option>', ...Array.from({ length: 10 }, (_, k) => `<option value="${k + 1}">CPU ${k + 1}</option>`)].join('');
    row.innerHTML = `<span class="dot"></span><input maxlength="12" aria-label="Player ${i + 1} name" /><select aria-label="Player ${i + 1} type">${opts}</select>`;
    const input = row.querySelector('input')!;
    const sel = row.querySelector('select')!;
    input.addEventListener('change', () => {
      seat.name = input.value.trim() || `Player ${i + 1}`;
      changed();
    });
    sel.addEventListener('change', () => {
      const was = seat.cpu;
      seat.cpu = Number(sel.value);
      // Rename default names so the plates read "CPU 7" rather than "Player 2".
      if (seat.cpu && (seat.name === `Player ${i + 1}` || /^CPU \d+$/.test(seat.name))) seat.name = `CPU ${seat.cpu}`;
      if (!seat.cpu && was && /^CPU \d+$/.test(seat.name)) seat.name = `Player ${i + 1}`;
      click();
      changed();
    });
    seatsEl.appendChild(row);
  });
  const modeOf = () => (s.count >= 3 ? 'three' : s.seats[1].cpu ? 'cpu' : 'hotseat');
  // Forget ids of weapons that no longer exist.
  s.disabled = (s.disabled ?? []).filter((id) => WEAPONS.some((w) => w.id === id));
  const themeSel = $<HTMLSelectElement>('#theme');
  for (const t of THEMES) themeSel.add(new Option(t.name, t.id));

  const sync = () => {
    document.querySelectorAll<HTMLButtonElement>('.mode[data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === modeOf()));
    seatsEl.querySelectorAll<HTMLElement>('.seat').forEach((row, i) => {
      row.classList.toggle('hidden', i >= s.count);
      row.querySelector('input')!.value = s.seats[i].name;
      row.querySelector('select')!.value = String(s.seats[i].cpu);
    });
    themeSel.value = s.theme;
    document.querySelectorAll<HTMLElement>('.seg[data-key]').forEach((seg) => {
      const v = String(s[seg.dataset.key as keyof MatchSettings]);
      seg.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.classList.toggle('active', b.dataset.v === v));
    });
    $('#start-btn').textContent = s.selection === 'draft' ? 'Pick weapons' : 'Start battle';
    const on = WEAPONS.length - s.disabled.length;
    $('#arsenal-btn').textContent = on === WEAPONS.length ? `All ${on} weapons` : `${on} of ${WEAPONS.length} weapons`;
  };
  const changed = () => {
    sync();
    onChange({ ...s });
  };

  document.querySelectorAll<HTMLButtonElement>('.mode[data-mode]').forEach((b) =>
    b.addEventListener('click', () => {
      // Presets: two humans, human vs CPU, or three players (keeping whoever is already set up).
      const m = b.dataset.mode;
      const setCpu = (i: number, lvl: number) => {
        const seat = s.seats[i];
        const wasDefault = seat.name === `Player ${i + 1}` || /^CPU \d+$/.test(seat.name);
        seat.cpu = lvl;
        if (wasDefault) seat.name = lvl ? `CPU ${lvl}` : `Player ${i + 1}`;
      };
      if (m === 'hotseat') {
        s.count = 2;
        setCpu(1, 0);
      } else if (m === 'cpu') {
        s.count = 2;
        setCpu(1, s.seats[1].cpu || 5);
      } else s.count = Math.max(3, s.count);
      click();
      changed();
    }),
  );
  document.querySelectorAll<HTMLElement>('.seg[data-key]').forEach((seg) =>
    seg.querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
      b.addEventListener('click', () => {
        const key = seg.dataset.key as keyof MatchSettings;
        const v = b.dataset.v!;
        (s as unknown as Record<string, unknown>)[key] = typeof DEFAULT_SETTINGS[key] === 'number' ? Number(v) : v;
        click();
        changed();
      }),
    ),
  );
  themeSel.addEventListener('change', () => ((s.theme = themeSel.value), changed()));

  // ── Weapons in play ──
  const overlay = $('#arsenal');
  const grid = $('#arsenal-grid');
  const presetRng = new Rng((Math.random() * 2 ** 31) | 0);
  let editing = new Set<string>();
  const renderArsenal = () => {
    grid.querySelectorAll<HTMLButtonElement>('.pcardw').forEach((b) => {
      const off = !editing.has(b.dataset.id!);
      b.classList.toggle('off', off);
      b.setAttribute('aria-pressed', String(!off));
      b.querySelector('.left')!.textContent = off ? 'OFF' : 'ON';
    });
    const n = editing.size;
    const cnt = $('#arsenal-count');
    cnt.textContent = n ? `${n} of ${WEAPONS.length} on` : 'Switch on at least one weapon';
    cnt.classList.toggle('bad', !n);
    $<HTMLButtonElement>('#arsenal-done').disabled = !n;
  };
  for (const w of WEAPONS) {
    const b = document.createElement('button');
    b.className = 'pcardw';
    b.dataset.id = w.id;
    b.title = w.description;
    b.innerHTML = `<span class="left"></span><img alt="" src="${weaponIcon(w)}" /><b>${w.name}</b><small>${w.description}</small>`;
    b.addEventListener('click', () => {
      if (editing.has(w.id)) editing.delete(w.id);
      else editing.add(w.id);
      click();
      renderArsenal();
    });
    grid.appendChild(b);
  }
  overlay.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((b) =>
    b.addEventListener('click', () => {
      editing = new Set(PRESETS[b.dataset.preset!](presetRng));
      click();
      renderArsenal();
    }),
  );
  $('#arsenal-btn').addEventListener('click', () => {
    editing = new Set(enabledWeapons({ disabled: s.disabled }));
    if (s.disabled.length >= WEAPONS.length) editing.clear();
    click();
    renderArsenal();
    overlay.classList.remove('hidden');
  });
  $('#arsenal-done').addEventListener('click', () => {
    if (!editing.size) return;
    s.disabled = WEAPONS.filter((w) => !editing.has(w.id)).map((w) => w.id);
    overlay.classList.add('hidden');
    click();
    changed();
  });
  sync();
  return {
    get: (): MatchSettings => {
      // Pick up a name still being typed.
      seatsEl.querySelectorAll<HTMLInputElement>('.seat input').forEach((inp, i) => (s.seats[i].name = inp.value.trim() || `Player ${i + 1}`));
      return { ...s, seats: s.seats.map((x) => ({ ...x })) };
    },
  };
}

export function playersOf(s: MatchSettings): PlayerSetup[] {
  return s.seats.slice(0, s.count).map((seat) => (seat.cpu ? { name: seat.name, cpuLevel: seat.cpu } : { name: seat.name }));
}

export function gameOptions(s: MatchSettings, seed: number): GameOptions {
  return {
    players: playersOf(s),
    weaponsPerPlayer: s.weapons,
    seed,
    themeId: s.theme || undefined,
    maxWind: WIND_MAX[s.wind],
    terrain: s.terrain === 'random' ? undefined : s.terrain,
    pool: enabledWeapons(s),
  };
}

/**
 * Weapon draft: players take turns picking from the arsenal until both hands are full. When hands are
 * larger than the arsenal allows, each weapon comes in enough copies to go round.
 */
export function runDraft(opts: {
  players: PlayerSetup[];
  perPlayer: number;
  /** Weapon ids that may be picked. Defaults to the whole arsenal. */
  pool?: string[];
  first: number;
  rng: Rng;
  onPick: () => void;
  onDone: (hands: string[][]) => void;
}) {
  const { players, perPlayer, rng } = opts;
  const allowed = new Set(opts.pool ?? WEAPONS.map((w) => w.id));
  const ARSENAL = WEAPONS.filter((w) => allowed.has(w.id));
  const n = players.length;
  const copies = Math.max(1, Math.ceil((perPlayer * n) / ARSENAL.length));
  const left = new Map(ARSENAL.map((w) => [w.id, copies]));
  const hands: string[][] = players.map(() => []);
  let picker = opts.first;
  let cpuTimer = 0;
  let finished = false;
  const overlay = $('#draft');
  const pool = $('#draft-pool');

  const available = () => ARSENAL.filter((w) => (left.get(w.id) ?? 0) > 0);

  const pick = (id: string) => {
    if (finished || hands[picker].length >= perPlayer || !left.get(id)) return;
    left.set(id, left.get(id)! - 1);
    hands[picker].push(id);
    opts.onPick();
    // Next player round the table who still has room in their hand.
    for (let k = 1; k <= n; k++) {
      const next = (picker + k) % n;
      if (hands[next].length < perPlayer) {
        picker = next;
        break;
      }
    }
    render();
    if (hands.every((h) => h.length >= perPlayer)) {
      finished = true;
      $('#draft-turn').textContent = 'Arsenals ready. Deploying…';
      setTimeout(() => {
        overlay.classList.add('hidden');
        opts.onDone(hands.map((h) => h.slice()));
      }, 700);
      return;
    }
    scheduleCpu();
  };

  const cpuChoice = (level: number) => {
    const av = available();
    let best = av[0],
      bs = -Infinity;
    for (const w of av) {
      const sc = (w.ai?.value ?? 3) + rng.range(0, 11 - level);
      if (sc > bs) {
        bs = sc;
        best = w;
      }
    }
    return best.id;
  };

  const scheduleCpu = () => {
    clearTimeout(cpuTimer);
    const lvl = players[picker].cpuLevel;
    if (lvl && !finished) cpuTimer = window.setTimeout(() => pick(cpuChoice(lvl)), 420);
  };

  const render = () => {
    const p = players[picker];
    const turn = $('#draft-turn');
    turn.textContent = `${p.name} picks · ${hands[picker].length + 1} of ${perPlayer}`;
    turn.style.color = `var(--p${picker})`;
    $('#hand2').classList.toggle('hidden', n < 3);
    $('#hand3').classList.toggle('hidden', n < 4);
    for (let i = 0; i < n; i++) {
      const el = $(`#hand${i}`);
      el.classList.toggle('picking', i === picker && !finished);
      el.querySelector('h3')!.textContent = players[i].name;
      const list = el.querySelector('.hand-list')!;
      list.innerHTML = '';
      hands[i].forEach((id) => {
        const w = getWeapon(id);
        const d = document.createElement('div');
        d.className = 'hand-item';
        d.innerHTML = `<img alt="" src="${weaponIcon(w)}" /><span>${w.name}</span>`;
        list.appendChild(d);
      });
      for (let k = hands[i].length; k < perPlayer; k++) list.appendChild(Object.assign(document.createElement('div'), { className: 'hand-slot' }));
    }
    const humanTurn = !p.cpuLevel && !finished;
    pool.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      const n = left.get(b.dataset.id!) ?? 0;
      b.disabled = n <= 0 || !humanTurn;
      if (n <= 0) b.style.opacity = '';
      b.querySelector('.left')!.textContent = copies > 1 ? `×${n}` : '';
    });
    $<HTMLButtonElement>('#draft-random').disabled = !humanTurn;
    $<HTMLButtonElement>('#draft-auto').disabled = finished;
  };

  pool.innerHTML = '';
  for (const w of ARSENAL) {
    const b = document.createElement('button');
    b.className = 'pcardw';
    b.dataset.id = w.id;
    b.title = w.description;
    b.innerHTML = `<span class="left"></span><img alt="" src="${weaponIcon(w)}" /><b>${w.name}</b><small>${w.description}</small>`;
    b.addEventListener('click', () => pick(w.id));
    pool.appendChild(b);
  }
  const randomPick = () => {
    const av = available();
    if (av.length) pick(rng.pick(av).id);
  };
  $('#draft-random').onclick = () => !players[picker].cpuLevel && randomPick();
  $('#draft-auto').onclick = () => {
    clearTimeout(cpuTimer);
    while (!finished) {
      const lvl = players[picker].cpuLevel;
      const av = available();
      if (!av.length) break;
      pick(lvl ? cpuChoice(lvl) : rng.pick(av).id);
    }
  };
  overlay.classList.remove('hidden');
  render();
  scheduleCpu();
  return { cancel: () => ((finished = true), clearTimeout(cpuTimer), overlay.classList.add('hidden')) };
}
