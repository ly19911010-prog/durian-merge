/** localStorage persistence: best score + mute preference. */

const BEST_KEY = 'durianMergeBestScore';
const MUTE_KEY = 'durianMergeMuted';

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode etc. — ignore */
  }
}

export function loadBest(): number {
  const v = parseInt(safeGet(BEST_KEY) || '0', 10);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

export function saveBest(v: number): void {
  safeSet(BEST_KEY, String(Math.max(0, Math.floor(v))));
}

export function loadMuted(): boolean {
  return safeGet(MUTE_KEY) === '1';
}

export function saveMuted(m: boolean): void {
  safeSet(MUTE_KEY, m ? '1' : '0');
}
