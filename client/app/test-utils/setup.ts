import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

/**
 * In-memory Web Storage polyfill.
 *
 * On Node >= 22 the runtime exposes a native `localStorage` global that stays
 * `undefined` unless `--localstorage-file` is passed, and jsdom does not always
 * provide `window.localStorage` for opaque origins. Tests that touch
 * `localStorage`/`sessionStorage` therefore blow up with
 * "Cannot read properties of undefined (reading 'getItem')". A tiny, spec-shaped
 * in-memory implementation keeps those tests deterministic and isolated.
 */
class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

function installStorage(name: "localStorage" | "sessionStorage") {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, name, {
    value: storage,
    writable: true,
    configurable: true,
  });
  if (typeof window !== "undefined") {
    Object.defineProperty(window, name, {
      value: storage,
      writable: true,
      configurable: true,
    });
  }
}

installStorage("localStorage");
installStorage("sessionStorage");

// jsdom does not implement matchMedia; many UI components read it on mount.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

// jsdom lacks ResizeObserver / IntersectionObserver used by some UI primitives.
class MockObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn(() => []);
}
if (typeof globalThis.ResizeObserver === "undefined") {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
    MockObserver;
}
if (typeof globalThis.IntersectionObserver === "undefined") {
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
    MockObserver;
}

// jsdom does not implement scrollIntoView; Radix/cmdk call it.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

afterEach(() => {
  cleanup();
  // Guard: individual tests may stub these globals with partial mocks.
  if (typeof localStorage?.clear === "function") localStorage.clear();
  if (typeof sessionStorage?.clear === "function") sessionStorage.clear();
});
