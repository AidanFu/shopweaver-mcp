import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { AmazonAdsWriteService } from "../src/tools/amazon-tools.js";
import { ConfirmationStore } from "../src/writes/confirmations.js";

describe("AmazonAdsWriteService", () => {
  it("previews and confirms approved negative keywords from a reviewed workbook", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shopweaver-amazon-ads-write-"));
    const file = join(dir, "reviewed-optimization.xlsx");
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
      {
        "Action ID": "negative_exact_candidate:ad_group:campaign-1:adgroup-1:free-crochet-pattern",
        "Action": "negative_exact_candidate",
        "Scope": "ad_group",
        "Campaign ID": "campaign-1",
        "Ad Group ID": "adgroup-1",
        "Search Term": "free crochet pattern",
        "Decision": "approve"
      },
      {
        "Action ID": "budget_watch:campaign:campaign-1",
        "Action": "budget_watch",
        "Scope": "campaign",
        "Campaign ID": "campaign-1",
        "Decision": "approve"
      }
    ]), "Action Plan");
    XLSX.writeFile(workbook, file);
    const amazonAds = {
      createSponsoredProductsNegativeKeywords: vi.fn().mockResolvedValue({
        negativeKeywords: { success: [{ index: 0, negativeKeywordId: "999" }], error: [] }
      })
    };
    const service = new AmazonAdsWriteService(amazonAds, new ConfirmationStore(() => 1_000));

    const preview = await service.previewApprovedNegativeKeywords("profile-1", file);

    expect(preview).toMatchObject({
      operation: "amazon_ads_create_negative_keywords",
      profileId: "profile-1",
      negativeKeywordCount: 1,
      applied: false,
      negativeKeywords: [{
        campaignId: "campaign-1",
        adGroupId: "adgroup-1",
        keywordText: "free crochet pattern",
        matchType: "NEGATIVE_EXACT",
        state: "ENABLED"
      }]
    });
    expect(amazonAds.createSponsoredProductsNegativeKeywords).not.toHaveBeenCalled();

    await expect(service.confirmApprovedNegativeKeywords("profile-1", file, preview.confirmationToken))
      .resolves.toMatchObject({
        operation: "amazon_ads_create_negative_keywords",
        profileId: "profile-1",
        negativeKeywordCount: 1,
        applied: true,
        result: { negativeKeywords: { success: [{ index: 0, negativeKeywordId: "999" }], error: [] } }
      });
    expect(amazonAds.createSponsoredProductsNegativeKeywords).toHaveBeenCalledWith("profile-1", [{
      campaignId: "campaign-1",
      adGroupId: "adgroup-1",
      keywordText: "free crochet pattern",
      matchType: "NEGATIVE_EXACT",
      state: "ENABLED"
    }]);
  });

  it("previews and confirms campaign state updates", async () => {
    const amazonAds = {
      createSponsoredProductsNegativeKeywords: vi.fn(),
      updateSponsoredProductsCampaigns: vi.fn().mockResolvedValue({
        campaigns: { success: [{ index: 0, campaignId: "campaign-1" }], error: [] }
      })
    };
    const service = new AmazonAdsWriteService(amazonAds, new ConfirmationStore(() => 1_000));

    const preview = await service.previewCampaignStateUpdates("profile-1", [{
      campaignId: "campaign-1",
      state: "PAUSED",
      reason: "Active campaign is unrelated to current handmade charm products."
    }]);

    expect(preview).toMatchObject({
      operation: "amazon_ads_update_campaign_states",
      profileId: "profile-1",
      campaignUpdateCount: 1,
      applied: false,
      campaigns: [{
        campaignId: "campaign-1",
        state: "PAUSED",
        reason: "Active campaign is unrelated to current handmade charm products."
      }]
    });
    expect(amazonAds.updateSponsoredProductsCampaigns).not.toHaveBeenCalled();

    await expect(service.confirmCampaignStateUpdates("profile-1", preview.campaigns, preview.confirmationToken))
      .resolves.toMatchObject({
        operation: "amazon_ads_update_campaign_states",
        profileId: "profile-1",
        campaignUpdateCount: 1,
        applied: true,
        result: { campaigns: { success: [{ index: 0, campaignId: "campaign-1" }], error: [] } }
      });
    expect(amazonAds.updateSponsoredProductsCampaigns).toHaveBeenCalledWith("profile-1", [{
      campaignId: "campaign-1",
      state: "PAUSED"
    }]);
  });
});
