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
  actionType: "negative_keywords_and_listing_review" | "budget_watch" | "budget_bid_review" | "data_collection";
  recommendation: string;
  sellerApprovalRequired: true;
}

export interface AmazonSearchTermReportAnalysis {
  rowCount: number;
  campaignCount: number;
  totalSpend: number;
  totalSales: number;
  blendedAcos: number;
  wasteSearchTerms: AmazonWasteSearchTerm[];
  efficientSearchTerms: AmazonEfficientSearchTerm[];
  recommendations: AmazonCampaignRecommendation[];
}

export interface AmazonWasteSearchTerm {
  campaignId: string;
  campaignName: string;
  searchTerm: string;
  clicks: number;
  spend: number;
  sales: number;
  orders: number;
  recommendation: string;
}

export interface AmazonEfficientSearchTerm extends AmazonWasteSearchTerm {
  acos: number;
}

export function analyzeAmazonCampaignMetrics(metrics: AmazonCampaignMetrics): AmazonCampaignRecommendation {
  if (metrics.spend >= 25 && metrics.clicks >= 30 && metrics.orders === 0) {
    return {
      campaignId: metrics.campaignId,
      campaignName: metrics.campaignName,
      status: "reduce_waste",
      priority: "high",
      actionType: "budget_watch",
      recommendation: "Reduce or cap budget until waste terms and listing conversion are reviewed; this campaign has high spend and clicks with no orders.",
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
  const wasteSearchTerms: AmazonWasteSearchTerm[] = [];
  const efficientSearchTerms: AmazonEfficientSearchTerm[] = [];
  for (const row of rows) {
    const campaignId = fieldText(row, ["campaignId", "Campaign ID", "Campaign Id"]);
    if (!campaignId) continue;
    const searchTerm = fieldText(row, ["searchTerm", "Customer Search Term", "Search Term"]);
    const campaignName = fieldText(row, ["campaignName", "Campaign Name"]) || campaignId;
    const clicks = fieldNumber(row, ["clicks", "Clicks"]);
    const spend = fieldNumber(row, ["cost", "Spend", "Cost"]);
    const sales = fieldNumber(row, ["sales7d", "7 Day Total Sales", "Sales"]);
    const orders = fieldNumber(row, ["purchases7d", "7 Day Total Orders (#)", "Orders"]);
    const current = campaigns.get(campaignId) ?? {
      campaignId,
      campaignName,
      spend: 0,
      sales: 0,
      clicks: 0,
      orders: 0,
      acos: 0,
      searchTerms: ""
    };
    const searchTerms = [current.searchTerms, searchTerm].filter(Boolean);
    current.spend += spend;
    current.sales += sales;
    current.clicks += clicks;
    current.orders += orders;
    current.searchTerms = Array.from(new Set(searchTerms)).join("; ");
    campaigns.set(campaignId, current);
    if (searchTerm && orders === 0 && sales === 0 && (clicks >= 15 || spend >= 10)) {
      wasteSearchTerms.push({
        campaignId,
        campaignName,
        searchTerm,
        clicks,
        spend,
        sales,
        orders,
        recommendation: "Add as negative exact candidate after review; high spend/clicks with no orders."
      });
    }
    const acos = sales > 0 ? Number(((spend / sales) * 100).toFixed(2)) : 0;
    if (searchTerm && orders > 0 && acos > 0 && acos <= 35) {
      efficientSearchTerms.push({
        campaignId,
        campaignName,
        searchTerm,
        clicks,
        spend,
        sales,
        orders,
        acos,
        recommendation: "Keep active; consider moving to exact match or modest bid increase only after budget waste is reduced."
      });
    }
  }
  const metrics = [...campaigns.values()].map(campaign => ({
    ...campaign,
    acos: campaign.sales > 0 ? Number(((campaign.spend / campaign.sales) * 100).toFixed(2)) : 0
  }));
  const totalSpend = Number(metrics.reduce((sum, campaign) => sum + campaign.spend, 0).toFixed(2));
  const totalSales = Number(metrics.reduce((sum, campaign) => sum + campaign.sales, 0).toFixed(2));
  return {
    rowCount: rows.length,
    campaignCount: metrics.length,
    totalSpend,
    totalSales,
    blendedAcos: totalSales > 0 ? Number(((totalSpend / totalSales) * 100).toFixed(2)) : 0,
    wasteSearchTerms,
    efficientSearchTerms,
    recommendations: metrics.map(analyzeAmazonCampaignMetrics)
  };
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function number(value: unknown): number {
  const parsed = Number(String(value ?? 0).replace(/[$,%]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function fieldText(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = text(row[key]);
    if (value) return value;
  }
  return "";
}

function fieldNumber(row: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && text(row[key]) !== "") return number(row[key]);
  }
  return 0;
}
