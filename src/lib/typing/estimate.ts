import { hashStringToSeed } from './rng';
import type { TypingOptions } from './types';
import { createTypingPlan } from './planner';

export interface TypingEstimate {
  meanSeconds: number;
  minSeconds: number;
  maxSeconds: number;
  samples: number[];
}

export function estimateTypingSeconds(text: string, options: TypingOptions, runs: number = 3): TypingEstimate {
  const r = Math.max(1, Math.min(12, Math.floor(runs)));
  const baseSeed = options.seed ?? hashStringToSeed(text);
  const samples: number[] = [];

  for (let k = 0; k < r; k++) {
    const plan = createTypingPlan(text, { ...options, seed: (baseSeed + k) >>> 0 });
    samples.push(plan.estimatedSeconds);
  }

  samples.sort((a, b) => a - b);
  const meanSeconds = samples.reduce((s, x) => s + x, 0) / samples.length;
  return {
    meanSeconds,
    minSeconds: samples[0] ?? 0,
    maxSeconds: samples[samples.length - 1] ?? 0,
    samples,
  };
}

