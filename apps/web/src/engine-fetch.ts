export const engineFetch = ((input, init) => globalThis.fetch(input, init)) satisfies typeof fetch;
