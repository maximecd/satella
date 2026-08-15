import * as matchers from "@testing-library/jest-dom/matchers";

import { cleanup } from "@testing-library/react";
import { afterEach, expect, vi } from "vite-plus/test";

expect.extend(matchers);

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    addEventListener: vi.fn(),
    addListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches: false,
    media: query,
    onchange: null,
    removeEventListener: vi.fn(),
    removeListener: vi.fn(),
  })),
  writable: true,
});

Object.defineProperty(window, "scrollTo", {
  configurable: true,
  value: vi.fn(),
  writable: true,
});

Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  configurable: true,
  value: vi.fn(() => null),
});

if (typeof HTMLDialogElement !== "undefined") {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
}

class ResizeObserverMock implements ResizeObserver {
  private readonly callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  readonly observe = (target: Element) => {
    this.callback(
      [
        {
          target,
          contentRect: {
            width: 400,
            height: 280,
            top: 0,
            left: 0,
            bottom: 280,
            right: 400,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          },
          borderBoxSize: [],
          contentBoxSize: [],
          devicePixelContentBoxSize: [],
        },
      ],
      this,
    );
  };
  readonly unobserve = vi.fn();
  readonly disconnect = vi.fn();
}

Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  value: ResizeObserverMock,
});

const localStorageStore = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => localStorageStore.get(key) ?? null,
  setItem: (key: string, value: string) => {
    localStorageStore.set(key, value);
  },
  removeItem: (key: string) => {
    localStorageStore.delete(key);
  },
  clear: () => {
    localStorageStore.clear();
  },
  key: (index: number) => [...localStorageStore.keys()][index] ?? null,
  get length() {
    return localStorageStore.size;
  },
};
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: localStorageMock,
});
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: localStorageMock,
});

afterEach(() => {
  cleanup();
  localStorageStore.clear();
});
