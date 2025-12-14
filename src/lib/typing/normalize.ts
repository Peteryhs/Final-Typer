import { DEFAULT_ADVANCED_SETTINGS } from './defaults';
import type { TypingAdvancedSettings } from './types';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const toNumberOr = (v: unknown, fallback: number) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
};

const toBoolOr = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

export function normalizeAdvancedSettings(input: Partial<TypingAdvancedSettings> | undefined): TypingAdvancedSettings {
  const merged = { ...DEFAULT_ADVANCED_SETTINGS, ...(input ?? {}) } as TypingAdvancedSettings;

  // Timing model
  merged.keystrokesPerWord = clamp(toNumberOr(merged.keystrokesPerWord, DEFAULT_ADVANCED_SETTINGS.keystrokesPerWord), 3, 12);
  merged.minInterKeyDelaySeconds = clamp(toNumberOr(merged.minInterKeyDelaySeconds, DEFAULT_ADVANCED_SETTINGS.minInterKeyDelaySeconds), 0.001, 2);
  merged.maxInterKeyDelaySeconds = clamp(toNumberOr(merged.maxInterKeyDelaySeconds, DEFAULT_ADVANCED_SETTINGS.maxInterKeyDelaySeconds), merged.minInterKeyDelaySeconds, 5);
  merged.lognormalSigma = clamp(toNumberOr(merged.lognormalSigma, DEFAULT_ADVANCED_SETTINGS.lognormalSigma), 0.01, 1);

  // Pauses / bursts
  merged.pauseScale = clamp(toNumberOr(merged.pauseScale, DEFAULT_ADVANCED_SETTINGS.pauseScale), 0, 10);
  merged.microPauseChance = clamp(toNumberOr(merged.microPauseChance, DEFAULT_ADVANCED_SETTINGS.microPauseChance), 0, 1);
  merged.microPauseMinSeconds = clamp(toNumberOr(merged.microPauseMinSeconds, DEFAULT_ADVANCED_SETTINGS.microPauseMinSeconds), 0, 10);
  merged.microPauseMaxSeconds = clamp(toNumberOr(merged.microPauseMaxSeconds, DEFAULT_ADVANCED_SETTINGS.microPauseMaxSeconds), merged.microPauseMinSeconds, 10);

  merged.burstEnabled = toBoolOr(merged.burstEnabled, DEFAULT_ADVANCED_SETTINGS.burstEnabled);
  merged.burstWordsMin = clamp(toNumberOr(merged.burstWordsMin, DEFAULT_ADVANCED_SETTINGS.burstWordsMin), 1, 50);
  merged.burstWordsMax = clamp(toNumberOr(merged.burstWordsMax, DEFAULT_ADVANCED_SETTINGS.burstWordsMax), merged.burstWordsMin, 80);
  merged.burstSpeedMultiplier = clamp(toNumberOr(merged.burstSpeedMultiplier, DEFAULT_ADVANCED_SETTINGS.burstSpeedMultiplier), 1, 3);
  merged.burstThinkingPauseMinSeconds = clamp(
    toNumberOr(merged.burstThinkingPauseMinSeconds, DEFAULT_ADVANCED_SETTINGS.burstThinkingPauseMinSeconds),
    0,
    10,
  );
  merged.burstThinkingPauseMaxSeconds = clamp(
    toNumberOr(merged.burstThinkingPauseMaxSeconds, DEFAULT_ADVANCED_SETTINGS.burstThinkingPauseMaxSeconds),
    merged.burstThinkingPauseMinSeconds,
    15,
  );

  // Mistakes
  merged.dynamicMistakes = toBoolOr(merged.dynamicMistakes, DEFAULT_ADVANCED_SETTINGS.dynamicMistakes);
  merged.caseSensitiveTypos = toBoolOr(merged.caseSensitiveTypos, DEFAULT_ADVANCED_SETTINGS.caseSensitiveTypos);
  merged.typoNearbyWeight = clamp(toNumberOr(merged.typoNearbyWeight, DEFAULT_ADVANCED_SETTINGS.typoNearbyWeight), 0, 1);
  merged.typoRandomWeight = clamp(toNumberOr(merged.typoRandomWeight, DEFAULT_ADVANCED_SETTINGS.typoRandomWeight), 0, 1);
  merged.typoDoubleWeight = clamp(toNumberOr(merged.typoDoubleWeight, DEFAULT_ADVANCED_SETTINGS.typoDoubleWeight), 0, 1);
  merged.typoSkipWeight = clamp(toNumberOr(merged.typoSkipWeight, DEFAULT_ADVANCED_SETTINGS.typoSkipWeight), 0, 1);
  merged.typoClusteringEnabled = toBoolOr(merged.typoClusteringEnabled, DEFAULT_ADVANCED_SETTINGS.typoClusteringEnabled);
  merged.typoClusteringMultiplier = clamp(toNumberOr(merged.typoClusteringMultiplier, DEFAULT_ADVANCED_SETTINGS.typoClusteringMultiplier), 1, 3);
  merged.typoClusteringDecayChars = clamp(toNumberOr(merged.typoClusteringDecayChars, DEFAULT_ADVANCED_SETTINGS.typoClusteringDecayChars), 1, 20);
  merged.huntAndPeckEnabled = toBoolOr(merged.huntAndPeckEnabled, DEFAULT_ADVANCED_SETTINGS.huntAndPeckEnabled);
  merged.huntAndPeckDelayMultiplier = clamp(toNumberOr(merged.huntAndPeckDelayMultiplier, DEFAULT_ADVANCED_SETTINGS.huntAndPeckDelayMultiplier), 1, 3);

  // Corrections
  merged.reflexRate = clamp(toNumberOr(merged.reflexRate, DEFAULT_ADVANCED_SETTINGS.reflexRate), 0, 1);
  merged.reflexHesitationMinSeconds = clamp(
    toNumberOr(merged.reflexHesitationMinSeconds, DEFAULT_ADVANCED_SETTINGS.reflexHesitationMinSeconds),
    0,
    10,
  );
  merged.reflexHesitationMaxSeconds = clamp(
    toNumberOr(merged.reflexHesitationMaxSeconds, DEFAULT_ADVANCED_SETTINGS.reflexHesitationMaxSeconds),
    merged.reflexHesitationMinSeconds,
    10,
  );
  merged.backspaceDelaySeconds = clamp(toNumberOr(merged.backspaceDelaySeconds, DEFAULT_ADVANCED_SETTINGS.backspaceDelaySeconds), 0.001, 2);
  merged.realizationBaseChance = clamp(toNumberOr(merged.realizationBaseChance, DEFAULT_ADVANCED_SETTINGS.realizationBaseChance), 0, 1);
  merged.realizationSensitivity = clamp(toNumberOr(merged.realizationSensitivity, DEFAULT_ADVANCED_SETTINGS.realizationSensitivity), 0, 1);
  merged.realizationMinDelayChars = clamp(toNumberOr(merged.realizationMinDelayChars, DEFAULT_ADVANCED_SETTINGS.realizationMinDelayChars), 0, 200);
  merged.realizationMaxDelayChars = clamp(
    toNumberOr(merged.realizationMaxDelayChars, DEFAULT_ADVANCED_SETTINGS.realizationMaxDelayChars),
    merged.realizationMinDelayChars,
    1000,
  );
  merged.deletionBacktrackChance = clamp(
    toNumberOr(merged.deletionBacktrackChance, DEFAULT_ADVANCED_SETTINGS.deletionBacktrackChance),
    0,
    1,
  );

  // Synonyms
  merged.synonymReplaceEnabled = toBoolOr(merged.synonymReplaceEnabled, DEFAULT_ADVANCED_SETTINGS.synonymReplaceEnabled);
  merged.synonymReplaceChance = clamp(toNumberOr(merged.synonymReplaceChance, DEFAULT_ADVANCED_SETTINGS.synonymReplaceChance), 0, 1);
  merged.synonymCorrectionMode =
    merged.synonymCorrectionMode === 'live' || merged.synonymCorrectionMode === 'backtrack'
      ? merged.synonymCorrectionMode
      : DEFAULT_ADVANCED_SETTINGS.synonymCorrectionMode;
  merged.synonymBacktrackMinWords = clamp(toNumberOr(merged.synonymBacktrackMinWords, DEFAULT_ADVANCED_SETTINGS.synonymBacktrackMinWords), 0, 50);
  merged.synonymBacktrackMaxWords = clamp(
    toNumberOr(merged.synonymBacktrackMaxWords, DEFAULT_ADVANCED_SETTINGS.synonymBacktrackMaxWords),
    Math.max(1, merged.synonymBacktrackMinWords),
    80,
  );

  // Fix sessions
  merged.fixSessionsEnabled = toBoolOr(merged.fixSessionsEnabled, DEFAULT_ADVANCED_SETTINGS.fixSessionsEnabled);
  merged.fixSessionIntervalWords = clamp(toNumberOr(merged.fixSessionIntervalWords, DEFAULT_ADVANCED_SETTINGS.fixSessionIntervalWords), 1, 500);
  merged.fixSessionMaxFixes = clamp(toNumberOr(merged.fixSessionMaxFixes, DEFAULT_ADVANCED_SETTINGS.fixSessionMaxFixes), 4, 20);
  merged.fixSessionPauseMinSeconds = clamp(
    toNumberOr(merged.fixSessionPauseMinSeconds, DEFAULT_ADVANCED_SETTINGS.fixSessionPauseMinSeconds),
    0,
    30,
  );
  merged.fixSessionPauseMaxSeconds = clamp(
    toNumberOr(merged.fixSessionPauseMaxSeconds, DEFAULT_ADVANCED_SETTINGS.fixSessionPauseMaxSeconds),
    merged.fixSessionPauseMinSeconds,
    60,
  );
  merged.fixSessionCursorMoveDelaySeconds = clamp(
    toNumberOr(merged.fixSessionCursorMoveDelaySeconds, DEFAULT_ADVANCED_SETTINGS.fixSessionCursorMoveDelaySeconds),
    0.001, // 1ms minimum
    0.06,  // 60ms maximum
  );

  // Verification
  merged.finalVerifyViaClipboard = toBoolOr(merged.finalVerifyViaClipboard, DEFAULT_ADVANCED_SETTINGS.finalVerifyViaClipboard);
  merged.finalVerifyMaxAttempts = clamp(toNumberOr(merged.finalVerifyMaxAttempts, DEFAULT_ADVANCED_SETTINGS.finalVerifyMaxAttempts), 1, 50);
  merged.finalRewriteOnMismatch = toBoolOr(merged.finalRewriteOnMismatch, DEFAULT_ADVANCED_SETTINGS.finalRewriteOnMismatch);

  return merged;
}

