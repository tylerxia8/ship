import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Returns a contrast-safe text color (black or white) for a given background color.
 * Uses WCAG relative luminance formula to ensure 4.5:1 contrast ratio.
 */
export function getContrastTextColor(hexColor: string): string {
  // Parse hex color (supports #rgb, #rrggbb, rgb(), and named colors)
  let r: number, g: number, b: number;

  if (hexColor.startsWith('#')) {
    const hex = hexColor.slice(1);
    if (hex.length === 3) {
      // 3-digit hex: each char is a single nibble, doubled. Length is
      // guaranteed 3 by the branch — destructure to assert non-undefined.
      const [h0, h1, h2] = hex;
      if (!h0 || !h1 || !h2) return '#000000';
      r = parseInt(h0 + h0, 16);
      g = parseInt(h1 + h1, 16);
      b = parseInt(h2 + h2, 16);
    } else {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    }
  } else if (hexColor.startsWith('rgb')) {
    const match = hexColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    // The regex has exactly 3 capture groups so match[1..3] are defined when
    // match exists, but TS only sees `string | undefined` from RegExpMatchArray.
    if (match && match[1] && match[2] && match[3]) {
      r = parseInt(match[1], 10);
      g = parseInt(match[2], 10);
      b = parseInt(match[3], 10);
    } else {
      return '#000000'; // Default to black for unparseable colors
    }
  } else {
    return '#000000'; // Default to black for named colors
  }

  // Calculate relative luminance (WCAG formula). The .map preserves length 3,
  // but TS narrows tuple[T] to `T | undefined` under noUncheckedIndexedAccess.
  // Use a tuple destructure to express the guarantee directly.
  const sRGB = [r, g, b].map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  const luminance = 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];

  // Use black text on light backgrounds, white on dark
  // Threshold ~0.179 ensures 4.5:1 contrast ratio for WCAG AA
  return luminance > 0.179 ? '#000000' : '#ffffff';
}
