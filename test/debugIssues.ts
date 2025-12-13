/**
 * Debug script to find the specific issues reported:
 * 1. "friends star" -> del -> "frien" -> "friens" -> no fix
 * 2. "The idea" -> "The kdda" -> fix session -> "The keda" -> "Theikeda"
 */

import { textAnalysis } from '../src/lib/analysis';
import { createTypingPlan } from '../src/lib/typing/planner';
import {
  visualizeTypingPlan,
  createDebugSummary,
  formatBufferWithCaret,
} from '../src/lib/typing/debugVisualizer';

function testAndReport(text: string, seedStart: number, seedEnd: number, mistakeRate: number = 0.5) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Testing: "${text}" (seeds ${seedStart}-${seedEnd}, mistakes=${mistakeRate})`);
  console.log('='.repeat(70));

  const analysis = textAnalysis(text);
  const failures: { seed: number; final: string; details: string }[] = [];

  for (let seed = seedStart; seed <= seedEnd; seed++) {
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
        deletionBacktrackChance: 0.15,
        fixSessionsEnabled: true,
        fixSessionIntervalWords: 2,
        fixSessionMaxFixes: 4,
      },
    });

    const viz = visualizeTypingPlan(plan);

    if (!viz.matches) {
      // Collect details about what went wrong
      const details: string[] = [];

      // Find significant buffer states
      const significantStates: string[] = [];
      let lastBuffer = '';
      for (const e of viz.events) {
        if (e.bufferAfter !== lastBuffer) {
          // Check if this is a major change (not just adding one char)
          const diff = Math.abs(e.bufferAfter.length - lastBuffer.length);
          if (diff > 1 || e.step.type === 'key') {
            significantStates.push(`"${formatBufferWithCaret(e.bufferAfter, e.caretAfter)}"`);
          }
          lastBuffer = e.bufferAfter;
        }
      }

      details.push(`Progression: ${significantStates.slice(-10).join(' -> ')}`);

      failures.push({
        seed,
        final: viz.finalBuffer,
        details: details.join('\n'),
      });
    }
  }

  if (failures.length === 0) {
    console.log(`All ${seedEnd - seedStart + 1} seeds passed!`);
  } else {
    console.log(`FAILURES: ${failures.length}/${seedEnd - seedStart + 1}`);
    for (const f of failures.slice(0, 5)) {
      console.log(`\n--- Seed ${f.seed} ---`);
      console.log(`Target: "${text}"`);
      console.log(`Got:    "${f.final}"`);
      console.log(f.details);
    }
    if (failures.length > 5) {
      console.log(`\n... and ${failures.length - 5} more failures`);
    }
  }

  return failures;
}

// Test the specific phrases mentioned
console.log('\n' + '='.repeat(70));
console.log('SEARCHING FOR REPORTED ISSUES');
console.log('='.repeat(70));

// Test various phrases that might trigger the issues
const testPhrases = [
  'friends star',
  'friends start',
  'The idea',
  'the idea is',
  'friends starting today',
  'idea for friends',
];

let allFailures: { text: string; seed: number; final: string }[] = [];

for (const phrase of testPhrases) {
  const failures = testAndReport(phrase, 1, 100, 0.5);
  for (const f of failures) {
    allFailures.push({ text: phrase, seed: f.seed, final: f.final });
  }
}

// If we found failures, show detailed debug for one of them
if (allFailures.length > 0) {
  console.log('\n' + '='.repeat(70));
  console.log('DETAILED DEBUG OF FIRST FAILURE');
  console.log('='.repeat(70));

  const first = allFailures[0]!;
  const analysis = textAnalysis(first.text);
  const plan = createTypingPlan(first.text, {
    speed: 80,
    speedMode: 'constant',
    speedVariance: 0.15,
    mistakeRate: 0.5,
    fatigueMode: false,
    analysis,
    seed: first.seed,
    advanced: {
      reflexRate: 0.1,
      deletionBacktrackChance: 0.15,
      fixSessionsEnabled: true,
      fixSessionIntervalWords: 2,
      fixSessionMaxFixes: 4,
    },
  });

  const viz = visualizeTypingPlan(plan);
  console.log(createDebugSummary(viz));

  console.log('\n--- Full trace ---');
  for (const e of viz.events) {
    const stepInfo = e.step.type === 'pause'
      ? `Pause(${(e.step as any).reason})`
      : e.step.type === 'key'
        ? `Key(${(e.step as any).key})`
        : `Char('${(e.step as any).char}')`;
    console.log(`[${e.stepIndex.toString().padStart(3)}] ${stepInfo.padEnd(25)} | "${formatBufferWithCaret(e.bufferAfter, e.caretAfter)}"`);
  }
} else {
  console.log('\n' + '='.repeat(70));
  console.log('No failures found in tested phrases!');
  console.log('The issues might require specific conditions to reproduce.');
  console.log('='.repeat(70));
}
