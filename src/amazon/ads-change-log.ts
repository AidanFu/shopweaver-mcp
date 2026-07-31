import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface AmazonAdsChangeLogRecord {
  createdAt?: string;
  operation: string;
  profileId: string;
  applied: true;
  payload: Record<string, unknown>;
  result: unknown;
}

export interface AmazonAdsChangeLogReadInput {
  profileId?: string;
  operation?: string;
  campaignId?: string;
  limit?: number;
}

export interface AmazonAdsChangeLog {
  record(entry: AmazonAdsChangeLogRecord): Promise<void>;
  read(input?: AmazonAdsChangeLogReadInput): Promise<{
    operation: "read_amazon_ads_change_log";
    recordCount: number;
    records: AmazonAdsChangeLogRecord[];
  }>;
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

  async read(input: AmazonAdsChangeLogReadInput = {}) {
    const limit = input.limit ?? 50;
    const records = (await this.readRecords())
      .filter(record => !input.profileId || record.profileId === input.profileId)
      .filter(record => !input.operation || record.operation === input.operation)
      .filter(record => !input.campaignId || recordHasCampaign(record, input.campaignId))
      .slice(-limit)
      .reverse();
    return {
      operation: "read_amazon_ads_change_log" as const,
      recordCount: records.length,
      records
    };
  }

  private async readRecords(): Promise<AmazonAdsChangeLogRecord[]> {
    try {
      return (await readFile(this.path, "utf8"))
        .split("\n")
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => JSON.parse(line) as AmazonAdsChangeLogRecord);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }
}

function recordHasCampaign(record: AmazonAdsChangeLogRecord, campaignId: string): boolean {
  const campaigns = (record.payload as { campaigns?: Array<{ campaignId?: string }> }).campaigns ?? [];
  return campaigns.some(campaign => campaign.campaignId === campaignId);
}
