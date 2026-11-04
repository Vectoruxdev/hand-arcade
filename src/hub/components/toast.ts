import { h } from '../dom.ts';

let current: HTMLElement | null = null;
let timer = 0;

/** 2 s, top center, never stacks. */
export function showToast(text: string, ms = 2000): void {
  current?.remove();
  current = h('div', { class: 'toast', role: 'status', text });
  document.body.appendChild(current);
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    current?.remove();
    current = null;
  }, ms);
}
