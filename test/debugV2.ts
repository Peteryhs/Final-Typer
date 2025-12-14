/**
 * Debug script for V2 planner fix session issue
 */

import { textAnalysis } from '../src/lib/analysis';
import { createTypingPlanV2, setDebugConfig } from '../src/lib/typing/plannerV2';
import { normalizeTextForTyping } from '../src/lib/textNormalize';
import type { TypingStep } from '../src/lib/typing/types';

// Enable debug logging
setDebugConfig({
  enabled: true,
  logCharTyping: false,
  logNavigation: true,
  logCorrections: true,
  logFixSessions: true,
  logStateValidation: true,
  validateAfterEveryStep: true,
});

function applySteps(steps: TypingStep[]): { text: string; trace: string[] } {
  const out: string[] = [];
  let caret = 0;
  const trace: string[] = [];

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]!;

    if (s.type === 'char') {
      out.splice(caret, 0, s.char);
      caret++;
      // trace.push(`[${i}] CHAR '${s.char === '\n' ? '↵' : s.char}' -> caret=${caret}, buf="${out.join('').slice(0, 50)}"`);
      continue;
    }
    if (s.type === 'pause') {
      if (s.reason.includes('fix') || s.reason.includes('correction') || s.reason.includes('realization')) {
        trace.push(`[${i}] PAUSE: ${s.reason}`);
      }
      continue;
    }
    if (s.type !== 'key') continue;

    const beforeCaret = caret;
    const beforeLen = out.length;
    const beforeBuf = out.join('');

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

    if (['BACKSPACE', 'LEFT', 'RIGHT', 'CTRL_END', 'CTRL_HOME', 'HOME', 'END'].includes(s.key)) {
      const afterBuf = out.join('');
      trace.push(`[${i}] ${s.key.padEnd(12)} caret: ${beforeCaret} -> ${caret}, len: ${beforeLen} -> ${out.length}`);
      if (beforeBuf !== afterBuf) {
        trace.push(`    Buffer changed: "${beforeBuf.slice(0, 40)}" -> "${afterBuf.slice(0, 40)}"`);
      }
    }
  }
  return { text: out.join(''), trace };
}

const text = 'Hello world this is a longer sentence for review.';
const analysis = textAnalysis(text);
const target = normalizeTextForTyping(text);

console.log('='.repeat(80));
console.log('DEBUG: V2 Fix Session Issue');
console.log('='.repeat(80));
console.log(`Target: "${target}"`);
console.log('');

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

console.log('');
console.log('='.repeat(80));
console.log('APPLYING STEPS');
console.log('='.repeat(80));

const { text: typed, trace } = applySteps(plan.steps);

console.log('');
console.log('Key operations:');
for (const t of trace) {
  console.log(t);
}

console.log('');
console.log('='.repeat(80));
console.log('RESULT');
console.log('='.repeat(80));
console.log(`Target:  "${target}"`);
console.log(`Got:     "${typed}"`);
console.log(`Match:   ${typed === target}`);

if (typed !== target) {
  console.log('');
  console.log('Differences:');
  for (let i = 0; i < Math.max(target.length, typed.length); i++) {
    if (target[i] !== typed[i]) {
      console.log(`  Index ${i}: expected '${target[i] ?? '(end)'}', got '${typed[i] ?? '(end)'}'`);
      console.log(`  Context target: ...${target.slice(Math.max(0, i - 10), i + 10)}...`);
      console.log(`  Context got:    ...${typed.slice(Math.max(0, i - 10), i + 10)}...`);
      break;
    }
  }
}
