import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export interface AmazonAdsChangeLogRecord {
  createdAt?: string;
  operation: string;
  profileId: string;
  applied: true;
  payload: Record<string, unknown>;
  result: unknown;
}

export interface AmazonAdsChangeLog {
  record(entry: AmazonAdsChangeLogRecord): Promise<void>;
}

export class FileAmazonAdsChangeLog implements AmazonAdsChangeLog {
  constructor(
    private readonly path = "logs/amazon-ads-actions.log",
    private readonly now: () => Date = () => new Date()
  ) {}

  async record(entry: AmazonAdsChangeLogRecord): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await appendFile(this.path, `${JSON.stringify({ ...entry, createdAt: entry.createdAt ?? this.now().toISOString() })}\n`, "utf8");
  }
}
