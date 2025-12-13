/**
 * Debug visualizer CLI for typing plans.
 *
 * Usage:
 *   npx tsx test/debugPlan.ts "your text here"
 *   npx tsx test/debugPlan.ts "your text here" --seed 123
 *   npx tsx test/debugPlan.ts "your text here" --seed 123 --trace
 *   npx tsx test/debugPlan.ts "your text here" --trace --steps 100
 */

import { textAnalysis } from '../src/lib/analysis';
import { createTypingPlan } from '../src/lib/typing/planner';
import {
  visualizeTypingPlan,
  createDebugSummary,
  createDetailedTrace,
  formatBufferWithCaret,
} from '../src/lib/typing/debugVisualizer';

// Parse args
const args = process.argv.slice(2);
const text = args.find((a) => !a.startsWith('--')) || 'Hello world test.';
const seed = parseInt(args.find((a) => a.startsWith('--seed='))?.split('=')[1] || '12345', 10);
const showTrace = args.includes('--trace');
const maxSteps = parseInt(args.find((a) => a.startsWith('--steps='))?.split('=')[1] || '200', 10);
const mistakeRate = parseFloat(args.find((a) => a.startsWith('--mistakes='))?.split('=')[1] || '0.4');

console.log('='.repeat(70));
console.log('TYPING PLAN DEBUG VISUALIZER');
console.log('='.repeat(70));
console.log(`Text:         "${text}"`);
console.log(`Seed:         ${seed}`);
console.log(`Mistake rate: ${mistakeRate}`);
console.log('='.repeat(70));
console.log('');

const analysis = textAnalysis(text);
const plan = createTypingPlan(text, {
  speed: 80,
  speedMode: 'constant',
  speedVariance: 0.15,
  mistakeRate,
  fatigueMode: false,
  analysis,
  seed,
  advanced: {
    reflexRate: 0.1,
    deletionBacktrackChance: 0.1,
    fixSessionsEnabled: true,
    fixSessionIntervalWords: 3,
    fixSessionMaxFixes: 4,
  },
});

const viz = visualizeTypingPlan(plan);

// Show summary
console.log(createDebugSummary(viz));
console.log('');

// Show fix sessions in detail
const fixSessionEvents = viz.events.filter(
  (e) => e.step.type === 'pause' && (e.step.reason === 'fix-session' || e.step.reason === 'fix-session-final'),
);

if (fixSessionEvents.length > 0) {
  console.log('='.repeat(70));
  console.log('FIX SESSION DETAILS');
  console.log('='.repeat(70));

  for (const event of fixSessionEvents) {
    const startIdx = event.stepIndex;
    // Find all steps until 'fix-session-return'
    let endIdx = startIdx + 1;
    while (endIdx < viz.events.length) {
      const e = viz.events[endIdx]!;
      if (e.step.type === 'pause' && e.step.reason === 'fix-session-return') {
        break;
      }
      endIdx++;
    }

    console.log(`\n--- Fix Session at step ${startIdx} ---`);
    console.log(`Buffer before: "${formatBufferWithCaret(event.bufferBefore, event.caretBefore)}"`);

    for (let i = startIdx; i <= Math.min(endIdx, viz.events.length - 1); i++) {
      const e = viz.events[i]!;
      if (e.step.type === 'key' || (e.step.type === 'pause' && e.step.reason.includes('fix'))) {
        console.log(`  [${i}] ${e.action.padEnd(35)} | "${formatBufferWithCaret(e.bufferAfter, e.caretAfter)}"`);
      }
    }

    const afterReturn = viz.events[endIdx];
    if (afterReturn) {
      console.log(`Buffer after:  "${formatBufferWithCaret(afterReturn.bufferAfter, afterReturn.caretAfter)}"`);
    }
  }
  console.log('');
}

// Show corrections (deletion-backtrack)
const correctionEvents = viz.events.filter(
  (e) =>
    e.step.type === 'pause' &&
    (e.step.reason === 'realization' || e.step.reason === 'forced-realization' || e.step.reason === 'end-correction'),
);

if (correctionEvents.length > 0) {
  console.log('='.repeat(70));
  console.log('DELETION-BACKTRACK CORRECTIONS');
  console.log('='.repeat(70));

  for (const event of correctionEvents) {
    console.log(`\n--- Correction at step ${event.stepIndex} (${event.step.type === 'pause' ? event.step.reason : ''}) ---`);
    console.log(`Buffer: "${formatBufferWithCaret(event.bufferBefore, event.caretBefore)}"`);

    // Show a few steps after the correction
    for (let i = event.stepIndex; i < Math.min(event.stepIndex + 20, viz.events.length); i++) {
      const e = viz.events[i]!;
      if (e.step.type !== 'char' || i < event.stepIndex + 5) {
        console.log(`  [${i}] ${e.action.padEnd(35)} | "${formatBufferWithCaret(e.bufferAfter, e.caretAfter)}"`);
      }
    }
  }
  console.log('');
}

// Full trace if requested
if (showTrace) {
  console.log('='.repeat(70));
  console.log('FULL STEP TRACE');
  console.log('='.repeat(70));
  console.log(createDetailedTrace(viz, maxSteps));
  console.log('');
}

// Final result
console.log('='.repeat(70));
console.log('FINAL RESULT');
console.log('='.repeat(70));
console.log(`Target:  "${plan.normalizedText.replace(/\n/g, '↵')}"`);
console.log(`Result:  "${viz.finalBuffer.replace(/\n/g, '↵')}"`);
console.log(`Match:   ${viz.matches ? 'YES ✓' : 'NO ✗'}`);
console.log(`Steps:   ${viz.events.length}`);
console.log(`Time:    ${plan.estimatedSeconds.toFixed(2)}s`);

if (!viz.matches) {
  process.exit(1);
}
