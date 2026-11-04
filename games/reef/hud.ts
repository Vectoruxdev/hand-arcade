// Reef HUD in DOM over the canvas: shell jar, water meter, the visit-1 checklist, the away card,
// the shop sheet, the fish card, the thumbs-up ring, the tool marker and the ghost hand.
// Buttons carry data-hand-target so the hub's cursor rules (dwell included) work unchanged.

import type { GameHost } from '../../src/games/types.ts';
import { DECOR, SHOP_SPECIES, SPECIES, TANKS } from './constants.ts';
import type { DecorKind, Species, TankTier } from './constants.ts';
import type { Fish, ReefSave } from './model.ts';
import type { AwaySummary } from './simulate.ts';
import { canBuyDecor, canBuyFish, canBuyTank, nextTier } from './shop.ts';

const STYLE = `
.reef-hud{position:absolute;inset:0;pointer-events:none;font-family:var(--font-body);color:#f3eadf}
.reef-hud button{pointer-events:auto}
.reef-jar{position:absolute;left:2rem;bottom:6rem;display:flex;align-items:center;gap:.8rem;min-height:4rem;padding:0 1.6rem 0 1rem;border-radius:999px;background:#1c2a48;color:#f3eadf;font-family:var(--font-display);font-size:1.8rem;font-weight:600;box-shadow:0 .3rem 1rem #0f1729}
.reef-jar small{font-family:var(--font-body);font-size:1.1rem;font-weight:500;color:rgba(243,234,223,.7)}
.reef-jar[data-hand-hover],.reef-jar:hover{transform:translateY(-.2rem);box-shadow:0 .6rem 1.4rem #0f1729,0 0 0 3px #f2c66d}
.reef-jar svg{width:2rem;height:2rem;fill:#f2c66d}
.reef-meter{position:absolute;right:2rem;top:50%;transform:translateY(-50%);width:1.2rem;height:18rem;border-radius:999px;background:rgba(15,23,41,.7);overflow:hidden}
.reef-meter i{position:absolute;left:0;right:0;bottom:0;height:50%;background:#8bbf9a;border-radius:999px;transition:height .6s cubic-bezier(.2,.8,.2,1),background-color .6s}
.reef-meter[data-bad] i{background:#e8846b}
.reef-meter b{position:absolute;right:1.8rem;top:50%;transform:translateY(-50%);font-size:1.1rem;font-weight:500;color:rgba(243,234,223,.7);white-space:nowrap}
.reef-list{position:absolute;left:2rem;top:6.4rem;display:grid;gap:.4rem;font-size:1.3rem;font-weight:600}
.reef-list span{display:flex;align-items:center;gap:.6rem;color:rgba(243,234,223,.55)}
.reef-list span::before{content:'';width:1rem;height:1rem;border-radius:50%;border:2px solid rgba(243,234,223,.5)}
.reef-list span[data-done]{color:#8bbf9a}
.reef-list span[data-done]::before{background:#8bbf9a;border-color:#8bbf9a}
.reef-list span[data-now]{color:#f3eadf}
.reef-list span[data-now]::before{border-color:#f2c66d}
.reef-ring{position:absolute;right:2rem;top:6.4rem;width:5rem;height:5rem;border-radius:50%;display:grid;place-items:center;font-size:1.1rem;font-weight:600;color:rgba(243,234,223,.7);opacity:0;transition:opacity .2s}
.reef-ring[data-show]{opacity:1}
.reef-ring::before{content:'';position:absolute;inset:0;border-radius:50%;border:4px solid rgba(243,234,223,.25)}
.reef-ring::after{content:'';position:absolute;inset:0;border-radius:50%;border:4px solid #f2c66d;-webkit-mask:conic-gradient(#000 calc(var(--hold,0)*360deg),transparent 0);mask:conic-gradient(#000 calc(var(--hold,0)*360deg),transparent 0)}
.reef-tool{position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;transform:translate3d(var(--x,0px),var(--y,0px),0);opacity:0;transition:opacity .2s}
.reef-tool[data-mode]{opacity:1}
.reef-tool i{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:block}
.reef-tool[data-mode=feed] i{width:1.6rem;height:1.6rem;border-radius:50%;background:radial-gradient(circle,#f2c66d,rgba(242,198,109,0) 70%)}
.reef-tool[data-mode=wipe] i{width:9rem;height:1.4rem;border-radius:.4rem;background:rgba(243,234,223,.55);box-shadow:0 .2rem .6rem rgba(0,0,0,.4)}
.reef-tool[data-mode=vacuum] i{width:1.6rem;height:12rem;border-radius:.8rem;background:linear-gradient(to bottom,rgba(243,234,223,.0),rgba(200,210,220,.8));transform:translate(-50%,-92%)}
.reef-tool[data-mode=pet] i{width:7rem;height:7rem;border-radius:50%;background:radial-gradient(circle,rgba(243,234,223,.35),rgba(243,234,223,0) 70%)}
.reef-tool[data-mode=net] i{width:6rem;height:6rem;border-radius:50%;border:3px solid rgba(243,234,223,.7);background:repeating-linear-gradient(45deg,rgba(243,234,223,.15) 0 2px,transparent 2px 10px)}
.reef-tool[data-mode=pour] i{width:3rem;height:5rem;border-radius:.4rem .4rem 1.5rem 1.5rem;background:rgba(159,216,232,.7)}
.reef-tool[data-mode=scrub] i{width:3rem;height:3rem;border-radius:.6rem;background:rgba(243,234,223,.5)}
.reef-card{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);min-width:36rem;max-width:56rem;padding:2.4rem 2.8rem;border-radius:.9rem;background:#1c2a48;box-shadow:0 1.2rem 3rem #0f1729;display:grid;gap:1.2rem;justify-items:center;text-align:center;pointer-events:auto}
.reef-card h2{margin:0;font-family:var(--font-display);font-size:2.4rem;font-weight:700}
.reef-card p{margin:0;font-size:1.2rem;line-height:1.4;color:rgba(243,234,223,.7)}
.reef-card .big{font-family:var(--font-display);font-size:3.6rem;font-weight:600;color:#f2c66d;line-height:1}
.reef-btn{display:inline-flex;align-items:center;justify-content:center;min-height:4rem;padding:0 2rem;border-radius:999px;background:#f3eadf;color:#16213a;font-family:var(--font-body);font-size:1.3rem;font-weight:700;box-shadow:0 .3rem 1rem #0f1729}
.reef-btn--lamp{background:#f2c66d}
.reef-btn--quiet{background:#16213a;color:#f3eadf}
.reef-btn--big{min-height:8rem;min-width:24rem;font-size:1.8rem;border-radius:.9rem}
.reef-btn[data-hand-hover],.reef-btn:hover{transform:translateY(-.2rem);box-shadow:0 .6rem 1.4rem #0f1729,0 0 0 3px #f2c66d}
.reef-btn:disabled{opacity:.4;transform:none;box-shadow:none;cursor:default}
.reef-shop{position:absolute;inset:4rem 6rem 5rem;border-radius:.9rem;background:rgba(28,42,72,.96);box-shadow:0 1.2rem 3rem #0f1729;padding:2rem 2.4rem;display:grid;grid-template-rows:auto 1fr auto;gap:1.2rem;pointer-events:auto}
.reef-shop h2{margin:0;font-family:var(--font-display);font-size:2.4rem;font-weight:700;display:flex;justify-content:space-between;align-items:center}
.reef-shop h2 span{font-size:1.6rem;color:#f2c66d}
.reef-shop__grid{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;overflow:hidden;align-content:start}
.reef-item{display:grid;gap:.3rem;padding:1rem 1.2rem;border-radius:.9rem;background:#16213a;text-align:left;color:#f3eadf;min-height:7rem;align-content:start}
.reef-item b{font-family:var(--font-display);font-size:1.4rem;font-weight:600}
.reef-item small{font-size:1.1rem;color:rgba(243,234,223,.7);line-height:1.3}
.reef-item em{font-style:normal;font-size:1.2rem;color:#f2c66d;font-weight:700}
.reef-item[disabled] em{color:rgba(243,234,223,.4)}
.reef-item[data-hand-hover],.reef-item:hover:not([disabled]){transform:translateY(-.2rem);box-shadow:0 0 0 3px #f2c66d}
.reef-shop__foot{display:flex;justify-content:center}
.reef-ghost{position:absolute;right:2.4rem;bottom:6rem;width:9rem;height:9rem;opacity:0;pointer-events:none}
.reef-ghost[data-show]{opacity:1}
.reef-ghost svg{width:100%;height:100%;fill:none;stroke:rgba(243,234,223,.4);stroke-width:3;stroke-linecap:round;stroke-linejoin:round}
.reef-ghost[data-g=feed] svg{animation:reef-g-feed 1.2s ease-in-out infinite}
.reef-ghost[data-g=wipe] svg{animation:reef-g-wipe 1.6s ease-in-out infinite}
.reef-ghost[data-g=vacuum] svg{animation:reef-g-vac 2s ease-in-out infinite}
.reef-ghost[data-g=thumbs] svg{animation:reef-g-thumbs 1.5s ease-in-out infinite}
.reef-ghost[data-g=pet] svg{animation:reef-g-pet 2s ease-in-out infinite}
.reef-ghost[data-g=wave] svg{animation:reef-g-wave 1s ease-in-out infinite}
@keyframes reef-g-feed{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-.6rem) scale(.9)}}
@keyframes reef-g-wipe{0%,100%{transform:translateX(-2.4rem)}50%{transform:translateX(2.4rem)}}
@keyframes reef-g-vac{0%,100%{transform:translate(-1.5rem,1.2rem)}50%{transform:translate(1.5rem,1.2rem)}}
@keyframes reef-g-thumbs{0%,100%{transform:rotate(-8deg)}50%{transform:rotate(8deg)}}
@keyframes reef-g-pet{0%,100%{opacity:.5}50%{opacity:1}}
@keyframes reef-g-wave{0%,100%{transform:rotate(-20deg)}50%{transform:rotate(20deg)}}
.reef-cloud{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 60%,rgba(120,110,80,.45),rgba(120,110,80,0) 70%);opacity:0;transition:opacity 1.2s;pointer-events:none}
.reef-cloud[data-show]{opacity:1}
.reef-tag{position:absolute;transform:translate(-50%,-150%);font-size:1.1rem;font-weight:600;color:#f3eadf;text-shadow:0 1px 4px #0f1729;white-space:nowrap;pointer-events:none}
`;

const HAND_SVG: Record<string, string> = {
  open: `<svg viewBox="0 0 64 64"><path d="M22 58 C14 54 10 46 10 38 V22 M10 30 V14 M18 26 V8 M26 26 V6 M34 28 V10 M34 28 C42 26 50 30 50 40 C50 50 42 60 30 60 Z"/></svg>`,
  pinch: `<svg viewBox="0 0 64 64"><path d="M22 58 C14 54 10 46 10 38 V22 M14 28 C14 18 20 14 26 16 L34 22 M26 24 V8 M34 28 C42 26 50 30 50 40 C50 50 42 60 30 60 Z"/><circle cx="30" cy="20" r="3"/></svg>`,
  point: `<svg viewBox="0 0 64 64"><path d="M22 58 C14 54 10 46 10 38 V26 M18 30 V8 M26 32 V22 M34 34 V24 M34 34 C42 32 50 36 50 44 C50 52 42 60 30 60 Z"/></svg>`,
  thumbs: `<svg viewBox="0 0 64 64"><path d="M20 60 C14 58 12 52 12 44 V34 C12 28 18 28 20 32 M20 32 L34 6 C38 6 42 10 40 18 L36 28 H50 C56 28 56 36 52 40 C54 46 50 50 46 50 C46 56 42 60 36 60 Z"/></svg>`,
};

export interface ShopActions {
  buyFish(species: Species): void;
  buyDecor(kind: DecorKind): void;
  buyTank(): void;
  close(): void;
}

export class ReefHud {
  readonly el: HTMLElement;
  private style: HTMLStyleElement;
  private jar: HTMLButtonElement;
  private jarCount: HTMLElement;
  private meter: HTMLElement;
  private meterFill: HTMLElement;
  private meterLabel: HTMLElement;
  private list: HTMLElement;
  private ring: HTMLElement;
  private tool: HTMLElement;
  private ghost: HTMLElement;
  private cloud: HTMLElement;
  private card: HTMLElement | null = null;
  private shop: HTMLElement | null = null;
  private tags = new Map<string, HTMLElement>();
  private ghostTimer = 0;
  private host: GameHost;

  constructor(host: GameHost, onJar: () => void) {
    this.host = host;
    this.style = document.createElement('style');
    this.style.textContent = STYLE;
    host.root.appendChild(this.style);
    this.el = document.createElement('div');
    this.el.className = 'reef-hud';
    this.el.innerHTML = `
      <button class="reef-jar" type="button" data-hand-target data-dwell data-reef-jar aria-label="Shells and shop">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 C6 3 3 8 3 12 C3 17 7 21 12 21 C17 21 21 17 21 12 C21 8 18 3 12 3 Z M12 6 C15 6 17 9 17 12 C17 15 15 17 12 17 C9 17 7 15 7 12 C7 9 9 6 12 6 Z"/></svg>
        <span data-shells>0</span><small>shells</small>
      </button>
      <div class="reef-meter" data-meter><i></i><b>water</b></div>
      <div class="reef-list" data-list hidden></div>
      <div class="reef-ring" data-ring>done</div>
      <div class="reef-tool" data-tool><i></i></div>
      <div class="reef-ghost" data-ghost></div>
      <div class="reef-cloud" data-cloud></div>`;
    host.root.appendChild(this.el);
    this.jar = this.el.querySelector('[data-reef-jar]') as HTMLButtonElement;
    this.jarCount = this.el.querySelector('[data-shells]') as HTMLElement;
    this.meter = this.el.querySelector('[data-meter]') as HTMLElement;
    this.meterFill = this.meter.querySelector('i') as HTMLElement;
    this.meterLabel = this.meter.querySelector('b') as HTMLElement;
    this.list = this.el.querySelector('[data-list]') as HTMLElement;
    this.ring = this.el.querySelector('[data-ring]') as HTMLElement;
    this.tool = this.el.querySelector('[data-tool]') as HTMLElement;
    this.ghost = this.el.querySelector('[data-ghost]') as HTMLElement;
    this.cloud = this.el.querySelector('[data-cloud]') as HTMLElement;
    this.jar.addEventListener('click', onJar);
  }

  setShells(n: number): void {
    this.jarCount.textContent = String(n);
  }

  setWater(w: number): void {
    this.meterFill.style.height = `${Math.round(w)}%`;
    this.meterLabel.textContent = `water ${Math.round(w)}`;
    if (w < 40) this.meter.setAttribute('data-bad', '');
    else this.meter.removeAttribute('data-bad');
  }

  /** The visit-1 checklist; null hides it. */
  setChecklist(steps: { label: string; done: boolean; now: boolean }[] | null): void {
    if (!steps) {
      this.list.hidden = true;
      return;
    }
    this.list.hidden = false;
    this.list.innerHTML = steps
      .map((s) => `<span${s.done ? ' data-done' : ''}${s.now ? ' data-now' : ''}>${s.label}</span>`)
      .join('');
  }

  setHold(p: number, label = 'done'): void {
    this.ring.style.setProperty('--hold', p.toFixed(3));
    this.ring.textContent = label;
    if (p > 0) this.ring.setAttribute('data-show', '');
    else this.ring.removeAttribute('data-show');
  }

  setTool(mode: string | null, x: number, y: number): void {
    if (!mode) {
      this.tool.removeAttribute('data-mode');
      return;
    }
    this.tool.setAttribute('data-mode', mode);
    this.tool.style.setProperty('--x', `${(x * this.host.root.clientWidth).toFixed(0)}px`);
    this.tool.style.setProperty('--y', `${(y * this.host.root.clientHeight).toFixed(0)}px`);
  }

  /** A 3 s ghost hand demonstrating a gesture in the corner. */
  showGhost(gesture: 'feed' | 'wipe' | 'vacuum' | 'thumbs' | 'pet' | 'wave', ms = 3000): void {
    const svg =
      gesture === 'feed'
        ? HAND_SVG['pinch']
        : gesture === 'vacuum'
          ? HAND_SVG['point']
          : gesture === 'thumbs'
            ? HAND_SVG['thumbs']
            : HAND_SVG['open'];
    this.ghost.innerHTML = svg ?? '';
    this.ghost.setAttribute('data-g', gesture);
    this.ghost.setAttribute('data-show', '');
    window.clearTimeout(this.ghostTimer);
    this.ghostTimer = window.setTimeout(() => this.ghost.removeAttribute('data-show'), ms);
  }

  setCloud(on: boolean): void {
    if (on) this.cloud.setAttribute('data-show', '');
    else this.cloud.removeAttribute('data-show');
  }

  /** A floating name tag at a screen point; null removes it. */
  setTag(id: string, text: string, pos: { x: number; y: number } | null): void {
    let t = this.tags.get(id);
    if (!pos) {
      t?.remove();
      this.tags.delete(id);
      return;
    }
    if (!t) {
      t = document.createElement('div');
      t.className = 'reef-tag';
      this.el.appendChild(t);
      this.tags.set(id, t);
    }
    t.textContent = text;
    t.style.left = `${(pos.x * 100).toFixed(2)}%`;
    t.style.top = `${(pos.y * 100).toFixed(2)}%`;
  }

  private openCard(
    html: string,
    buttons: { label: string; kind?: 'lamp' | 'quiet'; big?: boolean; onClick: () => void }[],
  ): HTMLElement {
    this.closeCard();
    const card = document.createElement('div');
    card.className = 'reef-card';
    card.setAttribute('role', 'dialog');
    card.innerHTML = html;
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `reef-btn ${b.kind === 'lamp' ? 'reef-btn--lamp' : b.kind === 'quiet' ? 'reef-btn--quiet' : ''} ${b.big ? 'reef-btn--big' : ''}`;
      btn.setAttribute('data-hand-target', '');
      btn.setAttribute('data-dwell', '');
      btn.textContent = b.label;
      btn.addEventListener('click', b.onClick);
      card.appendChild(btn);
    }
    this.el.appendChild(card);
    this.card = card;
    (card.querySelector('button') as HTMLButtonElement | null)?.focus({ preventScroll: true });
    return card;
  }

  closeCard(): void {
    this.card?.remove();
    this.card = null;
  }

  get cardOpen(): boolean {
    return this.card !== null || this.shop !== null;
  }

  showWelcome(onContinue: () => void): void {
    this.openCard(
      `<h2>This tank is yours</h2><p>Pinch above the water to sprinkle flakes. Wipe the glass with an open hand. Point at the gravel to vacuum. Then a thumbs up to say goodnight.</p>`,
      [{ label: 'Say hello', kind: 'lamp', big: true, onClick: onContinue }],
    );
  }

  showAway(summary: AwaySummary, onContinue: () => void): void {
    const lines: string[] = [];
    const h = summary.hours;
    lines.push(
      h >= 36
        ? `You were away about ${Math.round(h / 24)} days.`
        : h >= 1.5
          ? `You were away about ${Math.round(h)} hours.`
          : 'Welcome back.',
    );
    if (summary.grew.length) lines.push(`${summary.grew.join(' and ')} grew bigger.`);
    if (summary.hungry)
      lines.push(
        summary.hungry === 1 ? 'One fish is hungry.' : `${summary.hungry} fish are hungry.`,
      );
    if (summary.algae >= 8) lines.push('Algae crept up the glass.');
    if (summary.missedYou) lines.push('They missed you.');
    this.openCard(`<h2>While you were away</h2>${lines.map((l) => `<p>${l}</p>`).join('')}`, [
      { label: 'Go on in', kind: 'lamp', big: true, onClick: onContinue },
    ]);
  }

  showSignOff(
    result: { shells: number; value: number; newMilestones: string[]; fry: number },
    onDone: () => void,
  ): void {
    const extra: string[] = [];
    if (result.fry)
      extra.push(
        result.fry === 1
          ? 'A fry hatched in the nursery.'
          : `${result.fry} fry hatched in the nursery.`,
      );
    for (const m of result.newMilestones) extra.push(`New badge: ${m}.`);
    this.openCard(
      `<h2>Goodnight, tank</h2><div class="big">+${result.shells} shells</div><p>Reef value ${result.value}</p>${extra.map((l) => `<p>${l}</p>`).join('')}`,
      [{ label: 'Done', kind: 'lamp', big: true, onClick: onDone }],
    );
  }

  showFishCard(fish: Fish, onClose: () => void): void {
    const info = SPECIES[fish.species];
    const mood = fish.mood >= 80 ? 'happy' : fish.mood >= 40 ? 'fine' : 'sulking';
    const tame =
      fish.tameness >= 100
        ? 'best friend'
        : fish.tameness >= 70
          ? 'comes to your hand'
          : fish.tameness >= 40
            ? 'knows the bell'
            : 'shy';
    this.openCard(
      `<h2>${fish.name}</h2><p>${info.name} · size ${fish.size} of ${info.maxSize}${fish.inNursery ? ' · in the nursery' : ''}</p><p>Mood: ${mood} · Hunger: ${fish.hunger >= 60 ? 'hungry' : 'fed'} · ${tame}</p>`,
      [{ label: 'Close', kind: 'quiet', onClick: onClose }],
    );
  }

  showShop(save: ReefSave, actions: ShopActions): void {
    this.closeCard();
    this.closeShop();
    const shop = document.createElement('div');
    shop.className = 'reef-shop';
    shop.setAttribute('role', 'dialog');
    const items: string[] = [];
    const item = (
      key: string,
      name: string,
      desc: string,
      price: number,
      check: { ok: true } | { ok: false; why: string },
    ) =>
      `<button class="reef-item" type="button" data-hand-target data-dwell data-buy="${key}" ${check.ok ? '' : 'disabled'}><b>${name}</b><small>${check.ok ? desc : check.why}</small><em>${price} shells</em></button>`;
    for (const sp of SHOP_SPECIES) {
      const i = SPECIES[sp];
      items.push(
        item(
          `fish:${sp}`,
          i.name,
          sp === 'tetra'
            ? 'Schools with friends'
            : sp === 'goldfish'
              ? 'Greedy, grows big'
              : sp === 'guppy'
                ? 'Breeds easiest'
                : sp === 'angelfish'
                  ? 'Stately, needs room'
                  : sp === 'pleco'
                    ? 'Eats algae'
                    : 'Loves coral',
          i.shells,
          canBuyFish(save, sp),
        ),
      );
    }
    for (const kind of Object.keys(DECOR) as DecorKind[]) {
      const d = DECOR[kind];
      const desc =
        kind === 'plant'
          ? 'A hiding spot'
          : kind === 'driftwood'
            ? 'Scrub it clean'
            : kind === 'castle'
              ? 'Fish circle it'
              : kind === 'bubbler'
                ? 'Cleaner water'
                : kind === 'bell'
                  ? 'Wave to ring it'
                  : kind === 'nursery'
                    ? 'For breeding'
                    : 'A clownfish home';
      items.push(item(`decor:${kind}`, d.name, desc, d.shells, canBuyDecor(save, kind)));
    }
    const next = nextTier(save.tank.tier);
    if (next) {
      const t = TANKS[next as TankTier];
      items.push(
        item(
          'tank',
          t.name,
          `${t.capacity} fish${next === 'twenty' ? ', nursery included' : ', wider than the screen'}`,
          t.shells,
          canBuyTank(save),
        ),
      );
    }
    shop.innerHTML = `<h2>Shop <span>${save.shells} shells</span></h2><div class="reef-shop__grid">${items.join('')}</div><div class="reef-shop__foot"></div>`;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'reef-btn reef-btn--quiet';
    close.setAttribute('data-hand-target', '');
    close.setAttribute('data-dwell', '');
    close.textContent = 'Back to the tank';
    close.addEventListener('click', actions.close);
    (shop.querySelector('.reef-shop__foot') as HTMLElement).appendChild(close);
    shop.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-buy]') as HTMLButtonElement | null;
      if (!b || b.disabled) return;
      const key = b.dataset['buy'] ?? '';
      if (key.startsWith('fish:')) actions.buyFish(key.slice(5) as Species);
      else if (key.startsWith('decor:')) actions.buyDecor(key.slice(6) as DecorKind);
      else if (key === 'tank') actions.buyTank();
    });
    this.el.appendChild(shop);
    this.shop = shop;
    close.focus({ preventScroll: true });
  }

  closeShop(): void {
    this.shop?.remove();
    this.shop = null;
  }

  destroy(): void {
    window.clearTimeout(this.ghostTimer);
    this.closeCard();
    this.closeShop();
    this.el.remove();
    this.style.remove();
  }
}
