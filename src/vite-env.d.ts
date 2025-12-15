/// <reference types="vite/client" />

interface Window {
  electronAPI: ElectronAPI;
}

type SpeedMode = 'constant' | 'dynamic';

interface TypingAdvancedOptions {
  // Timing model
  keystrokesPerWord: number;
  minInterKeyDelaySeconds: number;
  maxInterKeyDelaySeconds: number;
  lognormalSigma: number;

  // Pauses / bursts
  pauseScale: number;
  microPauseChance: number;
  microPauseMinSeconds: number;
  microPauseMaxSeconds: number;
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

  // Corrections
  reflexRate: number;
  reflexHesitationMinSeconds: number;
  reflexHesitationMaxSeconds: number;
  backspaceDelaySeconds: number;
  realizationBaseChance: number;
  realizationSensitivity: number;
  realizationMinDelayChars: number;
  realizationMaxDelayChars: number;
  deletionBacktrackChance: number;

  // Synonyms
  synonymReplaceEnabled: boolean;
  synonymReplaceChance: number;
  synonymCorrectionMode: 'live' | 'backtrack';
  synonymBacktrackMinWords: number;
  synonymBacktrackMaxWords: number;

  // Fix sessions
  fixSessionsEnabled: boolean;
  fixSessionIntervalWords: number;
  fixSessionMaxFixes: number;
  fixSessionPauseMinSeconds: number;
  fixSessionPauseMaxSeconds: number;
  fixSessionCursorMoveDelaySeconds: number;

  // Verification
  finalVerifyViaClipboard: boolean;
  finalVerifyMaxAttempts: number;
  finalRewriteOnMismatch: boolean;
}

interface TypingOptions {
  speed: number;
  speedMode: SpeedMode;
  speedVariance: number;
  mistakeRate: number;
  fatigueMode: boolean;
  analysis: import('./lib/analysis').TextAnalysisResult;
  advanced: TypingAdvancedOptions;
}

interface StoredConfig {
  text: string;
  options: TypingOptions;
}

interface DebugLogEntry {
  stepNumber: number;
  action: string;
  detail: string;
  buffer: string;
  caret: number;
  level: 'info' | 'warn' | 'error' | 'debug';
}

interface ElectronAPI {
  startTyping: (text: string, options: TypingOptions) => Promise<void>;
  stopTyping: () => void;
  toggleOverlay: () => void;
  setOverlayExpanded: (expanded: boolean) => void;
  onOverlayCollapsed: (callback: () => void) => () => void;
  onOverlayAutoShown: (callback: () => void) => () => void;
  setConfig: (config: StoredConfig) => void;
  signalStart: () => Promise<void>;
  minimize: () => void;
  maximize: () => void;
  close: () => void;

  // Typing state & Auto-overlay
  setTypingState: (typing: boolean) => void;
  setAutoOverlayEnabled: (enabled: boolean) => void;

  // Debug API
  onDebugLog: (callback: (log: DebugLogEntry) => void) => () => void;
  setDebugEnabled: (enabled: boolean) => void;
  setDisableDoubleTap: (disabled: boolean) => void;
}
