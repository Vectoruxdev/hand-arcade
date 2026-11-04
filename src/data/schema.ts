// IndexedDB schema. Plan v2, section 4.1. Database `hand-arcade`, version 1.
// Everything that will sync later carries id, updatedAt and deviceId.

export const DB_NAME = 'hand-arcade';
export const DB_VERSION = 1;

export const STORES = ['profiles', 'saves', 'scores', 'settings'] as const;
export type StoreName = (typeof STORES)[number];

export const PROFILE_COLORS = {
  lamp: '#F2C66D',
  moss: '#5C8A6B',
  rust: '#C8553D',
  sky: '#6FA3C8',
  plum: '#8B6BA8',
  clay: '#C98A5E',
  mint: '#7FBFA3',
  rose: '#D98B9A',
} as const;
export type ProfileColor = keyof typeof PROFILE_COLORS;
export const PROFILE_COLOR_IDS = Object.keys(PROFILE_COLORS) as ProfileColor[];

export const GLYPHS = ['fox', 'owl', 'bear', 'hare', 'otter', 'deer', 'hedgehog', 'goat'] as const;
export type Glyph = (typeof GLYPHS)[number];

export const MAX_PROFILES = 8;
export const MAX_NAME = 12;

export interface Profile {
  id: string;
  /** 1–12 characters: letters, digits, space, apostrophe. */
  name: string;
  color: ProfileColor;
  glyph: Glyph;
  created: number;
  lastPlayed: number;
  updatedAt: number;
  deviceId: string;
  /** 900–2000; undefined = the hub default (1200). */
  dwellMs?: number;
  /** undefined = on. */
  dwellEnabled?: boolean;
}

export interface SaveRow {
  profileId: string;
  gameId: string;
  data: unknown;
  gameVersion: number;
  updatedAt: number;
  deviceId: string;
}

export interface ScoreRow {
  id: string;
  profileId: string;
  gameId: string;
  score: number;
  /** ISO 8601 with the local offset kept, e.g. 2026-11-03T19:04:11-07:00. */
  date: string;
  durationSec?: number;
  bot: boolean;
  gameVersion: number;
  deviceId: string;
  updatedAt: number;
  meta?: Record<string, unknown>;
}

export interface SettingRow {
  key: string;
  value: unknown;
}

export interface CameraRegionSetting {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface Settings {
  activeProfileId: string | null;
  sound: boolean;
  cameraRegion: CameraRegionSetting;
  oneEuro: { minCutoff: number; beta: number; dCutoff: number };
  shelfOrder: string[];
  deviceId: string;
  lastScreen: string | null;
  botSeen: boolean;
  /** Reef: 'HH:MM' to fake the clock for captures; null = real time. */
  clockOverride: string | null;
  /** Set once navigator.storage.persist() succeeded. */
  persisted: boolean;
}

export const DEFAULT_SETTINGS: Omit<Settings, 'deviceId'> = {
  activeProfileId: null,
  sound: true,
  cameraRegion: { x0: 0.15, x1: 0.85, y0: 0.2, y1: 0.8 },
  oneEuro: { minCutoff: 1.2, beta: 0.01, dCutoff: 1.0 },
  shelfOrder: ['pop', 'motes', 'reef'],
  lastScreen: null,
  botSeen: false,
  clockOverride: null,
  persisted: false,
};

/** The standard fall-through migration. Runs inside onupgradeneeded. */
export function migrate(db: IDBDatabase, oldVersion: number): void {
  switch (oldVersion) {
    case 0: {
      const profiles = db.createObjectStore('profiles', { keyPath: 'id' });
      profiles.createIndex('lastPlayed', 'lastPlayed');
      const saves = db.createObjectStore('saves', { keyPath: ['profileId', 'gameId'] });
      saves.createIndex('profileId', 'profileId');
      const scores = db.createObjectStore('scores', { keyPath: 'id' });
      scores.createIndex('byProfileGame', ['profileId', 'gameId']);
      scores.createIndex('byGameDate', ['gameId', 'date']);
      scores.createIndex('byDate', 'date');
      scores.createIndex('byProfile', 'profileId');
      db.createObjectStore('settings', { keyPath: 'key' });
    }
    // falls through to the next version's changes when there are any
  }
}
