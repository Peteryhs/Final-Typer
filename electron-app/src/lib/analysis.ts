export interface TextAnalysisResult {
  word_count: number;
  unique_word_count: number;
  character_count: number;
  average_word_length: number;
  letter_frequency: Record<string, number>;
  word_frequency: Record<string, number>;
  sentence_count: number;
}

export function textAnalysis(text: string): TextAnalysisResult {
  if (!text) {
    return {
      word_count: 0,
      unique_word_count: 0,
      character_count: 0,
      average_word_length: 0,
      letter_frequency: {},
      word_frequency: {},
      sentence_count: 0,
    };
  }

  const words = text.toLowerCase().match(/[\w']+|[.,!?;:]+/g) || [];
  const word_count = words.length;
  const unique_word_count = new Set(words).size;
  const character_count = text.length;
  const total_word_length = words.reduce((sum, word) => sum + word.length, 0);
  const average_word_length = word_count > 0 ? total_word_length / word_count : 0;

  const letters = text.toLowerCase().match(/[a-z]/g) || [];
  const letter_frequency: Record<string, number> = {};
  letters.forEach((l) => (letter_frequency[l] = (letter_frequency[l] || 0) + 1));

  const word_frequency: Record<string, number> = {};
  words.forEach((w) => (word_frequency[w] = (word_frequency[w] || 0) + 1));

  // Basic sentence splitting similar to Python's re.split
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const sentence_count = sentences.length;

  return {
    word_count,
    unique_word_count,
    character_count,
    average_word_length,
    letter_frequency,
    word_frequency,
    sentence_count,
  };
}

export function mistakeAnalysis(speed: number, analysis: TextAnalysisResult): number {
  const base_rate = (speed / 200) * 0.05;
  const word_complexity = analysis.average_word_length / 5;
  const vocabulary_complexity =
    analysis.word_count > 0
      ? (analysis.unique_word_count * 10) / analysis.word_count
      : 1;
  
  const difficult_letters = ['z', 'q', 'x', 'j', 'k', 'v', 'b', 'p'];
  const total_letters = Object.values(analysis.letter_frequency).reduce((a, b) => a + b, 0);
  
  let difficult_letter_count = 0;
  difficult_letters.forEach(l => {
    difficult_letter_count += analysis.letter_frequency[l] || 0;
  });

  const letter_difficulty =
    total_letters > 0
      ? (difficult_letter_count + total_letters) / total_letters
      : 1;

  const mistake_rate =
    (base_rate * (word_complexity + vocabulary_complexity + letter_difficulty)) / 10;
  
  return mistake_rate;
}

export interface SpeedTagResult {
  cleanText: string;
  speedMap: Record<number, number>; // Index in cleanText -> Speed
}

export function parseSpeedTags(text: string): SpeedTagResult {
  let cleanText = "";
  const speedMap: Record<number, number> = {};
  
  const regex = /\[\[(\d+)\]\]/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Append text before the tag
    cleanText += text.substring(lastIndex, match.index);
    
    // Record the speed change at the current end of cleanText
    const speed = parseInt(match[1], 10);
    if (!isNaN(speed)) {
      speedMap[cleanText.length] = speed;
    }

    lastIndex = regex.lastIndex;
  }
  
  // Append remaining text
  cleanText += text.substring(lastIndex);

  return { cleanText, speedMap };
}
