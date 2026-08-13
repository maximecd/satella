import { vi } from "vite-plus/test";

const cache = new Map<string, ReturnType<typeof vi.fn>>();

export const engineApi = new Proxy(
  {},
  {
    get(_target, property: string) {
      const existing = cache.get(property);
      if (existing !== undefined) return existing;
      const fn = vi.fn();
      cache.set(property, fn);
      return fn;
    },
  },
);
