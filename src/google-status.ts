import { pathToFileURL } from "node:url";
import { KeychainCredentialStore } from "./credentials/keychain.js";
import { GoogleOAuth } from "./google/oauth.js";
import { GoogleDriveHealthService } from "./google/status.js";
import { LocalConfigStore } from "./local-config.js";
import { redact } from "./redaction.js";

type GoogleStatusCliDeps = {
  health?: Pick<GoogleDriveHealthService, "status">;
  stdout?: Pick<NodeJS.WriteStream, "write">;
};

function safeStatus(value: unknown): unknown {
  const json = JSON.parse(JSON.stringify(value));
  stripSensitiveFields(json);
  return JSON.parse(redact(JSON.stringify(json)) as string);
}

function stripSensitiveFields(value: unknown): void {
  if (Array.isArray(value)) {
    for (const entry of value) stripSensitiveFields(entry);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const key of ["accessToken", "refreshToken", "clientSecret"]) delete (value as Record<string, unknown>)[key];
  for (const entry of Object.values(value)) stripSensitiveFields(entry);
}

export async function runGoogleStatusCli(deps: GoogleStatusCliDeps = {}): Promise<number> {
  const health = deps.health ?? createDefaultHealth();
  const stdout = deps.stdout ?? process.stdout;
  const status = await health.status({ validateRefresh: true });
  stdout.write(`${JSON.stringify(safeStatus(status), null, 2)}\n`);
  return status.connected ? 0 : 1;
}

function createDefaultHealth(): GoogleDriveHealthService {
  const store = new KeychainCredentialStore();
  return new GoogleDriveHealthService(store, new LocalConfigStore(), new GoogleOAuth(store));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runGoogleStatusCli();
}
