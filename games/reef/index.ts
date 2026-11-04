// Reef. Plan v2, section 11. A living tank that belongs to one player, kept on the real clock.

import type { GameHost, GameInstance, GameModule, HandFrame, Vec2 } from '../../src/games/types.ts';
import { pet, pour, ringBell, scrub, tapGlass, throwPellet, vacuum, eatFlake } from './actions.ts';
import { ReefAudio } from './audio.ts';
import { createReefBot } from './bot.ts';
import { C, MILESTONES, SPECIES } from './constants.ts';
import type { MilestoneId } from './constants.ts';
import { ReefGestures } from './gestures.ts';
import type { Intent } from './gestures.ts';
import { ReefHud } from './hud.ts';
import { manifest } from './manifest.ts';
import { createSave, migrateSave } from './model.ts';
import type { Fish, ReefSave } from './model.ts';
import { TankScene } from './scene/tank.ts';
import { advance, reefValue, signOff, summarizeAway, tick } from './simulate.ts';
import { availableGestures, buyDecor, buyFish, buyTank } from './shop.ts';
import {
  canSignOff,
  createVisit,
  dropFlakes,
  dropPellet,
  markClean,
  takeEvents,
  updateFlakes,
} from './visit.ts';
import type { VisitState } from './visit.ts';

let current: { save: ReefSave; visit: VisitState } | null = null;

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

async function mount(host: GameHost): Promise<GameInstance> {
  const now = host.clock.now();
  const loaded = await host.saves.get<unknown>();
  const save = migrateSave(loaded, now) ?? createSave(now);
  const firstVisit = save.visits === 0 && loaded === null;
  const before = clone(save);
  advance(save, now);
  const away = summarizeAway(before, save, now);

  const scene = new TankScene(host.root, host.settings.dpr);
  const audio = new ReefAudio(host);
  const gestures = new ReefGestures();
  const visit = createVisit(now);
  current = { save, visit };
  (window as unknown as { __reef?: unknown }).__reef = current;
  let rngState = (save.seed + save.visits * 131) >>> 0;
  const rng = () => {
    rngState = (rngState * 1664525 + 1013904223) >>> 0;
    return rngState / 4294967296;
  };

  let paused = true;
  let destroyed = false;
  let submitted = false;
  let raf = 0;
  let last = 0;
  let simAcc = 0;
  let dirty = true;
  let petted = new Set<string>();
  let petting = false;
  let petPoint: Vec2 | null = null;
  let vacuumSec = 0;
  let vacuumOn = false;
  let lastSqueegee = 0;
  let cloudUntil = 0;
  let toldFeedFirst = false;
  let wipeCoverageBefore = -1;
  const unlockedThisVisit = new Set<string>();

  const hud = new ReefHud(host, () => openShop());

  const persist = () => void host.saves.set(save);
  const tutorialActive = () => save.visits === 0;

  const refreshChecklist = () => {
    if (!tutorialActive()) {
      hud.setChecklist(null);
      return;
    }
    const t = visit.tutorial;
    const order: ['feed' | 'wipe' | 'vacuum' | 'thumbs', string][] = [
      ['feed', 'Pinch above the water to feed'],
      ['wipe', 'Wipe the glass'],
      ['vacuum', 'Point at the gravel'],
      ['thumbs', 'Thumbs up to finish'],
    ];
    let nowFound = false;
    hud.setChecklist(
      order.map(([k, label]) => {
        const done = t[k];
        const isNow = !done && !nowFound;
        if (isNow) nowFound = true;
        return { label, done, now: isNow };
      }),
    );
    const next = order.find(([k]) => !t[k]);
    if (next) hud.showGhost(next[0], 2500);
  };

  const announce = (
    gesture: string,
    text: string,
    ghost?: 'feed' | 'wipe' | 'vacuum' | 'thumbs' | 'pet' | 'wave',
  ) => {
    if (unlockedThisVisit.has(gesture)) return;
    unlockedThisVisit.add(gesture);
    host.ui.toast(text);
    if (ghost) hud.showGhost(ghost);
  };

  // Unlock toasts for gestures that are newly available this visit (plan 11.5).
  const avail = availableGestures(save);
  const teach = (
    id: string,
    text: string,
    ghost?: 'feed' | 'wipe' | 'vacuum' | 'thumbs' | 'pet' | 'wave',
  ) => {
    if (!avail.has(id) || save.unlocked.includes(id as never)) return;
    save.unlocked.push(id as never);
    announce(id, text, ghost);
  };

  const openShop = () => {
    if (destroyed) return;
    hud.showShop(save, {
      buyFish: (sp) => {
        const r = buyFish(save, sp, host.clock.now());
        if (!r.ok) {
          host.ui.toast(r.why);
          return;
        }
        audio.buy();
        host.ui.toast(`${SPECIES[sp].name} added to your tank`);
        dirty = true;
        persist();
        openShop();
      },
      buyDecor: (kind) => {
        const r = buyDecor(save, kind, host.clock.now());
        if (!r.ok) {
          host.ui.toast(r.why);
          return;
        }
        audio.buy();
        dirty = true;
        persist();
        if (kind === 'bell') announce('wave', 'New: wave to ring the bell', 'wave');
        openShop();
      },
      buyTank: () => {
        const r = buyTank(save, host.clock.now());
        if (!r.ok) {
          host.ui.toast(r.why);
          return;
        }
        audio.buy();
        host.ui.toast(
          save.tank.tier === 'twenty'
            ? 'A bigger tank, with a nursery. Roll your wrist to pour fresh water.'
            : 'The Coral tank. Steer with two hands to look around.',
        );
        dirty = true;
        persist();
        openShop();
      },
      close: () => hud.closeShop(),
    });
  };

  const fishById = (id: string): Fish | undefined => save.tank.fish.find((f) => f.id === id);

  const finishVisit = () => {
    if (submitted) return;
    submitted = true;
    const result = signOff(save, host.clock.now());
    persist();
    audio.chord();
    hud.setHold(0);
    hud.setTool(null, 0, 0);
    const names = result.newMilestones.map((m) => MILESTONES[m as MilestoneId] ?? m);
    const done = () => {
      hud.closeCard();
      host.submitScore(result.value, {
        durationSec: Math.round((host.clock.now() - visit.startedAt) / 1000),
        meta: { shells: result.shells, visits: save.visits, fish: save.tank.fish.length },
      });
    };
    hud.showSignOff(
      { shells: result.shells, value: result.value, newMilestones: names, fry: result.fry.length },
      done,
    );
    // A bot has no hand to pinch Done with; captures still get a beat to see the card.
    if (host.settings.bot) window.setTimeout(done, 1500 / host.settings.fast);
    hud.setShells(save.shells);
    dirty = true;
  };

  const apply = (intent: Intent, f: HandFrame) => {
    const h = scene.bounds.h;
    switch (intent.kind) {
      case 'hand': {
        if (intent.at) hud.setTool(intent.mode, intent.at.x, intent.at.y);
        else hud.setTool(null, 0, 0);
        if (intent.mode !== 'vacuum' && vacuumOn) {
          vacuumOn = false;
          audio.vacuum(false);
        }
        if (intent.mode !== 'pet') {
          petting = false;
          petPoint = null;
        }
        break;
      }
      case 'feed': {
        const p = scene.screenToTank(intent.at.x, intent.at.y);
        dropFlakes(
          visit,
          p.x,
          (rng() - 0.5) * scene.bounds.d * 0.5,
          h * 0.9,
          host.clock.now(),
          rng,
        );
        audio.sprinkle();
        break;
      }
      case 'tap': {
        tapGlass(save);
        const t = performance.now() / 1000;
        for (const b of scene.fish) {
          b.fleeUntil = t + 10;
          b.hideTarget = scene.hidingSpots[0] ?? null;
        }
        audio.thud();
        if (!visit.tapHinted) {
          visit.tapHinted = true;
          host.ui.toast("They don't like that");
        }
        dirty = true;
        break;
      }
      case 'wipe': {
        const algae = scene.algae;
        if (wipeCoverageBefore < 0) wipeCoverageBefore = algae.coverage();
        algae.wipe(intent.from.x, intent.from.y, intent.to.x, intent.to.y, 0.05);
        if (f.t - lastSqueegee > 120) {
          lastSqueegee = f.t;
          audio.squeegee(Math.min(intent.speed, 2));
          const levelBefore = save.tank.algae;
          const remaining = algae.remaining(levelBefore, wipeCoverageBefore);
          wipeCoverageBefore = algae.coverage();
          if (remaining < levelBefore - 0.2) {
            save.tank.algae = remaining;
            markClean(visit, 'wipe');
            dirty = true;
          }
        }
        break;
      }
      case 'vacuum': {
        if (!vacuumOn) {
          vacuumOn = true;
          audio.vacuum(true);
        }
        const dtv = (1 / 60) * host.settings.fast;
        vacuumSec += dtv;
        if (save.tank.debris > 0) {
          vacuum(save, dtv);
          scene.vacuumAt(scene.screenToTank(intent.at.x, intent.at.y), save.tank.debris);
        }
        if (vacuumSec >= 1) markClean(visit, 'vacuum');
        break;
      }
      case 'pet': {
        if (!avail.has('pet')) break;
        petting = intent.progress >= 1;
        petPoint = petting ? intent.at : null;
        break;
      }
      case 'thumbs': {
        if (intent.progress > 0 && !canSignOff(visit, host.clock.now())) {
          hud.setHold(0);
          if (!toldFeedFirst) {
            toldFeedFirst = true;
            host.ui.toast('Feed them and clean something first');
          }
          break;
        }
        hud.setHold(intent.progress, 'goodnight');
        if (intent.progress >= 1 && !submitted) {
          if (tutorialActive() && !visit.tutorial.thumbs) {
            visit.tutorial.thumbs = true;
            refreshChecklist();
          }
          finishVisit();
        }
        break;
      }
      case 'wave': {
        if (!avail.has('wave')) break;
        const responders = ringBell(save);
        const bp = scene.bellPoint();
        const t = performance.now() / 1000;
        for (const b of scene.fish) {
          if (!responders.some((r) => r.id === b.id) || !bp) continue;
          b.wander.copy(bp).add({ x: (rng() - 0.5) * 0.2, y: -0.05, z: 0 } as never);
          b.wanderAt = t + 4;
        }
        audio.bell();
        dirty = true;
        break;
      }
      case 'throw': {
        if (!avail.has('throw')) break;
        const from = scene.screenToTank(intent.from.x, intent.from.y);
        let best: (typeof scene.fish)[number] | null = null;
        let bestD = Infinity;
        for (const b of scene.fish) {
          const dx = b.pos.x - from.x;
          const dy = b.pos.y - from.y;
          const along = dx * intent.direction.x + dy * -intent.direction.y;
          if (along < 0) continue;
          const off = Math.abs(dx * -intent.direction.y - dy * intent.direction.x);
          if (off < bestD) {
            bestD = off;
            best = b;
          }
        }
        const target = best ?? scene.fish[0];
        if (target) {
          dropPellet(
            visit,
            target.pos.x,
            Math.min(target.pos.y + 0.15, h * 0.9),
            target.pos.z,
            target.id,
            host.clock.now(),
          );
          audio.sprinkle();
        }
        break;
      }
      case 'pour': {
        if (!avail.has('roll')) break;
        if (intent.on) {
          const counted = pour(save, visit.poured);
          visit.poured = true;
          audio.pour();
          host.ui.toast(counted ? 'Fresh water' : 'Fresh water (already counted today)');
          dirty = true;
        }
        break;
      }
      case 'grab': {
        const p = scene.screenToTank(intent.at.x, intent.at.y);
        const b = scene.fishNear(p, 0.12);
        if (b) {
          b.carried = true;
          visit.carrying = b.id;
        }
        break;
      }
      case 'drag': {
        if (!visit.carrying) break;
        const b = scene.fish.find((x) => x.id === visit.carrying);
        if (b) {
          const p = scene.screenToTank(intent.at.x, intent.at.y);
          b.pos.set(p.x, Math.min(Math.max(p.y, h * 0.06), h * 0.9), scene.bounds.d * 0.3);
        }
        break;
      }
      case 'drop': {
        if (!visit.carrying) break;
        const b = scene.fish.find((x) => x.id === visit.carrying);
        const fish = fishById(visit.carrying);
        visit.carrying = null;
        if (b && fish) {
          b.carried = false;
          const n = scene.nurseryPoint();
          const inNursery = Boolean(n && Math.hypot(b.pos.x - n.x, b.pos.y - n.y) < 0.2);
          if (inNursery !== fish.inNursery) {
            fish.inNursery = inNursery;
            host.ui.toast(
              inNursery ? `${fish.name} is in the nursery` : `${fish.name} is back in the tank`,
            );
            dirty = true;
          }
        }
        break;
      }
      case 'scrub': {
        if (!avail.has('circle')) break;
        const p = scene.screenToTank(intent.at.x, intent.at.y);
        const d = scene.decorAt(p);
        if (d && (d.kind === 'castle' || d.kind === 'driftwood')) {
          scrub(save, d.id, 35);
          audio.sparkle();
          dirty = true;
        }
        break;
      }
      case 'zoom': {
        if (!avail.has('zoom') || hud.cardOpen) break;
        if (intent.scale > 1.4) {
          const center = scene.screenToTank(0.5, 0.5);
          const b = scene.fishNear(center, 2);
          const fish = b ? fishById(b.id) : undefined;
          if (fish) hud.showFishCard(fish, () => hud.closeCard());
        }
        break;
      }
      case 'steer': {
        if (!avail.has('steer')) break;
        scene.setPan(intent.angle / 0.6);
        break;
      }
    }
  };

  const unsub = host.hands.onFrame((f: HandFrame) => {
    if (paused || destroyed || submitted) return;
    if (hud.cardOpen) {
      // Only the hand marker while a card or the shop is up; the hub's cursor does the clicking.
      hud.setTool(null, 0, 0);
      return;
    }
    const carryAllowed = (at: Vec2) =>
      avail.has('carry') && scene.fishNear(scene.screenToTank(at.x, at.y), 0.12) !== null;
    for (const intent of gestures.update(f, carryAllowed, host.settings.fast)) apply(intent, f);
  });

  const frame = (nowPerf: number) => {
    if (destroyed) return;
    const dt = Math.min((nowPerf - last) / 1000, 0.1) * host.settings.fast;
    last = nowPerf;
    const t = nowPerf / 1000;
    const nowClock = host.clock.now();
    if (!paused && !submitted) {
      // Simulation: one tick per simulated second with the real clock's date for light hours.
      simAcc += dt;
      if (simAcc >= 1) {
        tick(save, simAcc * 1000, new Date(nowClock));
        simAcc = 0;
        dirty = true;
      }
      updateFlakes(visit, save, dt, nowClock, scene.bounds.h * 0.03);
      for (const e of takeEvents(visit)) {
        if (e.kind === 'overfeed') {
          cloudUntil = t + 6;
          hud.setCloud(true);
          if (!visit.overfeedHinted) {
            visit.overfeedHinted = true;
            host.ui.toast("That's plenty");
          }
          dirty = true;
        } else if (e.kind === 'tutorial') {
          refreshChecklist();
        }
      }
      if (cloudUntil && t > cloudUntil) {
        cloudUntil = 0;
        hud.setCloud(false);
      }
    }
    const palm = petPoint ? scene.screenToTank(petPoint.x, petPoint.y) : null;
    const { ate } = scene.update(
      paused ? 0 : dt,
      t,
      { flakes: visit.flakes, palm, petting, hidingSpots: scene.hidingSpots, rng },
      save.tank.fish,
      visit.flakes,
    );
    for (const a of ate) {
      const fish = fishById(a.fishId);
      if (!fish) continue;
      if (a.flake.forFish) throwPellet(fish);
      else eatFlake(fish);
      audio.eat();
      dirty = true;
    }
    if (petting && palm) {
      for (const b of scene.fish) {
        if (petted.has(b.id)) continue;
        if (Math.hypot(b.pos.x - palm.x, b.pos.y - palm.y) < 0.09) {
          const fish = fishById(b.id);
          if (!fish) continue;
          pet(save, fish, visit.petsCounted);
          visit.petsCounted++;
          petted.add(b.id);
          audio.nuzzle();
          hud.setTag(b.id, `${fish.name} ♥`, scene.tankToScreen(b.pos));
          window.setTimeout(() => hud.setTag(b.id, '', null), 1500);
          dirty = true;
        }
      }
    }
    if (dirty) {
      scene.sync(save);
      hud.setShells(save.shells);
      hud.setWater(save.tank.water);
      persist();
      dirty = false;
    }
    const d = new Date(nowClock);
    scene.setHour(d.getHours() + d.getMinutes() / 60);
    scene.render();
    raf = requestAnimationFrame(frame);
  };

  // First frame of state.
  scene.sync(save);
  hud.setShells(save.shells);
  hud.setWater(save.tank.water);
  scene.setHour(new Date(now).getHours() + new Date(now).getMinutes() / 60);
  persist();

  const begin = () => {
    hud.closeCard();
    host.ui.hint(tutorialActive() ? 'Pinch above the water to feed them' : null);
    refreshChecklist();
    teach('pet', 'New: hold an open hand still and they come to you', 'pet');
    teach('roll', 'New: roll your wrist to pour fresh water');
    teach('throw', 'New: pinch, hold and throw a pellet to one fish');
    teach('circle', 'New: draw circles to scrub a decoration');
    teach('zoom', 'New: spread two hands to zoom in on a fish');
    teach('steer', 'New: steer with two hands to look around the Coral tank');
    teach('carry', 'New: pinch a fish to carry it to the nursery');
    audio.startHum();
  };
  if (host.settings.bot) begin();
  else if (firstVisit) hud.showWelcome(begin);
  else if (away.hours >= 0.5) hud.showAway(away, begin);
  else begin();

  return {
    pause() {
      paused = true;
      audio.vacuum(false);
      vacuumOn = false;
    },
    resume() {
      paused = false;
      last = performance.now();
      if (!raf) raf = requestAnimationFrame(frame);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(raf);
      unsub();
      persist();
      audio.destroy();
      hud.destroy();
      scene.dispose();
      gestures.reset();
      petted = new Set();
      if (current && current.save === save) current = null;
    },
    onResize(w, h) {
      scene.resize(w, h);
    },
    score: () => reefValue(save.tank),
  };
}

export const module: GameModule = {
  manifest,
  mount,
  bot: (host, tools) => createReefBot(host, tools),
};
export default module;
void C;
