import synonymDictRaw from '../../../dict.json';

// Type the imported dictionary
const synonymDict: Record<string, string[]> = synonymDictRaw as Record<string, string[]>;

// Export the synonym dictionary (loaded from dict.json at project root)
// This provides a comprehensive set of ~500+ words with synonyms
export const SYNONYMS: Record<string, string[]> = synonymDict;

// Legacy export for backwards compatibility
export const BASIC_SYNONYMS = SYNONYMS;

export type WordCasing = 'lower' | 'upper' | 'title' | 'mixed';

export function detectWordCasing(word: string): WordCasing {
  const letters = word.replace(/[^A-Za-z]/g, '');
  if (!letters) return 'mixed';
  if (letters.toUpperCase() === letters) return 'upper';
  if (letters.toLowerCase() === letters) return 'lower';
  const first = letters[0] ?? '';
  const rest = letters.slice(1);
  if (first.toUpperCase() === first && rest.toLowerCase() === rest) return 'title';
  return 'mixed';
}

export function applyCasing(word: string, casing: WordCasing): string {
  switch (casing) {
    case 'upper':
      return word.toUpperCase();
    case 'lower':
      return word.toLowerCase();
    case 'title':
      return word.length ? word[0].toUpperCase() + word.slice(1).toLowerCase() : word;
    case 'mixed':
    default:
      return word;
  }
}

/**
 * Get synonyms for a word (case-insensitive lookup)
 */
export function getSynonyms(word: string): string[] | undefined {
  return SYNONYMS[word.toLowerCase()];
}

/**
 * Check if a word has synonyms
 */
export function hasSynonyms(word: string): boolean {
  return word.toLowerCase() in SYNONYMS;
}

/**
 * Get a random synonym for a word, or undefined if none available
 */
export function getRandomSynonym(word: string, randomFn: () => number = Math.random): string | undefined {
  const synonyms = getSynonyms(word);
  if (!synonyms || synonyms.length === 0) return undefined;

  // Filter out multi-word synonyms (they can be awkward substitutions)
  const singleWordSynonyms = synonyms.filter(s => !s.includes(' '));
  if (singleWordSynonyms.length === 0) return undefined;

  const selected = singleWordSynonyms[Math.floor(randomFn() * singleWordSynonyms.length)];

  // Apply the original word's casing to the synonym
  const originalCasing = detectWordCasing(word);
  return applyCasing(selected!, originalCasing);
}
