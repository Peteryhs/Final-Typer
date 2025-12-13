// Text normalization shared by renderer + Electron main.
// Keeps output in a conservative ASCII subset to avoid SendKeys / encoding quirks.

export function normalizeTextForTyping(input: string): string {
  // Normalize newlines.
  let text = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Replace common “smart punctuation” with plain ASCII.
  // Note: \u2026 expands to "..." (length change is intentional).
  text = text
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '');

  return text;
}

