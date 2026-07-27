#!/usr/bin/env node
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { parseAmazonMarketplaceIds, parseAmazonRegion } from "./amazon/setup-inputs.js";
import { KeychainCredentialStore } from "./credentials/keychain.js";
import { ShopWeaverError } from "./errors.js";

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
  const clientId = await promptMasked("Amazon LWA client ID: ");
  const clientSecret = await promptMasked("Amazon LWA client secret: ");
  const refreshToken = await promptMasked("Amazon SP-API refresh token: ");
  const readline = createInterface({ input: stdin, output: stdout });
  const sellingPartnerId = (await readline.question("Amazon selling partner ID: ")).trim();
  const region = parseAmazonRegion(await readline.question("Amazon SP-API region [na/eu/fe]: "));
  const marketplaceIds = parseAmazonMarketplaceIds(await readline.question("Amazon marketplace IDs, comma separated: "));
  readline.close();
  await store.set("amazonSpApiApp", { clientId, clientSecret });
  await store.set("amazonSpApiAuth", { refreshToken, sellingPartnerId, region, marketplaceIds });
  stdout.write("ShopWeaver stored Amazon SP-API authorization.\n");
}

main().catch(error => {
  const message = error instanceof ShopWeaverError ? error.message : "ShopWeaver Amazon setup failed.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
