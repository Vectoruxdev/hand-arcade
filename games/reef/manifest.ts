import type { GameManifest } from '../../src/games/types.ts';

export const manifest: GameManifest = {
  id: 'reef',
  title: 'Reef',
  tagline: 'Your own tank. Feed, clean and grow it by hand.',
  description:
    'A living tank that belongs to you. Pinch to sprinkle flakes, wipe the glass, vacuum the gravel and pet the fish. It keeps going on the real clock between visits, and a thumbs up banks your Reef value.',
  cover: 'cover.jpg',
  screenshots: ['1.jpg', '2.jpg', '3.jpg'],
  gestures: [
    'pinch',
    'pinch-tap',
    'open-hand',
    'point',
    'thumbs-up',
    'wave',
    'throw',
    'roll',
    'circle',
    'zoom',
    'steer',
  ],
  scoring: { kind: 'high', label: 'Reef value', reference: 500 },
  renderer: 'three',
  version: 1,
};
