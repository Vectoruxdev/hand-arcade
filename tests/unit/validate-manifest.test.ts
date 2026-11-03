import { describe, expect, it } from 'vitest';

import { validateManifest } from '../../scripts/lib/validate-manifest.ts';
import type { GameManifest } from '../../src/games/types.ts';

const good: GameManifest = {
  id: 'motes',
  title: 'Motes',
  tagline: 'Catch glowing motes at dusk with a pinch of your fingers.',
  description:
    'Catch glowing motes at dusk with a pinch of your fingers. Gold ones are worth five.',
  cover: 'cover.jpg',
  screenshots: ['1.jpg', '2.jpg', '3.jpg'],
  gestures: ['pinch'],
  scoring: { kind: 'high', label: 'Motes', reference: 60 },
  renderer: 'three',
  version: 1,
};

const allFiles = { exists: () => true };
const fields = (problems: { field: string }[]) => problems.map((p) => p.field);

describe('validateManifest', () => {
  it('accepts a complete manifest', () => {
    expect(validateManifest(good, 'motes', allFiles)).toEqual([]);
  });

  it('rejects a non-object', () => {
    expect(fields(validateManifest(null, 'motes', allFiles))).toEqual(['manifest']);
  });

  it('requires the id to match the folder', () => {
    expect(fields(validateManifest(good, 'pop', allFiles))).toEqual(['id']);
  });

  it('requires exactly three screenshots that exist', () => {
    const two = { ...good, screenshots: ['1.jpg', '2.jpg'] };
    expect(fields(validateManifest(two, 'motes', allFiles))).toEqual(['screenshots']);

    const missing = { exists: (p: string) => p !== '3.jpg' };
    expect(validateManifest(good, 'motes', missing)).toEqual([
      { field: 'screenshots', message: 'file not found: 3.jpg' },
    ]);
  });

  it('requires a cover that exists', () => {
    const noCover = { exists: (p: string) => p !== 'cover.jpg' };
    expect(fields(validateManifest(good, 'motes', noCover))).toEqual(['cover']);
  });

  it('only allows known, unique gestures', () => {
    const unknown = { ...good, gestures: ['pinch', 'jazz-hands'] };
    expect(fields(validateManifest(unknown, 'motes', allFiles))).toEqual(['gestures']);

    const dup = { ...good, gestures: ['pinch', 'pinch'] };
    expect(fields(validateManifest(dup, 'motes', allFiles))).toEqual(['gestures']);

    const none = { ...good, gestures: [] };
    expect(fields(validateManifest(none, 'motes', allFiles))).toEqual(['gestures']);
  });

  it('checks scoring, renderer and version', () => {
    const bad = {
      ...good,
      scoring: { kind: 'points', label: '', reference: 0 },
      renderer: 'webgpu',
      version: 0,
    };
    expect(fields(validateManifest(bad, 'motes', allFiles))).toEqual([
      'scoring.kind',
      'scoring.label',
      'scoring.reference',
      'renderer',
      'version',
    ]);
  });

  it('enforces the title and tagline lengths', () => {
    const long = { ...good, title: 'A Title Far Too Long', tagline: 'x'.repeat(61) };
    expect(fields(validateManifest(long, 'motes', allFiles))).toEqual(['title', 'tagline']);
  });
});
