import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { FileAmazonAdsChangeLog } from "../src/amazon/ads-change-log.js";

describe("FileAmazonAdsChangeLog", () => {
  it("appends Amazon Ads write records as JSON lines", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shopweaver-amazon-ads-log-"));
    const file = join(dir, "amazon-ads-actions.log");
    const log = new FileAmazonAdsChangeLog(file, () => new Date("2026-07-30T20:45:00.000Z"));

    await log.record({
      operation: "amazon_ads_update_campaign_bidding",
      profileId: "profile-1",
      applied: true,
      payload: { campaigns: [{ campaignId: "campaign-1" }] },
      result: { campaigns: { success: [{ campaignId: "campaign-1" }], error: [] } }
    });

    const lines = (await readFile(file, "utf8")).trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual({
      createdAt: "2026-07-30T20:45:00.000Z",
      operation: "amazon_ads_update_campaign_bidding",
      profileId: "profile-1",
      applied: true,
      payload: { campaigns: [{ campaignId: "campaign-1" }] },
      result: { campaigns: { success: [{ campaignId: "campaign-1" }], error: [] } }
    });
  });
});
