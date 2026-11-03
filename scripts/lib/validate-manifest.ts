import { GESTURE_IDS, RENDERERS, SCORING_KINDS } from '../../src/games/types.ts';
import type { GameManifest } from '../../src/games/types.ts';

export interface ManifestProblem {
  field: string;
  message: string;
}

export interface FileChecker {
  /** True when `relativePath` exists inside the game's folder. */
  exists(relativePath: string): boolean;
}

const ID_PATTERN = /^[a-z0-9-]+$/;
const TITLE_MAX = 14;
const TAGLINE_MAX = 60;
const SCREENSHOT_COUNT = 3;

/**
 * Checks one game manifest against the contract (plan v2, 1.3) and the per-game checklist
 * (plan v2, 12.3). Returns an empty list when the manifest is good.
 */
export function validateManifest(
  input: unknown,
  dirName: string,
  files: FileChecker,
): ManifestProblem[] {
  const problems: ManifestProblem[] = [];
  const bad = (field: string, message: string) => problems.push({ field, message });

  if (typeof input !== 'object' || input === null) {
    return [{ field: 'manifest', message: 'manifest.ts must export an object named manifest' }];
  }
  const m = input as Partial<Record<keyof GameManifest, unknown>>;

  if (typeof m.id !== 'string' || !ID_PATTERN.test(m.id)) {
    bad('id', 'must be a string matching /^[a-z0-9-]+$/');
  } else if (m.id !== dirName) {
    bad('id', `must equal the folder name "${dirName}", got "${m.id}"`);
  }

  if (typeof m.title !== 'string' || m.title.length === 0)
    bad('title', 'must be a non-empty string');
  else if (m.title.length > TITLE_MAX) bad('title', `must be ≤ ${TITLE_MAX} characters`);

  if (typeof m.tagline !== 'string' || m.tagline.length === 0) {
    bad('tagline', 'must be a non-empty string');
  } else if (m.tagline.length > TAGLINE_MAX) {
    bad('tagline', `must be ≤ ${TAGLINE_MAX} characters`);
  }

  if (typeof m.description !== 'string' || m.description.trim().length === 0) {
    bad('description', 'must be a non-empty string');
  }

  if (typeof m.cover !== 'string' || m.cover.length === 0) bad('cover', 'must name a file');
  else if (!files.exists(m.cover)) bad('cover', `file not found: ${m.cover}`);

  if (!Array.isArray(m.screenshots)) {
    bad('screenshots', `must be an array of ${SCREENSHOT_COUNT} files`);
  } else {
    if (m.screenshots.length !== SCREENSHOT_COUNT) {
      bad('screenshots', `must list exactly ${SCREENSHOT_COUNT}, got ${m.screenshots.length}`);
    }
    for (const shot of m.screenshots) {
      if (typeof shot !== 'string') bad('screenshots', 'entries must be file names');
      else if (!files.exists(shot)) bad('screenshots', `file not found: ${shot}`);
    }
  }

  if (!Array.isArray(m.gestures) || m.gestures.length === 0) {
    bad('gestures', 'must list at least one gesture the game reads');
  } else {
    const seen = new Set<string>();
    for (const g of m.gestures) {
      if (typeof g !== 'string' || !(GESTURE_IDS as readonly string[]).includes(g)) {
        bad('gestures', `unknown gesture "${String(g)}"; allowed: ${GESTURE_IDS.join(', ')}`);
      } else if (seen.has(g)) {
        bad('gestures', `duplicate gesture "${g}"`);
      }
      if (typeof g === 'string') seen.add(g);
    }
  }

  if (typeof m.scoring !== 'object' || m.scoring === null) {
    bad('scoring', 'must be { kind, label, reference }');
  } else {
    const s = m.scoring as Record<string, unknown>;
    if (
      typeof s['kind'] !== 'string' ||
      !(SCORING_KINDS as readonly string[]).includes(s['kind'])
    ) {
      bad('scoring.kind', `must be one of ${SCORING_KINDS.join(', ')}`);
    }
    if (typeof s['label'] !== 'string' || s['label'].length === 0) {
      bad('scoring.label', 'must be a non-empty string');
    }
    if (typeof s['reference'] !== 'number' || !(s['reference'] > 0)) {
      bad('scoring.reference', 'must be a number > 0 (the score worth 1000 arcade points)');
    }
  }

  if (typeof m.renderer !== 'string' || !(RENDERERS as readonly string[]).includes(m.renderer)) {
    bad('renderer', `must be one of ${RENDERERS.join(', ')}`);
  }

  if (typeof m.version !== 'number' || !Number.isInteger(m.version) || m.version < 1) {
    bad('version', 'must be a positive integer');
  }

  if (m.wantsCameraThumbnail !== undefined && typeof m.wantsCameraThumbnail !== 'boolean') {
    bad('wantsCameraThumbnail', 'must be a boolean when present');
  }

  return problems;
}
