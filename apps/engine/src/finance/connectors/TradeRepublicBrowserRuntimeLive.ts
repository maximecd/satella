import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium, type BrowserContext, type Page } from "playwright";
import { ConnectorAuthenticationError, describeErrorBody } from "@satella-app/connector-core";
import {
  TradeRepublicBrowserRuntime,
  TRADE_REPUBLIC_API_ORIGIN,
  TRADE_REPUBLIC_WEB_ORIGIN,
  TradeRepublicSession,
  type TradeRepublicBrowserAttempt,
  type TradeRepublicBrowserStartInput,
  isTradeRepublicJsonObject,
  isTradeRepublicJsonString,
  type TradeRepublicJsonValue,
  type TradeRepublicSession as TradeRepublicSessionType,
} from "@satella-app/connector-trade-republic";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

const BROWSER_TIMEOUT_MS = 30_000;
const WAF_TOKEN_POLL_MS = 250;
const WAF_TOKEN_ATTEMPTS = 40;
const TRADE_REPUBLIC_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

const authenticationFailure = (
  message: string,
  category: ConnectorAuthenticationError["category"] = "network",
) => new ConnectorAuthenticationError({ category, message });

const errorDetail = (cause: unknown): string => {
  if (!(cause instanceof Error)) return "";
  const message = cause.message.trim();
  return message.length > 0 ? `: ${message}` : "";
};

const responseBody = async (
  response: Awaited<ReturnType<Page["request"]["post"]>>,
): Promise<TradeRepublicJsonValue | undefined> => {
  try {
    const body: TradeRepublicJsonValue = await response.json();
    return body;
  } catch {
    try {
      const body = (await response.text()).trim();
      return body.length === 0 ? undefined : body;
    } catch {
      return undefined;
    }
  }
};

const stringField = (
  value: TradeRepublicJsonValue | undefined,
  ...keys: ReadonlyArray<string>
): string | undefined => {
  if (value === undefined || !isTradeRepublicJsonObject(value)) return undefined;
  const record = value;
  for (const key of keys) {
    const candidate = record[key];
    if (isTradeRepublicJsonString(candidate) && candidate.trim() !== "") return candidate.trim();
  }
  return undefined;
};

const sessionFrom = (
  sessionToken: string | undefined,
  refreshToken: string | undefined,
): TradeRepublicSessionType => {
  if (sessionToken === undefined || refreshToken === undefined)
    throw new Error("Trade Republic did not return a durable session");
  const candidate = {
    sessionToken,
    refreshToken,
  };
  return Schema.decodeUnknownSync(TradeRepublicSession)(candidate);
};

const executablePath = () =>
  process.env["SATELLA_PLAYWRIGHT_EXECUTABLE"] ?? chromium.executablePath();

const requestHeaders = (wafToken: string, deviceInfo: string) => {
  const headers = {
    Accept: "*/*",
    "Accept-Language": "en",
    "Cache-Control": "no-cache",
    Origin: TRADE_REPUBLIC_WEB_ORIGIN,
    Pragma: "no-cache",
    Referer: `${TRADE_REPUBLIC_WEB_ORIGIN}/`,
    "x-tr-app-version": "13.40.5",
    "x-tr-device-info": deviceInfo,
    "x-tr-platform": "web",
    "x-aws-waf-token": wafToken,
  };
  return headers;
};

type WafTokenPage = Pick<Page, "waitForTimeout">;
type WafTokenContext = {
  cookies(): Promise<ReadonlyArray<{ name: string; value: string }>>;
};

export const waitForWafToken = async (
  page: WafTokenPage,
  context: WafTokenContext,
  attempts = WAF_TOKEN_ATTEMPTS,
): Promise<string | undefined> => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const token = (await context.cookies()).find(
        (cookie) => cookie.name.toLowerCase() === "aws-waf-token",
      )?.value;
      if (token !== undefined && token.trim() !== "") return token;
    } catch {}
    if (attempt + 1 < attempts) await page.waitForTimeout(WAF_TOKEN_POLL_MS);
  }
  return undefined;
};

const deviceInfo = () =>
  Buffer.from(JSON.stringify({ stableDeviceId: randomBytes(64).toString("hex") })).toString(
    "base64",
  );

const makeAttempt = async (
  context: BrowserContext,
  page: Page,
  profile: string,
  processId: string,
  expiresAt: Date,
  stableDeviceInfo: string,
): Promise<TradeRepublicBrowserAttempt> => {
  let closed = false;
  const close = () =>
    Effect.tryPromise({
      try: async () => {
        if (closed) return;
        closed = true;
        await context.close().catch(() => undefined);
        await rm(profile, { recursive: true, force: true });
      },
      catch: () => undefined,
    }).pipe(Effect.asVoid, Effect.ignore);

  return {
    challenge: {
      kind: "confirmation_code",
      prompt: "Enter the four-digit confirmation code sent by Trade Republic.",
      length: 4,
      expiresAt: expiresAt.toISOString(),
    },
    submitCode: (code) =>
      Effect.tryPromise({
        try: async () => {
          const nextWafToken = await waitForWafToken(page, context);
          if (nextWafToken === undefined)
            throw authenticationFailure(
              "Trade Republic did not issue the browser security token required to verify the confirmation code",
              "invalid_response",
            );
          const response = await page.request.post(
            `${TRADE_REPUBLIC_API_ORIGIN}/api/v1/auth/web/login/${encodeURIComponent(processId)}/${encodeURIComponent(code)}`,
            {
              headers: requestHeaders(nextWafToken, stableDeviceInfo),
              timeout: BROWSER_TIMEOUT_MS,
            },
          );
          const body = await responseBody(response);
          if (response.status() === 429)
            throw authenticationFailure(
              `Trade Republic rate limit reached (HTTP ${response.status()})${describeErrorBody(body)}`,
              "rate_limit",
            );
          if (response.status() === 401 || response.status() === 403)
            throw authenticationFailure(
              `Trade Republic confirmation code was rejected (HTTP ${response.status()})${describeErrorBody(body)}`,
              "invalid_credentials",
            );
          if (!response.ok())
            throw authenticationFailure(
              `Trade Republic authentication failed (HTTP ${response.status()})${describeErrorBody(body)}`,
              "invalid_response",
            );
          const cookies = await context.cookies(TRADE_REPUBLIC_WEB_ORIGIN);
          const cookieValue = (name: string) =>
            cookies.find((cookie) => cookie.name === name)?.value;
          return sessionFrom(
            cookieValue("tr_session") ?? stringField(body, "sessionToken", "session_token"),
            cookieValue("tr_refresh") ?? stringField(body, "refreshToken", "refresh_token"),
          );
        },
        catch: (cause) => {
          if (cause instanceof ConnectorAuthenticationError) return cause;
          if (cause instanceof Error && cause.name === "TimeoutError")
            return authenticationFailure("Trade Republic authentication timed out", "timeout");
          return authenticationFailure(
            `Trade Republic authentication could not be completed${errorDetail(cause)}`,
          );
        },
      }).pipe(Effect.ensuring(close())),
    close,
  };
};

const start = (input: TradeRepublicBrowserStartInput) =>
  Effect.tryPromise({
    try: (signal) =>
      (async () => {
        let profile: string | undefined;
        let context: BrowserContext | undefined;
        let cleanedUp = false;
        const cleanup = async () => {
          if (cleanedUp) return;
          cleanedUp = true;
          await context?.close().catch(() => undefined);
          if (profile !== undefined) await rm(profile, { recursive: true, force: true });
        };
        const onAbort = () => {
          void cleanup();
        };
        signal.addEventListener("abort", onAbort, { once: true });
        try {
          profile = await mkdtemp(join(tmpdir(), "satella-trade-republic-"));
          context = await chromium.launchPersistentContext(profile, {
            headless: true,
            executablePath: executablePath(),
            userAgent: TRADE_REPUBLIC_USER_AGENT,
            timeout: BROWSER_TIMEOUT_MS,
            args: ["--disable-dev-shm-usage"],
          });
          // SAFETY: Trade Republic's AWS WAF integration requires a normal web
          // browser signal; this narrowly scoped init script is part of the
          // connector's documented browser adapter, not a general stealth layer.
          await context.addInitScript(() => {
            Object.defineProperty(navigator, "webdriver", { get: () => undefined });
          });
          const page = await context.newPage();
          await page.goto(TRADE_REPUBLIC_WEB_ORIGIN, {
            waitUntil: "domcontentloaded",
            timeout: BROWSER_TIMEOUT_MS,
          });
          const wafToken = await waitForWafToken(page, context);
          if (wafToken === undefined)
            throw authenticationFailure(
              "Trade Republic did not issue the browser security token required to start authentication",
              "invalid_response",
            );
          const stableDeviceInfo = deviceInfo();
          const response = await page.request.post(
            `${TRADE_REPUBLIC_API_ORIGIN}/api/v1/auth/web/login`,
            {
              headers: requestHeaders(wafToken, stableDeviceInfo),
              data: { phoneNumber: input.phone, pin: input.pin },
              timeout: BROWSER_TIMEOUT_MS,
            },
          );
          const body = await responseBody(response);
          if (response.status() === 429)
            throw authenticationFailure(
              `Trade Republic rate limit reached (HTTP ${response.status()})${describeErrorBody(body)}`,
              "rate_limit",
            );
          if (response.status() === 401 || response.status() === 403)
            throw authenticationFailure(
              `Trade Republic phone number or PIN was rejected (HTTP ${response.status()})${describeErrorBody(body)}`,
              "invalid_credentials",
            );
          if (!response.ok())
            throw authenticationFailure(
              `Trade Republic authentication failed (HTTP ${response.status()})${describeErrorBody(body)}`,
              "invalid_response",
            );
          const processId = stringField(body, "processId", "process_id", "id");
          if (processId === undefined)
            throw authenticationFailure(
              `Trade Republic did not return an authentication challenge${describeErrorBody(body)}`,
              "invalid_response",
            );
          const attempt = await makeAttempt(
            context,
            page,
            profile,
            processId,
            input.expiresAt,
            stableDeviceInfo,
          );
          signal.removeEventListener("abort", onAbort);
          return attempt;
        } catch (cause) {
          signal.removeEventListener("abort", onAbort);
          await cleanup();
          throw cause;
        }
      })(),
    catch: (cause) => {
      if (cause instanceof ConnectorAuthenticationError) return cause;
      if (cause instanceof Error && cause.name === "TimeoutError")
        return authenticationFailure("Trade Republic authentication timed out", "timeout");
      return authenticationFailure(
        `Trade Republic browser authentication could not be started${errorDetail(cause)}`,
      );
    },
  }).pipe(
    Effect.timeoutOrElse({
      duration: BROWSER_TIMEOUT_MS,
      orElse: () =>
        Effect.fail(authenticationFailure("Trade Republic authentication timed out", "timeout")),
    }),
  );

export const TradeRepublicBrowserRuntimeLive = Layer.succeed(TradeRepublicBrowserRuntime, {
  start,
});

export const layer = TradeRepublicBrowserRuntimeLive;
