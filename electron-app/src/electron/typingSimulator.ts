import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { app } from 'electron';
import { TextAnalysisResult, mistakeAnalysis, parseSpeedTags } from '../lib/analysis';

interface TypingOptions {
  speed: number; // WPM (Base)
  speedMode: 'constant' | 'dynamic';
  speedVariance: number; // 0.0 to 1.0
  mistakeRate: number; // 0.0 to 1.0
  fatigueMode: boolean;
  analysis: TextAnalysisResult;
  advanced?: {
    realizationSensitivity: number;
    reflexRate: number;
    backspaceSpeed: number;
    pauseScale: number;
    burstLength?: number;
    misalignmentChance?: number;
    dynamicMistakes?: boolean;
  };
}

let typerProcess: ChildProcess | null = null;
let isTyping = false;
let abortController: AbortController | null = null;

// Helper to escape characters for SendKeys
function escapeKey(char: string): string {
  const special = ['+', '^', '%', '~', '(', ')', '{', '}', '[', ']'];
  if (special.includes(char)) {
    return `{${char}}`;
  }
  return char;
}

// Get nearby key (simplified layout map)
function getNearbyKey(char: string): string {
  const layout: Record<string, string> = {
    'q': 'wa', 'w': 'qeasd', 'e': 'wrsdf', 'r': 'etdfg', 't': 'ryfgh',
    'y': 'tughj', 'u': 'yihjk', 'i': 'uojkl', 'o': 'ipkl;', 'p': 'o[l;\'',
    'a': 'qwsz', 's': 'wedxza', 'd': 'erfcxs', 'f': 'rtgvcx', 'g': 'tyhbvf',
    'h': 'yujnbg', 'j': 'uikmnh', 'k': 'iolmj', 'l': 'op;,k',
    'z': 'asx', 'x': 'sdc', 'c': 'dfv', 'v': 'fgb', 'b': 'ghn',
    'n': 'hjm', 'm': 'jk,',
    "'": "\"[];", '"': "'[];", ';': 'l,.', ':': ';',
  };
  const nearby = layout[char.toLowerCase()];
  if (nearby) {
    return nearby[Math.floor(Math.random() * nearby.length)];
  }
  return char;
}

const commonWords: Record<string, number> = {
  'the': 0.9, 'be': 0.94, 'to': 0.92, 'of': 0.93, 'and': 0.92,
  'a': 0.95, 'in': 0.94, 'that': 0.96, 'have': 0.95, 'i': 0.9,
  'it': 0.93, 'for': 0.94, 'not': 0.95, 'on': 0.94, 'with': 0.95,
  'he': 0.95, 'as': 0.95, 'you': 0.94, 'do': 0.95, 'at': 0.95,
  'this': 0.95, 'but': 0.95, 'his': 0.95, 'by': 0.94, 'from': 0.95,
};

function getWordDifficulty(word: string, analysis: TextAnalysisResult): number {
  const avgLen = analysis.average_word_length > 0 ? analysis.average_word_length : 1;
  const lengthFactor = (word.length / avgLen) * 1.5;
  const frequencyFactor = analysis.word_frequency[word.toLowerCase()] ? 1.0 : 1.5;
  return lengthFactor * frequencyFactor;
}

function naturalPause(word: string, analysis: TextAnalysisResult, scale: number = 1.0): number {
  let val = 0;
  if (/[.!?;]+$/.test(word)) val = Math.random() * (2.5 - 0.8) + 0.8;
  else if ([';', ':', "'", '"'].some(c => word.endsWith(c))) val = Math.random() * (0.5 - 0.2) + 0.2;
  else if (getWordDifficulty(word, analysis) > 1.5) val = Math.random() * (0.03 - 0.01) + 0.01;
  else if (Math.random() < 0.01) val = Math.random() * (15 - 8) + 8; 
  else val = Math.random() * (0.00005 - 0.00001) + 0.00001;
  
  return val * scale;
}

const clamp = (val: number, min: number, max: number) => Math.min(max, Math.max(min, val));

interface CharacterDynamics {
  delayMultiplier: number;
  mistakeMultiplier: number;
  trailingPause: number;
}

interface CharacterDynamicInput {
  char: string;
  prevChar: string | null;
  nextChar: string | null;
  wordDifficulty: number;
  letterDifficulty: number;
  isBursting: boolean;
  pauseScale: number;
  isWordStart: boolean;
  isWhitespace: boolean;
}

function getLetterDifficultyMultiplier(char: string, analysis: TextAnalysisResult, totalLetters: number): number {
  const lower = char.toLowerCase();
  if (!/[a-z]/.test(lower)) return 1;
  if (totalLetters === 0) return 1.1;

  const freq = analysis.letter_frequency[lower] || 0;
  const ratio = freq / totalLetters;
  const baseline = 0.065; // rough english average
  const diff = 1 + (baseline - ratio) * 1.8;
  return clamp(diff, 0.85, 1.35);
}

function getCharacterDynamics(input: CharacterDynamicInput): CharacterDynamics {
  let delayMultiplier = 1;
  let mistakeMultiplier = 1;
  let trailingPause = 0;

  delayMultiplier *= input.letterDifficulty;
  mistakeMultiplier *= input.letterDifficulty;

  if (input.wordDifficulty > 1.2) {
    const over = input.wordDifficulty - 1.2;
    delayMultiplier *= 1 + over * 0.07;
    mistakeMultiplier *= 1 + over * 0.1;
  } else {
    delayMultiplier *= 0.98;
    mistakeMultiplier *= 0.9;
  }

  if (input.isBursting) {
    delayMultiplier *= 0.9;
    mistakeMultiplier *= 0.85;
  }

  if (/[A-Z]/.test(input.char)) {
    delayMultiplier *= 1.08;
    mistakeMultiplier *= 1.05;
  }

  if (/\d/.test(input.char)) {
    delayMultiplier *= 1.04;
  }

  if (/[(){}\[\]]/.test(input.char)) {
    delayMultiplier *= 1.05;
    mistakeMultiplier *= 1.05;
  }

  if (/[.!?]/.test(input.char)) {
    trailingPause += 0.18 + Math.random() * 0.25;
    delayMultiplier *= 1.2;
  } else if (/[,:;]/.test(input.char)) {
    trailingPause += 0.08 + Math.random() * 0.15;
    delayMultiplier *= 1.1;
  } else if (input.char === '\n') {
    trailingPause += 0.3 + Math.random() * 0.5;
  } else if (input.char === '-' && input.nextChar && /\w/.test(input.nextChar)) {
    trailingPause += 0.05 + Math.random() * 0.1;
  }

  if (input.isWordStart && !input.isWhitespace && !/[.!?]/.test(input.char)) {
    delayMultiplier *= 1.03;
  }

  if (input.prevChar && input.prevChar === input.char && /[a-z]/i.test(input.char)) {
    mistakeMultiplier *= 0.75;
  }

  if (input.isWhitespace) {
    mistakeMultiplier *= 0.5;
  }

  delayMultiplier = clamp(delayMultiplier, 0.5, 1.8);
  mistakeMultiplier = clamp(mistakeMultiplier, 0.5, 1.4);

  return {
    delayMultiplier,
    mistakeMultiplier,
    trailingPause: trailingPause * input.pauseScale
  };
}

async function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new Error('Aborted'));
    const t = setTimeout(() => resolve(), ms * 1000);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new Error('Aborted'));
    });
  });
}

export async function startTyping(text: string, options: TypingOptions) {
  if (isTyping) return;
  isTyping = true;
  abortController = new AbortController();
  const { signal } = abortController;

  // Advanced Defaults
  const adv = {
    realizationSensitivity: 0.15,
    reflexRate: 0.05,
    backspaceSpeed: 0.06,
    pauseScale: 1.0,
    burstLength: 4,
    misalignmentChance: 0.15,
    dynamicMistakes: true,
    ...options.advanced
  };

  const typerPath = app.isPackaged 
    ? path.join(process.resourcesPath, 'Typer.exe')
    : path.join(__dirname, '../../../src/electron/Typer.exe');

  console.log('Starting Typer from:', typerPath);

  try {
    typerProcess = spawn(typerPath);
    
    typerProcess.on('error', (err) => {
      console.error('Failed to start Typer.exe:', err);
    });
    
    await new Promise(r => setTimeout(r, 100));

    const writeToTyper = (payload: string) => {
        if (!typerProcess || !typerProcess.stdin) {
            console.warn('Typer process not ready for input.');
            return;
        }
        typerProcess.stdin.write(payload);
    };

    // Track typed output locally so we can reconcile at the end.
    let typedBuffer = "";
    let caretPosition = 0;

    const insertAtCaret = (value: string) => {
        if (!value) return;
        typedBuffer = typedBuffer.slice(0, caretPosition) + value + typedBuffer.slice(caretPosition);
        caretPosition += value.length;
    };

    const applyBackspace = () => {
        if (caretPosition === 0) return;
        typedBuffer = typedBuffer.slice(0, caretPosition - 1) + typedBuffer.slice(caretPosition);
        caretPosition = Math.max(0, caretPosition - 1);
    };

    const applyArrow = (direction: 'LEFT' | 'RIGHT') => {
        if (direction === 'LEFT') {
            caretPosition = Math.max(0, caretPosition - 1);
        } else {
            caretPosition = Math.min(typedBuffer.length, caretPosition + 1);
        }
    };

    const sendTextInput = (value: string) => {
        if (!value) return;
        const escaped = value.split('').map((ch) => escapeKey(ch)).join('');
        writeToTyper(escaped + '\n');
        insertAtCaret(value);
    };

    const pressEnterKey = () => {
        writeToTyper('{ENTER}\n');
        insertAtCaret('\n');
    };

    const pressBackspaceKey = () => {
        writeToTyper('{BACKSPACE}\n');
        applyBackspace();
    };

    const pressArrowKey = (direction: 'LEFT' | 'RIGHT') => {
        writeToTyper(`{${direction}}\n`);
        applyArrow(direction);
    };

    const moveCursorSteps = async (direction: 'LEFT' | 'RIGHT', steps: number, delay = 0.02) => {
        for (let k = 0; k < steps; k++) {
            pressArrowKey(direction);
            await sleep(delay, signal);
        }
    };

    const moveCaretToIndex = async (targetIndex: number, delay = 0.02) => {
        const sanitizedTarget = Math.max(0, Math.min(targetIndex, typedBuffer.length));
        const distance = sanitizedTarget - caretPosition;
        if (distance === 0) return;
        if (distance > 0) {
            await moveCursorSteps('RIGHT', distance, delay);
        } else {
            await moveCursorSteps('LEFT', Math.abs(distance), delay);
        }
    };

    const findFirstMismatch = (current: string, target: string): number => {
        const minLen = Math.min(current.length, target.length);
        for (let i = 0; i < minLen; i++) {
            if (current[i] !== target[i]) return i;
        }
        if (current.length !== target.length) return minLen;
        return -1;
    };

    const reconcileFinalOutput = async (targetText: string) => {
        if (typedBuffer === targetText) return;
        let guard = 0;
        const guardLimit = (targetText.length + typedBuffer.length) * 4 + 200;

        while (!signal.aborted && guard < guardLimit) {
            guard++;
            const mismatchIndex = findFirstMismatch(typedBuffer, targetText);
            if (mismatchIndex === -1) break;

            const currentLen = typedBuffer.length;
            const targetLen = targetText.length;

            if (currentLen > targetLen) {
                await moveCaretToIndex(mismatchIndex + 1);
                pressBackspaceKey();
                await sleep(0.04, signal);
                continue;
            }

            if (currentLen < targetLen) {
                await moveCaretToIndex(mismatchIndex);
                sendTextInput(targetText[mismatchIndex]);
                await sleep(0.05, signal);
                continue;
            }

            // Same length, replace char
            await moveCaretToIndex(mismatchIndex + 1);
            pressBackspaceKey();
            await sleep(0.04, signal);
            await moveCaretToIndex(mismatchIndex);
            sendTextInput(targetText[mismatchIndex]);
            await sleep(0.05, signal);
        }

        if (typedBuffer.length !== targetText.length) {
            const difference = targetText.length - typedBuffer.length;
            if (difference > 0) {
                const insertionStart = typedBuffer.length;
                await moveCaretToIndex(insertionStart);
                for (let i = 0; i < difference && !signal.aborted; i++) {
                    const char = targetText[insertionStart + i];
                    if (!char) break;
                    sendTextInput(char);
                    await sleep(0.04, signal);
                }
            } else if (difference < 0) {
                const removalCount = Math.abs(difference);
                await moveCaretToIndex(typedBuffer.length);
                for (let i = 0; i < removalCount && !signal.aborted; i++) {
                    pressBackspaceKey();
                    await sleep(0.035, signal);
                }
            }
        }

        if (typedBuffer !== targetText) {
            console.warn('Final reconciliation incomplete.');
        }
    };

    // Normalize text
    let normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    let speedMap: Record<number, number> = {};

    // Parse Speed Tags if Dynamic
    if (options.speedMode === 'dynamic') {
       const parsed = parseSpeedTags(normalizedText);
       normalizedText = parsed.cleanText;
       speedMap = parsed.speedMap;
    }

    // Initial Speed Setup
    let currentSpeed = options.speed;
    const getBaseDelay = (wpm: number) => (60 / (Math.max(10, wpm) * 7)) * 0.5;
    let baseDelay = getBaseDelay(currentSpeed);
    let targetSpeed = currentSpeed; // For smooth transitions

    const words = normalizedText.split(/\s+/).filter(w => w.length > 0); 
    let currentWordIndex = 0;
    let currentWord = "";
    
    // State for backtracking
    let currentIndex = 0;
    let firstErrorIndex: number | null = null;
    
    // State for Periodic Review
    let lastReviewTime = Date.now();
    interface MissedError {
        index: number;
        correctChar: string;
        position: number;
    }
    let missedErrors: MissedError[] = [];
    const reviewMissedErrors = async (startingCursor: number, returnPosition: number | null) => {
        if (missedErrors.length === 0) return;
        await sleep(Math.random() * 0.5 + 0.5, signal);
        missedErrors.sort((a, b) => b.position - a.position);
        let visualCursor = startingCursor;
        for (const err of missedErrors) {
            const targetPos = err.position + 1;
            const delta = visualCursor - targetPos;
            if (delta > 0) {
                await moveCursorSteps('LEFT', delta);
            } else if (delta < 0) {
                await moveCursorSteps('RIGHT', Math.abs(delta));
            }
            visualCursor = targetPos;
            await sleep(0.2, signal);
            pressBackspaceKey();
            await sleep(0.1, signal);
            sendTextInput(err.correctChar);
            await sleep(0.12, signal);
        }
        if (returnPosition !== null) {
            const diff = returnPosition - visualCursor;
            if (diff > 0) {
                await moveCursorSteps('RIGHT', diff);
            } else if (diff < 0) {
                await moveCursorSteps('LEFT', Math.abs(diff));
            }
        }
        missedErrors = [];
        lastReviewTime = Date.now();
        await sleep(0.5, signal);
    };

    interface HistoryItem {
        index: number;
        backspaces: number;
        isWordEnd: boolean;
        preCurrentWord: string;
        wordIndexSnapshot: number;
    }
    const history: HistoryItem[] = [];

    // New Human-like States
    const getNextBurst = () => Math.max(1, Math.floor(Math.random() * 3) + ((adv.burstLength || 4) - 1));
    let burstRemaining = getNextBurst();
    let misalignedRemaining = 0; // Counter for "hands shifted" errors
    const calculatedMistakeBase = mistakeAnalysis(options.speed, options.analysis);
    const totalLetters = Object.values(options.analysis.letter_frequency).reduce((sum, count) => sum + count, 0);
    const letterDifficultyCache: Record<string, number> = {};
    const resolveLetterDifficulty = (char: string) => {
        if (!/[a-z]/i.test(char)) return 1;
        const key = char.toLowerCase();
        if (letterDifficultyCache[key] !== undefined) return letterDifficultyCache[key];
        const value = getLetterDifficultyMultiplier(key, options.analysis, totalLetters);
        letterDifficultyCache[key] = value;
        return value;
    };

    while (currentIndex < normalizedText.length) {
      if (signal.aborted) break;

      // SPEED LOGIC: Check for manual tag at this index
      if (speedMap[currentIndex] !== undefined) {
          targetSpeed = speedMap[currentIndex];
          // Instant change for manual tags
          currentSpeed = targetSpeed; 
          baseDelay = getBaseDelay(currentSpeed);
      } else if (options.speedMode === 'dynamic') {
          // Random Drift logic
          // Every 10 characters, drift target speed slightly based on variance
          if (currentIndex % 10 === 0) {
             // Drift targetSpeed around the original options.speed (base)
             const noise = (Math.random() * 2 - 1) * (options.speed * options.speedVariance);
             targetSpeed = Math.max(10, options.speed + noise);
          }
          
          // Smoothly interpolate currentSpeed to targetSpeed
          const alpha = 0.1; // Smoothing factor
          currentSpeed += (targetSpeed - currentSpeed) * alpha;
          baseDelay = getBaseDelay(currentSpeed);
      }

      // 0. Periodic Review (unchanged logic, compacted)
      if (Date.now() - lastReviewTime > 30000 && missedErrors.length > 0 && firstErrorIndex === null) {
          await reviewMissedErrors(caretPosition, caretPosition);
      }

      // 1. Realization / Backtrack
      if (firstErrorIndex !== null) {
          const distance = currentIndex - firstErrorIndex;
          const realizationChance = 0.05 + (distance * adv.realizationSensitivity); 
          
          if (Math.random() < realizationChance) {
               // REALIZATION TRIGGERED
               await sleep(Math.random() * 0.4 + 0.2, signal);

               // Backtrack Loop
               while (history.length > 0 && history[history.length - 1].index >= firstErrorIndex) {
                   const item = history.pop();
                   if (item) {
                       // Improvement: Fast backtrack for "rage delete"
                       // If we have > 5 chars to delete, speed up significantly
                       const speedMod = distance > 5 ? 0.5 : 1.0;

                       for (let k = 0; k < item.backspaces; k++) {
                           pressBackspaceKey();
                           await sleep(adv.backspaceSpeed * speedMod, signal);
                       }
                       currentWordIndex = item.wordIndexSnapshot;
                       currentWord = item.preCurrentWord;
                   }
               }

               currentIndex = firstErrorIndex;
               firstErrorIndex = null;
               misalignedRemaining = 0; // Reset misalignment on correction
               
               await sleep(0.3, signal);
               continue;
          }
      }

      // 2. Processing Next Character
      const char = normalizedText[currentIndex];
      const preCurrentWord = currentWord;
      const wordIndexSnapshot = currentWordIndex;
      const isAlphaChar = /[a-zA-Z]/.test(char);
      const activeWord = isAlphaChar ? `${preCurrentWord}${char.toLowerCase()}` : preCurrentWord;
      const normalizedActiveWord = activeWord ? activeWord.toLowerCase() : "";
      
      // Update currentWord context
      if (isAlphaChar) {
        currentWord = activeWord;
      } else if (/["'. ,!?;:\n]/.test(char)) { // Include newline as resetter
        currentWord = "";
      }

      const wordDifficulty = normalizedActiveWord ? getWordDifficulty(normalizedActiveWord, options.analysis) : 1;

      let wordSpeedFactor = 1.0;
      if (normalizedActiveWord) {
          const difficultySlowdown = clamp(1 + Math.max(0, wordDifficulty - 1) * 0.08, 0.85, 1.35);
          wordSpeedFactor *= difficultySlowdown;
          const commonModifier = commonWords[normalizedActiveWord];
          if (commonModifier) {
              wordSpeedFactor *= clamp(commonModifier, 0.75, 1);
          }
      }
      if ([ "'", '"'].includes(char)) wordSpeedFactor *= 1.1;
      wordSpeedFactor = clamp(wordSpeedFactor, 0.6, 1.5);

      const prevChar = currentIndex > 0 ? normalizedText[currentIndex - 1] : null;
      const nextChar = currentIndex < normalizedText.length - 1 ? normalizedText[currentIndex + 1] : null;
      const isWhitespace = /\s/.test(char);
      const isWordStart = !prevChar || /\s/.test(prevChar) || /[([{]/.test(prevChar);
      const letterDifficulty = resolveLetterDifficulty(char);
      const charDynamics = getCharacterDynamics({
          char,
          prevChar,
          nextChar,
          wordDifficulty,
          letterDifficulty,
          isBursting: burstRemaining > 0,
          pauseScale: adv.pauseScale,
          isWordStart,
          isWhitespace
      });

      let typedContent = "";
      let backspacesNeeded = 0;

      if (char === '\n') {
          pressEnterKey();
          typedContent = "\n";
          backspacesNeeded = 1; 
      } else {
          // Dynamic Mistake Probability
          let effectiveMistakeRate = options.mistakeRate;
          
          if (options.mistakeRate > 0) {
              const difficultyMult = wordDifficulty ? (1 + (wordDifficulty - 1) * 0.5) : 1;
              // Normalize: Scale input down to counter multipliers, treat analysis as modifier
              const sysFactor = adv.dynamicMistakes ? (1 + calculatedMistakeBase * 5) : 1;
              const base = options.mistakeRate * 0.6 * sysFactor;
              
              effectiveMistakeRate = base * difficultyMult;
              effectiveMistakeRate *= charDynamics.mistakeMultiplier;
              
              if (misalignedRemaining > 0) {
                  effectiveMistakeRate *= 4.0; 
              }
              effectiveMistakeRate = clamp(effectiveMistakeRate, 0, 0.9);
          }

          if (Math.random() < effectiveMistakeRate) {
            const mistakeType = Math.random();
            let typo = '';
            
            if (misalignedRemaining > 0) {
                 typo = getNearbyKey(char);
                 misalignedRemaining--; 
            } else {
                // Realistic Distribution:
                // 0-5%: Random (Brain fart)
                // 5-20%: Double hit
                // 20-35%: Missed key
                // 35-100%: Nearby key (Fat finger)
                if (mistakeType < 0.05) typo = String.fromCharCode(Math.floor(Math.random() * 26) + 97); 
                else if (mistakeType < 0.20) typo = char + char; 
                else if (mistakeType < 0.35) typo = ''; 
                else {
                    typo = getNearbyKey(char);
                    if (Math.random() < (adv.misalignmentChance || 0.12)) {
                        misalignedRemaining = Math.floor(Math.random() * 2) + 1; 
                    }
                }
            }

            if (firstErrorIndex === null && typo !== char) { 
                const isSubstitution = typo.length === 1 && char.length === 1;
                if (isSubstitution && Math.random() < 0.2) {
                    // Leave for later
                } else {
                    firstErrorIndex = currentIndex;
                }
            }

            if (typo !== '') {
                 if (Math.random() < adv.reflexRate) { 
                     sendTextInput(typo);
                     await sleep(0.15, signal);
                     for (let k = 0; k < typo.length; k++) {
                         pressBackspaceKey();
                         await sleep(0.05, signal);
                     }
                     sendTextInput(char);
                     typedContent = char;
                     backspacesNeeded = 1; 
                     if (firstErrorIndex === currentIndex) firstErrorIndex = null; 
                     misalignedRemaining = 0; // Caught it immediately
                 } else {
                     // Commit
                     const insertionPoint = caretPosition;
                     sendTextInput(typo);
                     typedContent = typo;
                     backspacesNeeded = typo.length;
                     if (firstErrorIndex === null && typo !== char && typo.length === 1 && char.length === 1) {
                         missedErrors.push({ index: currentIndex, correctChar: char, position: insertionPoint });
                     }
                 }
            } else {
                typedContent = "";
                backspacesNeeded = 0;
            }
          } else {
            sendTextInput(char);
            typedContent = char;
            backspacesNeeded = 1;
            if (misalignedRemaining > 0 && Math.random() < 0.5) {
                misalignedRemaining = 0;
            }
          }
      }

      // Delay Calculation
      let variance = Math.random() * (1.4 - 0.6) + 0.6;
      let delay = baseDelay * variance * wordSpeedFactor * charDynamics.delayMultiplier;
      
      // Fatigue only if NOT dynamic mode
      if (options.fatigueMode && options.speedMode !== 'dynamic') {
        delay *= (currentIndex * 0.0005 + 1); 
      }
      
      await sleep(delay, signal);

      if (charDynamics.trailingPause > 0 && (!isWhitespace || char === '\n')) {
          await sleep(charDynamics.trailingPause, signal);
      }

      // Word End / Pause Logic
      const isPrevWhitespace = prevChar ? /\s/.test(prevChar) : false;
      
      const isWordEnd = (isWhitespace && !isPrevWhitespace) || (currentIndex === normalizedText.length - 1 && !isWhitespace);

      history.push({ 
          index: currentIndex, 
          backspaces: backspacesNeeded, 
          isWordEnd,
          preCurrentWord,
          wordIndexSnapshot
      });

      if (isWordEnd) {
         if (currentWordIndex < words.length) {
             let pauseTime = naturalPause(words[currentWordIndex], options.analysis, adv.pauseScale);
             if (char === '\n') {
                 pauseTime += 0.1 + Math.random() * 0.15;
                 if (nextChar === '\n') {
                     pauseTime += 0.2 + Math.random() * 0.3;
                 }
             }
             
             // Update Burst
             burstRemaining--;
             if (burstRemaining <= 0) {
                 // End of burst: Extra "Thinking" pause
                 pauseTime += Math.random() * 0.3 + 0.2;
                 burstRemaining = getNextBurst(); // Reset burst
             }
             
             await sleep(pauseTime, signal);
             currentWordIndex++;
         }
      }
      
      currentIndex++;
    }
    
    if (!signal.aborted) {
        await reviewMissedErrors(caretPosition, typedBuffer.length);
        await reconcileFinalOutput(normalizedText);
    }
  } catch (err) {
      if ((err as Error).message !== 'Aborted') {
          console.error(err);
      }
  } finally {
    isTyping = false;
    typerProcess?.kill();
    typerProcess = null;
  }
}

export function stopTyping() {
  if (abortController) {
    abortController.abort();
  }
  if (typerProcess) {
    typerProcess.kill();
    typerProcess = null;
  }
  isTyping = false;
}
