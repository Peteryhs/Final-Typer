/**
 * Debug script to test fix sessions alignment.
 * Run with: npx tsx test/debugFixSessions.ts
 */

import { textAnalysis } from '../src/lib/analysis';
import { createTypingPlan } from '../src/lib/typing/planner';
import { visualizeTypingPlan, createDebugSummary, createDetailedTrace } from '../src/lib/typing/debugVisualizer';

// Test case: text that tends to generate fix session errors
const testTexts = [
  'Hello world this is a test.',
  'The quick brown fox jumps over the lazy dog.',
  'to be or not to be',
  'focus on the task at hand',
  'covered in snow the mountains rise',
  'workshop for beginners starts today',
];

console.log('=== Fix Sessions Debug Test ===\n');

let allPassed = true;

for (const text of testTexts) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: "${text}"`);
  console.log('='.repeat(60));

  const analysis = textAnalysis(text);

  // Run multiple seeds to catch intermittent issues
  for (let seed = 1; seed <= 10; seed++) {
    const plan = createTypingPlan(text, {
      speed: 80,
      speedMode: 'constant',
      speedVariance: 0.1,
      mistakeRate: 0.5, // High mistake rate to trigger fix sessions
      fatigueMode: false,
      analysis,
      seed,
      advanced: {
        dynamicMistakes: false,
        reflexRate: 0, // Disable reflex corrections to force fix sessions
        deletionBacktrackChance: 0, // Disable deletion backtrack to force fix sessions
        fixSessionsEnabled: true,
        fixSessionIntervalWords: 2,
        fixSessionMaxFixes: 5,
        typoNearbyWeight: 0.8,
        typoRandomWeight: 0.2,
        typoDoubleWeight: 0,
        typoSkipWeight: 0,
      },
    });

    const viz = visualizeTypingPlan(plan);

    if (!viz.matches) {
      allPassed = false;
      console.log(`\n[FAIL] Seed ${seed}:`);
      console.log(createDebugSummary(viz));
      console.log('\n--- Detailed trace (last 50 steps) ---');
      // Show last 50 steps when there's a failure
      const lastEvents = viz.events.slice(-50);
      for (const event of lastEvents) {
        if (event.step.type !== 'pause' || event.step.reason.includes('fix')) {
          console.log(
            `[${event.stepIndex}] ${event.action.padEnd(45)} | "${viz.events[viz.events.length - 1]?.bufferAfter?.slice(0, 60) ?? ''}"`,
          );
        }
      }
      console.log(createDetailedTrace({ ...viz, events: lastEvents }));
    } else {
      // Count fix sessions
      const fixSessionCount = viz.events.filter(
        (e) => e.step.type === 'pause' && e.step.reason === 'fix-session',
      ).length;
      if (fixSessionCount > 0) {
        console.log(`[OK] Seed ${seed}: ${fixSessionCount} fix session(s), result matches target`);
      }
    }
  }
}

console.log('\n' + '='.repeat(60));
if (allPassed) {
  console.log('All tests passed!');
} else {
  console.log('Some tests FAILED - see above for details');
  process.exit(1);
}
