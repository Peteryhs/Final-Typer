/**
 * Test suite for Planner V2
 * Verifies that the new planner produces correct output in all scenarios
 */

import * as assert from 'node:assert/strict';
import { textAnalysis } from '../src/lib/analysis';
import { createTypingPlanV2, setDebugConfig } from '../src/lib/typing/plannerV2';
import { normalizeTextForTyping } from '../src/lib/textNormalize';
import type { TypingPlan, TypingStep } from '../src/lib/typing/types';

// Disable verbose logging during tests (enable for debugging)
setDebugConfig({
  enabled: false,
  logCharTyping: false,
  logNavigation: false,
  logCorrections: false,
  logFixSessions: false,
  logStateValidation: false,
  validateAfterEveryStep: true,
});

function applySteps(steps: TypingStep[]): string {
  const out: string[] = [];
  let caret = 0;
  for (const s of steps) {
    if (s.type === 'char') {
      out.splice(caret, 0, s.char);
      caret++;
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
          out.splice(caret - 1, 1);
          caret--;
        }
        break;
      case 'LEFT':
        caret = Math.max(0, caret - 1);
        break;
      case 'RIGHT':
        caret = Math.min(out.length, caret + 1);
        break;
      case 'HOME':
      case 'CTRL_HOME':
        caret = 0;
        break;
      case 'END':
      case 'CTRL_END':
        caret = out.length;
        break;
    }
  }
  return out.join('');
}

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`\x1b[32mok\x1b[0m - ${name}`);
  } catch (err) {
    console.error(`\x1b[31mnot ok\x1b[0m - ${name}`);
    throw err;
  }
}

// ============================================================================
// Basic Tests
// ============================================================================

run('V2: plan always converges to the normalized target text', () => {
  const text = "Hello World.\nQuick test!";
  const analysis = textAnalysis(text);
  const plan = createTypingPlanV2(text, {
    speed: 70,
    speedMode: 'constant',
    speedVariance: 0.25,
    mistakeRate: 0.35,
    fatigueMode: true,
    analysis,
    seed: 12345,
    advanced: {
      reflexRate: 0.0,
      realizationBaseChance: 0.02,
      realizationSensitivity: 0.08,
      realizationMinDelayChars: 1,
      realizationMaxDelayChars: 10,
      synonymReplaceEnabled: false,
    },
  });

  const typed = applySteps(plan.steps);
  assert.equal(typed, normalizeTextForTyping(text));
});

run('V2: caseSensitiveTypos makes letter typos match capitalization', () => {
  const text = 'Hello';
  const analysis = textAnalysis(text);
  const target = normalizeTextForTyping(text);
  let found = false;

  for (let seed = 1; seed <= 50; seed++) {
    const plan = createTypingPlanV2(text, {
      speed: 80,
      speedMode: 'constant',
      speedVariance: 0,
      mistakeRate: 1,
      fatigueMode: false,
      analysis,
      seed,
      advanced: {
        dynamicMistakes: false,
        caseSensitiveTypos: true,
        typoNearbyWeight: 1,
        typoRandomWeight: 0,
        typoDoubleWeight: 0,
        typoSkipWeight: 0,
        reflexRate: 0,
        realizationBaseChance: 0,
        realizationSensitivity: 0,
        realizationMinDelayChars: 999,
        realizationMaxDelayChars: 999,
        synonymReplaceEnabled: false,
      },
    });

    const firstCharStep = plan.steps.find((s) => s.type === 'char') as { type: 'char'; char: string };
    assert.ok(firstCharStep && firstCharStep.type === 'char');

    if (firstCharStep.char === target[0]) continue;
    found = true;
    assert.match(firstCharStep.char, /^[A-Z]$/, 'expected the typo to be uppercase');
    break;
  }

  assert.ok(found, 'failed to find a deterministic seed that produces an initial substitution typo');
});

run('V2: synonymReplace (live) introduces backspaces but ends correct', () => {
  const text = 'Quick fox.';
  const analysis = textAnalysis(text);
  const plan = createTypingPlanV2(text, {
    speed: 90,
    speedMode: 'constant',
    speedVariance: 0.2,
    mistakeRate: 0,
    fatigueMode: false,
    analysis,
    seed: 42,
    advanced: {
      synonymReplaceEnabled: true,
      synonymReplaceChance: 1,
      synonymCorrectionMode: 'live',
    },
  });

  const typed = applySteps(plan.steps);
  assert.equal(typed, normalizeTextForTyping(text));

  const backspaces = plan.steps.filter((s) => s.type === 'key' && s.key === 'BACKSPACE').length;
  assert.ok(backspaces > 0, 'expected synonym live correction to use backspaces');
});

run('V2: delayed mistakes trigger backtrack correction and still end correct', () => {
  const text = 'Typing.';
  const analysis = textAnalysis(text);
  const plan = createTypingPlanV2(text, {
    speed: 80,
    speedMode: 'constant',
    speedVariance: 0.1,
    mistakeRate: 0.8,
    fatigueMode: false,
    analysis,
    seed: 7,
    advanced: {
      reflexRate: 0,
      realizationBaseChance: 1,
      realizationSensitivity: 0,
      realizationMinDelayChars: 1,
      realizationMaxDelayChars: 2,
      synonymReplaceEnabled: false,
    },
  });

  const typed = applySteps(plan.steps);
  assert.equal(typed, normalizeTextForTyping(text));

  const backspaces = plan.steps.filter((s) => s.type === 'key' && s.key === 'BACKSPACE').length;
  assert.ok(backspaces > 0, 'expected backtrack correction to use backspaces');
});

run('V2: fix sessions revisit past substitution mistakes (caret movement) and end correct', () => {
  const text = 'Hello world this is a longer sentence for review.';
  const analysis = textAnalysis(text);
  const plan = createTypingPlanV2(text, {
    speed: 80,
    speedMode: 'constant',
    speedVariance: 0.05,
    mistakeRate: 0.5,
    fatigueMode: false,
    analysis,
    seed: 31415,
    advanced: {
      dynamicMistakes: false,
      reflexRate: 0,
      typoNearbyWeight: 0.8,
      typoRandomWeight: 0.2,
      typoDoubleWeight: 0,
      typoSkipWeight: 0,
      deletionBacktrackChance: 0,
      fixSessionsEnabled: true,
      fixSessionIntervalWords: 2,
      fixSessionMaxFixes: 3,
    },
  });

  const typed = applySteps(plan.steps);
  assert.equal(typed, normalizeTextForTyping(text));

  const moved = plan.steps.some((s) => s.type === 'key' && (s.key === 'LEFT' || s.key === 'RIGHT'));
  assert.ok(moved, 'expected fix sessions to move the caret');

  const hasFixSessionPause = plan.steps.some((s) => s.type === 'pause' && s.reason === 'fix-session');
  assert.ok(hasFixSessionPause, 'expected a fix-session pause');
});

run('V2: synonymReplace (backtrack) triggers a later correction', () => {
  const text = 'Quick brown fox jumps.';
  const analysis = textAnalysis(text);
  const plan = createTypingPlanV2(text, {
    speed: 85,
    speedMode: 'constant',
    speedVariance: 0.1,
    mistakeRate: 0,
    fatigueMode: false,
    analysis,
    seed: 99,
    advanced: {
      synonymReplaceEnabled: true,
      synonymReplaceChance: 1,
      synonymCorrectionMode: 'backtrack',
      synonymBacktrackMinWords: 1,
      synonymBacktrackMaxWords: 1,
    },
  });

  const typed = applySteps(plan.steps);
  assert.equal(typed, normalizeTextForTyping(text));

  const hasSynonymCorrectionPause = plan.steps.some((s) => s.type === 'pause' && s.reason === 'synonym-realization');
  assert.ok(hasSynonymCorrectionPause, 'expected a synonym backtrack correction pause to occur');
});

run('V2: estimatedSeconds equals the sum of step timings', () => {
  const text = 'Estimating time should be consistent.';
  const analysis = textAnalysis(text);
  const plan = createTypingPlanV2(text, {
    speed: 75,
    speedMode: 'dynamic',
    speedVariance: 0.3,
    mistakeRate: 0.15,
    fatigueMode: true,
    analysis,
    seed: 2025,
  });

  const summed = plan.steps.reduce((sum, s) => {
    if (s.type === 'pause') return sum + s.seconds;
    return sum + s.delayAfterSeconds;
  }, 0);

  assert.ok(Math.abs(plan.estimatedSeconds - summed) < 1e-9);
});

// ============================================================================
// Stress Tests - High Mistake Rates
// ============================================================================

run('V2: converges with high mistake rate (50%)', () => {
  const text = 'The quick brown fox jumps over the lazy dog.';
  const analysis = textAnalysis(text);

  for (let seed = 1; seed <= 20; seed++) {
    const plan = createTypingPlanV2(text, {
      speed: 80,
      speedMode: 'constant',
      speedVariance: 0.2,
      mistakeRate: 0.5,
      fatigueMode: false,
      analysis,
      seed,
      advanced: {
        fixSessionsEnabled: true,
        fixSessionIntervalWords: 4,
      },
    });

    const typed = applySteps(plan.steps);
    assert.equal(typed, normalizeTextForTyping(text), `Failed with seed ${seed}`);
  }
});

run('V2: converges with very high mistake rate (70%)', () => {
  const text = 'Testing high error rate.';
  const analysis = textAnalysis(text);

  for (let seed = 1; seed <= 30; seed++) {
    const plan = createTypingPlanV2(text, {
      speed: 60,
      speedMode: 'constant',
      speedVariance: 0.1,
      mistakeRate: 0.7,
      fatigueMode: false,
      analysis,
      seed,
      advanced: {
        reflexRate: 0.2,
        deletionBacktrackChance: 0.3,
        fixSessionsEnabled: true,
        fixSessionIntervalWords: 2,
      },
    });

    const typed = applySteps(plan.steps);
    assert.equal(typed, normalizeTextForTyping(text), `Failed with seed ${seed}`);
  }
});

// ============================================================================
// User Issue Reproduction Test
// ============================================================================

run('V2: handles the "teacher" bug case correctly', () => {
  const text = 'My computer engineering teacher, Mr. Henrich, saw my unbounded enthusiasm and helped my friend and I';
  const analysis = textAnalysis(text);

  const userConfig = {
    keystrokesPerWord: 5,
    lognormalSigma: 0.14,
    dynamicMistakes: true,
    caseSensitiveTypos: true,
    typoNearbyWeight: 0.62,
    typoRandomWeight: 0.1,
    typoDoubleWeight: 0.18,
    typoSkipWeight: 0.1,
    typoClusteringEnabled: true,
    typoClusteringMultiplier: 1.6,
    typoClusteringDecayChars: 5,
    reflexRate: 0.1,
    deletionBacktrackChance: 0.18,
    fixSessionsEnabled: true,
    fixSessionIntervalWords: 18,
    fixSessionMaxFixes: 4,
    synonymReplaceEnabled: true,
    synonymReplaceChance: 0.06,
  };

  let failures = 0;
  const SEED_RANGE = 200;

  for (let seed = 1; seed <= SEED_RANGE; seed++) {
    const plan = createTypingPlanV2(text, {
      speed: 80,
      speedMode: 'constant',
      speedVariance: 0.15,
      mistakeRate: 0.4,
      fatigueMode: false,
      analysis,
      seed,
      advanced: userConfig,
    });

    const typed = applySteps(plan.steps);
    if (typed !== normalizeTextForTyping(text)) {
      failures++;
    }
  }

  assert.equal(failures, 0, `${failures} out of ${SEED_RANGE} seeds failed`);
});

// ============================================================================
// Edge Case Tests
// ============================================================================

run('V2: handles empty text', () => {
  const text = '';
  const analysis = textAnalysis(text);
  const plan = createTypingPlanV2(text, {
    speed: 80,
    speedMode: 'constant',
    speedVariance: 0.1,
    mistakeRate: 0.3,
    fatigueMode: false,
    analysis,
    seed: 1,
  });

  const typed = applySteps(plan.steps);
  assert.equal(typed, '');
});

run('V2: handles single character', () => {
  const text = 'a';
  const analysis = textAnalysis(text);
  const plan = createTypingPlanV2(text, {
    speed: 80,
    speedMode: 'constant',
    speedVariance: 0.1,
    mistakeRate: 0.5,
    fatigueMode: false,
    analysis,
    seed: 1,
  });

  const typed = applySteps(plan.steps);
  assert.equal(typed, normalizeTextForTyping(text));
});

run('V2: handles newlines correctly', () => {
  const text = 'Line one.\nLine two.\nLine three.';
  const analysis = textAnalysis(text);

  for (let seed = 1; seed <= 10; seed++) {
    const plan = createTypingPlanV2(text, {
      speed: 80,
      speedMode: 'constant',
      speedVariance: 0.2,
      mistakeRate: 0.4,
      fatigueMode: false,
      analysis,
      seed,
    });

    const typed = applySteps(plan.steps);
    assert.equal(typed, normalizeTextForTyping(text), `Failed with seed ${seed}`);
  }
});

run('V2: handles special characters', () => {
  const text = 'Hello! @user #tag $100 %off ^caret &ampersand *star (parens) [brackets] {braces}';
  const analysis = textAnalysis(text);

  for (let seed = 1; seed <= 10; seed++) {
    const plan = createTypingPlanV2(text, {
      speed: 60,
      speedMode: 'constant',
      speedVariance: 0.1,
      mistakeRate: 0.3,
      fatigueMode: false,
      analysis,
      seed,
    });

    const typed = applySteps(plan.steps);
    assert.equal(typed, normalizeTextForTyping(text), `Failed with seed ${seed}`);
  }
});

// ============================================================================
// Summary
// ============================================================================

console.log('\n' + '='.repeat(60));
console.log('All V2 planner tests passed!');
console.log('='.repeat(60));
