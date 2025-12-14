/**
 * Focused debug for "started" -> "stated" over-deletion bug
 *
 * The user reports:
 * - Typing "started"
 * - Double-t typo makes it "startted"
 * - Correction over-deletes, making "stated" instead of "started"
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

function applyStepsWithFullTrace(steps: TypingStep[]): { text: string; trace: string[] } {
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
      trace.push(`[${i.toString().padStart(3)}] CHAR '${s.char}'`.padEnd(22) +
        `| caret: ${beforeCaret}->${caret}`.padEnd(15) +
        `| "${out.join('')}"`);
      continue;
    }

    if (s.type === 'pause') {
      trace.push(`[${i.toString().padStart(3)}] PAUSE: ${s.reason}`);
      continue;
    }

    if (s.type !== 'key') continue;

    switch (s.key) {
      case 'ENTER':
        out.splice(caret, 0, '\n');
        caret++;
        trace.push(`[${i.toString().padStart(3)}] ENTER`.padEnd(22) +
          `| caret: ${beforeCaret}->${caret}`.padEnd(15) +
          `| "${out.join('').replace(/\n/g, '↵')}"`);
        break;
      case 'BACKSPACE':
        if (caret > 0) {
          const deleted = out[caret - 1];
          out.splice(caret - 1, 1);
          caret--;
          trace.push(`[${i.toString().padStart(3)}] BKSP (del '${deleted}')`.padEnd(22) +
            `| caret: ${beforeCaret}->${caret}`.padEnd(15) +
            `| "${out.join('')}"`);
        } else {
          trace.push(`[${i.toString().padStart(3)}] BKSP (NO-OP!)`.padEnd(22) +
            `| caret: ${beforeCaret}->${caret}`.padEnd(15) +
            `| "${out.join('')}"`);
        }
        break;
      case 'LEFT':
        caret = Math.max(0, caret - 1);
        trace.push(`[${i.toString().padStart(3)}] LEFT`.padEnd(22) +
          `| caret: ${beforeCaret}->${caret}`.padEnd(15) +
          `| (nav only)`);
        break;
      case 'RIGHT':
        caret = Math.min(out.length, caret + 1);
        trace.push(`[${i.toString().padStart(3)}] RIGHT`.padEnd(22) +
          `| caret: ${beforeCaret}->${caret}`.padEnd(15) +
          `| (nav only)`);
        break;
      case 'HOME':
      case 'CTRL_HOME':
        caret = 0;
        trace.push(`[${i.toString().padStart(3)}] ${s.key}`.padEnd(22) +
          `| caret: ${beforeCaret}->${caret}`.padEnd(15) +
          `| (nav only)`);
        break;
      case 'END':
      case 'CTRL_END':
        caret = out.length;
        trace.push(`[${i.toString().padStart(3)}] ${s.key}`.padEnd(22) +
          `| caret: ${beforeCaret}->${caret}`.padEnd(15) +
          `| (nav only)`);
        break;
    }
  }
  return { text: out.join(''), trace };
}

// Simple test with just "started"
const simpleText = 'typing started here';
const analysis = textAnalysis(simpleText);
const target = normalizeTextForTyping(simpleText);

console.log('='.repeat(80));
console.log('DEBUG: "started" -> "stated" Over-Deletion Bug');
console.log('='.repeat(80));
console.log(`Target: "${target}"`);
console.log('');

// Test different mistake/correction combinations
const testCases = [
  { name: 'Double typo + reflex (100%)', typoDouble: 1.0, typoNearby: 0, reflex: 1.0, deletion: 0, fixSession: false },
  { name: 'Double typo + delayed deletion', typoDouble: 1.0, typoNearby: 0, reflex: 0, deletion: 1.0, fixSession: false },
  { name: 'Double typo + fix session', typoDouble: 1.0, typoNearby: 0, reflex: 0, deletion: 0, fixSession: true },
  { name: 'Mixed typos + mixed corrections', typoDouble: 0.3, typoNearby: 0.5, reflex: 0.3, deletion: 0.3, fixSession: true },
];

for (const tc of testCases) {
  console.log(`\n${'─'.repeat(80)}`);
  console.log(`TEST: ${tc.name}`);
  console.log('─'.repeat(80));

  let failures = 0;
  let failureSeeds: number[] = [];

  for (let seed = 1; seed <= 100; seed++) {
    // Suppress planner logs during bulk search
    setDebugConfig({ enabled: false });

    const plan = createTypingPlanV2(simpleText, {
      speed: 80,
      speedMode: 'constant',
      speedVariance: 0.1,
      mistakeRate: 0.5,
      fatigueMode: false,
      analysis,
      seed,
      advanced: {
        dynamicMistakes: false,
        typoNearbyWeight: tc.typoNearby,
        typoRandomWeight: 0,
        typoDoubleWeight: tc.typoDouble,
        typoSkipWeight: 0,
        reflexRate: tc.reflex,
        deletionBacktrackChance: tc.deletion,
        fixSessionsEnabled: tc.fixSession,
        fixSessionIntervalWords: 2,
        synonymReplaceEnabled: false,
      },
    });

    const { text: typed } = applyStepsWithFullTrace(plan.steps);

    if (typed !== target) {
      failures++;
      if (failureSeeds.length < 3) {
        failureSeeds.push(seed);
      }
    }
  }

  if (failures > 0) {
    console.log(`FAILURES: ${failures}/100 seeds failed`);

    // Re-run first failing seed with full logging
    if (failureSeeds.length > 0) {
      const failSeed = failureSeeds[0]!;
      console.log(`\nDetailed trace for seed ${failSeed}:`);

      setDebugConfig({
        enabled: true,
        logCharTyping: true,
        logNavigation: true,
        logCorrections: true,
        logFixSessions: true,
        logStateValidation: true,
      });

      const plan = createTypingPlanV2(simpleText, {
        speed: 80,
        speedMode: 'constant',
        speedVariance: 0.1,
        mistakeRate: 0.5,
        fatigueMode: false,
        analysis,
        seed: failSeed,
        advanced: {
          dynamicMistakes: false,
          typoNearbyWeight: tc.typoNearby,
          typoRandomWeight: 0,
          typoDoubleWeight: tc.typoDouble,
          typoSkipWeight: 0,
          reflexRate: tc.reflex,
          deletionBacktrackChance: tc.deletion,
          fixSessionsEnabled: tc.fixSession,
          fixSessionIntervalWords: 2,
          synonymReplaceEnabled: false,
        },
      });

      setDebugConfig({ enabled: false });

      const { text: typed, trace } = applyStepsWithFullTrace(plan.steps);
      console.log(`\nTarget: "${target}"`);
      console.log(`Got:    "${typed}"`);
      console.log('\nStep-by-step:');
      for (const t of trace) {
        console.log(t);
      }
    }
  } else {
    console.log('All 100 seeds passed');
  }
}

console.log('\n' + '='.repeat(80));
console.log('DONE');
console.log('='.repeat(80));
