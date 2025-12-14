/**
 * Debug script for the double-typo over-deletion bug
 *
 * Issue: "started" -> "startted" (double t mistake) -> should fix to "started"
 *        But instead it becomes "stated" (over-deletes the 'r')
 */

import { textAnalysis } from '../src/lib/analysis';
import { createTypingPlanV2, setDebugConfig } from '../src/lib/typing/plannerV2';
import { normalizeTextForTyping } from '../src/lib/textNormalize';
import type { TypingStep } from '../src/lib/typing/types';

// Enable full debug logging
setDebugConfig({
  enabled: true,
  logCharTyping: true,
  logNavigation: true,
  logCorrections: true,
  logFixSessions: true,
  logStateValidation: true,
  validateAfterEveryStep: true,
});

function applyStepsWithTrace(steps: TypingStep[]): { text: string; trace: string[] } {
  const out: string[] = [];
  let caret = 0;
  const trace: string[] = [];

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]!;
    const beforeCaret = caret;
    const beforeBuf = out.join('');

    if (s.type === 'char') {
      out.splice(caret, 0, s.char);
      caret++;
      trace.push(`[${i.toString().padStart(3)}] CHAR '${s.char === '\n' ? '↵' : s.char}'`.padEnd(25) +
        ` | caret: ${beforeCaret} -> ${caret}`.padEnd(18) +
        ` | "${out.join('').replace(/\n/g, '↵')}"`);
      continue;
    }

    if (s.type === 'pause') {
      if (s.reason.includes('reflex') || s.reason.includes('fix') || s.reason.includes('realization') || s.reason.includes('correction')) {
        trace.push(`[${i.toString().padStart(3)}] PAUSE: ${s.reason}`);
      }
      continue;
    }

    if (s.type !== 'key') continue;

    switch (s.key) {
      case 'ENTER':
        out.splice(caret, 0, '\n');
        caret++;
        break;
      case 'BACKSPACE':
        if (caret > 0) {
          const deleted = out[caret - 1];
          out.splice(caret - 1, 1);
          caret--;
          trace.push(`[${i.toString().padStart(3)}] BACKSPACE (del '${deleted}')`.padEnd(25) +
            ` | caret: ${beforeCaret} -> ${caret}`.padEnd(18) +
            ` | "${out.join('').replace(/\n/g, '↵')}"`);
        } else {
          trace.push(`[${i.toString().padStart(3)}] BACKSPACE (no-op at 0)`);
        }
        break;
      case 'LEFT':
        caret = Math.max(0, caret - 1);
        trace.push(`[${i.toString().padStart(3)}] LEFT`.padEnd(25) +
          ` | caret: ${beforeCaret} -> ${caret}`.padEnd(18) +
          ` | "${out.join('').replace(/\n/g, '↵')}"`);
        break;
      case 'RIGHT':
        caret = Math.min(out.length, caret + 1);
        trace.push(`[${i.toString().padStart(3)}] RIGHT`.padEnd(25) +
          ` | caret: ${beforeCaret} -> ${caret}`.padEnd(18) +
          ` | "${out.join('').replace(/\n/g, '↵')}"`);
        break;
      case 'HOME':
      case 'CTRL_HOME':
        caret = 0;
        trace.push(`[${i.toString().padStart(3)}] ${s.key}`.padEnd(25) +
          ` | caret: ${beforeCaret} -> ${caret}`.padEnd(18) +
          ` | "${out.join('').replace(/\n/g, '↵')}"`);
        break;
      case 'END':
      case 'CTRL_END':
        caret = out.length;
        trace.push(`[${i.toString().padStart(3)}] ${s.key}`.padEnd(25) +
          ` | caret: ${beforeCaret} -> ${caret}`.padEnd(18) +
          ` | "${out.join('').replace(/\n/g, '↵')}"`);
        break;
    }
  }
  return { text: out.join(''), trace };
}

// Test text containing "started"
const text = 'The project started successfully.';
const analysis = textAnalysis(text);
const target = normalizeTextForTyping(text);

console.log('='.repeat(80));
console.log('DEBUG: Double Typo Over-Deletion Bug');
console.log('='.repeat(80));
console.log(`Target: "${target}"`);
console.log('');

// Search for seeds that produce a double-t typo in "started" with reflex correction
let foundBug = false;

for (let seed = 1; seed <= 500 && !foundBug; seed++) {
  const plan = createTypingPlanV2(text, {
    speed: 80,
    speedMode: 'constant',
    speedVariance: 0.1,
    mistakeRate: 0.5,  // High mistake rate to trigger errors
    fatigueMode: false,
    analysis,
    seed,
    advanced: {
      dynamicMistakes: false,
      typoNearbyWeight: 0,
      typoRandomWeight: 0,
      typoDoubleWeight: 1.0,  // Force double typos only
      typoSkipWeight: 0,
      reflexRate: 1.0,  // Force immediate correction
      fixSessionsEnabled: false,  // Disable fix sessions to isolate the reflex issue
      synonymReplaceEnabled: false,
    },
  });

  const { text: typed, trace } = applyStepsWithTrace(plan.steps);

  if (typed !== target) {
    console.log(`\nFOUND BUG with seed ${seed}:`);
    console.log(`Expected: "${target}"`);
    console.log(`Got:      "${typed}"`);
    console.log('');
    console.log('Full trace:');
    for (const t of trace) {
      console.log(t);
    }
    foundBug = true;
  }
}

if (!foundBug) {
  console.log('No bugs found with double-typo + reflex correction in 500 seeds.');
  console.log('Trying with mixed typo types...');

  // Try with mixed settings that might trigger the issue
  for (let seed = 1; seed <= 200 && !foundBug; seed++) {
    const plan = createTypingPlanV2(text, {
      speed: 80,
      speedMode: 'constant',
      speedVariance: 0.15,
      mistakeRate: 0.4,
      fatigueMode: false,
      analysis,
      seed,
      advanced: {
        typoDoubleWeight: 0.5,
        typoNearbyWeight: 0.3,
        typoRandomWeight: 0.1,
        typoSkipWeight: 0.1,
        reflexRate: 0.5,
        deletionBacktrackChance: 0.2,
        fixSessionsEnabled: true,
        fixSessionIntervalWords: 3,
      },
    });

    const { text: typed, trace } = applyStepsWithTrace(plan.steps);

    if (typed !== target) {
      console.log(`\nFOUND BUG with seed ${seed} (mixed settings):`);
      console.log(`Expected: "${target}"`);
      console.log(`Got:      "${typed}"`);
      console.log('');
      console.log('Full trace:');
      for (const t of trace) {
        console.log(t);
      }
      foundBug = true;
    }
  }
}

if (!foundBug) {
  console.log('\nNo bugs found. Testing with user-like settings...');

  // Use more realistic settings
  for (let seed = 1; seed <= 300 && !foundBug; seed++) {
    const plan = createTypingPlanV2(text, {
      speed: 80,
      speedMode: 'constant',
      speedVariance: 0.15,
      mistakeRate: 0.35,
      fatigueMode: false,
      analysis,
      seed,
      advanced: {
        dynamicMistakes: true,
        caseSensitiveTypos: true,
        typoNearbyWeight: 0.62,
        typoRandomWeight: 0.1,
        typoDoubleWeight: 0.18,
        typoSkipWeight: 0.1,
        reflexRate: 0.1,
        deletionBacktrackChance: 0.18,
        fixSessionsEnabled: true,
        fixSessionIntervalWords: 8,
        fixSessionMaxFixes: 4,
      },
    });

    const { text: typed, trace } = applyStepsWithTrace(plan.steps);

    if (typed !== target) {
      console.log(`\nFOUND BUG with seed ${seed} (user-like settings):`);
      console.log(`Expected: "${target}"`);
      console.log(`Got:      "${typed}"`);
      console.log('');
      console.log('Full trace:');
      for (const t of trace) {
        console.log(t);
      }
      foundBug = true;
    }
  }
}

if (!foundBug) {
  console.log('\nAll tests passed - no over-deletion bugs found in this text.');
}

console.log('\n' + '='.repeat(80));
console.log('DONE');
console.log('='.repeat(80));
