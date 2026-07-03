import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { ShopWeaverError } from "../errors.js";

function statesMatch(actual: string, expected: string): boolean {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function waitForOAuthCallback(redirectUri: URL, expectedState: string, timeoutMs = 300_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      server.close(action);
    };
    const server = createServer((request, response) => {
      const requestUrl = new URL(request.url ?? "/", redirectUri);
      if (request.method !== "GET" || requestUrl.pathname !== redirectUri.pathname) {
        response.writeHead(404).end("Not found");
        return;
      }
      const state = requestUrl.searchParams.get("state") ?? "";
      if (!statesMatch(state, expectedState)) {
        response.writeHead(400, { "content-type": "text/html; charset=utf-8" }).end("Authorization failed. Return to the terminal.");
        finish(() => reject(new ShopWeaverError("OAUTH_STATE_MISMATCH", "OAuth state validation failed.")));
        return;
      }
      const error = requestUrl.searchParams.get("error");
      const code = requestUrl.searchParams.get("code");
      if (error || !code) {
        response.writeHead(400, { "content-type": "text/html; charset=utf-8" }).end("Authorization was not completed. Return to the terminal.");
        finish(() => reject(new ShopWeaverError("OAUTH_DENIED", "Etsy authorization was not completed.")));
        return;
      }
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end("ShopWeaver is connected. You may close this window.");
      finish(() => resolve(code));
    });
    const timer = setTimeout(() => finish(() => reject(new ShopWeaverError("OAUTH_TIMEOUT", "Etsy authorization timed out."))), timeoutMs);
    server.once("error", error => finish(() => reject(new ShopWeaverError("OAUTH_CALLBACK_FAILED", "Could not start the local OAuth callback.", error))));
    server.listen(Number(redirectUri.port || 80), redirectUri.hostname);
  });
}
