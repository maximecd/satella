import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium, type BrowserContext, type Page } from "playwright";
import { ConnectorAuthenticationError } from "@satella-app/connector-core";
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
const TRADE_REPUBLIC_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

const authenticationFailure = (
  message: string,
  category: ConnectorAuthenticationError["category"] = "network",
) => new ConnectorAuthenticationError({ category, message });

const responseBody = async (
  response: Awaited<ReturnType<Page["request"]["post"]>>,
): Promise<TradeRepublicJsonValue | undefined> => {
  try {
    const body: TradeRepublicJsonValue = await response.json();
    return body;
  } catch {
    return undefined;
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

const requestHeaders = (wafToken: string | undefined) => {
  const headers = {
    Accept: "application/json",
    Origin: TRADE_REPUBLIC_WEB_ORIGIN,
    Referer: `${TRADE_REPUBLIC_WEB_ORIGIN}/`,
    "x-tr-app-version": "web",
    "x-tr-device-info": "web",
    "x-tr-platform": "web",
    "x-tr-protocol-version": "31",
  };
  if (wafToken !== undefined) Object.assign(headers, { "x-aws-waf-token": wafToken });
  return headers;
};

const wafTokenFrom = async (page: Page, context: BrowserContext): Promise<string | undefined> => {
  let pageToken: string | undefined;
  try {
    pageToken = await page.evaluate(() => {
      // SAFETY: AWSWafIntegration is installed by the Trade Republic page before this evaluation runs.
      const candidate = (
        globalThis as { AWSWafIntegration?: { getToken?: () => string | Promise<string> } }
      ).AWSWafIntegration?.getToken?.();
      return candidate;
    });
  } catch {}
  if (pageToken !== undefined && pageToken.trim() !== "") return pageToken;
  try {
    return (await context.cookies()).find((cookie) => cookie.name === "aws-waf-token")?.value;
  } catch {
    return undefined;
  }
};

const makeAttempt = async (
  context: BrowserContext,
  page: Page,
  profile: string,
  processId: string,
  expiresAt: Date,
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
          const nextWafToken = await wafTokenFrom(page, context);
          const response = await page.request.post(
            `${TRADE_REPUBLIC_API_ORIGIN}/api/v1/auth/web/login/${encodeURIComponent(processId)}/${encodeURIComponent(code)}`,
            {
              headers: requestHeaders(nextWafToken),
              timeout: BROWSER_TIMEOUT_MS,
            },
          );
          if (response.status() === 429)
            throw authenticationFailure("Trade Republic rate limit reached", "rate_limit");
          if (response.status() === 401 || response.status() === 403)
            throw authenticationFailure(
              "Trade Republic confirmation code was rejected",
              "invalid_credentials",
            );
          if (!response.ok())
            throw authenticationFailure("Trade Republic authentication failed", "invalid_response");
          const body = await responseBody(response);
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
          return authenticationFailure("Trade Republic authentication could not be completed");
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
          const wafToken = await wafTokenFrom(page, context);
          const response = await page.request.post(
            `${TRADE_REPUBLIC_API_ORIGIN}/api/v1/auth/web/login`,
            {
              headers: requestHeaders(wafToken),
              data: { phoneNumber: input.phone, pin: input.pin },
              timeout: BROWSER_TIMEOUT_MS,
            },
          );
          if (response.status() === 429)
            throw authenticationFailure("Trade Republic rate limit reached", "rate_limit");
          if (response.status() === 401 || response.status() === 403)
            throw authenticationFailure(
              "Trade Republic phone number or PIN was rejected",
              "invalid_credentials",
            );
          if (!response.ok())
            throw authenticationFailure("Trade Republic authentication failed", "invalid_response");
          const body = await responseBody(response);
          const processId = stringField(body, "processId", "process_id", "id");
          if (processId === undefined)
            throw authenticationFailure(
              "Trade Republic did not return an authentication challenge",
              "invalid_response",
            );
          const attempt = await makeAttempt(context, page, profile, processId, input.expiresAt);
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
      return authenticationFailure("Trade Republic browser authentication could not be started");
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
