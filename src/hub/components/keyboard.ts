// On-screen keyboard for names. Plan v2, section 6.5: QWERTY, 5×4 rem keys, dwell 0.9 s, Done is big.

import { MAX_NAME } from '../../data/schema.ts';
import { cleanName } from '../../data/profiles.ts';
import { h } from '../dom.ts';

const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

export interface KeyboardOptions {
  value: string;
  onChange(value: string): void;
  onDone(): void;
}

export function makeKeyboard(opts: KeyboardOptions): {
  el: HTMLElement;
  value(): string;
  onKey(e: KeyboardEvent): boolean;
} {
  let value = opts.value;
  let shift = true;
  const keys: HTMLButtonElement[] = [];

  const set = (next: string) => {
    value = next.slice(0, MAX_NAME);
    opts.onChange(value);
    if (shift && value.length > 0) {
      shift = false;
      render();
    }
    if (value.length === 0 && !shift) {
      shift = true;
      render();
    }
  };
  const type = (ch: string) => {
    if (value.length >= MAX_NAME) return;
    set(value + (shift ? ch.toUpperCase() : ch.toLowerCase()));
  };
  const render = () => {
    for (const k of keys) {
      const ch = k.dataset['ch'];
      if (ch && /[a-z]/i.test(ch)) k.textContent = shift ? ch.toUpperCase() : ch.toLowerCase();
    }
    shiftKey.setAttribute('aria-pressed', String(shift));
  };

  const key = (label: string, ch: string, cls = '', onClick?: () => void) => {
    const b = h(
      'button',
      {
        class: `key ${cls}`,
        type: 'button',
        'data-hand-target': '',
        'data-dwell': '900',
        'data-ch': ch,
        onClick: onClick ?? (() => type(ch)),
      },
      label,
    );
    keys.push(b);
    return b;
  };

  const shiftKey = key('Shift', '', 'key--wide', () => {
    shift = !shift;
    render();
  });
  const rows = ROWS.map((r, i) =>
    h(
      'div',
      { class: 'keyboard__row' },
      i === 2 ? shiftKey : null,
      ...r.split('').map((ch) => key(ch, ch)),
      i === 2 ? key('⌫', 'backspace', 'key--wide', () => set(value.slice(0, -1))) : null,
    ),
  );
  const bottom = h(
    'div',
    { class: 'keyboard__row' },
    key("'", "'"),
    key('Space', ' ', 'key--wide', () => type(' ')),
    key('Done', 'done', 'key--done', () => opts.onDone()),
  );
  const el = h(
    'div',
    { class: 'keyboard', role: 'group', 'aria-label': 'On-screen keyboard' },
    ...rows,
    bottom,
  );
  render();

  return {
    el,
    value: () => value,
    /** Physical keyboard goes straight to the field. Returns true when handled. */
    onKey(e: KeyboardEvent): boolean {
      if (e.key === 'Enter') {
        opts.onDone();
        return true;
      }
      if (e.key === 'Backspace') {
        set(value.slice(0, -1));
        return true;
      }
      if (e.key.length === 1 && /[A-Za-z0-9' ]/.test(e.key)) {
        if (value.length < MAX_NAME) set(cleanName(value + e.key) || value);
        return true;
      }
      return false;
    },
  };
}
