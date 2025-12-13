const QWERTY_LETTERS = 'abcdefghijklmnopqrstuvwxyz';

export function randomQwertyLetter(): string {
  return QWERTY_LETTERS[Math.floor(Math.random() * QWERTY_LETTERS.length)];
}

// Get nearby key (simplified layout map).
export function getNearbyKey(char: string): string {
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
  if (!nearby) return char;

  // Keep letter typos as letters in typical text (avoid punctuation noise).
  const isAlpha = /[a-z]/i.test(char);
  const candidates = isAlpha ? nearby.replace(/[^a-z]/gi, '') : nearby;
  if (candidates.length > 0) {
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  return isAlpha ? randomQwertyLetter() : char;
}

