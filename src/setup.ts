#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { DEFAULT_REDIRECT_URI } from "./config.js";
import { KeychainCredentialStore } from "./credentials/keychain.js";
import { ShopWeaverError } from "./errors.js";
import { waitForOAuthCallback } from "./oauth/callback.js";
import { EtsyOAuth } from "./oauth/etsy-oauth.js";

async function promptMasked(label: string): Promise<string> {
  if (!stdin.isTTY) throw new ShopWeaverError("TTY_REQUIRED", "Run setup in an interactive terminal.");
  stdout.write(label);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let value = "";
    const onData = (chunk: string) => {
      if (chunk === "\u0003") {
        cleanup();
        reject(new ShopWeaverError("SETUP_CANCELLED", "Setup cancelled."));
      } else if (chunk === "\r" || chunk === "\n") {
        cleanup();
        stdout.write("\n");
        resolve(value);
      } else if (chunk === "\u007f") {
        if (value) {
          value = value.slice(0, -1);
          stdout.write("\b \b");
        }
      } else if (chunk >= " ") {
        value += chunk;
        stdout.write("*");
      }
    };
    const cleanup = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    stdin.on("data", onData);
  });
}

async function main(): Promise<void> {
  const store = new KeychainCredentialStore();
  const keystring = await promptMasked("Etsy API keystring: ");
  const sharedSecret = await promptMasked("Etsy shared secret: ");
  const readline = createInterface({ input: stdin, output: stdout });
  const enteredRedirect = await readline.question(`Registered redirect URI [${DEFAULT_REDIRECT_URI}]: `);
  readline.close();
  const app = { keystring, sharedSecret, redirectUri: enteredRedirect.trim() || DEFAULT_REDIRECT_URI };
  await store.set("app", app);
  const oauth = new EtsyOAuth(store);
  const authorization = oauth.createAuthorization(keystring, app.redirectUri);
  const callback = waitForOAuthCallback(new URL(app.redirectUri), authorization.state);
  spawn("/usr/bin/open", [authorization.url.toString()], { stdio: "ignore", detached: true }).unref();
  const code = await callback;
  const { userId } = await oauth.exchangeCode(app, authorization.verifier, code);
  const token = await store.get("oauth");
  if (!token) throw new ShopWeaverError("AUTH_REQUIRED", "Etsy authorization was not stored.");
  const shopId = await oauth.discoverSingleShop(app, token.accessToken, userId);
  await store.set("shop", { userId, shopId });
  stdout.write("ShopWeaver connected one Etsy shop.\n");
}

main().catch(error => {
  const message = error instanceof ShopWeaverError ? error.message : "ShopWeaver setup failed.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
