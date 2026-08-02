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

  it("previews and confirms direct negative keyword payloads", async () => {
    const amazonAds = {
      createSponsoredProductsNegativeKeywords: vi.fn().mockResolvedValue({
        negativeKeywords: { success: [{ index: 0, negativeKeywordId: "999" }], error: [] }
      })
    };
    const service = new AmazonAdsWriteService(amazonAds, new ConfirmationStore(() => 1_000));

    const preview = await service.previewNegativeKeywords("profile-1", [{
      campaignId: "campaign-1",
      adGroupId: "adgroup-1",
      keywordText: "free crochet pattern",
      matchType: "NEGATIVE_EXACT",
      state: "ENABLED"
    }]);

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

    await expect(service.confirmNegativeKeywords("profile-1", preview.negativeKeywords, preview.confirmationToken))
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

  it("records confirmed direct negative keywords for later optimization analysis", async () => {
    const amazonAds = {
      createSponsoredProductsNegativeKeywords: vi.fn().mockResolvedValue({
        negativeKeywords: { success: [{ index: 0, negativeKeywordId: "999" }], error: [] }
      })
    };
    const auditLog = { record: vi.fn().mockResolvedValue(undefined) };
    const service = new AmazonAdsWriteService(amazonAds, new ConfirmationStore(() => 1_000), auditLog);
    const preview = await service.previewNegativeKeywords("profile-1", [{
      campaignId: "campaign-1",
      adGroupId: "adgroup-1",
      keywordText: "free towel rack manual",
      matchType: "NEGATIVE_EXACT",
      state: "ENABLED"
    }]);

    await service.confirmNegativeKeywords("profile-1", preview.negativeKeywords, preview.confirmationToken);

    expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({
      operation: "amazon_ads_create_negative_keywords",
      profileId: "profile-1",
      applied: true,
      payload: {
        negativeKeywords: [{
          campaignId: "campaign-1",
          adGroupId: "adgroup-1",
          keywordText: "free towel rack manual",
          matchType: "NEGATIVE_EXACT",
          state: "ENABLED"
        }]
      },
      result: { negativeKeywords: { success: [{ index: 0, negativeKeywordId: "999" }], error: [] } }
    }));
    expect(auditLog.record.mock.calls[0][0].createdAt).toEqual(expect.any(String));
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

  it("records confirmed campaign state updates for later optimization analysis", async () => {
    const amazonAds = {
      createSponsoredProductsNegativeKeywords: vi.fn(),
      updateSponsoredProductsCampaigns: vi.fn().mockResolvedValue({
        campaigns: { success: [{ index: 0, campaignId: "campaign-1" }], error: [] }
      })
    };
    const auditLog = { record: vi.fn().mockResolvedValue(undefined) };
    const service = new AmazonAdsWriteService(amazonAds, new ConfirmationStore(() => 1_000), auditLog);
    const preview = await service.previewCampaignStateUpdates("profile-1", [{
      campaignId: "campaign-1",
      state: "PAUSED",
      reason: "Pause spend while listing conversion is reviewed."
    }]);

    await service.confirmCampaignStateUpdates("profile-1", preview.campaigns, preview.confirmationToken);

    expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({
      operation: "amazon_ads_update_campaign_states",
      profileId: "profile-1",
      applied: true,
      payload: {
        campaigns: [{
          campaignId: "campaign-1",
          state: "PAUSED",
          reason: "Pause spend while listing conversion is reviewed."
        }]
      },
      result: { campaigns: { success: [{ index: 0, campaignId: "campaign-1" }], error: [] } }
    }));
    expect(auditLog.record.mock.calls[0][0].createdAt).toEqual(expect.any(String));
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

  it("records confirmed campaign creation for later optimization analysis", async () => {
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
    const auditLog = { record: vi.fn().mockResolvedValue(undefined) };
    const service = new AmazonAdsWriteService(amazonAds, new ConfirmationStore(() => 1_000), auditLog);
    const preview = await service.previewCampaignCreations("profile-1", [campaign]);

    await service.confirmCampaignCreations("profile-1", preview.campaigns, preview.confirmationToken);

    expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({
      operation: "amazon_ads_create_campaigns",
      profileId: "profile-1",
      applied: true,
      payload: { campaigns: [campaign] },
      result: { campaigns: { success: [{ index: 0, campaignId: "campaign-2" }], error: [] } }
    }));
    expect(auditLog.record.mock.calls[0][0].createdAt).toEqual(expect.any(String));
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

  it("records confirmed campaign budget updates for later optimization analysis", async () => {
    const amazonAds = {
      createSponsoredProductsNegativeKeywords: vi.fn(),
      updateSponsoredProductsCampaigns: vi.fn().mockResolvedValue({
        campaigns: { success: [{ index: 0, campaignId: "campaign-1" }], error: [] }
      }),
      createSponsoredProductsCampaigns: vi.fn()
    };
    const auditLog = { record: vi.fn().mockResolvedValue(undefined) };
    const service = new AmazonAdsWriteService(amazonAds, new ConfirmationStore(() => 1_000), auditLog);
    const preview = await service.previewCampaignBudgetUpdates("profile-1", [{
      campaignId: "campaign-1",
      budget: { budgetType: "DAILY", budget: 5 },
      reason: "Reduce daily cost while waste terms are reviewed."
    }]);

    await service.confirmCampaignBudgetUpdates("profile-1", preview.campaigns, preview.confirmationToken);

    expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({
      operation: "amazon_ads_update_campaign_budgets",
      profileId: "profile-1",
      applied: true,
      payload: {
        campaigns: [{
          campaignId: "campaign-1",
          budget: { budgetType: "DAILY", budget: 5 },
          reason: "Reduce daily cost while waste terms are reviewed."
        }]
      },
      result: { campaigns: { success: [{ index: 0, campaignId: "campaign-1" }], error: [] } }
    }));
    expect(auditLog.record.mock.calls[0][0].createdAt).toEqual(expect.any(String));
  });

  it("previews SKU optimizer budget updates through the existing budget confirmation flow", async () => {
    const amazonAds = {
      createSponsoredProductsNegativeKeywords: vi.fn(),
      updateSponsoredProductsCampaigns: vi.fn(),
      createSponsoredProductsCampaigns: vi.fn(),
      getReport: vi.fn().mockResolvedValue({ reportId: "sku-report-1", status: "COMPLETED", url: "https://example.test/sku-report.gz" }),
      downloadReportRows: vi.fn().mockResolvedValue([
        { campaignId: "campaign-1", campaignName: "Exact Gold", adGroupId: "adgroup-1", advertisedSku: "DH-E37S-W6DM", searchTerm: "heated towel rack", clicks: 18, cost: 32, purchases7d: 0, sales7d: 0 },
        { campaignId: "campaign-2", campaignName: "Exact Silver", adGroupId: "adgroup-2", advertisedSku: "5H-2EH1-7H77", searchTerm: "towel warmer", clicks: 20, cost: 18, purchases7d: 1, sales7d: 184.9 }
      ]),
      listSponsoredProductsCampaigns: vi.fn().mockResolvedValue({ campaigns: [{ campaignId: "campaign-1", budget: { budgetType: "DAILY", budget: 10 } }] })
    };
    const service = new AmazonAdsWriteService(amazonAds, new ConfirmationStore(() => 1_000));

    const preview = await service.previewSkuOptimizerBudgetUpdates({
      profileId: "profile-1",
      reportId: "sku-report-1",
      startDate: "2026-07-29",
      endDate: "2026-08-01",
      targetSkus: ["DH-E37S-W6DM", "5H-2EH1-7H77"],
      targetSkusWithSales: ["5H-2EH1-7H77"],
      nonTargetSkusWithSales: []
    });

    expect(preview).toMatchObject({
      operation: "amazon_ads_update_campaign_budgets",
      sourceOperation: "amazon_ads_run_sku_optimization_cycle",
      sourceReportId: "sku-report-1",
      profileId: "profile-1",
      campaignBudgetUpdateCount: 1,
      applied: false,
      campaigns: [{
        campaignId: "campaign-1",
        budget: { budgetType: "DAILY", budget: 5 },
        reason: "Reduce daily budget from 10 to 5 only after reviewing SKU fit and ad group bids; 100% of spend is high-priority zero-sale SKU spend."
      }]
    });
    expect(preview.confirmationToken).toEqual(expect.any(String));
    expect(amazonAds.updateSponsoredProductsCampaigns).not.toHaveBeenCalled();
  });

  it("previews SKU optimizer keyword bid updates through the existing keyword bid confirmation flow", async () => {
    const amazonAds = {
      createSponsoredProductsNegativeKeywords: vi.fn(),
      updateSponsoredProductsCampaigns: vi.fn(),
      createSponsoredProductsCampaigns: vi.fn(),
      updateSponsoredProductsKeywords: vi.fn(),
      getReport: vi.fn().mockResolvedValue({ reportId: "sku-report-1", status: "COMPLETED", url: "https://example.test/sku-report.gz" }),
      downloadReportRows: vi.fn().mockResolvedValue([
        { campaignId: "campaign-1", campaignName: "Exact Gold", adGroupId: "adgroup-1", advertisedSku: "DH-E37S-W6DM", keywordId: "keyword-1", searchTerm: "free towel rack manual", clicks: 18, cost: 32, purchases7d: 0, sales7d: 0, bid: 0.8 }
      ]),
      listSponsoredProductsCampaigns: vi.fn().mockResolvedValue({ campaigns: [] })
    };
    const service = new AmazonAdsWriteService(amazonAds, new ConfirmationStore(() => 1_000));

    const preview = await service.previewSkuOptimizerKeywordBidUpdates({
      profileId: "profile-1",
      reportId: "sku-report-1",
      startDate: "2026-07-29",
      endDate: "2026-08-01",
      targetSkus: ["DH-E37S-W6DM"],
      targetSkusWithSales: [],
      nonTargetSkusWithSales: []
    });

    expect(preview).toMatchObject({
      operation: "amazon_ads_update_keyword_bids",
      sourceOperation: "amazon_ads_run_sku_optimization_cycle",
      sourceReportId: "sku-report-1",
      profileId: "profile-1",
      keywordBidUpdateCount: 1,
      applied: false,
      keywords: [{
        keywordId: "keyword-1",
        bid: 0.6,
        reason: "Reduce bid from 0.8 to 0.6 for wasted traffic before increasing campaign budget."
      }]
    });
    expect(preview.confirmationToken).toEqual(expect.any(String));
    expect(amazonAds.updateSponsoredProductsKeywords).not.toHaveBeenCalled();
  });

  it("previews SKU optimizer ad group bid updates through the existing ad group bid confirmation flow", async () => {
    const amazonAds = {
      createSponsoredProductsNegativeKeywords: vi.fn(),
      updateSponsoredProductsCampaigns: vi.fn(),
      createSponsoredProductsCampaigns: vi.fn(),
      updateSponsoredProductsAdGroups: vi.fn(),
      getReport: vi.fn().mockResolvedValue({ reportId: "sku-report-1", status: "COMPLETED", url: "https://example.test/sku-report.gz" }),
      downloadReportRows: vi.fn().mockResolvedValue([
        { campaignId: "campaign-1", campaignName: "Broad Gold", adGroupId: "adgroup-1", advertisedSku: "DH-E37S-W6DM", searchTerm: "free towel rack manual", clicks: 18, cost: 32, purchases7d: 0, sales7d: 0, defaultBid: 0.6 }
      ]),
      listSponsoredProductsCampaigns: vi.fn().mockResolvedValue({ campaigns: [] })
    };
    const service = new AmazonAdsWriteService(amazonAds, new ConfirmationStore(() => 1_000));

    const preview = await service.previewSkuOptimizerAdGroupBidUpdates({
      profileId: "profile-1",
      reportId: "sku-report-1",
      startDate: "2026-07-29",
      endDate: "2026-08-01",
      targetSkus: ["DH-E37S-W6DM"],
      targetSkusWithSales: [],
      nonTargetSkusWithSales: []
    });

    expect(preview).toMatchObject({
      operation: "amazon_ads_update_ad_group_bids",
      sourceOperation: "amazon_ads_run_sku_optimization_cycle",
      sourceReportId: "sku-report-1",
      profileId: "profile-1",
      adGroupBidUpdateCount: 1,
      applied: false,
      adGroups: [{
        adGroupId: "adgroup-1",
        defaultBid: 0.45,
        reason: "Reduce ad group default bid from 0.6 to 0.45 for wasted traffic without keyword-level bid data."
      }]
    });
    expect(preview.confirmationToken).toEqual(expect.any(String));
    expect(amazonAds.updateSponsoredProductsAdGroups).not.toHaveBeenCalled();
  });

  it("previews SKU optimizer negative keywords through the direct negative keyword confirmation flow", async () => {
    const amazonAds = {
      createSponsoredProductsNegativeKeywords: vi.fn(),
      updateSponsoredProductsCampaigns: vi.fn(),
      createSponsoredProductsCampaigns: vi.fn(),
      getReport: vi.fn().mockResolvedValue({ reportId: "sku-report-1", status: "COMPLETED", url: "https://example.test/sku-report.gz" }),
      downloadReportRows: vi.fn().mockResolvedValue([
        { campaignId: "campaign-1", campaignName: "Exact Gold", adGroupId: "adgroup-1", advertisedSku: "DH-E37S-W6DM", searchTerm: "free towel rack manual", clicks: 18, cost: 32, purchases7d: 0, sales7d: 0 }
      ]),
      listSponsoredProductsCampaigns: vi.fn().mockResolvedValue({ campaigns: [] })
    };
    const service = new AmazonAdsWriteService(amazonAds, new ConfirmationStore(() => 1_000));

    const preview = await service.previewSkuOptimizerNegativeKeywords({
      profileId: "profile-1",
      reportId: "sku-report-1",
      startDate: "2026-07-29",
      endDate: "2026-08-01",
      targetSkus: ["DH-E37S-W6DM"],
      targetSkusWithSales: [],
      nonTargetSkusWithSales: []
    });

    expect(preview).toMatchObject({
      operation: "amazon_ads_create_negative_keywords",
      sourceOperation: "amazon_ads_run_sku_optimization_cycle",
      sourceReportId: "sku-report-1",
      profileId: "profile-1",
      negativeKeywordCount: 1,
      applied: false,
      negativeKeywords: [{
        campaignId: "campaign-1",
        adGroupId: "adgroup-1",
        keywordText: "free towel rack manual",
        matchType: "NEGATIVE_EXACT",
        state: "ENABLED"
      }]
    });
    expect(preview.confirmationToken).toEqual(expect.any(String));
    expect(amazonAds.createSponsoredProductsNegativeKeywords).not.toHaveBeenCalled();
  });

  it("previews a combined SKU optimizer apply plan without issuing confirmation tokens", async () => {
    const amazonAds = {
      createSponsoredProductsNegativeKeywords: vi.fn(),
      updateSponsoredProductsCampaigns: vi.fn(),
      createSponsoredProductsCampaigns: vi.fn(),
      updateSponsoredProductsKeywords: vi.fn(),
      updateSponsoredProductsAdGroups: vi.fn(),
      getReport: vi.fn().mockResolvedValue({ reportId: "sku-report-1", status: "COMPLETED", url: "https://example.test/sku-report.gz" }),
      downloadReportRows: vi.fn().mockResolvedValue([
        { campaignId: "campaign-1", campaignName: "Exact Gold", adGroupId: "adgroup-1", advertisedSku: "DH-E37S-W6DM", keywordId: "keyword-1", searchTerm: "free towel rack manual", clicks: 18, cost: 32, purchases7d: 0, sales7d: 0, bid: 0.8 },
        { campaignId: "campaign-2", campaignName: "Exact Silver", adGroupId: "adgroup-2", advertisedSku: "5H-2EH1-7H77", keywordId: "keyword-2", searchTerm: "heated towel rack wall mounted", clicks: 20, cost: 18, purchases7d: 1, sales7d: 184.9 }
      ]),
      listSponsoredProductsCampaigns: vi.fn().mockResolvedValue({ campaigns: [{ campaignId: "campaign-1", budget: { budgetType: "DAILY", budget: 10 } }] })
    };
    const service = new AmazonAdsWriteService(amazonAds, new ConfirmationStore(() => 1_000));

    const preview = await service.previewSkuOptimizerApplyPlan({
      profileId: "profile-1",
      reportId: "sku-report-1",
      startDate: "2026-07-29",
      endDate: "2026-08-01",
      targetSkus: ["DH-E37S-W6DM", "5H-2EH1-7H77"],
      targetSkusWithSales: ["5H-2EH1-7H77"],
      nonTargetSkusWithSales: []
    });

    expect(preview).toMatchObject({
      operation: "preview_amazon_ads_sku_apply_plan",
      mode: "review_only",
      profileId: "profile-1",
      status: "COMPLETED",
      reportId: "sku-report-1",
      applied: false,
      summary: {
        strategy: "balance_sales_growth_and_budget_efficiency",
        actionCounts: {
          campaignBudgetUpdates: 1,
          keywordBidUpdates: 1,
          negativeKeywords: 1
        }
      },
      payloads: {
        campaignStates: {
          tool: "amazon_ads_update_campaign_states",
          mode: "preview",
          profileId: "profile-1",
          campaigns: [{
            campaignId: "campaign-1",
            state: "PAUSED" as const
          }]
        },
        campaignBudgets: {
          tool: "amazon_ads_update_campaign_budgets",
          mode: "preview",
          campaigns: [{
            campaignId: "campaign-1",
            budget: { budgetType: "DAILY", budget: 5 }
          }]
        },
        keywordBids: {
          tool: "amazon_ads_update_keyword_bids",
          mode: "preview",
          keywords: [{ keywordId: "keyword-1", bid: 0.6 }]
        },
        negativeKeywords: {
          tool: "amazon_ads_create_negative_keywords",
          mode: "preview",
          negativeKeywords: [{ keywordText: "free towel rack manual" }]
        }
      }
    });
    expect(preview).not.toHaveProperty("confirmationToken");
    expect(amazonAds.updateSponsoredProductsCampaigns).not.toHaveBeenCalled();
    expect(amazonAds.updateSponsoredProductsKeywords).not.toHaveBeenCalled();
    expect(amazonAds.updateSponsoredProductsAdGroups).not.toHaveBeenCalled();
    expect(amazonAds.createSponsoredProductsNegativeKeywords).not.toHaveBeenCalled();
  });

  it("promotes a combined SKU apply plan into exact action previews without writing", async () => {
    const amazonAds = {
      createSponsoredProductsNegativeKeywords: vi.fn(),
      updateSponsoredProductsCampaigns: vi.fn(),
      createSponsoredProductsCampaigns: vi.fn(),
      updateSponsoredProductsKeywords: vi.fn(),
      updateSponsoredProductsAdGroups: vi.fn()
    };
    const service = new AmazonAdsWriteService(amazonAds, new ConfirmationStore(() => 1_000));

    const previews = await service.previewSkuApplyPlanActions({
      operation: "preview_amazon_ads_sku_apply_plan",
      profileId: "profile-1",
      reportId: "sku-report-1",
      payloads: {
        campaignStates: {
          tool: "amazon_ads_update_campaign_states",
          mode: "preview",
          profileId: "profile-1",
          campaigns: [{
            campaignId: "campaign-1",
            state: "PAUSED" as const,
            reason: "Pause pure zero-sale campaign."
          }]
        },
        campaignBudgets: {
          tool: "amazon_ads_update_campaign_budgets",
          mode: "preview",
          profileId: "profile-1",
          campaigns: [{
            campaignId: "campaign-1",
            budget: { budgetType: "DAILY" as const, budget: 5 },
            reason: "Reduce waste while preserving sales budget."
          }]
        },
        keywordBids: {
          tool: "amazon_ads_update_keyword_bids",
          mode: "preview",
          profileId: "profile-1",
          keywords: [{ keywordId: "keyword-1", bid: 0.6, reason: "Reduce wasted traffic." }]
        },
        adGroupBids: {
          tool: "amazon_ads_update_ad_group_bids",
          mode: "preview",
          profileId: "profile-1",
          adGroups: []
        },
        negativeKeywords: {
          tool: "amazon_ads_create_negative_keywords",
          mode: "preview",
          profileId: "profile-1",
          negativeKeywords: [{
            campaignId: "campaign-1",
            adGroupId: "adgroup-1",
            keywordText: "free towel rack manual",
            matchType: "NEGATIVE_EXACT" as const,
            state: "ENABLED" as const
          }]
        }
      }
    });

    expect(previews).toMatchObject({
      operation: "preview_amazon_ads_sku_apply_plan_actions",
      sourceOperation: "preview_amazon_ads_sku_apply_plan",
      sourceReportId: "sku-report-1",
      profileId: "profile-1",
      applied: false,
      previewCount: 4,
      previews: {
        campaignStates: {
          operation: "amazon_ads_update_campaign_states",
          campaignUpdateCount: 1,
          campaigns: [{ campaignId: "campaign-1", state: "PAUSED" }],
          applied: false
        },
        campaignBudgets: {
          operation: "amazon_ads_update_campaign_budgets",
          campaignBudgetUpdateCount: 1,
          campaigns: [{ campaignId: "campaign-1", budget: { budgetType: "DAILY", budget: 5 } }],
          applied: false
        },
        keywordBids: {
          operation: "amazon_ads_update_keyword_bids",
          keywordBidUpdateCount: 1,
          keywords: [{ keywordId: "keyword-1", bid: 0.6 }],
          applied: false
        },
        negativeKeywords: {
          operation: "amazon_ads_create_negative_keywords",
          negativeKeywordCount: 1,
          negativeKeywords: [{ keywordText: "free towel rack manual" }],
          applied: false
        }
      }
    });
    expect(previews.previews.campaignStates.confirmationToken).toEqual(expect.any(String));
    expect(previews.previews.campaignBudgets.confirmationToken).toEqual(expect.any(String));
    expect(previews.previews.keywordBids.confirmationToken).toEqual(expect.any(String));
    expect(previews.previews.negativeKeywords.confirmationToken).toEqual(expect.any(String));
    expect(previews.previews).not.toHaveProperty("adGroupBids");
    expect(amazonAds.updateSponsoredProductsCampaigns).not.toHaveBeenCalled();
    expect(amazonAds.updateSponsoredProductsKeywords).not.toHaveBeenCalled();
    expect(amazonAds.updateSponsoredProductsAdGroups).not.toHaveBeenCalled();
    expect(amazonAds.createSponsoredProductsNegativeKeywords).not.toHaveBeenCalled();
  });

  it("previews and confirms campaign dynamic bidding updates", async () => {
    const amazonAds = {
      createSponsoredProductsNegativeKeywords: vi.fn(),
      updateSponsoredProductsCampaigns: vi.fn().mockResolvedValue({
        campaigns: { success: [{ index: 0, campaignId: "campaign-1" }], error: [] }
      }),
      createSponsoredProductsCampaigns: vi.fn()
    };
    const service = new AmazonAdsWriteService(amazonAds, new ConfirmationStore(() => 1_000));

    const preview = await service.previewCampaignBiddingUpdates("profile-1", [{
      campaignId: "campaign-1",
      dynamicBidding: {
        strategy: "AUTO_FOR_SALES",
        placementBidding: [{ placement: "PLACEMENT_TOP", percentage: 0 }]
      },
      reason: "Remove top-of-search boost after cost-control review."
    }]);

    expect(preview).toMatchObject({
      operation: "amazon_ads_update_campaign_bidding",
      profileId: "profile-1",
      campaignBiddingUpdateCount: 1,
      applied: false,
      campaigns: [{
        campaignId: "campaign-1",
        dynamicBidding: {
          strategy: "AUTO_FOR_SALES",
          placementBidding: [{ placement: "PLACEMENT_TOP", percentage: 0 }]
        },
        reason: "Remove top-of-search boost after cost-control review."
      }]
    });
    expect(amazonAds.updateSponsoredProductsCampaigns).not.toHaveBeenCalled();

    await expect(service.confirmCampaignBiddingUpdates("profile-1", preview.campaigns, preview.confirmationToken))
      .resolves.toMatchObject({
        operation: "amazon_ads_update_campaign_bidding",
        profileId: "profile-1",
        campaignBiddingUpdateCount: 1,
        applied: true,
        result: { campaigns: { success: [{ index: 0, campaignId: "campaign-1" }], error: [] } }
      });
    expect(amazonAds.updateSponsoredProductsCampaigns).toHaveBeenCalledWith("profile-1", [{
      campaignId: "campaign-1",
      dynamicBidding: {
        strategy: "AUTO_FOR_SALES",
        placementBidding: [{ placement: "PLACEMENT_TOP", percentage: 0 }]
      }
    }]);
  });

  it("records confirmed campaign bidding updates for later optimization analysis", async () => {
    const amazonAds = {
      createSponsoredProductsNegativeKeywords: vi.fn(),
      updateSponsoredProductsCampaigns: vi.fn().mockResolvedValue({
        campaigns: { success: [{ index: 0, campaignId: "campaign-1" }], error: [] }
      }),
      createSponsoredProductsCampaigns: vi.fn()
    };
    const auditLog = { record: vi.fn().mockResolvedValue(undefined) };
    const service = new AmazonAdsWriteService(amazonAds, new ConfirmationStore(() => 1_000), auditLog);
    const preview = await service.previewCampaignBiddingUpdates("profile-1", [{
      campaignId: "campaign-1",
      dynamicBidding: {
        strategy: "AUTO_FOR_SALES",
        placementBidding: [{ placement: "PLACEMENT_TOP", percentage: 0 }]
      },
      reason: "Remove top-of-search boost after cost-control review."
    }]);

    await service.confirmCampaignBiddingUpdates("profile-1", preview.campaigns, preview.confirmationToken);

    expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({
      operation: "amazon_ads_update_campaign_bidding",
      profileId: "profile-1",
      applied: true,
      payload: {
        campaigns: [{
          campaignId: "campaign-1",
          dynamicBidding: {
            strategy: "AUTO_FOR_SALES",
            placementBidding: [{ placement: "PLACEMENT_TOP", percentage: 0 }]
          },
          reason: "Remove top-of-search boost after cost-control review."
        }]
      },
      result: { campaigns: { success: [{ index: 0, campaignId: "campaign-1" }], error: [] } }
    }));
    expect(auditLog.record.mock.calls[0][0].createdAt).toEqual(expect.any(String));
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

  it("records confirmed keyword bid updates for later optimization analysis", async () => {
    const amazonAds = {
      createSponsoredProductsNegativeKeywords: vi.fn(),
      updateSponsoredProductsCampaigns: vi.fn(),
      createSponsoredProductsCampaigns: vi.fn(),
      updateSponsoredProductsKeywords: vi.fn().mockResolvedValue({
        keywords: { success: [{ index: 0, keywordId: "keyword-1" }], error: [] }
      })
    };
    const auditLog = { record: vi.fn().mockResolvedValue(undefined) };
    const service = new AmazonAdsWriteService(amazonAds, new ConfirmationStore(() => 1_000), auditLog);
    const preview = await service.previewKeywordBidUpdates("profile-1", [{
      keywordId: "keyword-1",
      bid: 0.25,
      reason: "Lower bid after report shows spend without orders."
    }]);

    await service.confirmKeywordBidUpdates("profile-1", preview.keywords, preview.confirmationToken);

    expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({
      operation: "amazon_ads_update_keyword_bids",
      profileId: "profile-1",
      applied: true,
      payload: {
        keywords: [{
          keywordId: "keyword-1",
          bid: 0.25,
          reason: "Lower bid after report shows spend without orders."
        }]
      },
      result: { keywords: { success: [{ index: 0, keywordId: "keyword-1" }], error: [] } }
    }));
    expect(auditLog.record.mock.calls[0][0].createdAt).toEqual(expect.any(String));
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

  it("records confirmed ad group default bid updates for later optimization analysis", async () => {
    const amazonAds = {
      createSponsoredProductsNegativeKeywords: vi.fn(),
      updateSponsoredProductsCampaigns: vi.fn(),
      createSponsoredProductsCampaigns: vi.fn(),
      updateSponsoredProductsKeywords: vi.fn(),
      updateSponsoredProductsAdGroups: vi.fn().mockResolvedValue({
        adGroups: { success: [{ index: 0, adGroupId: "adgroup-1" }], error: [] }
      })
    };
    const auditLog = { record: vi.fn().mockResolvedValue(undefined) };
    const service = new AmazonAdsWriteService(amazonAds, new ConfirmationStore(() => 1_000), auditLog);
    const preview = await service.previewAdGroupBidUpdates("profile-1", [{
      adGroupId: "adgroup-1",
      defaultBid: 0.3,
      reason: "Lower ad group bid after broad spend runs ahead of orders."
    }]);

    await service.confirmAdGroupBidUpdates("profile-1", preview.adGroups, preview.confirmationToken);

    expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({
      operation: "amazon_ads_update_ad_group_bids",
      profileId: "profile-1",
      applied: true,
      payload: {
        adGroups: [{
          adGroupId: "adgroup-1",
          defaultBid: 0.3,
          reason: "Lower ad group bid after broad spend runs ahead of orders."
        }]
      },
      result: { adGroups: { success: [{ index: 0, adGroupId: "adgroup-1" }], error: [] } }
    }));
    expect(auditLog.record.mock.calls[0][0].createdAt).toEqual(expect.any(String));
  });
});
