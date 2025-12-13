/**
 * More aggressive test to find edge cases
 */

import { textAnalysis } from '../src/lib/analysis';
import { createTypingPlan } from '../src/lib/typing/planner';
import {
  visualizeTypingPlan,
  formatBufferWithCaret,
} from '../src/lib/typing/debugVisualizer';

const testPhrases = [
  'friends star',
  'friends start',
  'The idea',
  'the idea is',
  'friends starting today',
  'to be or not to be',
  'focus on the task',
  'covered in snow',
  'workshop for beginners',
  'Hello world this is a test sentence with many words to type.',
];

console.log('Testing with aggressive settings (high mistakes, many seeds)...\n');

let totalTests = 0;
let totalFailures = 0;
const failureDetails: { text: string; seed: number; mistakeRate: number; final: string; target: string }[] = [];

for (const text of testPhrases) {
  const analysis = textAnalysis(text);

  // Try multiple mistake rates
  for (const mistakeRate of [0.4, 0.6, 0.8]) {
    // Try many seeds
    for (let seed = 1; seed <= 200; seed++) {
      totalTests++;

      const plan = createTypingPlan(text, {
        speed: 80,
        speedMode: 'constant',
        speedVariance: 0.2,
        mistakeRate,
        fatigueMode: false,
        analysis,
        seed,
        advanced: {
          dynamicMistakes: true,
          reflexRate: 0.05, // Low reflex to let errors accumulate
          deletionBacktrackChance: 0.1,
          fixSessionsEnabled: true,
          fixSessionIntervalWords: 2,
          fixSessionMaxFixes: 5,
          typoNearbyWeight: 0.5,
          typoRandomWeight: 0.2,
          typoDoubleWeight: 0.15,
          typoSkipWeight: 0.15,
        },
      });

      const viz = visualizeTypingPlan(plan);

      if (!viz.matches) {
        totalFailures++;
        if (failureDetails.length < 10) {
          failureDetails.push({
            text,
            seed,
            mistakeRate,
            final: viz.finalBuffer,
            target: viz.targetText,
          });
        }
      }
    }
  }
}

console.log(`Total tests: ${totalTests}`);
console.log(`Total failures: ${totalFailures}`);
console.log(`Failure rate: ${((totalFailures / totalTests) * 100).toFixed(2)}%`);

if (failureDetails.length > 0) {
  console.log('\n' + '='.repeat(70));
  console.log('FAILURE DETAILS');
  console.log('='.repeat(70));

  for (const f of failureDetails) {
    console.log(`\nText: "${f.text}" | Seed: ${f.seed} | Mistakes: ${f.mistakeRate}`);
    console.log(`Target: "${f.target}"`);
    console.log(`Got:    "${f.final}"`);

    // Show detailed trace for this failure
    const analysis = textAnalysis(f.text);
    const plan = createTypingPlan(f.text, {
      speed: 80,
      speedMode: 'constant',
      speedVariance: 0.2,
      mistakeRate: f.mistakeRate,
      fatigueMode: false,
      analysis,
      seed: f.seed,
      advanced: {
        dynamicMistakes: true,
        reflexRate: 0.05,
        deletionBacktrackChance: 0.1,
        fixSessionsEnabled: true,
        fixSessionIntervalWords: 2,
        fixSessionMaxFixes: 5,
        typoNearbyWeight: 0.5,
        typoRandomWeight: 0.2,
        typoDoubleWeight: 0.15,
        typoSkipWeight: 0.15,
      },
    });

    const viz = visualizeTypingPlan(plan);

    // Show key events
    console.log('Key events:');
    for (const e of viz.events) {
      if (
        e.step.type === 'pause' ||
        (e.step.type === 'key' && ['BACKSPACE', 'LEFT', 'RIGHT'].includes((e.step as any).key))
      ) {
        const stepInfo = e.step.type === 'pause'
          ? `Pause(${(e.step as any).reason})`
          : `Key(${(e.step as any).key})`;
        console.log(`  [${e.stepIndex}] ${stepInfo.padEnd(30)} | "${formatBufferWithCaret(e.bufferAfter, e.caretAfter)}"`);
      }
    }
  }
} else {
  console.log('\nNo failures found! The algorithm appears stable.');
}
