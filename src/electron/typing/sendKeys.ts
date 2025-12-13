// Utilities for .NET `System.Windows.Forms.SendKeys.SendWait` payload escaping.
// Typer.exe uses SendKeys, which has its own mini-language for special keys.

export function escapeSendKeysChar(char: string): string {
  // Only a handful of characters are "special" in SendKeys and must be escaped.
  // Importantly, `[` and `]` are NOT special; escaping them (e.g. `{[}`) is invalid.
  switch (char) {
    case '+':
    case '^':
    case '%':
    case '~':
    case '(':
    case ')':
      return `{${char}}`;
    case '{':
      return '{{}'; // literal "{"
    case '}':
      return '{}}'; // literal "}"
    default:
      return char;
  }
}

