/**
 * Test specifically for "computer engineering" phrase
 * which was reported to turn into "compueerelnginerting"
 */

import { textAnalysis } from '../src/lib/analysis';
import { createTypingPlan } from '../src/lib/typing/planner';
import { visualizeTypingPlan, formatBufferWithCaret, createDebugSummary } from '../src/lib/typing/debugVisualizer';

const targetText = "computer engineering";

console.log('Testing "computer engineering" specifically...\n');
console.log(`Target: "${targetText}"\n`);

const analysis = textAnalysis(targetText);

let totalTests = 0;
let totalFailures = 0;
const failures: { seed: number; final: string; config: string }[] = [];

// Test with many configurations
const configs = [
    { name: 'high-mistakes', mistakeRate: 0.5, reflexRate: 0.05, fixSessionsEnabled: true },
    { name: 'very-high-mistakes', mistakeRate: 0.7, reflexRate: 0.02, fixSessionsEnabled: true },
    { name: 'extreme-mistakes', mistakeRate: 0.9, reflexRate: 0.01, fixSessionsEnabled: true },
    { name: 'no-fix-sessions', mistakeRate: 0.5, reflexRate: 0.1, fixSessionsEnabled: false },
];

for (const config of configs) {
    for (let seed = 1; seed <= 500; seed++) {
        totalTests++;

        const plan = createTypingPlan(targetText, {
            speed: 80,
            speedMode: 'constant',
            speedVariance: 0.15,
            mistakeRate: config.mistakeRate,
            fatigueMode: false,
            analysis,
            seed,
            advanced: {
                dynamicMistakes: true,
                reflexRate: config.reflexRate,
                deletionBacktrackChance: 0.2,
                fixSessionsEnabled: config.fixSessionsEnabled,
                fixSessionIntervalWords: 2,
                fixSessionMaxFixes: 5,
                typoNearbyWeight: 0.4,
                typoRandomWeight: 0.2,
                typoDoubleWeight: 0.2,
                typoSkipWeight: 0.2,
            },
        });

        const viz = visualizeTypingPlan(plan);

        if (!viz.matches) {
            totalFailures++;
            if (failures.length < 10) {
                failures.push({ seed, final: viz.finalBuffer, config: config.name });
            }
        }
    }
}

console.log(`Total tests: ${totalTests}`);
console.log(`Total failures: ${totalFailures}`);
console.log(`Failure rate: ${((totalFailures / totalTests) * 100).toFixed(4)}%`);

if (failures.length > 0) {
    console.log('\n' + '='.repeat(70));
    console.log('FAILURES FOUND');
    console.log('='.repeat(70));

    for (const f of failures.slice(0, 5)) {
        console.log(`\nSeed ${f.seed} (${f.config}):`);
        console.log(`Target: "${targetText}"`);
        console.log(`Got:    "${f.final}"`);

        // Re-run with full trace
        const plan = createTypingPlan(targetText, {
            speed: 80,
            speedMode: 'constant',
            speedVariance: 0.15,
            mistakeRate: 0.5,
            fatigueMode: false,
            analysis,
            seed: f.seed,
            advanced: {
                dynamicMistakes: true,
                reflexRate: 0.05,
                deletionBacktrackChance: 0.2,
                fixSessionsEnabled: true,
                fixSessionIntervalWords: 2,
                fixSessionMaxFixes: 5,
            },
        });

        const viz = visualizeTypingPlan(plan);
        console.log('\n' + createDebugSummary(viz));
    }
} else {
    console.log('\n✓ All simulation tests passed!');
    console.log('\nThe algorithm correctly produces "computer engineering" in all 2000 tests.');
    console.log('If real execution produces wrong output, it\'s an execution/timing issue with Google Docs.');
}
