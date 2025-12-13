import type { TypingAdvancedSettings } from './types';

export const DEFAULT_ADVANCED_SETTINGS: TypingAdvancedSettings = {
  keystrokesPerWord: 5,
  minInterKeyDelaySeconds: 0.012,
  maxInterKeyDelaySeconds: 0.55,
  lognormalSigma: 0.22,

  pauseScale: 1.0,
  microPauseChance: 0.03,
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
  typoRandomWeight: 0.10,
  typoDoubleWeight: 0.18,
  typoSkipWeight: 0.10,
  typoClusteringEnabled: true,
  typoClusteringMultiplier: 1.6, // 60% more likely to make errors after a recent error
  typoClusteringDecayChars: 5, // effect fades over 5 characters

  huntAndPeckEnabled: true,
  huntAndPeckDelayMultiplier: 1.25, // 25% slower for unusual characters

  reflexRate: 0.10,
  reflexHesitationMinSeconds: 0.10,
  reflexHesitationMaxSeconds: 0.28,
  backspaceDelaySeconds: 0.05,
  realizationBaseChance: 0.025,
  realizationSensitivity: 0.035,
  realizationMinDelayChars: 2,
  realizationMaxDelayChars: 24,
  // Lower default = fewer aggressive delete+retype backtracks; more is deferred to fix sessions.
  deletionBacktrackChance: 0.08,

  synonymReplaceEnabled: false,
  synonymReplaceChance: 0.12,
  synonymCorrectionMode: 'backtrack',
  synonymBacktrackMinWords: 1,
  synonymBacktrackMaxWords: 4,

  fixSessionsEnabled: true,
  // Default to fairly frequent sessions so the behavior is visible.
  fixSessionIntervalWords: 8,
  fixSessionMaxFixes: 4,
  fixSessionPauseMinSeconds: 0.55,
  fixSessionPauseMaxSeconds: 1.35,
  fixSessionCursorMoveDelaySeconds: 0.06,

  finalVerifyViaClipboard: true,
  finalVerifyMaxAttempts: 4,
  finalRewriteOnMismatch: true,
};
