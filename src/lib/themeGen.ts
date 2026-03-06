/**
 * Dynamic theme generation from a single seed color.
 * Converts the seed into a full light/dark palette with proper
 * contrast ratios for backgrounds, surfaces, and accent colors.
 */

// ─── HSL helpers ────────────────────────────────────────────

interface HSL { h: number; s: number; l: number; }

function hexToHsl(hex: string): HSL {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0, s = 0;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
            case g: h = ((b - r) / d + 2) / 6; break;
            case b: h = ((r - g) / d + 4) / 6; break;
        }
    }

    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToHex(h: number, s: number, l: number): string {
    h = ((h % 360) + 360) % 360;
    s = Math.max(0, Math.min(100, s)) / 100;
    l = Math.max(0, Math.min(100, l)) / 100;

    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;

    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }

    const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

// ─── Palette generation ──────────────────────────────────────

export interface GeneratedPalette {
    primary: string;
    secondary: string;
    background: string;
    surface: string;
}

/**
 * Given a single hex seed color, produce a full UI palette for both
 * light and dark modes.  The algorithm:
 *
 * • Primary: the seed itself, lightened for dark mode readability.
 * • Secondary: a desaturated, slightly hue-shifted companion.
 * • Background / Surface: very dark (dark mode) or very light (light mode)
 *   tinted versions of the seed hue so every section feels cohesive.
 */
export function generatePalette(seedHex: string): { light: GeneratedPalette; dark: GeneratedPalette } {
    // Validate hex – if invalid (e.g. old palette name from localStorage), fallback to violet
    if (!/^#[0-9A-Fa-f]{6}$/.test(seedHex) && !/^#[0-9A-Fa-f]{3}$/.test(seedHex)) {
        seedHex = '#7C3AED';
    }
    const { h, s } = hexToHsl(seedHex);

    // Clamp saturation so neons don't blow out backgrounds
    const baseSat = Math.min(s, 90);

    return {
        dark: {
            // Primary – light enough to pop on dark backgrounds (~75-80% lightness)
            primary: hslToHex(h, Math.min(baseSat + 10, 100), 78),
            // Secondary – desaturated, slightly shifted hue
            secondary: hslToHex((h + 20) % 360, Math.max(baseSat - 25, 15), 75),
            // Background – extremely dark, very low saturation tint of seed hue
            background: hslToHex(h, Math.min(baseSat, 30), 7),
            // Surface – slightly lighter than background, subtle tint
            surface: hslToHex(h, Math.min(baseSat, 25), 11),
        },
        light: {
            // Primary – medium‑dark for contrast on white backgrounds
            primary: hslToHex(h, Math.min(baseSat + 5, 100), 38),
            // Secondary – muted companion
            secondary: hslToHex((h + 20) % 360, Math.max(baseSat - 20, 20), 45),
            // Background – nearly white with a whisper of the seed hue
            background: hslToHex(h, Math.min(baseSat, 40), 98),
            // Surface – a touch darker, still very light
            surface: hslToHex(h, Math.min(baseSat, 35), 93),
        },
    };
}

// ─── Preset quick-pick colors ────────────────────────────────

export const PRESET_COLORS: { name: string; hex: string }[] = [
    { name: 'Violet', hex: '#7C3AED' },
    { name: 'Blue', hex: '#2563EB' },
    { name: 'Cyan', hex: '#06B6D4' },
    { name: 'Green', hex: '#16A34A' },
    { name: 'Lime', hex: '#65A30D' },
    { name: 'Amber', hex: '#D97706' },
    { name: 'Orange', hex: '#EA580C' },
    { name: 'Red', hex: '#DC2626' },
    { name: 'Pink', hex: '#DB2777' },
    { name: 'Rose', hex: '#E11D48' },
    { name: 'Slate', hex: '#64748B' },
    { name: 'Teal', hex: '#0D9488' },
];
