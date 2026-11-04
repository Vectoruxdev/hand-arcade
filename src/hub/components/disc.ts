import { PROFILE_COLORS } from '../../data/schema.ts';
import type { Glyph, ProfileColor } from '../../data/schema.ts';
import { h } from '../dom.ts';
import { glyphSvg } from './glyphs.ts';

export function colorHex(color: ProfileColor): string {
  return PROFILE_COLORS[color] ?? PROFILE_COLORS.lamp;
}

export function makeDisc(look: { color: ProfileColor; glyph: Glyph }, className = ''): HTMLElement {
  return h('span', {
    class: `disc ${className}`.trim(),
    style: `--disc-color:${colorHex(look.color)}`,
    html: glyphSvg(look.glyph),
  });
}
