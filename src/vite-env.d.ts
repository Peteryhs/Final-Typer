/// <reference types="vite/client" />

interface Window {
  electronAPI: ElectronAPI;
}

type SpeedMode = 'constant' | 'dynamic';

interface TypingAdvancedOptions {
  realizationSensitivity: number;
  reflexRate: number;
  backspaceSpeed: number;
  pauseScale: number;
  burstLength?: number;
  misalignmentChance?: number;
  dynamicMistakes?: boolean;
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

interface ElectronAPI {
  startTyping: (text: string, options: TypingOptions) => Promise<void>;
  stopTyping: () => void;
  toggleOverlay: () => void;
  setConfig: (config: StoredConfig) => void;
  signalStart: () => Promise<void>;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
}
