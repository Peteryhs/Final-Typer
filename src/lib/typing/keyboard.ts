const QWERTY = [
  'qwertyuiop',
  'asdfghjkl',
  'zxcvbnm',
];

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

export function randomLetter(rnd: () => number): string {
  return LETTERS[Math.floor(rnd() * LETTERS.length)];
}

function findInRows(ch: string): { row: number; col: number } | null {
  for (let r = 0; r < QWERTY.length; r++) {
    const c = QWERTY[r].indexOf(ch);
    if (c >= 0) return { row: r, col: c };
  }
  return null;
}

export function nearbyQwertyLetter(intendedLower: string, rnd: () => number): string {
  const pos = findInRows(intendedLower);
  if (!pos) return intendedLower;

  const candidates: string[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const rr = pos.row + dr;
      const cc = pos.col + dc;
      const row = QWERTY[rr];
      if (!row) continue;
      const ch = row[cc];
      if (ch) candidates.push(ch);
    }
  }

  if (candidates.length === 0) return intendedLower;
  return candidates[Math.floor(rnd() * candidates.length)];
}

