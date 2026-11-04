// Sheets: pause, results, confirm. Plan v2, sections 6.2 and 8. While a sheet is open the screen
// beneath is inert, so the cursor cannot reach what is under it.

import { h } from '../dom.ts';

export interface SheetButton {
  label: string;
  kind?: 'default' | 'quiet' | 'lamp' | 'danger';
  big?: boolean;
  dwell?: boolean;
  onClick: () => void;
}

export interface SheetSpec {
  title?: string;
  big?: string;
  lines?: { text: string; good?: boolean }[];
  buttons: SheetButton[];
  tag?: string;
  /** Called by Esc or the open-palm hold; defaults to the last button. */
  onCancel?: () => void;
  /** Extra content between the lines and the buttons. */
  body?: HTMLElement;
}

export interface SheetHandle {
  el: HTMLElement;
  close(): void;
  cancel(): void;
  readonly open: boolean;
}

let openSheets: SheetHandle[] = [];

export function anySheetOpen(): boolean {
  return openSheets.length > 0;
}

export function topSheet(): SheetHandle | null {
  return openSheets[openSheets.length - 1] ?? null;
}

export function openSheet(spec: SheetSpec, inertRoot: HTMLElement | null): SheetHandle {
  const buttons = spec.buttons.map((b) =>
    h(
      'button',
      {
        class: `btn ${b.kind === 'quiet' ? 'btn--quiet' : b.kind === 'lamp' ? 'btn--lamp' : b.kind === 'danger' ? 'btn--danger' : ''} ${b.big ? 'btn--big' : ''}`,
        'data-hand-target': '',
        'data-dwell': b.dwell === false ? null : '',
        type: 'button',
        onClick: () => b.onClick(),
      },
      b.label,
    ),
  );
  const panel = h(
    'div',
    { class: 'sheet', role: 'dialog', 'aria-modal': 'true' },
    spec.title ? h('h2', { class: 'sheet__title', text: spec.title }) : null,
    spec.big ? h('div', { class: 'sheet__big', text: spec.big }) : null,
    ...(spec.lines ?? []).map((l) =>
      h('p', { class: `sheet__line ${l.good ? 'sheet__line--good' : ''}`, text: l.text }),
    ),
    spec.body ?? null,
    h('div', { class: 'sheet__buttons' }, ...buttons),
    spec.tag ? h('div', { class: 'sheet__tag', text: spec.tag }) : null,
  );
  const el = h('div', { class: 'sheet-backdrop' }, panel);
  document.body.appendChild(el);
  if (inertRoot) inertRoot.setAttribute('inert', '');
  let open = true;
  const handle: SheetHandle = {
    el,
    get open() {
      return open;
    },
    close() {
      if (!open) return;
      open = false;
      el.remove();
      openSheets = openSheets.filter((s) => s !== handle);
      if (inertRoot && !openSheets.length) inertRoot.removeAttribute('inert');
    },
    cancel() {
      const cb = spec.onCancel ?? spec.buttons[spec.buttons.length - 1]?.onClick;
      cb?.();
    },
  };
  openSheets.push(handle);
  buttons[0]?.focus({ preventScroll: true });
  return handle;
}
