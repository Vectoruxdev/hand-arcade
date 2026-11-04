// Eight animal line glyphs, drawn once as SVG strokes. Plan v2, section 5.1.

import type { Glyph } from '../../data/schema.ts';

const EYES = (x1: number, x2: number, y: number) =>
  `<circle cx="${x1}" cy="${y}" r="2.2" fill="currentColor" stroke="none"/><circle cx="${x2}" cy="${y}" r="2.2" fill="currentColor" stroke="none"/>`;

export const GLYPH_PATHS: Record<Glyph, string> = {
  fox: `<path d="M12 9 L24 22 H40 L52 9 L50 31 C50 44 41 52 32 55 C23 52 14 44 14 31 Z"/>${EYES(25, 39, 33)}<path d="M28 43 L32 47 L36 43"/>`,
  owl: `<path d="M16 14 L22 20 M48 14 L42 20"/><path d="M18 22 C18 12 46 12 46 22 V40 C46 50 38 56 32 56 C26 56 18 50 18 40 Z"/><circle cx="25" cy="30" r="5"/><circle cx="39" cy="30" r="5"/>${EYES(25, 39, 30)}<path d="M29 40 L32 45 L35 40"/>`,
  bear: `<circle cx="18" cy="18" r="6"/><circle cx="46" cy="18" r="6"/><path d="M14 30 C14 16 50 16 50 30 C50 44 42 54 32 54 C22 54 14 44 14 30 Z"/>${EYES(25, 39, 31)}<path d="M28 41 C28 38 36 38 36 41 C36 44 32 46 32 46 C32 46 28 44 28 41 Z" fill="currentColor" stroke="none"/>`,
  hare: `<path d="M22 30 C16 6 26 6 27 26 M42 30 C48 6 38 6 37 26"/><path d="M18 36 C18 24 46 24 46 36 C46 48 40 56 32 56 C24 56 18 48 18 36 Z"/>${EYES(26, 38, 37)}<path d="M29 46 L32 49 L35 46"/>`,
  otter: `<circle cx="17" cy="24" r="4"/><circle cx="47" cy="24" r="4"/><path d="M14 32 C14 18 50 18 50 32 C50 46 42 54 32 54 C22 54 14 46 14 32 Z"/>${EYES(25, 39, 32)}<path d="M29 42 C29 40 35 40 35 42 C35 44 32 45 32 45 C32 45 29 44 29 42 Z" fill="currentColor" stroke="none"/><path d="M14 44 L24 42 M14 50 L24 46 M50 44 L40 42 M50 50 L40 46"/>`,
  deer: `<path d="M20 26 L14 8 M20 26 L26 10 M14 14 L8 8 M44 26 L50 8 M44 26 L38 10 M50 14 L56 8"/><path d="M20 30 C20 22 44 22 44 30 C44 44 40 56 32 56 C24 56 20 44 20 30 Z"/>${EYES(26, 38, 34)}<path d="M29 48 C29 46 35 46 35 48 C35 50 32 51 32 51 C32 51 29 50 29 48 Z" fill="currentColor" stroke="none"/>`,
  hedgehog: `<path d="M8 40 L12 30 L16 36 L20 24 L24 32 L28 20 L32 30 L36 18 L40 28 L44 20 L48 30 L52 24 L56 34"/><path d="M8 40 C10 52 54 52 56 40 L50 40 C50 50 20 50 14 44 Z"/><circle cx="12" cy="42" r="2.4" fill="currentColor" stroke="none"/><circle cx="22" cy="43" r="1.8" fill="currentColor" stroke="none"/>`,
  goat: `<path d="M22 24 C16 18 16 10 20 6 M42 24 C48 18 48 10 44 6"/><path d="M20 30 C20 20 44 20 44 30 C44 40 42 50 36 54 L32 60 L28 54 C22 50 20 40 20 30 Z"/>${EYES(26, 38, 33)}<path d="M14 36 L22 32 M50 36 L42 32"/>`,
};

export function glyphSvg(id: Glyph): string {
  return `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">${GLYPH_PATHS[id] ?? ''}</svg>`;
}

/** A plus sign for the New player disc. */
export const PLUS_SVG = `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path d="M32 16 V48 M16 32 H48"/></svg>`;
