#!/usr/bin/env node
import { spawn } from "node:child_process";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { DEFAULT_GOOGLE_REDIRECT_URI } from "./config.js";
import { KeychainCredentialStore } from "./credentials/keychain.js";
import { ShopWeaverError } from "./errors.js";
import { GoogleOAuth } from "./google/oauth.js";
import { waitForOAuthCallback } from "./oauth/callback.js";

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
  const clientId = await promptMasked("Google OAuth client ID: ");
  const clientSecret = await promptMasked("Google OAuth client secret: ");
  const readline = createInterface({ input: stdin, output: stdout });
  const enteredRedirect = await readline.question(`Registered Google redirect URI [${DEFAULT_GOOGLE_REDIRECT_URI}]: `);
  readline.close();
  const app = { clientId, clientSecret, redirectUri: enteredRedirect.trim() || DEFAULT_GOOGLE_REDIRECT_URI };
  await store.set("googleApp", app);
  const oauth = new GoogleOAuth(store);
  const authorization = oauth.createAuthorization(clientId, app.redirectUri);
  const callback = waitForOAuthCallback(new URL(app.redirectUri), authorization.state);
  spawn("/usr/bin/open", [authorization.url.toString()], { stdio: "ignore", detached: true }).unref();
  const code = await callback;
  await oauth.exchangeCode(app, code);
  stdout.write("ShopWeaver connected Google Drive.\n");
}

main().catch(error => {
  const message = error instanceof ShopWeaverError ? error.message : "ShopWeaver Google Drive setup failed.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
