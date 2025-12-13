import type { TypingOptions } from './types';
import { estimateTypingSeconds } from './estimate';

export interface SolveWpmResult {
  wpm: number;
  estimatedSeconds: number;
}

export function solveWpmForTargetSeconds(
  text: string,
  baseOptions: Omit<TypingOptions, 'speed'>,
  targetSeconds: number,
  bounds: { minWpm?: number; maxWpm?: number } = {},
): SolveWpmResult {
  const target = Math.max(1, targetSeconds);
  let lo = Math.max(5, bounds.minWpm ?? 10);
  let hi = Math.max(lo, bounds.maxWpm ?? 250);

  const score = (wpm: number) => estimateTypingSeconds(text, { ...(baseOptions as TypingOptions), speed: wpm }, 1).meanSeconds;

  // Expand bounds until they bracket the target.
  let sLo = score(lo);
  let sHi = score(hi);
  let guard = 0;
  while (guard++ < 10 && sLo < target) {
    // Too fast even at lo -> lower lo.
    hi = lo;
    sHi = sLo;
    lo = Math.max(5, Math.floor(lo / 1.6));
    sLo = score(lo);
  }
  guard = 0;
  while (guard++ < 10 && sHi > target) {
    // Too slow even at hi -> raise hi.
    lo = hi;
    sLo = sHi;
    hi = Math.min(999, Math.ceil(hi * 1.6));
    sHi = score(hi);
  }

  // Binary search.
  let bestWpm = lo;
  let bestScore = sLo;
  for (let iter = 0; iter < 14; iter++) {
    const mid = Math.round((lo + hi) / 2);
    const s = score(mid);
    if (Math.abs(s - target) < Math.abs(bestScore - target)) {
      bestWpm = mid;
      bestScore = s;
    }
    if (s > target) lo = mid + 1;
    else hi = mid - 1;
    if (lo > hi) break;
  }

  return { wpm: bestWpm, estimatedSeconds: bestScore };
}

