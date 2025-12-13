import type { TextAnalysisResult } from '../analysis';

export type SpeedMode = 'constant' | 'dynamic';

export type SynonymCorrectionMode = 'live' | 'backtrack';

export interface TypingAdvancedSettings {
  // Timing model
  keystrokesPerWord: number; // standard WPM definition uses 5 chars/word
  minInterKeyDelaySeconds: number;
  maxInterKeyDelaySeconds: number;
  lognormalSigma: number; // 0 = near-constant, higher = more variance

  // Pauses
  pauseScale: number;
  microPauseChance: number;
  microPauseMinSeconds: number;
  microPauseMaxSeconds: number;

  // Bursts
  burstEnabled: boolean;
  burstWordsMin: number;
  burstWordsMax: number;
  burstSpeedMultiplier: number;
  burstThinkingPauseMinSeconds: number;
  burstThinkingPauseMaxSeconds: number;

  // Mistakes
  dynamicMistakes: boolean;
  caseSensitiveTypos: boolean;
  typoNearbyWeight: number;
  typoRandomWeight: number;
  typoDoubleWeight: number;
  typoSkipWeight: number;
  typoClusteringEnabled: boolean; // errors more likely after recent errors
  typoClusteringMultiplier: number; // how much more likely (e.g., 1.5 = 50% more likely)
  typoClusteringDecayChars: number; // chars until clustering effect fades

  // Hunt-and-peck for unusual characters
  huntAndPeckEnabled: boolean;
  huntAndPeckDelayMultiplier: number; // extra delay for unusual chars (e.g., 1.3 = 30% slower)

  // Corrections
  reflexRate: number;
  reflexHesitationMinSeconds: number;
  reflexHesitationMaxSeconds: number;
  backspaceDelaySeconds: number;
  realizationBaseChance: number;
  realizationSensitivity: number; // chance increase per char since mistake
  realizationMinDelayChars: number;
  realizationMaxDelayChars: number;
  deletionBacktrackChance: number; // substitution mistakes handled by deletion-based backtrack vs fix sessions

  // Synonyms
  synonymReplaceEnabled: boolean;
  synonymReplaceChance: number; // per eligible word
  synonymCorrectionMode: SynonymCorrectionMode;
  synonymBacktrackMinWords: number;
  synonymBacktrackMaxWords: number;

  // Fix sessions ("review" passes that jump back and patch older mistakes in-place)
  fixSessionsEnabled: boolean;
  fixSessionIntervalWords: number;
  fixSessionMaxFixes: number;
  fixSessionPauseMinSeconds: number;
  fixSessionPauseMaxSeconds: number;
  fixSessionCursorMoveDelaySeconds: number;

  // Final verification / reconciliation (Electron can optionally read-back via clipboard).
  finalVerifyViaClipboard: boolean;
  finalVerifyMaxAttempts: number;
  finalRewriteOnMismatch: boolean;
}

export interface TypingOptions {
  speed: number; // WPM base
  speedMode: SpeedMode;
  speedVariance: number; // 0..1
  mistakeRate: number; // 0..1
  fatigueMode: boolean;
  analysis: TextAnalysisResult;
  seed?: number;
  advanced?: Partial<TypingAdvancedSettings>;
}

export type TypingStep =
  | { type: 'char'; char: string; delayAfterSeconds: number }
  | {
      type: 'key';
      key: 'ENTER' | 'BACKSPACE' | 'LEFT' | 'RIGHT' | 'END' | 'HOME' | 'CTRL_END' | 'CTRL_HOME';
      delayAfterSeconds: number;
    }
  | { type: 'pause'; seconds: number; reason: string };

export interface TypingPlan {
  normalizedText: string;
  steps: TypingStep[];
  estimatedSeconds: number;
  seed: number;
}
