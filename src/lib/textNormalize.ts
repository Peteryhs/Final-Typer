// Text normalization shared by renderer + Electron main.
// Keeps output in a conservative ASCII subset to avoid SendKeys / encoding quirks.

export function markdownToPlainText(input: string): string {
  if (!input) return '';

  let text = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Preserve code content while removing fence markers.
  text = text.replace(/```[^\n]*\n([\s\S]*?)```/g, '$1');

  // Links and images.
  text = text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<((?:https?:\/\/|mailto:)[^>]+)>/g, '$1');

  // Headings, blockquotes, lists, horizontal rules.
  text = text
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}(?:[-*+])\s+/gm, '')
    .replace(/^\s{0,3}\d+\.\s+/gm, '')
    .replace(/^\s{0,3}(?:[-*_])(?:\s*[-*_]){2,}\s*$/gm, '');

  // Inline markdown syntax.
  text = text
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/_([^_\n]+)_/g, '$1');

  // Keep spacing readable.
  text = text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');

  return text;
}

export function prepareTextForTyping(input: string): string {
  return normalizeTextForTyping(markdownToPlainText(input));
}

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

