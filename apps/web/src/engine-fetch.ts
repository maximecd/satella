import { engineToken, engineUrl } from "./runtime";

export const ENGINE_TOKEN_HEADER = "x-satella-engine-token";

export const engineFetch = (async (input, init) => {
  const token = engineToken();
  if (token === undefined) return globalThis.fetch(input, init);
  const url = input instanceof Request ? input.url : String(input);
  if (!url.startsWith(engineUrl())) return globalThis.fetch(input, init);
  const headers = new Headers(
    input instanceof Request && init === undefined ? input.headers : init?.headers,
  );
  headers.set(ENGINE_TOKEN_HEADER, token);
  return globalThis.fetch(url, { ...init, headers });
}) satisfies typeof fetch;
