/**
 * COMPREHENSIVE DEBUG TEST for user-reported issue:
 * - Typed "friend" and then the typer went back and deleted the 'r' from "teacher"
 * - Target: "My computer engineering teacher, Mr. Henrich, saw my unbounded enthusiasm and helped my friend and I"
 * - Result: "My computer engineering teache, Mr. Henrich, ..." (missing 'r' in teacher)
 * 
 * This test aims to:
 * 1. Find seeds that reproduce the bug
 * 2. Trace through the exact sequence of operations
 * 3. Identify the root cause
 */

import { createTypingPlan } from '../src/lib/typing/planner';
import { textAnalysis } from '../src/lib/analysis';
import { visualizeTypingPlan, createDebugSummary, formatBufferWithCaret } from '../src/lib/typing/debugVisualizer';
import type { TypingPlan, TypingStep } from '../src/lib/typing/types';

const text = 'My computer engineering teacher, Mr. Henrich, saw my unbounded enthusiasm and helped my friend and I';

// User's config
const userConfig = {
    keystrokesPerWord: 5,
    minInterKeyDelaySeconds: 0.012,
    maxInterKeyDelaySeconds: 0.55,
    lognormalSigma: 0.14,
    pauseScale: 1,
    microPauseChance: 0.025,
    microPauseMinSeconds: 0.05,
    microPauseMaxSeconds: 0.18,
    burstEnabled: true,
    burstWordsMin: 2,
    burstWordsMax: 7,
    burstSpeedMultiplier: 1.12,
    burstThinkingPauseMinSeconds: 0.18,
    burstThinkingPauseMaxSeconds: 0.55,
    dynamicMistakes: true,
    caseSensitiveTypos: true,
    typoNearbyWeight: 0.62,
    typoRandomWeight: 0.1,
    typoDoubleWeight: 0.18,
    typoSkipWeight: 0.1,
    typoClusteringEnabled: true,
    typoClusteringMultiplier: 1.6,
    typoClusteringDecayChars: 5,
    huntAndPeckEnabled: true,
    huntAndPeckDelayMultiplier: 1.25,
    reflexRate: 0.1,
    reflexHesitationMinSeconds: 0.1,
    reflexHesitationMaxSeconds: 0.28,
    backspaceDelaySeconds: 0.05,
    realizationBaseChance: 0.025,
    realizationSensitivity: 0.18,
    realizationMinDelayChars: 2,
    realizationMaxDelayChars: 24,
    deletionBacktrackChance: 0.18,
    synonymReplaceEnabled: true,
    synonymReplaceChance: 0.06,
    synonymCorrectionMode: 'live' as const,
    synonymBacktrackMinWords: 1,
    synonymBacktrackMaxWords: 4,
    fixSessionsEnabled: true,
    fixSessionIntervalWords: 18,
    fixSessionMaxFixes: 4,
    fixSessionPauseMinSeconds: 0.55,
    fixSessionPauseMaxSeconds: 1.35,
    fixSessionCursorMoveDelaySeconds: 0.08,
    finalVerifyViaClipboard: false,
    finalVerifyMaxAttempts: 4,
    finalRewriteOnMismatch: false,
};

const analysis = textAnalysis(text);

console.log('='.repeat(80));
console.log('COMPREHENSIVE DEBUG: Looking for seeds that cause the planner to produce wrong output');
console.log('='.repeat(80));
console.log(`Target text: "${text}"`);
console.log(`Length: ${text.length} chars`);
console.log('');

interface FailureInfo {
    seed: number;
    finalBuffer: string;
    stepCount: number;
    fixSessionCount: number;
    correctionCount: number;
}

const failures: FailureInfo[] = [];
const SEED_RANGE = 1000;

// Search for seeds that cause failures
for (let seed = 1; seed <= SEED_RANGE; seed++) {
    const plan = createTypingPlan(text, {
        speed: 80,
        speedMode: 'constant',
        speedVariance: 0.15,
        mistakeRate: 0.4, // Typical mistake rate
        fatigueMode: false,
        analysis,
        seed,
        advanced: userConfig,
    });

    const viz = visualizeTypingPlan(plan);

    if (!viz.matches) {
        const fixSessionCount = viz.events.filter(
            (e) => e.step.type === 'pause' && ((e.step as any).reason?.startsWith('fix-session') ?? false),
        ).length;
        const correctionCount = viz.events.filter(
            (e) => e.step.type === 'pause' && ['realization', 'forced-realization', 'end-correction'].includes((e.step as any).reason),
        ).length;

        failures.push({
            seed,
            finalBuffer: viz.finalBuffer,
            stepCount: viz.events.length,
            fixSessionCount,
            correctionCount,
        });
    }
}

console.log(`Tested ${SEED_RANGE} seeds`);
console.log(`Found ${failures.length} failures (${((failures.length / SEED_RANGE) * 100).toFixed(2)}% failure rate)`);
console.log('');

if (failures.length > 0) {
    console.log('='.repeat(80));
    console.log('FAILURE ANALYSIS');
    console.log('='.repeat(80));

    // Analyze each failure
    for (const failure of failures.slice(0, 5)) {
        console.log(`\n${'─'.repeat(80)}`);
        console.log(`Seed ${failure.seed}:`);
        console.log(`  Target: "${text}"`);
        console.log(`  Got:    "${failure.finalBuffer}"`);
        console.log(`  Steps: ${failure.stepCount}, Fix Sessions: ${failure.fixSessionCount}, Corrections: ${failure.correctionCount}`);

        // Find differences
        for (let i = 0; i < Math.max(text.length, failure.finalBuffer.length); i++) {
            if (text[i] !== failure.finalBuffer[i]) {
                console.log(`  First diff at index ${i}: expected '${text[i] ?? '(end)'}', got '${failure.finalBuffer[i] ?? '(end)'}'`);

                // Context
                const start = Math.max(0, i - 10);
                const end = Math.min(Math.max(text.length, failure.finalBuffer.length), i + 10);
                console.log(`  Context: ...${text.substring(start, end)}...`);
                console.log(`  Got:     ...${failure.finalBuffer.substring(start, end)}...`);
                break;
            }
        }

        // Detailed trace for this failure
        console.log('\n  DETAILED TRACE:');
        const plan = createTypingPlan(text, {
            speed: 80,
            speedMode: 'constant',
            speedVariance: 0.15,
            mistakeRate: 0.4,
            fatigueMode: false,
            analysis,
            seed: failure.seed,
            advanced: userConfig,
        });

        const viz = visualizeTypingPlan(plan);

        // Show all non-normal events
        for (const event of viz.events) {
            const step = event.step;
            const isPause = step.type === 'pause';
            const isBackspace = step.type === 'key' && step.key === 'BACKSPACE';
            const isNav = step.type === 'key' && ['LEFT', 'RIGHT', 'HOME', 'END', 'CTRL_HOME', 'CTRL_END'].includes(step.key);

            if (isPause || isBackspace || isNav) {
                console.log(`  [${event.stepIndex.toString().padStart(4)}] ${event.action.padEnd(50)} | "${formatBufferWithCaret(event.bufferAfter, event.caretAfter).slice(0, 60)}"`);
            }
        }
    }

    if (failures.length > 5) {
        console.log(`\n... and ${failures.length - 5} more failures`);
    }
} else {
    console.log('No failures found with default mistake rate. Trying higher rate...');

    // Try with higher mistake rates
    for (const mistakeRate of [0.5, 0.6, 0.7]) {
        let found = false;
        for (let seed = 1; seed <= 500 && !found; seed++) {
            const plan = createTypingPlan(text, {
                speed: 80,
                speedMode: 'constant',
                speedVariance: 0.15,
                mistakeRate,
                fatigueMode: false,
                analysis,
                seed,
                advanced: userConfig,
            });

            const viz = visualizeTypingPlan(plan);

            if (!viz.matches) {
                console.log(`\nFound failure with mistakeRate=${mistakeRate}, seed=${seed}`);
                console.log(createDebugSummary(viz));
                found = true;
            }
        }
    }
}

// ADDITIONAL TEST: Verify the visualizer logic itself
console.log('\n' + '='.repeat(80));
console.log('VERIFYING VISUALIZER LOGIC');
console.log('='.repeat(80));

function simulatePlanManually(plan: TypingPlan): { buffer: string; caret: number } {
    const buffer: string[] = [];
    let caret = 0;

    for (const step of plan.steps) {
        if (step.type === 'char') {
            buffer.splice(caret, 0, step.char);
            caret++;
        } else if (step.type === 'key') {
            switch (step.key) {
                case 'ENTER':
                    buffer.splice(caret, 0, '\n');
                    caret++;
                    break;
                case 'BACKSPACE':
                    if (caret > 0) {
                        buffer.splice(caret - 1, 1);
                        caret--;
                    }
                    break;
                case 'LEFT':
                    caret = Math.max(0, caret - 1);
                    break;
                case 'RIGHT':
                    caret = Math.min(buffer.length, caret + 1);
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
    }

    return { buffer: buffer.join(''), caret };
}

// Test with the same seeds
let mismatchCount = 0;
for (let seed = 1; seed <= 100; seed++) {
    const plan = createTypingPlan(text, {
        speed: 80,
        speedMode: 'constant',
        speedVariance: 0.15,
        mistakeRate: 0.5,
        fatigueMode: false,
        analysis,
        seed,
        advanced: userConfig,
    });

    const viz = visualizeTypingPlan(plan);
    const manual = simulatePlanManually(plan);

    if (viz.finalBuffer !== manual.buffer) {
        console.log(`VISUALIZER MISMATCH at seed ${seed}:`);
        console.log(`  Visualizer: "${viz.finalBuffer}"`);
        console.log(`  Manual:     "${manual.buffer}"`);
        mismatchCount++;
    }
}

console.log(`Visualizer vs Manual simulation: ${mismatchCount} mismatches out of 100 tests`);

// CRITICAL TEST: Check if the plan itself is internally consistent
console.log('\n' + '='.repeat(80));
console.log('CHECKING PLAN INTERNAL CONSISTENCY');
console.log('='.repeat(80));

function checkPlanConsistency(plan: TypingPlan, seed: number): string[] {
    const issues: string[] = [];
    const buffer: string[] = [];
    let caret = 0;
    let lastNavStep = -1;

    for (let i = 0; i < plan.steps.length; i++) {
        const step = plan.steps[i]!;

        // Track state
        if (step.type === 'char') {
            buffer.splice(caret, 0, step.char);
            caret++;
        } else if (step.type === 'key') {
            switch (step.key) {
                case 'ENTER':
                    buffer.splice(caret, 0, '\n');
                    caret++;
                    break;
                case 'BACKSPACE':
                    if (caret > 0) {
                        buffer.splice(caret - 1, 1);
                        caret--;
                    } else {
                        issues.push(`Step ${i}: BACKSPACE at caret 0 (no-op)`);
                    }
                    break;
                case 'LEFT':
                    if (caret <= 0) {
                        issues.push(`Step ${i}: LEFT at caret 0 (no-op, buffer="${buffer.join('')}")`);
                    }
                    caret = Math.max(0, caret - 1);
                    lastNavStep = i;
                    break;
                case 'RIGHT':
                    if (caret >= buffer.length) {
                        issues.push(`Step ${i}: RIGHT at caret ${caret} == buffer.length (no-op)`);
                    }
                    caret = Math.min(buffer.length, caret + 1);
                    lastNavStep = i;
                    break;
                case 'HOME':
                case 'CTRL_HOME':
                    caret = 0;
                    lastNavStep = i;
                    break;
                case 'END':
                case 'CTRL_END':
                    caret = buffer.length;
                    lastNavStep = i;
                    break;
            }
        }

        // Check for immediately consecutive nav keys without pause
        if (step.type === 'key' && ['LEFT', 'RIGHT'].includes(step.key)) {
            if (lastNavStep === i - 1) {
                // This is fine, just consecutive nav
            }
        }
    }

    return issues;
}

let totalIssues = 0;
for (let seed = 1; seed <= 50; seed++) {
    const plan = createTypingPlan(text, {
        speed: 80,
        speedMode: 'constant',
        speedVariance: 0.15,
        mistakeRate: 0.5,
        fatigueMode: false,
        analysis,
        seed,
        advanced: userConfig,
    });

    const issues = checkPlanConsistency(plan, seed);
    if (issues.length > 0) {
        console.log(`\nSeed ${seed} has ${issues.length} consistency issues:`);
        for (const issue of issues.slice(0, 5)) {
            console.log(`  - ${issue}`);
        }
        if (issues.length > 5) {
            console.log(`  ... and ${issues.length - 5} more`);
        }
        totalIssues += issues.length;
    }
}

console.log(`\nTotal consistency issues across 50 seeds: ${totalIssues}`);

console.log('\n' + '='.repeat(80));
console.log('DONE');
console.log('='.repeat(80));
