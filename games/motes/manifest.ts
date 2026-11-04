import type { GameManifest } from '../../src/games/types.ts';

export const manifest: GameManifest = {
  id: 'motes',
  title: 'Motes',
  tagline: 'Catch glowing motes at dusk with a pinch.',
  description:
    'Catch glowing motes at dusk with a pinch of your fingers. Gold ones are worth five. Forty-five seconds, one hand, see how many you can gather.',
  cover: 'cover.jpg',
  screenshots: ['1.jpg', '2.jpg', '3.jpg'],
  gestures: ['pinch'],
  scoring: { kind: 'high', label: 'Motes', reference: 60 },
  renderer: 'three',
  version: 1,
};
