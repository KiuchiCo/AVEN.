import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => { cleanup(); document.body.style.overflow = ''; });

// jsdom lacks these browser features that components use.
Element.prototype.scrollIntoView ??= () => undefined;
window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
// jsdom does no layout, so every element reports offsetParent null ("not visible"), which would hide every control from the focus-trap code. Treat attached elements as visible.
Object.defineProperty(HTMLElement.prototype, 'offsetParent', { configurable: true, get(this: HTMLElement) { return this.isConnected ? this.parentElement : null; } });
