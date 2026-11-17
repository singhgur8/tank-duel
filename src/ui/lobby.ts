import { THEMES } from '../core/themes';
import type { TerrainStyle } from '../core/terrain';
import { Rng } from '../core/rng';
import type { GameOptions, PlayerSetup } from '../game/game';
import { WEAPONS, getWeapon } from '../game/weapons';
import { weaponIcon } from '../render/icons';

/** Everything the lobby lets players choose before a match. */
export interface MatchSettings {
  mode: 'hotseat' | 'cpu';
  name0: string;
  name1: string;
  cpuLevel: number;
  weapons: number;
  selection: 'draft' | 'random';
  terrain: 'random' | TerrainStyle;
  wind: 'off' | 'light' | 'normal' | 'strong';
  theme: string;
  rounds: number;
}

export const DEFAULT_SETTINGS: MatchSettings = {
  mode: 'hotseat', name0: 'Player 1', name1: 'Player 2', cpuLevel: 5, weapons: 10, selection: 'draft',
  terrain: 'random', wind: 'normal', theme: '', rounds: 1,
};

const WIND_MAX: Record<MatchSettings['wind'], number> = { off: 0, light: 4, normal: 10, strong: 15 };

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

/** Wires the lobby form to a settings object. Calls onChange whenever something changes. */
export function initLobby(initial: Partial<MatchSettings>, onChange: (s: MatchSettings) => void, click: () => void) {
  const s: MatchSettings = { ...DEFAULT_SETTINGS, ...initial };
  const themeSel = $<HTMLSelectElement>('#theme');
  for (const t of THEMES) themeSel.add(new Option(t.name, t.id));

  const sync = () => {
    document.querySelectorAll<HTMLButtonElement>('.mode[data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === s.mode));
    $('#name1-wrap').classList.toggle('hidden', s.mode === 'cpu');
    $('#cpu-wrap').classList.toggle('hidden', s.mode !== 'cpu');
    $<HTMLInputElement>('#cpu-level').value = String(s.cpuLevel);
    $('#cpu-level-val').textContent = String(s.cpuLevel);
    $<HTMLInputElement>('#name0').value = s.name0;
    $<HTMLInputElement>('#name1').value = s.name1;
    themeSel.value = s.theme;
    document.querySelectorAll<HTMLElement>('.seg[data-key]').forEach((seg) => {
      const v = String(s[seg.dataset.key as keyof MatchSettings]);
      seg.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.classList.toggle('active', b.dataset.v === v));
    });
    $('#start-btn').textContent = s.selection === 'draft' ? 'Pick weapons' : 'Start battle';
  };
  const changed = () => {
    sync();
    onChange({ ...s });
  };

  document.querySelectorAll<HTMLButtonElement>('.mode[data-mode]').forEach((b) =>
    b.addEventListener('click', () => {
      s.mode = b.dataset.mode as MatchSettings['mode'];
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
  $('#cpu-level').addEventListener('input', () => {
    s.cpuLevel = Number($<HTMLInputElement>('#cpu-level').value);
    changed();
  });
  $('#name0').addEventListener('change', () => ((s.name0 = $<HTMLInputElement>('#name0').value.trim() || 'Player 1'), changed()));
  $('#name1').addEventListener('change', () => ((s.name1 = $<HTMLInputElement>('#name1').value.trim() || 'Player 2'), changed()));
  themeSel.addEventListener('change', () => ((s.theme = themeSel.value), changed()));
  sync();
  return {
    get: (): MatchSettings => ({
      ...s,
      name0: $<HTMLInputElement>('#name0').value.trim() || 'Player 1',
      name1: $<HTMLInputElement>('#name1').value.trim() || 'Player 2',
    }),
  };
}

export function playersOf(s: MatchSettings): [PlayerSetup, PlayerSetup] {
  return [{ name: s.name0 }, s.mode === 'cpu' ? { name: `CPU ${s.cpuLevel}`, cpuLevel: s.cpuLevel } : { name: s.name1 }];
}

export function gameOptions(s: MatchSettings, seed: number): GameOptions {
  return {
    players: playersOf(s),
    weaponsPerPlayer: s.weapons,
    seed,
    themeId: s.theme || undefined,
    maxWind: WIND_MAX[s.wind],
    terrain: s.terrain === 'random' ? undefined : s.terrain,
  };
}

/**
 * Weapon draft: players take turns picking from the arsenal until both hands are full. When hands are
 * larger than the arsenal allows, each weapon comes in enough copies to go round.
 */
export function runDraft(opts: {
  players: [PlayerSetup, PlayerSetup];
  perPlayer: number;
  first: number;
  rng: Rng;
  onPick: () => void;
  onDone: (hands: [string[], string[]]) => void;
}) {
  const { players, perPlayer, rng } = opts;
  const copies = Math.max(1, Math.ceil((perPlayer * 2) / WEAPONS.length));
  const left = new Map(WEAPONS.map((w) => [w.id, copies]));
  const hands: [string[], string[]] = [[], []];
  let picker = opts.first;
  let cpuTimer = 0;
  let finished = false;
  const overlay = $('#draft');
  const pool = $('#draft-pool');

  const available = () => WEAPONS.filter((w) => (left.get(w.id) ?? 0) > 0);

  const pick = (id: string) => {
    if (finished || hands[picker].length >= perPlayer || !left.get(id)) return;
    left.set(id, left.get(id)! - 1);
    hands[picker].push(id);
    opts.onPick();
    const other = 1 - picker;
    if (hands[other].length < perPlayer) picker = other;
    render();
    if (hands[0].length >= perPlayer && hands[1].length >= perPlayer) {
      finished = true;
      $('#draft-turn').textContent = 'Arsenals ready. Deploying…';
      setTimeout(() => {
        overlay.classList.add('hidden');
        opts.onDone([hands[0].slice(), hands[1].slice()]);
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
    turn.style.color = picker === 0 ? 'var(--p0)' : 'var(--p1)';
    for (const i of [0, 1]) {
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
  for (const w of WEAPONS) {
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
