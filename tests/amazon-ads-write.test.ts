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

  it("previews and confirms campaign creation", async () => {
    const campaign = {
      name: "ShopWeaver Exact | Towel Warmer Winners",
      targetingType: "MANUAL" as const,
      state: "PAUSED" as const,
      startDate: "2026-07-30",
      budget: { budgetType: "DAILY" as const, budget: 5 },
      dynamicBidding: {
        strategy: "AUTO_FOR_SALES" as const,
        placementBidding: []
      },
      reason: "Launch paused until keywords and product targets are reviewed."
    };
    const amazonAds = {
      createSponsoredProductsNegativeKeywords: vi.fn(),
      updateSponsoredProductsCampaigns: vi.fn(),
      createSponsoredProductsCampaigns: vi.fn().mockResolvedValue({
        campaigns: { success: [{ index: 0, campaignId: "campaign-2" }], error: [] }
      })
    };
    const service = new AmazonAdsWriteService(amazonAds, new ConfirmationStore(() => 1_000));

    const preview = await service.previewCampaignCreations("profile-1", [campaign]);

    expect(preview).toMatchObject({
      operation: "amazon_ads_create_campaigns",
      profileId: "profile-1",
      campaignCreateCount: 1,
      applied: false,
      campaigns: [campaign]
    });
    expect(amazonAds.createSponsoredProductsCampaigns).not.toHaveBeenCalled();

    await expect(service.confirmCampaignCreations("profile-1", preview.campaigns, preview.confirmationToken))
      .resolves.toMatchObject({
        operation: "amazon_ads_create_campaigns",
        profileId: "profile-1",
        campaignCreateCount: 1,
        applied: true,
        result: { campaigns: { success: [{ index: 0, campaignId: "campaign-2" }], error: [] } }
      });
    expect(amazonAds.createSponsoredProductsCampaigns).toHaveBeenCalledWith("profile-1", [{
      name: "ShopWeaver Exact | Towel Warmer Winners",
      targetingType: "MANUAL",
      state: "PAUSED",
      startDate: "2026-07-30",
      budget: { budgetType: "DAILY", budget: 5 },
      dynamicBidding: {
        strategy: "AUTO_FOR_SALES",
        placementBidding: []
      }
    }]);
  });

  it("previews and confirms campaign budget updates", async () => {
    const amazonAds = {
      createSponsoredProductsNegativeKeywords: vi.fn(),
      updateSponsoredProductsCampaigns: vi.fn().mockResolvedValue({
        campaigns: { success: [{ index: 0, campaignId: "campaign-1" }], error: [] }
      }),
      createSponsoredProductsCampaigns: vi.fn()
    };
    const service = new AmazonAdsWriteService(amazonAds, new ConfirmationStore(() => 1_000));

    const preview = await service.previewCampaignBudgetUpdates("profile-1", [{
      campaignId: "campaign-1",
      budget: { budgetType: "DAILY", budget: 5 },
      reason: "Reduce daily cost while waste terms are reviewed."
    }]);

    expect(preview).toMatchObject({
      operation: "amazon_ads_update_campaign_budgets",
      profileId: "profile-1",
      campaignBudgetUpdateCount: 1,
      applied: false,
      campaigns: [{
        campaignId: "campaign-1",
        budget: { budgetType: "DAILY", budget: 5 },
        reason: "Reduce daily cost while waste terms are reviewed."
      }]
    });
    expect(amazonAds.updateSponsoredProductsCampaigns).not.toHaveBeenCalled();

    await expect(service.confirmCampaignBudgetUpdates("profile-1", preview.campaigns, preview.confirmationToken))
      .resolves.toMatchObject({
        operation: "amazon_ads_update_campaign_budgets",
        profileId: "profile-1",
        campaignBudgetUpdateCount: 1,
        applied: true,
        result: { campaigns: { success: [{ index: 0, campaignId: "campaign-1" }], error: [] } }
      });
    expect(amazonAds.updateSponsoredProductsCampaigns).toHaveBeenCalledWith("profile-1", [{
      campaignId: "campaign-1",
      budget: { budgetType: "DAILY", budget: 5 }
    }]);
  });

  it("previews and confirms keyword bid updates", async () => {
    const amazonAds = {
      createSponsoredProductsNegativeKeywords: vi.fn(),
      updateSponsoredProductsCampaigns: vi.fn(),
      createSponsoredProductsCampaigns: vi.fn(),
      updateSponsoredProductsKeywords: vi.fn().mockResolvedValue({
        keywords: { success: [{ index: 0, keywordId: "keyword-1" }], error: [] }
      })
    };
    const service = new AmazonAdsWriteService(amazonAds, new ConfirmationStore(() => 1_000));

    const preview = await service.previewKeywordBidUpdates("profile-1", [{
      keywordId: "keyword-1",
      bid: 0.25,
      reason: "Lower bid after report shows spend without orders."
    }]);

    expect(preview).toMatchObject({
      operation: "amazon_ads_update_keyword_bids",
      profileId: "profile-1",
      keywordBidUpdateCount: 1,
      applied: false,
      keywords: [{
        keywordId: "keyword-1",
        bid: 0.25,
        reason: "Lower bid after report shows spend without orders."
      }]
    });
    expect(amazonAds.updateSponsoredProductsKeywords).not.toHaveBeenCalled();

    await expect(service.confirmKeywordBidUpdates("profile-1", preview.keywords, preview.confirmationToken))
      .resolves.toMatchObject({
        operation: "amazon_ads_update_keyword_bids",
        profileId: "profile-1",
        keywordBidUpdateCount: 1,
        applied: true,
        result: { keywords: { success: [{ index: 0, keywordId: "keyword-1" }], error: [] } }
      });
    expect(amazonAds.updateSponsoredProductsKeywords).toHaveBeenCalledWith("profile-1", [{
      keywordId: "keyword-1",
      bid: 0.25
    }]);
  });

  it("previews and confirms ad group default bid updates", async () => {
    const amazonAds = {
      createSponsoredProductsNegativeKeywords: vi.fn(),
      updateSponsoredProductsCampaigns: vi.fn(),
      createSponsoredProductsCampaigns: vi.fn(),
      updateSponsoredProductsKeywords: vi.fn(),
      updateSponsoredProductsAdGroups: vi.fn().mockResolvedValue({
        adGroups: { success: [{ index: 0, adGroupId: "adgroup-1" }], error: [] }
      })
    };
    const service = new AmazonAdsWriteService(amazonAds, new ConfirmationStore(() => 1_000));

    const preview = await service.previewAdGroupBidUpdates("profile-1", [{
      adGroupId: "adgroup-1",
      defaultBid: 0.3,
      reason: "Lower ad group bid after broad spend runs ahead of orders."
    }]);

    expect(preview).toMatchObject({
      operation: "amazon_ads_update_ad_group_bids",
      profileId: "profile-1",
      adGroupBidUpdateCount: 1,
      applied: false,
      adGroups: [{
        adGroupId: "adgroup-1",
        defaultBid: 0.3,
        reason: "Lower ad group bid after broad spend runs ahead of orders."
      }]
    });
    expect(amazonAds.updateSponsoredProductsAdGroups).not.toHaveBeenCalled();

    await expect(service.confirmAdGroupBidUpdates("profile-1", preview.adGroups, preview.confirmationToken))
      .resolves.toMatchObject({
        operation: "amazon_ads_update_ad_group_bids",
        profileId: "profile-1",
        adGroupBidUpdateCount: 1,
        applied: true,
        result: { adGroups: { success: [{ index: 0, adGroupId: "adgroup-1" }], error: [] } }
      });
    expect(amazonAds.updateSponsoredProductsAdGroups).toHaveBeenCalledWith("profile-1", [{
      adGroupId: "adgroup-1",
      defaultBid: 0.3
    }]);
  });
});
