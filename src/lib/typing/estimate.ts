import { hashStringToSeed } from './rng';
import { normalizeAdvancedSettings } from './normalize';
import type { TypingOptions } from './types';
import { createTypingPlanV2 as createTypingPlan } from './plannerV2';

export interface TypingEstimate {
  meanSeconds: number;
  minSeconds: number;
  maxSeconds: number;
  samples: number[];
}

const EXECUTOR_OVERHEAD = {
  charTransportSeconds: 0.004,
  keyBaseSeconds: 0.008,
  backspaceSettleSeconds: 0.03,
  navigationSettleSeconds: 0.025,
  ctrlNavigationSettleSeconds: 0.08,
  preSequenceSettleSeconds: 0.06,
  postSequenceSettleSeconds: 0.05,
} as const;

function estimateExecutorOverheadSeconds(plan: { steps: Array<any> }): number {
  let overhead = 0;

  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i]!;
    const nextStep = i < plan.steps.length - 1 ? plan.steps[i + 1]! : null;

    if (step.type === 'char') {
      overhead += EXECUTOR_OVERHEAD.charTransportSeconds;
      continue;
    }

    if (step.type === 'key') {
      switch (step.key) {
        case 'BACKSPACE':
          overhead += EXECUTOR_OVERHEAD.backspaceSettleSeconds;
          break;
        case 'LEFT':
        case 'RIGHT':
        case 'END':
        case 'HOME':
          overhead += EXECUTOR_OVERHEAD.navigationSettleSeconds;
          break;
        case 'CTRL_END':
        case 'CTRL_HOME':
          overhead += EXECUTOR_OVERHEAD.ctrlNavigationSettleSeconds;
          break;
        default:
          overhead += EXECUTOR_OVERHEAD.keyBaseSeconds;
          break;
      }

      const isSequenceEnd =
        (step.key === 'CTRL_END' || step.key === 'END') &&
        (!!nextStep && (nextStep.type === 'char' || (nextStep.type === 'pause' && !(nextStep.reason || '').includes('fix'))));
      if (isSequenceEnd) {
        overhead += EXECUTOR_OVERHEAD.postSequenceSettleSeconds;
      }

      continue;
    }

    if (step.type === 'pause') {
      const reason = step.reason || '';
      if (
        reason.includes('fix') ||
        reason.includes('correction') ||
        reason.includes('realization') ||
        reason.includes('reflex')
      ) {
        overhead += EXECUTOR_OVERHEAD.preSequenceSettleSeconds;
      }
    }
  }

  return overhead;
}

export function estimateTypingSeconds(text: string, options: TypingOptions, runs: number = 3): TypingEstimate {
  const r = Math.max(1, Math.min(12, Math.floor(runs)));
  const baseSeed = options.seed ?? hashStringToSeed(text);
  const samples: number[] = [];
  const advanced = normalizeAdvancedSettings(options.advanced);

  for (let k = 0; k < r; k++) {
    const plan = createTypingPlan(text, { ...options, seed: (baseSeed + k) >>> 0 });
    const executorOverhead = estimateExecutorOverheadSeconds(plan);
    samples.push(plan.estimatedSeconds + executorOverhead);
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

