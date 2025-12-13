import * as assert from 'node:assert/strict';
import { textAnalysis } from '../src/lib/analysis';
import { createTypingPlan } from '../src/lib/typing/planner';
import { normalizeTextForTyping } from '../src/lib/textNormalize';

function applySteps(steps: Array<{ type: string; char?: string; key?: string }>): string {
  const out: string[] = [];
  let caret = 0;
  for (const s of steps) {
    if (s.type === 'char') {
      out.splice(caret, 0, s.char ?? '');
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
    // eslint-disable-next-line no-console
    console.log(`ok - ${name}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`not ok - ${name}`);
    throw err;
  }
}

run('plan always converges to the normalized target text', () => {
  const text = "Hello World.\nQuick test!";
  const analysis = textAnalysis(text);
  const plan = createTypingPlan(text, {
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

  const typed = applySteps(plan.steps as any);
  assert.equal(typed, normalizeTextForTyping(text));
});

run('caseSensitiveTypos makes letter typos match capitalization', () => {
  const text = 'Hello';
  const analysis = textAnalysis(text);
  const target = normalizeTextForTyping(text);
  let found = false;

  for (let seed = 1; seed <= 50; seed++) {
    const plan = createTypingPlan(text, {
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

    const firstCharStep = plan.steps.find((s) => s.type === 'char') as any;
    assert.ok(firstCharStep && firstCharStep.type === 'char');

    if (firstCharStep.char === target[0]) continue;
    found = true;
    assert.match(firstCharStep.char, /^[A-Z]$/, 'expected the typo to be uppercase');
    break;
  }

  assert.ok(found, 'failed to find a deterministic seed that produces an initial substitution typo');
});

run('synonymReplace (live) introduces backspaces but ends correct', () => {
  const text = 'Quick fox.';
  const analysis = textAnalysis(text);
  const plan = createTypingPlan(text, {
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

  const typed = applySteps(plan.steps as any);
  assert.equal(typed, normalizeTextForTyping(text));

  const backspaces = plan.steps.filter((s) => s.type === 'key' && (s as any).key === 'BACKSPACE').length;
  assert.ok(backspaces > 0, 'expected synonym live correction to use backspaces');
});

run('delayed mistakes trigger backtrack correction and still end correct', () => {
  const text = 'Typing.';
  const analysis = textAnalysis(text);
  const plan = createTypingPlan(text, {
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

  const typed = applySteps(plan.steps as any);
  assert.equal(typed, normalizeTextForTyping(text));

  const backspaces = plan.steps.filter((s) => s.type === 'key' && (s as any).key === 'BACKSPACE').length;
  assert.ok(backspaces > 0, 'expected backtrack correction to use backspaces');
});

run('fix sessions revisit past substitution mistakes (caret movement) and end correct', () => {
  const text = 'Hello world this is a longer sentence for review.';
  const analysis = textAnalysis(text);
  const plan = createTypingPlan(text, {
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

  const typed = applySteps(plan.steps as any);
  assert.equal(typed, normalizeTextForTyping(text));

  const moved = plan.steps.some((s) => s.type === 'key' && ((s as any).key === 'LEFT' || (s as any).key === 'RIGHT'));
  assert.ok(moved, 'expected fix sessions to move the caret');

  const hasFixSessionPause = plan.steps.some((s) => s.type === 'pause' && (s as any).reason === 'fix-session');
  assert.ok(hasFixSessionPause, 'expected a fix-session pause');
});

run('synonymReplace (backtrack) triggers a later correction', () => {
  const text = 'Quick brown fox jumps.';
  const analysis = textAnalysis(text);
  const plan = createTypingPlan(text, {
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

  const typed = applySteps(plan.steps as any);
  assert.equal(typed, normalizeTextForTyping(text));

  const hasSynonymCorrectionPause = plan.steps.some((s) => s.type === 'pause' && (s as any).reason === 'synonym-realization');
  assert.ok(hasSynonymCorrectionPause, 'expected a synonym backtrack correction pause to occur');
});

run('estimatedSeconds equals the sum of step timings', () => {
  const text = 'Estimating time should be consistent.';
  const analysis = textAnalysis(text);
  const plan = createTypingPlan(text, {
    speed: 75,
    speedMode: 'dynamic',
    speedVariance: 0.3,
    mistakeRate: 0.15,
    fatigueMode: true,
    analysis,
    seed: 2025,
  });

  const summed = plan.steps.reduce((sum, s) => {
    if (s.type === 'pause') return sum + (s as any).seconds;
    return sum + (s as any).delayAfterSeconds;
  }, 0);

  assert.ok(Math.abs(plan.estimatedSeconds - summed) < 1e-9);
});
