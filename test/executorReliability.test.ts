/**
 * Executor Reliability Test Suite
 *
 * This test validates that the executor correctly processes all planned steps
 * and produces the expected output. It simulates the executor's local buffer
 * operations without actually sending keys.
 *
 * Key test scenarios:
 * 1. Double press errors with reflex correction
 * 2. Navigation-based fixes (fix sessions)
 * 3. Deletion backtrack corrections
 * 4. Rapid consecutive backspaces
 * 5. Mixed correction modes
 */

import { createTypingPlanV2, setDebugConfig } from '../src/lib/typing/plannerV2';
import { textAnalysis } from '../src/lib/analysis';
import { normalizeTextForTyping } from '../src/lib/textNormalize';
import type { TypingStep, TypingPlan } from '../src/lib/typing/types';

// Disable debug logging for cleaner output
setDebugConfig({
    enabled: false,
    logCharTyping: false,
    logNavigation: false,
    logCorrections: false,
    logFixSessions: false,
    logStateValidation: false,
    validateAfterEveryStep: false,
});

// ============================================================================
// Shadow Buffer Simulation (mirrors executor behavior)
// ============================================================================

class TestBuffer {
    private chars: string[] = [];
    private caretPos: number = 0;
    private warnings: string[] = [];

    get text(): string {
        return this.chars.join('');
    }

    get caret(): number {
        return this.caretPos;
    }

    get length(): number {
        return this.chars.length;
    }

    getWarnings(): string[] {
        return [...this.warnings];
    }

    insert(ch: string): void {
        this.chars.splice(this.caretPos, 0, ch);
        this.caretPos++;
    }

    backspace(): void {
        if (this.caretPos <= 0) {
            this.warnings.push(`BACKSPACE at caret 0 - no-op`);
            return;
        }
        this.chars.splice(this.caretPos - 1, 1);
        this.caretPos--;
    }

    moveLeft(): void {
        if (this.caretPos <= 0) {
            this.warnings.push(`LEFT at caret 0 - no-op`);
            return;
        }
        this.caretPos--;
    }

    moveRight(): void {
        if (this.caretPos >= this.chars.length) {
            this.warnings.push(`RIGHT at caret ${this.caretPos} = length - no-op`);
            return;
        }
        this.caretPos++;
    }

    moveHome(): void {
        this.caretPos = 0;
    }

    moveEnd(): void {
        this.caretPos = this.chars.length;
    }

    toVisual(): string {
        const text = this.text.replace(/\n/g, '↵');
        return text.slice(0, this.caretPos) + '|' + text.slice(this.caretPos);
    }
}

function simulatePlan(plan: TypingPlan): { buffer: TestBuffer; stepTrace: string[] } {
    const buffer = new TestBuffer();
    const trace: string[] = [];

    for (let i = 0; i < plan.steps.length; i++) {
        const step = plan.steps[i]!;

        if (step.type === 'char') {
            buffer.insert(step.char);
        } else if (step.type === 'key') {
            switch (step.key) {
                case 'ENTER':
                    buffer.insert('\n');
                    break;
                case 'BACKSPACE':
                    buffer.backspace();
                    trace.push(`[${i}] BACKSPACE -> "${buffer.toVisual().slice(0, 50)}"`);
                    break;
                case 'LEFT':
                    buffer.moveLeft();
                    trace.push(`[${i}] LEFT -> "${buffer.toVisual().slice(0, 50)}"`);
                    break;
                case 'RIGHT':
                    buffer.moveRight();
                    trace.push(`[${i}] RIGHT -> "${buffer.toVisual().slice(0, 50)}"`);
                    break;
                case 'HOME':
                case 'CTRL_HOME':
                    buffer.moveHome();
                    trace.push(`[${i}] ${step.key} -> "${buffer.toVisual().slice(0, 50)}"`);
                    break;
                case 'END':
                case 'CTRL_END':
                    buffer.moveEnd();
                    trace.push(`[${i}] ${step.key} -> "${buffer.toVisual().slice(0, 50)}"`);
                    break;
            }
        }
    }

    return { buffer, stepTrace: trace };
}

// ============================================================================
// Test Runner
// ============================================================================

interface TestResult {
    name: string;
    passed: boolean;
    expected: string;
    got: string;
    warnings: string[];
    trace?: string[];
}

function runTest(
    name: string,
    text: string,
    config: {
        mistakeRate: number;
        seedRange: [number, number];
        advanced?: Record<string, unknown>;
        expectWarnings?: boolean;
    },
): TestResult[] {
    const results: TestResult[] = [];
    const analysis = textAnalysis(text);
    const target = normalizeTextForTyping(text);

    for (let seed = config.seedRange[0]; seed <= config.seedRange[1]; seed++) {
        const plan = createTypingPlanV2(text, {
            speed: 80,
            speedMode: 'constant',
            speedVariance: 0.15,
            mistakeRate: config.mistakeRate,
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
                synonymReplaceEnabled: false,
                ...config.advanced,
            },
        });

        const { buffer, stepTrace } = simulatePlan(plan);
        const passed = buffer.text === target;
        const warnings = buffer.getWarnings();

        if (!passed || (warnings.length > 0 && !config.expectWarnings)) {
            results.push({
                name: `${name} (seed ${seed})`,
                passed,
                expected: target,
                got: buffer.text,
                warnings,
                trace: stepTrace,
            });
        }
    }

    return results;
}

// ============================================================================
// Test Cases
// ============================================================================

console.log('='.repeat(80));
console.log('EXECUTOR RELIABILITY TEST SUITE');
console.log('='.repeat(80));
console.log('');

const allResults: TestResult[] = [];

// Test 1: Double press error correction
console.log('Test 1: Double press error correction...');
allResults.push(
    ...runTest('Double press', 'The project started successfully.', {
        mistakeRate: 0.5,
        seedRange: [1, 100],
        advanced: {
            typoDoubleWeight: 1.0,
            typoNearbyWeight: 0,
            typoRandomWeight: 0,
            typoSkipWeight: 0,
            reflexRate: 0.5,
        },
    }),
);

// Test 2: Fix session with cursor navigation
console.log('Test 2: Fix sessions with cursor navigation...');
allResults.push(
    ...runTest('Fix sessions', 'My computer engineering teacher helped my friend and I learn to code.', {
        mistakeRate: 0.4,
        seedRange: [1, 100],
        advanced: {
            fixSessionsEnabled: true,
            fixSessionIntervalWords: 5,
            reflexRate: 0.05,
            deletionBacktrackChance: 0.1,
        },
    }),
);

// Test 3: Deletion backtrack corrections
console.log('Test 3: Deletion backtrack corrections...');
allResults.push(
    ...runTest('Deletion backtrack', 'Learning programming requires patience and practice.', {
        mistakeRate: 0.45,
        seedRange: [1, 100],
        advanced: {
            deletionBacktrackChance: 1.0,
            fixSessionsEnabled: false,
            reflexRate: 0.0,
        },
    }),
);

// Test 4: Mixed correction modes
console.log('Test 4: Mixed correction modes...');
allResults.push(
    ...runTest(
        'Mixed modes',
        'The quick brown fox jumps over the lazy dog. This sentence contains every letter of the alphabet.',
        {
            mistakeRate: 0.35,
            seedRange: [1, 100],
            advanced: {
                reflexRate: 0.15,
                deletionBacktrackChance: 0.2,
                fixSessionsEnabled: true,
                fixSessionIntervalWords: 10,
            },
        },
    ),
);

// Test 5: Skip typo correction
console.log('Test 5: Skip typo correction...');
allResults.push(
    ...runTest('Skip typo', 'Hello world this is a test message.', {
        mistakeRate: 0.5,
        seedRange: [1, 100],
        advanced: {
            typoSkipWeight: 1.0,
            typoNearbyWeight: 0,
            typoRandomWeight: 0,
            typoDoubleWeight: 0,
            reflexRate: 0.3,
        },
    }),
);

// Test 6: Stress test with high mistake rate
console.log('Test 6: Stress test (high mistake rate)...');
allResults.push(
    ...runTest('Stress test', 'This is a stress test with many potential errors to catch and correct.', {
        mistakeRate: 0.7,
        seedRange: [1, 50],
        advanced: {
            reflexRate: 0.1,
            deletionBacktrackChance: 0.3,
            fixSessionsEnabled: true,
        },
    }),
);

// Test 7: Very long text
console.log('Test 7: Long text handling...');
const longText =
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.';
allResults.push(
    ...runTest('Long text', longText, {
        mistakeRate: 0.3,
        seedRange: [1, 30],
    }),
);

// ============================================================================
// Results Summary
// ============================================================================

console.log('');
console.log('='.repeat(80));
console.log('RESULTS SUMMARY');
console.log('='.repeat(80));

const failures = allResults.filter((r) => !r.passed);
const warningOnly = allResults.filter((r) => r.passed && r.warnings.length > 0);

console.log(`Total test runs: ~650 (across all seeds)`);
console.log(`Failures: ${failures.length}`);
console.log(`Warning-only: ${warningOnly.length}`);
console.log('');

if (failures.length > 0) {
    console.log('FAILURES:');
    for (const failure of failures.slice(0, 10)) {
        console.log(`\n  ${failure.name}:`);
        console.log(`    Expected: "${failure.expected.slice(0, 60)}${failure.expected.length > 60 ? '...' : ''}"`);
        console.log(`    Got:      "${failure.got.slice(0, 60)}${failure.got.length > 60 ? '...' : ''}"`);

        // Find first diff
        for (let i = 0; i < Math.max(failure.expected.length, failure.got.length); i++) {
            if (failure.expected[i] !== failure.got[i]) {
                console.log(
                    `    First diff at index ${i}: expected '${failure.expected[i] ?? '(end)'}', got '${failure.got[i] ?? '(end)'}'`,
                );
                break;
            }
        }

        if (failure.warnings.length > 0) {
            console.log(`    Warnings: ${failure.warnings.slice(0, 3).join('; ')}${failure.warnings.length > 3 ? '...' : ''}`);
        }

        if (failure.trace && failure.trace.length > 0) {
            console.log(`    Last 5 ops: ${failure.trace.slice(-5).join(' | ')}`);
        }
    }

    if (failures.length > 10) {
        console.log(`\n  ... and ${failures.length - 10} more failures`);
    }
} else {
    console.log('✅ All tests passed!');
}

if (warningOnly.length > 0) {
    console.log(`\n⚠️ ${warningOnly.length} tests had no-op warnings (these are usually harmless)`);
}

console.log('\n' + '='.repeat(80));
console.log('DONE');
console.log('='.repeat(80));
