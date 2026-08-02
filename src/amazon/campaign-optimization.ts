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
  adGroupId: string;
  adGroupName: string;
  matchType: string;
  targeting: string;
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

export interface AmazonCampaignSkuSignalInput {
  targetSkus: string[];
  targetSkusWithSales: string[];
  targetSkusWithoutSales: string[];
  nonTargetSkusWithSales: string[];
}

export interface AmazonNormalizedSalesSignal {
  sku: string;
  signal: "matched_ads_and_seller_sales" | "ads_attributed_without_seller_order" | "seller_order_without_ads_attribution" | "no_ads_or_seller_sales";
  adSpend?: number;
  sellerOrders?: number;
  adsOrders?: number;
}

export interface AmazonCampaignSkuSignalAnalysis {
  skuCampaigns: Array<{
    sku: string;
    campaignIds: string[];
    campaignNames: string[];
    campaignBreakdowns: Array<{
      campaignId: string;
      campaignName: string;
      adGroupIds: string[];
      spend: number;
      sales: number;
      orders: number;
    }>;
    spend: number;
    sales: number;
    orders: number;
    signal: "target_spend_no_sales" | "target_sold" | "non_target_sold" | "collect_more_data";
    recommendation: string;
  }>;
}

export function buildAmazonCampaignSkuSignalInputFromSalesSignals(targetSkus: string[], salesSignals: AmazonNormalizedSalesSignal[]): AmazonCampaignSkuSignalInput {
  const targetSet = new Set(targetSkus);
  const targetSkusWithSales = salesSignals
    .filter(signal => targetSet.has(signal.sku) && hasSellerSales(signal))
    .map(signal => signal.sku);
  const targetSkusWithoutSales = targetSkus.filter(sku => !targetSkusWithSales.includes(sku));
  const nonTargetSkusWithSales = salesSignals
    .filter(signal => !targetSet.has(signal.sku) && hasSellerSales(signal))
    .map(signal => signal.sku);
  return {
    targetSkus,
    targetSkusWithSales,
    targetSkusWithoutSales,
    nonTargetSkusWithSales
  };
}

export interface AmazonCampaignSkuActionPlan {
  totalActionCount: number;
  highPriorityCount: number;
  targetSpendNoSalesCount: number;
  highSpendNoSalesCount: number;
  skuCampaignActions: Array<{
    sku: string;
    campaignIds: string[];
    campaignNames: string[];
    campaignBreakdowns: AmazonCampaignSkuSignalAnalysis["skuCampaigns"][number]["campaignBreakdowns"];
    spend: number;
    sales: number;
    orders: number;
    signal: AmazonCampaignSkuSignalAnalysis["skuCampaigns"][number]["signal"];
    priority: "high" | "normal";
    actionType: "reduce_spend_or_listing_review" | "separate_or_protect_non_target_demand" | "non_target_waste_review" | "monitor_target_seller_sales_vs_ad_attribution";
    recommendation: string;
    sellerApprovalRequired: true;
  }>;
}

export interface AmazonCampaignSkuControlPreview {
  operation: "preview_amazon_ads_sku_spend_reviews";
  applied: false;
  warning: string;
  reviewCount: number;
  skuSpendReviews: Array<{
    sku: string;
    campaignId: string;
    campaignName: string;
    adGroupIds: string[];
    spend: number;
    sales: number;
    orders: number;
    signal: AmazonCampaignSkuSignalAnalysis["skuCampaigns"][number]["signal"];
    priority: "high" | "normal";
    actionType: AmazonCampaignSkuActionPlan["skuCampaignActions"][number]["actionType"];
    recommendedNextStep: string;
    sellerApprovalRequired: true;
  }>;
}

export interface AmazonCampaignSkuCampaignControlPreview {
  operation: "preview_amazon_ads_sku_campaign_reviews";
  applied: false;
  warning: string;
  campaignReviewCount: number;
  campaignReviews: Array<{
    campaignId: string;
    campaignName: string;
    totalSpend: number;
    highPrioritySpend: number;
    highPrioritySpendRatio: number;
    sales: number;
    orders: number;
    affectedSkus: string[];
    recommendedNextStep: string;
    sellerApprovalRequired: true;
  }>;
}

export interface AmazonCampaignSkuBudgetReviewPreview {
  operation: "preview_amazon_ads_sku_campaign_budget_reviews";
  applied: false;
  warning: string;
  budgetReviewCount: number;
  campaignBudgetReviews: Array<{
    campaignId: string;
    campaignName: string;
    currentBudget: { budgetType: "DAILY"; budget: number };
    suggestedBudget: { budgetType: "DAILY"; budget: number };
    reason: string;
    affectedSkus: string[];
    sellerApprovalRequired: true;
  }>;
  campaignBudgetUpdates: Array<{
    campaignId: string;
    budget: { budgetType: "DAILY"; budget: number };
    reason: string;
  }>;
}

export interface AmazonCampaignSkuStateReviewPreview {
  operation: "preview_amazon_ads_sku_campaign_state_reviews";
  applied: false;
  warning: string;
  stateReviewCount: number;
  campaignStateReviews: Array<{
    campaignId: string;
    campaignName: string;
    suggestedState: "PAUSED";
    reason: string;
    affectedSkus: string[];
    sellerApprovalRequired: true;
  }>;
  campaignStateUpdates: Array<{
    campaignId: string;
    state: "PAUSED";
    reason: string;
  }>;
}

export interface AmazonCampaignBudgetSalesPlan {
  operation: "preview_amazon_ads_budget_sales_strategy";
  applied: false;
  strategy: "balance_sales_growth_and_budget_efficiency";
  budgetProtection: {
    priority: "high" | "normal";
    wasteTermCount: number;
    budgetReviewCount: number;
    recommendedActions: string[];
  };
  salesGrowth: {
    priority: "high" | "normal";
    efficientTermCount: number;
    recommendedActions: string[];
  };
  listingConversion: {
    priority: "high" | "normal";
    skuReviewCount: number;
    recommendedActions: string[];
  };
  cadence: string;
}

export interface AmazonAdsBidKeywordPreview {
  operation: "preview_amazon_ads_bid_keyword_recommendations";
  applied: false;
  warning: string;
  negativeKeywordCount: number;
  keywordBidUpdateCount: number;
  adGroupBidUpdateCount: number;
  winnerTermCount: number;
  negativeKeywords: Array<{
    campaignId: string;
    adGroupId: string;
    keywordText: string;
    matchType: "NEGATIVE_EXACT";
    state: "ENABLED";
    reason: string;
  }>;
  keywordBidUpdates: Array<{
    keywordId: string;
    bid: number;
    reason: string;
  }>;
  adGroupBidUpdates: Array<{
    adGroupId: string;
    defaultBid: number;
    reason: string;
  }>;
  winnerTerms: Array<{
    campaignId: string;
    campaignName: string;
    adGroupId: string;
    adGroupName: string;
    keywordId: string;
    searchTerm: string;
    clicks: number;
    spend: number;
    sales: number;
    orders: number;
    acos: number;
    recommendation: string;
  }>;
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
    const adGroupId = fieldText(row, ["adGroupId", "Ad Group ID", "Ad Group Id"]);
    const adGroupName = fieldText(row, ["adGroupName", "Ad Group Name"]);
    const matchType = fieldText(row, ["matchType", "Match Type"]);
    const targeting = fieldText(row, ["targeting", "Targeting"]);
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
        adGroupId,
        adGroupName,
        matchType,
        targeting,
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
        adGroupId,
        adGroupName,
        matchType,
        targeting,
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

export function buildAmazonAdsBidKeywordPreview(rows: Array<Record<string, unknown>>): AmazonAdsBidKeywordPreview {
  const negativeKeywords: AmazonAdsBidKeywordPreview["negativeKeywords"] = [];
  const keywordBidUpdates: AmazonAdsBidKeywordPreview["keywordBidUpdates"] = [];
  const adGroupBidUpdates: AmazonAdsBidKeywordPreview["adGroupBidUpdates"] = [];
  const winnerTerms: AmazonAdsBidKeywordPreview["winnerTerms"] = [];
  const seenNegatives = new Set<string>();
  const seenKeywordBids = new Set<string>();
  const seenAdGroupBids = new Set<string>();

  for (const row of rows) {
    const campaignId = fieldText(row, ["campaignId", "Campaign ID", "Campaign Id"]);
    const adGroupId = fieldText(row, ["adGroupId", "Ad Group ID", "Ad Group Id"]);
    const searchTerm = fieldText(row, ["searchTerm", "Customer Search Term", "Search Term"]);
    const clicks = fieldNumber(row, ["clicks", "Clicks"]);
    const spend = fieldNumber(row, ["cost", "Spend", "Cost"]);
    const sales = fieldNumber(row, ["sales7d", "7 Day Total Sales", "Sales"]);
    const orders = fieldNumber(row, ["purchases7d", "7 Day Total Orders (#)", "Orders"]);
    const isWaste = Boolean(campaignId && adGroupId && searchTerm && orders === 0 && sales === 0 && (clicks >= 15 || spend >= 10));

    if (isWaste) {
      const negativeKey = `${campaignId}:${adGroupId}:${searchTerm.toLowerCase()}`;
      if (!seenNegatives.has(negativeKey)) {
        negativeKeywords.push({
          campaignId,
          adGroupId,
          keywordText: searchTerm,
          matchType: "NEGATIVE_EXACT",
          state: "ENABLED",
          reason: "High clicks or spend with no attributed orders; review before adding as negative exact."
        });
        seenNegatives.add(negativeKey);
      }

      const keywordId = fieldText(row, ["keywordId", "Keyword ID", "Keyword Id"]);
      const currentBid = fieldNumber(row, ["bid", "Bid", "Keyword Bid", "Current Bid"]);
      if (keywordId && currentBid > 0 && !seenKeywordBids.has(keywordId)) {
        const bid = reducedBid(currentBid);
        keywordBidUpdates.push({
          keywordId,
          bid,
          reason: `Reduce bid from ${currentBid} to ${bid} for wasted traffic before increasing campaign budget.`
        });
        seenKeywordBids.add(keywordId);
      }

      const defaultBid = fieldNumber(row, ["defaultBid", "Default Bid", "Ad Group Default Bid"]);
      if (!keywordId && adGroupId && defaultBid > 0 && !seenAdGroupBids.has(adGroupId)) {
        const nextBid = reducedBid(defaultBid);
        adGroupBidUpdates.push({
          adGroupId,
          defaultBid: nextBid,
          reason: `Reduce ad group default bid from ${defaultBid} to ${nextBid} for wasted traffic without keyword-level bid data.`
        });
        seenAdGroupBids.add(adGroupId);
      }
    }

    const acos = sales > 0 ? Number(((spend / sales) * 100).toFixed(2)) : 0;
    if (campaignId && searchTerm && orders > 0 && acos > 0 && acos <= 35) {
      winnerTerms.push({
        campaignId,
        campaignName: fieldText(row, ["campaignName", "Campaign Name"]) || campaignId,
        adGroupId,
        adGroupName: fieldText(row, ["adGroupName", "Ad Group Name"]),
        keywordId: fieldText(row, ["keywordId", "Keyword ID", "Keyword Id"]),
        searchTerm,
        clicks,
        spend,
        sales,
        orders,
        acos,
        recommendation: "Protect this converting term from budget cuts; consider exact-match isolation or modest bid growth only after waste reductions are reviewed."
      });
    }
  }

  return {
    operation: "preview_amazon_ads_bid_keyword_recommendations",
    applied: false,
    warning: "Preview only. No bids, keywords, negative keywords, campaigns, ad groups, product ads, or listings were changed.",
    negativeKeywordCount: negativeKeywords.length,
    keywordBidUpdateCount: keywordBidUpdates.length,
    adGroupBidUpdateCount: adGroupBidUpdates.length,
    winnerTermCount: winnerTerms.length,
    negativeKeywords,
    keywordBidUpdates,
    adGroupBidUpdates,
    winnerTerms
  };
}

export function analyzeAmazonCampaignSkuSignals(rows: Array<Record<string, unknown>>, signals: AmazonCampaignSkuSignalInput): AmazonCampaignSkuSignalAnalysis {
  const bySku = new Map<string, {
    sku: string;
    campaignIds: Set<string>;
    campaignNames: Set<string>;
    campaigns: Map<string, { campaignId: string; campaignName: string; adGroupIds: Set<string>; spend: number; sales: number; orders: number }>;
    spend: number;
    sales: number;
    orders: number;
  }>();
  for (const row of rows) {
    const sku = fieldText(row, ["advertisedSku", "Advertised SKU", "SKU"]);
    if (!sku) continue;
    const current = bySku.get(sku) ?? { sku, campaignIds: new Set<string>(), campaignNames: new Set<string>(), campaigns: new Map(), spend: 0, sales: 0, orders: 0 };
    const campaignId = fieldText(row, ["campaignId", "Campaign ID", "Campaign Id"]);
    const campaignName = fieldText(row, ["campaignName", "Campaign Name"]);
    const adGroupId = fieldText(row, ["adGroupId", "Ad Group ID", "Ad Group Id"]);
    const spend = fieldNumber(row, ["cost", "Spend", "Cost"]);
    const sales = fieldNumber(row, ["sales7d", "7 Day Total Sales", "Sales"]);
    const orders = fieldNumber(row, ["purchases7d", "7 Day Total Orders (#)", "Orders"]);
    current.campaignIds.add(campaignId);
    current.campaignNames.add(campaignName);
    if (campaignId) {
      const campaign = current.campaigns.get(campaignId) ?? { campaignId, campaignName, adGroupIds: new Set<string>(), spend: 0, sales: 0, orders: 0 };
      campaign.adGroupIds.add(adGroupId);
      campaign.spend += spend;
      campaign.sales += sales;
      campaign.orders += orders;
      current.campaigns.set(campaignId, campaign);
    }
    current.spend += spend;
    current.sales += sales;
    current.orders += orders;
    bySku.set(sku, current);
  }
  return {
    skuCampaigns: [...bySku.values()].map(row => {
      const spend = Number(row.spend.toFixed(2));
      const sales = Number(row.sales.toFixed(2));
      const signal = campaignSkuSignal(row.sku, spend, row.orders, signals);
      return {
        sku: row.sku,
        campaignIds: [...row.campaignIds].filter(Boolean),
        campaignNames: [...row.campaignNames].filter(Boolean),
        campaignBreakdowns: [...row.campaigns.values()].map(campaign => ({
          campaignId: campaign.campaignId,
          campaignName: campaign.campaignName,
          adGroupIds: [...campaign.adGroupIds].filter(Boolean),
          spend: Number(campaign.spend.toFixed(2)),
          sales: Number(campaign.sales.toFixed(2)),
          orders: campaign.orders
        })).sort((left, right) => right.spend - left.spend),
        spend,
        sales,
        orders: row.orders,
        signal,
        recommendation: campaignSkuRecommendation(row.sku, signal)
      };
    })
  };
}

export function buildAmazonCampaignSkuActionPlan(analysis: AmazonCampaignSkuSignalAnalysis): AmazonCampaignSkuActionPlan {
  const skuCampaignActions = analysis.skuCampaigns.map(row => {
    const highSpendNoSales = row.signal === "collect_more_data" && row.spend >= 25 && row.sales === 0 && row.orders === 0;
    const priority: AmazonCampaignSkuActionPlan["skuCampaignActions"][number]["priority"] = row.signal === "target_spend_no_sales" || highSpendNoSales ? "high" : "normal";
    return {
      sku: row.sku,
      campaignIds: row.campaignIds,
      campaignNames: row.campaignNames,
      campaignBreakdowns: row.campaignBreakdowns,
      spend: row.spend,
      sales: row.sales,
      orders: row.orders,
      signal: row.signal,
      priority,
      actionType: campaignSkuActionType(row.signal, highSpendNoSales),
      recommendation: campaignSkuActionRecommendation(row.sku, row.signal, highSpendNoSales, row.recommendation),
      sellerApprovalRequired: true as const
    };
  }).sort((left, right) => {
    if (left.priority !== right.priority) return left.priority === "high" ? -1 : 1;
    return right.spend - left.spend;
  });
  return {
    totalActionCount: skuCampaignActions.length,
    highPriorityCount: skuCampaignActions.filter(action => action.priority === "high").length,
    targetSpendNoSalesCount: skuCampaignActions.filter(action => action.signal === "target_spend_no_sales").length,
    highSpendNoSalesCount: skuCampaignActions.filter(action => action.actionType === "non_target_waste_review").length,
    skuCampaignActions
  };
}

export function buildAmazonCampaignSkuControlPreview(actionPlan: AmazonCampaignSkuActionPlan): AmazonCampaignSkuControlPreview {
  const skuSpendReviews = actionPlan.skuCampaignActions
    .filter(action => action.priority === "high")
    .flatMap(action => action.campaignBreakdowns
      .filter(breakdown => breakdown.spend > 0 && breakdown.sales === 0 && breakdown.orders === 0)
      .map(breakdown => ({
        sku: action.sku,
        campaignId: breakdown.campaignId,
        campaignName: breakdown.campaignName,
        adGroupIds: breakdown.adGroupIds,
        spend: breakdown.spend,
        sales: breakdown.sales,
        orders: breakdown.orders,
        signal: action.signal,
        priority: action.priority,
        actionType: action.actionType,
        recommendedNextStep: campaignSkuSpendReviewStep(action.actionType),
        sellerApprovalRequired: true as const
      })));
  return {
    operation: "preview_amazon_ads_sku_spend_reviews",
    applied: false,
    warning: "Preview only. No campaigns, ad groups, bids, budgets, keywords, negatives, product ads, or listings were changed.",
    reviewCount: skuSpendReviews.length,
    skuSpendReviews
  };
}

export function buildAmazonCampaignSkuCampaignControlPreview(analysis: AmazonCampaignSkuSignalAnalysis, actionPlan: AmazonCampaignSkuActionPlan): AmazonCampaignSkuCampaignControlPreview {
  const campaigns = new Map<string, { campaignId: string; campaignName: string; totalSpend: number; highPrioritySpend: number; sales: number; orders: number; affectedSkus: Set<string> }>();
  for (const sku of analysis.skuCampaigns) {
    for (const breakdown of sku.campaignBreakdowns) {
      const campaign = campaigns.get(breakdown.campaignId) ?? { campaignId: breakdown.campaignId, campaignName: breakdown.campaignName, totalSpend: 0, highPrioritySpend: 0, sales: 0, orders: 0, affectedSkus: new Set<string>() };
      campaign.totalSpend += breakdown.spend;
      campaign.sales += breakdown.sales;
      campaign.orders += breakdown.orders;
      campaigns.set(breakdown.campaignId, campaign);
    }
  }
  for (const action of actionPlan.skuCampaignActions.filter(action => action.priority === "high")) {
    for (const breakdown of action.campaignBreakdowns) {
      const campaign = campaigns.get(breakdown.campaignId) ?? { campaignId: breakdown.campaignId, campaignName: breakdown.campaignName, totalSpend: 0, highPrioritySpend: 0, sales: 0, orders: 0, affectedSkus: new Set<string>() };
      campaign.highPrioritySpend += breakdown.spend;
      campaign.affectedSkus.add(action.sku);
      campaigns.set(breakdown.campaignId, campaign);
    }
  }
  const campaignReviews = [...campaigns.values()]
    .map(campaign => {
      const totalSpend = Number(campaign.totalSpend.toFixed(2));
      const highPrioritySpend = Number(campaign.highPrioritySpend.toFixed(2));
      return {
        campaignId: campaign.campaignId,
        campaignName: campaign.campaignName,
        totalSpend,
        highPrioritySpend,
        highPrioritySpendRatio: totalSpend > 0 ? Number(((highPrioritySpend / totalSpend) * 100).toFixed(2)) : 0,
        sales: Number(campaign.sales.toFixed(2)),
        orders: campaign.orders,
        affectedSkus: [...campaign.affectedSkus],
        recommendedNextStep: "Review campaign budget, ad group bids, and SKU fit before applying any spend reduction; high-priority zero-sale SKU spend dominates this campaign.",
        sellerApprovalRequired: true as const
      };
    })
    .filter(campaign => campaign.highPrioritySpend >= 25 && campaign.highPrioritySpendRatio >= 60 && campaign.sales === 0 && campaign.orders === 0)
    .sort((left, right) => right.highPrioritySpend - left.highPrioritySpend);
  return {
    operation: "preview_amazon_ads_sku_campaign_reviews",
    applied: false,
    warning: "Preview only. No campaign budgets, campaign states, bidding strategies, ad groups, bids, keywords, negatives, product ads, or listings were changed.",
    campaignReviewCount: campaignReviews.length,
    campaignReviews
  };
}

export function buildAmazonCampaignSkuBudgetReviewPreview(campaignPreview: AmazonCampaignSkuCampaignControlPreview, campaigns: Array<Record<string, unknown>>): AmazonCampaignSkuBudgetReviewPreview {
  const currentBudgets = new Map(campaigns.map(campaign => [text(campaign.campaignId), campaignBudget(campaign)]));
  const campaignBudgetReviews = campaignPreview.campaignReviews
    .map(review => {
      const currentBudget = currentBudgets.get(review.campaignId);
      if (!currentBudget || currentBudget <= 3) return undefined;
      const suggestedBudget = Number(Math.max(3, currentBudget * 0.5).toFixed(2));
      return {
        campaignId: review.campaignId,
        campaignName: review.campaignName,
        currentBudget: { budgetType: "DAILY" as const, budget: currentBudget },
        suggestedBudget: { budgetType: "DAILY" as const, budget: suggestedBudget },
        reason: `Reduce daily budget from ${currentBudget} to ${suggestedBudget} only after reviewing SKU fit and ad group bids; ${review.highPrioritySpendRatio}% of spend is high-priority zero-sale SKU spend.`,
        affectedSkus: review.affectedSkus,
        sellerApprovalRequired: true as const
      };
    })
    .filter(review => review !== undefined);
  return {
    operation: "preview_amazon_ads_sku_campaign_budget_reviews",
    applied: false,
    warning: "Preview only. No campaign budgets were changed. Confirm through the existing campaign budget update flow before applying any exact payload.",
    budgetReviewCount: campaignBudgetReviews.length,
    campaignBudgetReviews,
    campaignBudgetUpdates: campaignBudgetReviews.map(review => ({
      campaignId: review.campaignId,
      budget: review.suggestedBudget,
      reason: review.reason
    }))
  };
}

export function buildAmazonCampaignSkuStateReviewPreview(campaignPreview: AmazonCampaignSkuCampaignControlPreview): AmazonCampaignSkuStateReviewPreview {
  const campaignStateReviews = campaignPreview.campaignReviews
    .filter(review => review.totalSpend >= 25 && review.highPrioritySpendRatio === 100 && review.sales === 0 && review.orders === 0)
    .map(review => {
      const reason = `Pause only after review; this campaign has ${review.totalSpend} spend, no sales or orders, and ${review.highPrioritySpendRatio}% high-priority zero-sale SKU spend.`;
      return {
        campaignId: review.campaignId,
        campaignName: review.campaignName,
        suggestedState: "PAUSED" as const,
        reason,
        affectedSkus: review.affectedSkus,
        sellerApprovalRequired: true as const
      };
    });
  return {
    operation: "preview_amazon_ads_sku_campaign_state_reviews",
    applied: false,
    warning: "Preview only. No campaign states were changed. Confirm through the existing campaign state update flow before pausing any exact campaign payload.",
    stateReviewCount: campaignStateReviews.length,
    campaignStateReviews,
    campaignStateUpdates: campaignStateReviews.map(review => ({
      campaignId: review.campaignId,
      state: review.suggestedState,
      reason: review.reason
    }))
  };
}

export function buildAmazonCampaignBudgetSalesPlan(input: {
  searchTermAnalysis: AmazonSearchTermReportAnalysis;
  actionPlan: AmazonCampaignSkuActionPlan;
  budgetReviewPreview: AmazonCampaignSkuBudgetReviewPreview;
}): AmazonCampaignBudgetSalesPlan {
  const skuReviewCount = input.actionPlan.skuCampaignActions.filter(action => action.actionType === "reduce_spend_or_listing_review").length;
  const soldSkuCount = input.actionPlan.skuCampaignActions.filter(action => action.signal === "target_sold").length;
  const budgetActions = [
    ...(input.searchTermAnalysis.wasteSearchTerms.length > 0 ? [`Review and apply ${input.searchTermAnalysis.wasteSearchTerms.length} negative exact candidate(s) from search terms with spend or clicks but no orders.`] : []),
    ...(input.budgetReviewPreview.budgetReviewCount > 0 ? [`Review ${input.budgetReviewPreview.budgetReviewCount} campaign budget reduction payload(s) as spend reallocation candidates, not pure sales-limiting cuts.`] : [])
  ];
  const salesActions = [
    ...(input.searchTermAnalysis.efficientSearchTerms.length > 0 ? [`Move ${input.searchTermAnalysis.efficientSearchTerms.length} efficient search term(s) into controlled exact campaigns or protect them from budget cuts so savings can be reinvested into demand.`] : []),
    ...(soldSkuCount > 0 ? [`Keep ${soldSkuCount} SKU(s) with recent sales active, but scale only after Ads attribution and seller orders agree.`] : [])
  ];
  const listingActions = skuReviewCount > 0
    ? [`Review listing conversion for ${skuReviewCount} advertised SKU(s) with spend but no recent SKU-level sales before raising bids or budgets.`]
    : [];
  return {
    operation: "preview_amazon_ads_budget_sales_strategy",
    applied: false,
    strategy: "balance_sales_growth_and_budget_efficiency",
    budgetProtection: {
      priority: budgetActions.length > 0 ? "high" : "normal",
      wasteTermCount: input.searchTermAnalysis.wasteSearchTerms.length,
      budgetReviewCount: input.budgetReviewPreview.budgetReviewCount,
      recommendedActions: budgetActions
    },
    salesGrowth: {
      priority: salesActions.length > 0 ? "high" : "normal",
      efficientTermCount: input.searchTermAnalysis.efficientSearchTerms.length,
      recommendedActions: salesActions
    },
    listingConversion: {
      priority: skuReviewCount > 0 ? "high" : "normal",
      skuReviewCount,
      recommendedActions: listingActions
    },
    cadence: "Run daily while spend is high, then weekly after ACOS and order trend stabilize."
  };
}

function campaignSkuSignal(sku: string, spend: number, orders: number, signals: AmazonCampaignSkuSignalInput): AmazonCampaignSkuSignalAnalysis["skuCampaigns"][number]["signal"] {
  if (signals.targetSkusWithSales.includes(sku)) return "target_sold";
  if (signals.targetSkusWithoutSales.includes(sku) && spend > 0 && orders === 0) return "target_spend_no_sales";
  if (signals.nonTargetSkusWithSales.includes(sku)) return "non_target_sold";
  return "collect_more_data";
}

function hasSellerSales(signal: AmazonNormalizedSalesSignal): boolean {
  return signal.sellerOrders !== undefined
    ? signal.sellerOrders > 0
    : signal.signal === "matched_ads_and_seller_sales" || signal.signal === "seller_order_without_ads_attribution";
}

function campaignSkuRecommendation(sku: string, signal: AmazonCampaignSkuSignalAnalysis["skuCampaigns"][number]["signal"]): string {
  if (signal === "target_sold") return `Keep ${sku} active and monitor ACOS; this target SKU has recent sales.`;
  if (signal === "target_spend_no_sales") return `Reduce spend pressure or review listing conversion for ${sku}; this target SKU has ad spend but no recent SKU-level sales.`;
  if (signal === "non_target_sold") return `Review ${sku} separately; non-target demand is present and should not be mixed with optimized listing campaign conclusions.`;
  return `Collect more ad and order data for ${sku} before changing campaign structure.`;
}

function campaignSkuActionType(signal: AmazonCampaignSkuSignalAnalysis["skuCampaigns"][number]["signal"], highSpendNoSales: boolean): AmazonCampaignSkuActionPlan["skuCampaignActions"][number]["actionType"] {
  if (signal === "target_spend_no_sales") return "reduce_spend_or_listing_review";
  if (signal === "non_target_sold") return "separate_or_protect_non_target_demand";
  if (signal === "target_sold") return "monitor_target_seller_sales_vs_ad_attribution";
  return highSpendNoSales ? "non_target_waste_review" : "separate_or_protect_non_target_demand";
}

function campaignSkuActionRecommendation(sku: string, signal: AmazonCampaignSkuSignalAnalysis["skuCampaigns"][number]["signal"], highSpendNoSales: boolean, fallback: string): string {
  if (highSpendNoSales) return `Review ${sku} because non-target spend is high with no recent attributed orders.`;
  if (signal === "target_sold") return `Keep ${sku} active, but do not scale blindly until seller-order sales and Ads attribution agree.`;
  return fallback;
}

function campaignSkuSpendReviewStep(actionType: AmazonCampaignSkuActionPlan["skuCampaignActions"][number]["actionType"]): string {
  if (actionType === "non_target_waste_review") return "Review SKU, campaign fit, and ad group targeting before reducing spend; this non-target SKU has high spend with no attributed orders.";
  return "Review listing conversion, product ad state, ad group bid, and campaign budget pressure before applying any spend reduction.";
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function number(value: unknown): number {
  const parsed = Number(String(value ?? 0).replace(/[$,%]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function reducedBid(currentBid: number): number {
  return Number(Math.max(0.15, currentBid * 0.75).toFixed(2));
}

function campaignBudget(campaign: Record<string, unknown>): number {
  const budget = campaign.budget;
  if (typeof budget === "number") return budget;
  if (budget && typeof budget === "object" && "budget" in budget) return number((budget as { budget?: unknown }).budget);
  return 0;
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
