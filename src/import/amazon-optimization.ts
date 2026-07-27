export interface AmazonDailyOptimizationInput {
  sessions: number;
  ctr: number;
  cpc: number;
  spend: number;
  orders: number;
  sales: number;
  conversionRate: number;
  searchTerms: string;
}

export interface AmazonWeeklyOptimizationInput {
  acos: number;
  tacos: number;
  totalSpend: number;
  totalSales: number;
  categoryConversionRate: number;
  keywordWinners: string;
  negativeKeywordCandidates: string;
}

export interface AmazonOptimizationResult {
  status: string;
  priority: "high" | "normal";
  actionType: "listing_review" | "keyword_harvest" | "category_campaign_review" | "keep_learning" | "data_collection" | "weekly_review";
  recommendation: string;
}

export interface AmazonOptimizationWorkbookInput {
  daily: Array<AmazonDailyOptimizationInput & { sku: string; productName: string; date: string; listingIssues: string }>;
  weekly: Array<Omit<AmazonWeeklyOptimizationInput, "categoryConversionRate"> & { sku: string; productName: string; weekStart: string; categoryConversionNotes: string; categoryConversionRate?: number }>;
}

export interface AmazonOptimizationWorkbookResult {
  daily: Array<AmazonOptimizationResult & { sku: string; productName: string; date: string }>;
  weekly: Array<AmazonOptimizationResult & { sku: string; productName: string; weekStart: string }>;
}

export function analyzeAmazonDailyOptimization(input: AmazonDailyOptimizationInput): AmazonOptimizationResult {
  if (input.sessions >= 50 && input.orders === 0 && input.spend > 0) {
    return {
      status: "needs_listing_review",
      priority: "high",
      actionType: "listing_review",
      recommendation: "Do not increase bids yet. Review title, main image, price, bullets, and size facts before spending more on the same traffic."
    };
  }
  if (input.orders > 0 && input.conversionRate >= 2 && input.spend > 0 && input.sales / input.spend >= 2) {
    return {
      status: "harvest_winners",
      priority: "normal",
      actionType: "keyword_harvest",
      recommendation: "Review only: move converting search terms into manual exact or phrase review, then decide seller-approved bid changes."
    };
  }
  return {
    status: "collect_more_data",
    priority: "normal",
    actionType: "data_collection",
    recommendation: "Review only: collect more daily traffic, click, conversion, and search-term data before changing listing copy, category, bids, budgets, keywords, or negatives."
  };
}

export function analyzeAmazonOptimizationWorkbookInputs(input: AmazonOptimizationWorkbookInput): AmazonOptimizationWorkbookResult {
  return {
    daily: input.daily.map(row => ({
      sku: row.sku,
      productName: row.productName,
      date: row.date,
      ...analyzeAmazonDailyOptimization(row)
    })),
    weekly: input.weekly.map(row => ({
      sku: row.sku,
      productName: row.productName,
      weekStart: row.weekStart,
      ...analyzeAmazonWeeklyOptimization({
        ...row,
        categoryConversionRate: Number.isFinite(row.categoryConversionRate) ? row.categoryConversionRate ?? 0 : conversionRateFromNotes(row.categoryConversionNotes)
      })
    }))
  };
}

function conversionRateFromNotes(notes: string): number {
  const match = notes.match(/(\d+(?:\.\d+)?)\s*%/);
  return match ? Number(match[1]) : 0;
}

export function analyzeAmazonWeeklyOptimization(input: AmazonWeeklyOptimizationInput): AmazonOptimizationResult {
  if (input.acos >= 60 && input.categoryConversionRate < 1.5) {
    return {
      status: "review_category_and_campaign",
      priority: "high",
      actionType: "category_campaign_review",
      recommendation: "Review category fit, listing conversion, and campaign structure together; pause or negate wasteful terms before increasing budget."
    };
  }
  if (input.acos <= 35 && input.categoryConversionRate >= 3) {
    return {
      status: "keep_learning",
      priority: "normal",
      actionType: "keep_learning",
      recommendation: "Keep the current category hypothesis, harvest keyword winners, and review negative keywords before seller-approved budget or bid changes."
    };
  }
  return {
    status: "weekly_review_needed",
    priority: "normal",
    actionType: "weekly_review",
    recommendation: "Review only: compare ACOS, TACOS, category conversion, keyword winners, and negatives before deciding category or campaign changes."
  };
}
