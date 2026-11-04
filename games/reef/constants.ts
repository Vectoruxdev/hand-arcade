// Reef simulation constants. Plan v2, sections 11.3, 11.6–11.10. Every number is a first guess
// that lives here and nowhere else; per real hour unless stated.

import type { GestureId } from '../../src/games/types.ts';

export type Species =
  'tetra' | 'goldfish' | 'guppy' | 'angelfish' | 'pleco' | 'clownfish' | 'betta';
export type TankTier = 'ten' | 'twenty' | 'coral';
export type DecorKind = 'plant' | 'driftwood' | 'castle' | 'bubbler' | 'bell' | 'nursery' | 'coral';
export type Band = 'surface' | 'mid' | 'bottom' | 'glass';

export const C = {
  catchUpCapHours: 48,
  stepMinutes: 15,
  hunger: { perHour: 8, goldfishPerHour: 10, hungry: 60, starving: 90, perFlake: 6, eatsAbove: 10 },
  feeding: {
    flakesPerPinch: 5,
    uneatenAfterSec: 20,
    overfeedFlakes: 8,
    overfeedDebris: 8,
    overfeedAlgae: 5,
  },
  mood: {
    goodPerHour: 2,
    hungryPerHour: -3,
    dirtyPerHour: -4,
    schoolPerHour: 1,
    pet: 10,
    petsCounted: 2,
    tap: -15,
    bell: 5,
    clownCoral: 1,
    clownNoCoral: -1,
  },
  growth: { perHour: 4.2, needMood: 60, needHungerBelow: 60 },
  tameness: {
    pet: 8,
    throw: 5,
    decayPerHour: -1,
    decayAfterHours: 48,
    bellAt: 40,
    palmAt: 70,
    palmSeekAt: 30,
  },
  algae: { lightPerHour: 2, darkPerHour: 0.5, plecoPerHour: -3, lightStart: 7, lightEnd: 21 },
  debris: { perUneatenFlake: 1, basePerHour: 0.2, goldfishPerHour: 0.1, vacuumPerSec: 10 },
  water: { driftPerHour: 5, pour: 30, bubblerTarget: 5 },
  decorGrimePerHour: 1,
  shells: {
    moodOk: 40,
    moodGreat: 80,
    cleanWater: 80,
    cleanBonus: 5,
    dailyBonus: 5,
    milestone: 10,
  },
  breeding: { needMood: 80, broodGapDays: 7, fryMin: 2, fryMax: 3, joinAtSize: 2 },
  score: { reference: 500, valuePerSizeRarity: 10, perDecor: 10 },
  signOff: { thumbsUpSec: 1, minVisitSec: 60 },
} as const;

export interface SpeciesInfo {
  name: string;
  shells: number;
  rarity: number;
  maxSize: 1 | 2 | 3 | 4 | 5;
  speed: number;
  band: Band;
  schooling: boolean;
  breedVisits: number;
  needsTier?: TankTier;
  needsCoral?: boolean;
  /** Not for sale in v1 (💡 plan decision 13: no betta bowl). */
  shop: boolean;
  names: string[];
}

export const SPECIES: Record<Species, SpeciesInfo> = {
  tetra: {
    name: 'Neon tetra',
    shells: 15,
    rarity: 1,
    maxSize: 3,
    speed: 0.35,
    band: 'mid',
    schooling: true,
    breedVisits: 3,
    shop: true,
    names: ['Pip', 'Dot', 'Zip', 'Neo', 'Blue', 'Flick', 'Spark', 'Bean'],
  },
  goldfish: {
    name: 'Goldfish',
    shells: 20,
    rarity: 1,
    maxSize: 5,
    speed: 0.15,
    band: 'bottom',
    schooling: false,
    breedVisits: 3,
    shop: true,
    names: ['Goldie', 'Bubbles', 'Sunny', 'Pudge', 'Marigold', 'Nugget'],
  },
  guppy: {
    name: 'Guppy',
    shells: 25,
    rarity: 2,
    maxSize: 3,
    speed: 0.3,
    band: 'surface',
    schooling: true,
    breedVisits: 2,
    shop: true,
    names: ['Gus', 'Poppy', 'Jelly', 'Rainbow', 'Fern', 'Twist'],
  },
  angelfish: {
    name: 'Angelfish',
    shells: 60,
    rarity: 3,
    maxSize: 5,
    speed: 0.2,
    band: 'mid',
    schooling: false,
    breedVisits: 3,
    needsTier: 'twenty',
    shop: true,
    names: ['Halo', 'Grace', 'Silver', 'Luna', 'Sol'],
  },
  pleco: {
    name: 'Pleco',
    shells: 70,
    rarity: 3,
    maxSize: 5,
    speed: 0.1,
    band: 'glass',
    schooling: false,
    breedVisits: 3,
    shop: true,
    names: ['Mop', 'Scrubs', 'Pebble', 'Hoover', 'Moss'],
  },
  clownfish: {
    name: 'Clownfish',
    shells: 80,
    rarity: 4,
    maxSize: 4,
    speed: 0.3,
    band: 'mid',
    schooling: false,
    breedVisits: 3,
    needsCoral: true,
    shop: true,
    names: ['Marlin', 'Coral', 'Tango', 'Clover', 'Dash'],
  },
  betta: {
    name: 'Betta',
    shells: 90,
    rarity: 4,
    maxSize: 3,
    speed: 0.12,
    band: 'mid',
    schooling: false,
    breedVisits: 3,
    shop: false,
    names: ['Ruby', 'Sapphire', 'Flare'],
  },
};

export const SHOP_SPECIES: Species[] = [
  'tetra',
  'goldfish',
  'guppy',
  'angelfish',
  'pleco',
  'clownfish',
];

export interface TankInfo {
  name: string;
  shells: number;
  capacity: number;
  /** Tank width in screen widths; the Coral tank is wider than the screen and steers. */
  width: number;
}

export const TANKS: Record<TankTier, TankInfo> = {
  ten: { name: '10-gallon tank', shells: 0, capacity: 6, width: 1 },
  twenty: { name: '20-gallon tank', shells: 200, capacity: 12, width: 1 },
  coral: { name: 'Coral tank', shells: 600, capacity: 20, width: 1.5 },
};

export const TIER_ORDER: TankTier[] = ['ten', 'twenty', 'coral'];

export interface DecorInfo {
  name: string;
  shells: number;
  scrubbable: boolean;
  hiding: boolean;
  needsTier?: TankTier;
  unique?: boolean;
  unlocks?: GestureId;
}

export const DECOR: Record<DecorKind, DecorInfo> = {
  plant: { name: 'Plant', shells: 10, scrubbable: false, hiding: true },
  driftwood: { name: 'Driftwood', shells: 20, scrubbable: true, hiding: true },
  castle: { name: 'Castle', shells: 40, scrubbable: true, hiding: true },
  bubbler: { name: 'Bubbler', shells: 30, scrubbable: false, hiding: false, unique: true },
  bell: {
    name: 'Feeding bell',
    shells: 25,
    scrubbable: false,
    hiding: false,
    unique: true,
    unlocks: 'wave',
  },
  nursery: { name: 'Nursery net', shells: 30, scrubbable: false, hiding: false, unique: true },
  coral: { name: 'Coral', shells: 40, scrubbable: false, hiding: true, needsTier: 'coral' },
};

export const MAX_DECOR = 10;

export type MilestoneId =
  | 'first-fry'
  | 'fully-grown'
  | 'clean-streak-7'
  | 'every-species'
  | 'coral-tank'
  | 'visits-30'
  | 'best-friend'
  | 'tidy-tank';

export const MILESTONES: Record<MilestoneId, string> = {
  'first-fry': 'First fry',
  'fully-grown': 'First fully grown fish',
  'clean-streak-7': '7-day clean water',
  'every-species': 'Every species owned',
  'coral-tank': 'Coral tank',
  'visits-30': '30 visits',
  'best-friend': 'Best friend',
  'tidy-tank': 'Tidy tank',
};

/** What each tier and purchase teaches (plan 11.5). Visit 1 teaches feed, wipe, vacuum, thumbs up. */
export const TIER_GESTURES: Record<TankTier, GestureId[]> = {
  ten: ['pinch', 'open-hand', 'point', 'thumbs-up'],
  twenty: ['roll'],
  coral: ['steer'],
};
