export interface AmazonCampaignMetrics {
  campaignId: string;
  campaignName: string;
  spend: number;
  sales: number;
  clicks: number;
  orders: number;
  acos: number;
  searchTerms: string;
}

export interface AmazonCampaignRecommendation {
  campaignId: string;
  campaignName: string;
  status: "reduce_waste" | "scale_carefully" | "collect_more_data";
  priority: "high" | "normal";
  actionType: "negative_keywords_and_listing_review" | "budget_bid_review" | "data_collection";
  recommendation: string;
  sellerApprovalRequired: true;
}

export interface AmazonSearchTermReportAnalysis {
  rowCount: number;
  campaignCount: number;
  recommendations: AmazonCampaignRecommendation[];
}

export function analyzeAmazonCampaignMetrics(metrics: AmazonCampaignMetrics): AmazonCampaignRecommendation {
  if (metrics.spend >= 25 && metrics.clicks >= 30 && metrics.orders === 0) {
    return {
      campaignId: metrics.campaignId,
      campaignName: metrics.campaignName,
      status: "reduce_waste",
      priority: "high",
      actionType: "negative_keywords_and_listing_review",
      recommendation: "Review search terms and listing conversion before increasing budget; add irrelevant terms as negative keyword candidates after seller approval.",
      sellerApprovalRequired: true
    };
  }
  if (metrics.orders > 0 && metrics.acos > 0 && metrics.acos <= 35) {
    return {
      campaignId: metrics.campaignId,
      campaignName: metrics.campaignName,
      status: "scale_carefully",
      priority: "normal",
      actionType: "budget_bid_review",
      recommendation: "Review controlled budget or bid increases for efficient terms; keep changes seller-approved and monitor ACOS after each adjustment.",
      sellerApprovalRequired: true
    };
  }
  return {
    campaignId: metrics.campaignId,
    campaignName: metrics.campaignName,
    status: "collect_more_data",
    priority: "normal",
    actionType: "data_collection",
    recommendation: "Collect more campaign traffic, click, order, sales, ACOS, and search-term data before changing bids, budgets, or negatives.",
    sellerApprovalRequired: true
  };
}

export function analyzeAmazonSearchTermReportRows(rows: Array<Record<string, unknown>>): AmazonSearchTermReportAnalysis {
  const campaigns = new Map<string, AmazonCampaignMetrics>();
  for (const row of rows) {
    const campaignId = text(row.campaignId);
    if (!campaignId) continue;
    const current = campaigns.get(campaignId) ?? {
      campaignId,
      campaignName: text(row.campaignName) || campaignId,
      spend: 0,
      sales: 0,
      clicks: 0,
      orders: 0,
      acos: 0,
      searchTerms: ""
    };
    const searchTerms = [current.searchTerms, text(row.searchTerm)].filter(Boolean);
    current.spend += number(row.cost);
    current.sales += number(row.sales7d);
    current.clicks += number(row.clicks);
    current.orders += number(row.purchases7d);
    current.searchTerms = Array.from(new Set(searchTerms)).join("; ");
    campaigns.set(campaignId, current);
  }
  const metrics = [...campaigns.values()].map(campaign => ({
    ...campaign,
    acos: campaign.sales > 0 ? Number(((campaign.spend / campaign.sales) * 100).toFixed(2)) : 0
  }));
  return {
    rowCount: rows.length,
    campaignCount: metrics.length,
    recommendations: metrics.map(analyzeAmazonCampaignMetrics)
  };
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function number(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
