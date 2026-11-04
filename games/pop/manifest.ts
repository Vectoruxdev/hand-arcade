import type { GameManifest } from '../../src/games/types.ts';

export const manifest: GameManifest = {
  id: 'pop',
  title: 'Balloon Pop',
  tagline: 'Point and pop. Your finger is the pin.',
  description:
    'Point and pop. Balloons rise, your finger is the pin, and the combos stack up fast. Gold balloons are worth three. Sixty seconds, both hands welcome.',
  cover: 'cover.jpg',
  screenshots: ['1.jpg', '2.jpg', '3.jpg'],
  gestures: ['point'],
  scoring: { kind: 'high', label: 'Balloons', reference: 40 },
  renderer: '2d',
  version: 1,
};
