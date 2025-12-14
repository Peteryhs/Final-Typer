/**
 * Specific debug test for the "frieend" over-deletion bug
 * 
 * User reported: frieend -> friend -> (over deletes) fr -> frends
 * 
 * This test traces through exactly what happens with a double-e typo
 * and subsequent correction.
 */

import { createTypingPlanV2, setDebugConfig } from '../src/lib/typing/plannerV2';
import { textAnalysis } from '../src/lib/analysis';
import { normalizeTextForTyping } from '../src/lib/textNormalize';
import type { TypingStep, TypingPlan } from '../src/lib/typing/types';

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

interface TraceEntry {
    stepIdx: number;
    action: string;
    detail: string;
    bufferBefore: string;
    bufferAfter: string;
    caretBefore: number;
    caretAfter: number;
}

function tracePlan(plan: TypingPlan): { finalBuffer: string; trace: TraceEntry[] } {
    const buffer: string[] = [];
    let caret = 0;
    const trace: TraceEntry[] = [];

    for (let i = 0; i < plan.steps.length; i++) {
        const step = plan.steps[i]!;
        const bufferBefore = buffer.join('');
        const caretBefore = caret;

        let action = '';
        let detail = '';

        if (step.type === 'char') {
            buffer.splice(caret, 0, step.char);
            caret++;
            action = 'CHAR';
            detail = `'${step.char === '\n' ? '↵' : step.char}'`;
        } else if (step.type === 'pause') {
            action = 'PAUSE';
            detail = step.reason;
        } else if (step.type === 'key') {
            action = step.key;
            switch (step.key) {
                case 'ENTER':
                    buffer.splice(caret, 0, '\n');
                    caret++;
                    break;
                case 'BACKSPACE':
                    if (caret > 0) {
                        const deleted = buffer[caret - 1];
                        buffer.splice(caret - 1, 1);
                        caret--;
                        detail = `del '${deleted}'`;
                    } else {
                        detail = 'NO-OP at 0!';
                    }
                    break;
                case 'LEFT':
                    if (caret > 0) caret--;
                    else detail = 'NO-OP at 0!';
                    break;
                case 'RIGHT':
                    if (caret < buffer.length) caret++;
                    else detail = 'NO-OP at end!';
                    break;
                case 'HOME':
                case 'CTRL_HOME':
                    caret = 0;
                    break;
                case 'END':
                case 'CTRL_END':
                    caret = buffer.length;
                    break;
            }
        }

        const bufferAfter = buffer.join('');
        const caretAfter = caret;

        // Only trace significant events
        if (step.type !== 'pause' || step.reason.includes('fix') || step.reason.includes('realization') || step.reason.includes('reflex') || step.reason.includes('correction')) {
            if (step.type !== 'char' || bufferAfter.length <= 15) { // Only trace chars for short buffers
                trace.push({
                    stepIdx: i,
                    action,
                    detail,
                    bufferBefore,
                    bufferAfter,
                    caretBefore,
                    caretAfter,
                });
            }
        }
    }

    return { finalBuffer: buffer.join(''), trace };
}

function formatBuffer(buf: string, caret: number): string {
    const display = buf.replace(/\n/g, '↵');
    return display.slice(0, caret) + '|' + display.slice(caret);
}

// Test with "friend" and forced double-e typo
console.log('='.repeat(80));
console.log('DEBUG: "friend" with double-e typo');
console.log('='.repeat(80));

const text = 'friend';
const analysis = textAnalysis(text);
const target = normalizeTextForTyping(text);

console.log(`Target: "${target}"`);
console.log('');

// Search for seeds that produce the bug
let foundBug = false;
for (let seed = 1; seed <= 1000 && !foundBug; seed++) {
    const plan = createTypingPlanV2(text, {
        speed: 80,
        speedMode: 'constant',
        speedVariance: 0.1,
        mistakeRate: 0.5,
        fatigueMode: false,
        analysis,
        seed,
        advanced: {
            dynamicMistakes: false,
            typoNearbyWeight: 0,
            typoRandomWeight: 0,
            typoDoubleWeight: 1.0, // Force double typos
            typoSkipWeight: 0,
            reflexRate: 0, // No reflex - use delayed correction
            deletionBacktrackChance: 1.0, // Force deletion backtrack
            fixSessionsEnabled: false,
            synonymReplaceEnabled: false,
            realizationMinDelayChars: 1,
            realizationMaxDelayChars: 3,
            realizationBaseChance: 0.5,
            realizationSensitivity: 0.3,
        },
    });

    const { finalBuffer, trace } = tracePlan(plan);

    if (finalBuffer !== target) {
        console.log(`\nFOUND BUG with seed ${seed}!`);
        console.log(`Expected: "${target}"`);
        console.log(`Got:      "${finalBuffer}"`);
        console.log('');
        console.log('TRACE:');
        for (const t of trace) {
            console.log(
                `  [${t.stepIdx.toString().padStart(4)}] ${t.action.padEnd(12)} ${t.detail.padEnd(20)} | "${formatBuffer(t.bufferBefore, t.caretBefore)}" -> "${formatBuffer(t.bufferAfter, t.caretAfter)}"`
            );
        }
        foundBug = true;
    }
}

if (!foundBug) {
    console.log('No bugs found with double typo + deletion backtrack in 1000 seeds.');
    console.log('Trying with different settings...');

    // Try with reflex correction
    for (let seed = 1; seed <= 500 && !foundBug; seed++) {
        const plan = createTypingPlanV2(text, {
            speed: 80,
            speedMode: 'constant',
            speedVariance: 0.1,
            mistakeRate: 0.6,
            fatigueMode: false,
            analysis,
            seed,
            advanced: {
                typoDoubleWeight: 1.0,
                typoNearbyWeight: 0,
                typoRandomWeight: 0,
                typoSkipWeight: 0,
                reflexRate: 1.0, // Force reflex correction
                fixSessionsEnabled: false,
                synonymReplaceEnabled: false,
            },
        });

        const { finalBuffer, trace } = tracePlan(plan);

        if (finalBuffer !== target) {
            console.log(`\nFOUND BUG with seed ${seed} (reflex mode)!`);
            console.log(`Expected: "${target}"`);
            console.log(`Got:      "${finalBuffer}"`);
            console.log('');
            console.log('TRACE:');
            for (const t of trace) {
                console.log(
                    `  [${t.stepIdx.toString().padStart(4)}] ${t.action.padEnd(12)} ${t.detail.padEnd(20)} | "${formatBuffer(t.bufferBefore, t.caretBefore)}" -> "${formatBuffer(t.bufferAfter, t.caretAfter)}"`
                );
            }
            foundBug = true;
        }
    }
}

// Also try with longer word 
console.log('\n' + '='.repeat(80));
console.log('Testing "friends" (longer word)');
console.log('='.repeat(80));

const text2 = 'friends';
const analysis2 = textAnalysis(text2);
const target2 = normalizeTextForTyping(text2);

for (let seed = 1; seed <= 500; seed++) {
    const plan = createTypingPlanV2(text2, {
        speed: 80,
        speedMode: 'constant',
        speedVariance: 0.15,
        mistakeRate: 0.5,
        fatigueMode: false,
        analysis: analysis2,
        seed,
        advanced: {
            typoDoubleWeight: 0.5,
            typoNearbyWeight: 0.3,
            typoRandomWeight: 0.1,
            typoSkipWeight: 0.1,
            reflexRate: 0.3,
            deletionBacktrackChance: 0.4,
            fixSessionsEnabled: true,
            fixSessionIntervalWords: 2,
        },
    });

    const { finalBuffer } = tracePlan(plan);

    if (finalBuffer !== target2) {
        console.log(`\nBug with seed ${seed}:`);
        console.log(`Expected: "${target2}"`);
        console.log(`Got:      "${finalBuffer}"`);

        // Find first diff
        for (let i = 0; i < Math.max(target2.length, finalBuffer.length); i++) {
            if (target2[i] !== finalBuffer[i]) {
                console.log(`First diff at index ${i}: expected '${target2[i] ?? '(end)'}', got '${finalBuffer[i] ?? '(end)'}'`);
                break;
            }
        }
    }
}

console.log('\n' + '='.repeat(80));
console.log('DONE');
console.log('='.repeat(80));
