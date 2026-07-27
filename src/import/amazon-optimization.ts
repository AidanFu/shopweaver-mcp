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
  recommendation: string;
}

export function analyzeAmazonDailyOptimization(input: AmazonDailyOptimizationInput): AmazonOptimizationResult {
  if (input.sessions >= 50 && input.orders === 0 && input.spend > 0) {
    return {
      status: "needs_listing_review",
      recommendation: "Do not increase bids yet. Review title, main image, price, bullets, and size facts before spending more on the same traffic."
    };
  }
  if (input.orders > 0 && input.conversionRate >= 2 && input.spend > 0 && input.sales / input.spend >= 2) {
    return {
      status: "harvest_winners",
      recommendation: "Review only: move converting search terms into manual exact or phrase review, then decide seller-approved bid changes."
    };
  }
  return {
    status: "collect_more_data",
    recommendation: "Review only: collect more daily traffic, click, conversion, and search-term data before changing listing copy, category, bids, budgets, keywords, or negatives."
  };
}

export function analyzeAmazonWeeklyOptimization(input: AmazonWeeklyOptimizationInput): AmazonOptimizationResult {
  if (input.acos >= 60 && input.categoryConversionRate < 1.5) {
    return {
      status: "review_category_and_campaign",
      recommendation: "Review category fit, listing conversion, and campaign structure together; pause or negate wasteful terms before increasing budget."
    };
  }
  if (input.acos <= 35 && input.categoryConversionRate >= 3) {
    return {
      status: "keep_learning",
      recommendation: "Keep the current category hypothesis, harvest keyword winners, and review negative keywords before seller-approved budget or bid changes."
    };
  }
  return {
    status: "weekly_review_needed",
    recommendation: "Review only: compare ACOS, TACOS, category conversion, keyword winners, and negatives before deciding category or campaign changes."
  };
}
