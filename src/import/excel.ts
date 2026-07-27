import * as XLSX from "xlsx";
import { analyzeAmazonDailyOptimization, analyzeAmazonOptimizationWorkbookInputs, analyzeAmazonWeeklyOptimization } from "./amazon-optimization.js";

export interface RawProductRecord {
  productName: string;
  rawChineseDescription: string;
  rowStart: number;
  rowEnd: number;
}

export function parseProductInformationWorkbook(bytes: Uint8Array): RawProductRecord[] {
  const workbook = XLSX.read(bytes, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const rows = XLSX.utils.sheet_to_json<Array<string>>(workbook.Sheets[firstSheetName], { header: 1, blankrows: false });
  const products: RawProductRecord[] = [];
  let current: { productName: string; descriptions: string[]; rowStart: number; rowEnd: number } | null = null;
  for (const [index, row] of rows.entries()) {
    const productName = String(row[0] ?? "").trim();
    const description = String(row[2] ?? "").trim();
    if (productName) {
      if (current) products.push({ productName: current.productName, rawChineseDescription: current.descriptions.join("\n"), rowStart: current.rowStart, rowEnd: current.rowEnd });
      current = { productName, descriptions: [], rowStart: index + 1, rowEnd: index + 1 };
    }
    if (current && description) {
      current.descriptions.push(description);
      current.rowEnd = index + 1;
    }
  }
  const finalProduct = current;
  if (finalProduct) products.push({ productName: finalProduct.productName, rawChineseDescription: finalProduct.descriptions.join("\n"), rowStart: finalProduct.rowStart, rowEnd: finalProduct.rowEnd });
  return products;
}

export interface EnrichedWorkbookRow {
  productName: string;
  rawChineseDescription?: string;
  englishTitle?: string;
  englishDescription?: string;
  shortSummary?: string;
  tags?: string;
  materials?: string;
  quantity?: number;
  price?: string;
  taxonomyId?: number;
  taxonomyPath?: string;
  whoMade?: string;
  whenMade?: string;
  type?: string;
  readinessStateId?: number;
  imageFolder?: string;
  imageCount?: number;
  validationStatus?: string;
  validationNotes?: string;
}

const ENRICHED_HEADERS = [
  "Product Name",
  "Raw Chinese Description",
  "English Title",
  "English Description",
  "Short Summary",
  "Tags",
  "Materials",
  "Quantity",
  "Price",
  "Taxonomy ID",
  "Taxonomy Path",
  "Who Made",
  "When Made",
  "Type",
  "Readiness State ID",
  "Image Folder",
  "Image Count",
  "Validation Status",
  "Validation Notes"
];

export function writeEnrichedWorkbook(rows: EnrichedWorkbookRow[]): Uint8Array {
  const workbook = XLSX.utils.book_new();
  const values = rows.map(row => [
    row.productName,
    row.rawChineseDescription ?? "",
    row.englishTitle ?? "",
    row.englishDescription ?? "",
    row.shortSummary ?? "",
    row.tags ?? "",
    row.materials ?? "",
    row.quantity ?? "",
    row.price ?? "",
    row.taxonomyId ?? "",
    row.taxonomyPath ?? "",
    row.whoMade ?? "",
    row.whenMade ?? "",
    row.type ?? "",
    row.readinessStateId ?? "",
    row.imageFolder ?? "",
    row.imageCount ?? "",
    row.validationStatus ?? "",
    row.validationNotes ?? ""
  ]);
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([ENRICHED_HEADERS, ...values]), "Etsy Drafts");
  return new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }));
}

export interface AmazonListingWorkbookRow {
  productName: string;
  sourceChineseDescription?: string;
  imageFolder?: string;
  imageCount?: number;
  amazonProductType?: string;
  amazonCategoryPath?: string;
  categoryConfidence?: string;
  sku?: string;
  parentSku?: string;
  variationTheme?: string;
  color?: string;
  size?: string;
  amazonTitle?: string;
  bullet1?: string;
  bullet2?: string;
  bullet3?: string;
  bullet4?: string;
  bullet5?: string;
  productDescription?: string;
  backendSearchTerms?: string;
  targetCustomer?: string;
  useCases?: string;
  mainImageNotes?: string;
  lifestyleImageNotes?: string;
  infographicImageNotes?: string;
  sizeImageNotes?: string;
  aplusModule1Headline?: string;
  aplusModule1Body?: string;
  aplusModule2Headline?: string;
  aplusModule2Body?: string;
  aplusModule3Headline?: string;
  aplusModule3Body?: string;
  adKeywordSeeds?: string;
  negativeKeywordSeeds?: string;
  suggestedCampaignStructure?: string;
  suggestedPrice?: string;
  packageWeight?: string;
  packageDimensions?: string;
  inventory?: string | number;
  complianceNotes?: string;
  amazonTitleLength?: number;
  amazonTitleQualityNotes?: string;
  listingCopyQualityScore?: number;
  productNameTranslationNotes?: string;
  manualReviewPriority?: string;
  customerQuestionTargets?: string;
  aiShoppingAnswerSummary?: string;
  rufusAlexaReadinessScore?: number;
  missingBuyerFacts?: string;
  giftabilityNotes?: string;
  useCaseCoverage?: string;
  primaryCategoryHypothesis?: string;
  alternativeCategoryHypotheses?: string;
  categoryDecisionEvidence?: string;
  similarBestsellerSearchQueries?: string;
  competitorCategoryNotes?: string;
  competitionLevel?: string;
  adCostRisk?: string;
  expectedConversionFit?: string;
  categoryExperimentPlan?: string;
  categoryLearningStatus?: string;
  aiOptimizationBrief?: string;
  listingOptimizationRecommendation?: string;
  categoryOptimizationRecommendation?: string;
  campaignOptimizationRecommendation?: string;
  analysisCadence?: string;
  dailyAnalysisInputs?: string;
  weeklyAnalysisInputs?: string;
  optimizationNextAction?: string;
  validationStatus?: string;
  validationNotes?: string;
}

const AMAZON_LISTING_HEADERS = [
  "Product Name",
  "Source Chinese Description",
  "Image Folder",
  "Image Count",
  "Amazon Product Type",
  "Amazon Category Path",
  "Category Confidence",
  "SKU",
  "Parent SKU",
  "Variation Theme",
  "Color",
  "Size",
  "Amazon Title",
  "Bullet 1",
  "Bullet 2",
  "Bullet 3",
  "Bullet 4",
  "Bullet 5",
  "Product Description",
  "Backend Search Terms",
  "Target Customer",
  "Use Cases",
  "Main Image Notes",
  "Lifestyle Image Notes",
  "Infographic Image Notes",
  "Size Image Notes",
  "A+ Module 1 Headline",
  "A+ Module 1 Body",
  "A+ Module 2 Headline",
  "A+ Module 2 Body",
  "A+ Module 3 Headline",
  "A+ Module 3 Body",
  "Ad Keyword Seeds",
  "Negative Keyword Seeds",
  "Suggested Campaign Structure",
  "Suggested Price",
  "Package Weight",
  "Package Dimensions",
  "Inventory",
  "Compliance Notes",
  "Amazon Title Length",
  "Amazon Title Quality Notes",
  "Listing Copy Quality Score",
  "Product Name Translation Notes",
  "Manual Review Priority",
  "Customer Question Targets",
  "AI Shopping Answer Summary",
  "Rufus/Alexa Readiness Score",
  "Missing Buyer Facts",
  "Giftability Notes",
  "Use Case Coverage",
  "Primary Category Hypothesis",
  "Alternative Category Hypotheses",
  "Category Decision Evidence",
  "Similar Bestseller Search Queries",
  "Competitor Category Notes",
  "Competition Level",
  "Ad Cost Risk",
  "Expected Conversion Fit",
  "Category Experiment Plan",
  "Category Learning Status",
  "AI Optimization Brief",
  "Listing Optimization Recommendation",
  "Category Optimization Recommendation",
  "Campaign Optimization Recommendation",
  "Analysis Cadence",
  "Daily Analysis Inputs",
  "Weekly Analysis Inputs",
  "Optimization Next Action",
  "Validation Status",
  "Validation Notes"
];

const AMAZON_DAILY_OPTIMIZATION_HEADERS = [
  "Date",
  "SKU",
  "Product Name",
  "Sessions",
  "CTR",
  "CPC",
  "Spend",
  "Orders",
  "Sales",
  "Conversion Rate",
  "Search Terms",
  "Listing Issues",
  "AI Daily Recommendation",
  "Seller Approval"
];

const AMAZON_WEEKLY_OPTIMIZATION_HEADERS = [
  "Week Start",
  "SKU",
  "Product Name",
  "ACOS",
  "TACOS",
  "Total Spend",
  "Total Sales",
  "Keyword Winners",
  "Negative Keyword Candidates",
  "Category Conversion Notes",
  "Category Decision",
  "Budget Recommendation",
  "AI Weekly Recommendation",
  "Seller Approval"
];

const AMAZON_OPTIMIZATION_RECOMMENDATION_HEADERS = [
  "Cadence",
  "Date/Week",
  "SKU",
  "Product Name",
  "Status",
  "Recommendation",
  "Seller Approval Required"
];

const AMAZON_OPTIMIZATION_GUIDE_ROWS = [
  ["Section", "Details"],
  ["Daily metrics", "Paste Date, Sessions, CTR, CPC, Spend, Orders, Sales, Conversion Rate, Search Terms, and Listing Issues into Daily Optimization Inputs."],
  ["Weekly metrics", "Paste Week Start, ACOS, TACOS, Total Spend, Total Sales, Keyword Winners, Negative Keyword Candidates, and Category Conversion Notes into Weekly Optimization Review."],
  ["Approval boundary", "Seller approval is required before applying any recommendation. Refreshing recommendations does not change Amazon listings, categories, bids, budgets, keywords, or ads."],
  ["Recommendation refresh", "Run shopweaver_refresh_amazon_optimization_recommendations after metrics are pasted. Blank template rows are ignored."]
];

export function writeAmazonListingWorkbook(rows: AmazonListingWorkbookRow[]): Uint8Array {
  const workbook = XLSX.utils.book_new();
  const values = rows.map(row => [
    row.productName,
    row.sourceChineseDescription ?? "",
    row.imageFolder ?? "",
    row.imageCount ?? "",
    row.amazonProductType ?? "",
    row.amazonCategoryPath ?? "",
    row.categoryConfidence ?? "",
    row.sku ?? "",
    row.parentSku ?? "",
    row.variationTheme ?? "",
    row.color ?? "",
    row.size ?? "",
    row.amazonTitle ?? "",
    row.bullet1 ?? "",
    row.bullet2 ?? "",
    row.bullet3 ?? "",
    row.bullet4 ?? "",
    row.bullet5 ?? "",
    row.productDescription ?? "",
    row.backendSearchTerms ?? "",
    row.targetCustomer ?? "",
    row.useCases ?? "",
    row.mainImageNotes ?? "",
    row.lifestyleImageNotes ?? "",
    row.infographicImageNotes ?? "",
    row.sizeImageNotes ?? "",
    row.aplusModule1Headline ?? "",
    row.aplusModule1Body ?? "",
    row.aplusModule2Headline ?? "",
    row.aplusModule2Body ?? "",
    row.aplusModule3Headline ?? "",
    row.aplusModule3Body ?? "",
    row.adKeywordSeeds ?? "",
    row.negativeKeywordSeeds ?? "",
    row.suggestedCampaignStructure ?? "",
    row.suggestedPrice ?? "",
    row.packageWeight ?? "",
    row.packageDimensions ?? "",
    row.inventory ?? "",
    row.complianceNotes ?? "",
    row.amazonTitleLength ?? "",
    row.amazonTitleQualityNotes ?? "",
    row.listingCopyQualityScore ?? "",
    row.productNameTranslationNotes ?? "",
    row.manualReviewPriority ?? "",
    row.customerQuestionTargets ?? "",
    row.aiShoppingAnswerSummary ?? "",
    row.rufusAlexaReadinessScore ?? "",
    row.missingBuyerFacts ?? "",
    row.giftabilityNotes ?? "",
    row.useCaseCoverage ?? "",
    row.primaryCategoryHypothesis ?? "",
    row.alternativeCategoryHypotheses ?? "",
    row.categoryDecisionEvidence ?? "",
    row.similarBestsellerSearchQueries ?? "",
    row.competitorCategoryNotes ?? "",
    row.competitionLevel ?? "",
    row.adCostRisk ?? "",
    row.expectedConversionFit ?? "",
    row.categoryExperimentPlan ?? "",
    row.categoryLearningStatus ?? "",
    row.aiOptimizationBrief ?? "",
    row.listingOptimizationRecommendation ?? "",
    row.categoryOptimizationRecommendation ?? "",
    row.campaignOptimizationRecommendation ?? "",
    row.analysisCadence ?? "",
    row.dailyAnalysisInputs ?? "",
    row.weeklyAnalysisInputs ?? "",
    row.optimizationNextAction ?? "",
    row.validationStatus ?? "",
    row.validationNotes ?? ""
  ]);
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([AMAZON_LISTING_HEADERS, ...values]), "Amazon Listings");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    AMAZON_DAILY_OPTIMIZATION_HEADERS,
    ...rows.map(row => [
      "",
      row.sku ?? "",
      row.productName,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      analyzeAmazonDailyOptimization({
        sessions: 0,
        ctr: 0,
        cpc: 0,
        spend: 0,
        orders: 0,
        sales: 0,
        conversionRate: 0,
        searchTerms: ""
      }).recommendation,
      ""
    ])
  ]), "Daily Optimization Inputs");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    AMAZON_WEEKLY_OPTIMIZATION_HEADERS,
    ...rows.map(row => [
      "",
      row.sku ?? "",
      row.productName,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      analyzeAmazonWeeklyOptimization({
        acos: 0,
        tacos: 0,
        totalSpend: 0,
        totalSales: 0,
        categoryConversionRate: 0,
        keywordWinners: "",
        negativeKeywordCandidates: ""
      }).recommendation,
      ""
    ])
  ]), "Weekly Optimization Review");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    AMAZON_OPTIMIZATION_RECOMMENDATION_HEADERS
  ]), "Optimization Recommendations");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(AMAZON_OPTIMIZATION_GUIDE_ROWS), "Optimization Guide");
  return new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }));
}

export interface AmazonDailyOptimizationWorkbookInput {
  date: string;
  sku: string;
  productName: string;
  sessions: number;
  ctr: number;
  cpc: number;
  spend: number;
  orders: number;
  sales: number;
  conversionRate: number;
  searchTerms: string;
  listingIssues: string;
}

export interface AmazonWeeklyOptimizationWorkbookInput {
  weekStart: string;
  sku: string;
  productName: string;
  acos: number;
  tacos: number;
  totalSpend: number;
  totalSales: number;
  keywordWinners: string;
  negativeKeywordCandidates: string;
  categoryConversionNotes: string;
}

function textValue(value: unknown): string {
  return String(value ?? "").trim();
}

function numberValue(value: unknown): number {
  const parsed = Number(textValue(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseAmazonDailyOptimizationInputs(bytes: Uint8Array): AmazonDailyOptimizationWorkbookInput[] {
  const workbook = XLSX.read(bytes, { type: "array" });
  const sheet = workbook.Sheets["Daily Optimization Inputs"];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return rows
    .filter(row => hasDailyOptimizationData(row))
    .map(row => ({
      date: textValue(row["Date"]),
      sku: textValue(row["SKU"]),
      productName: textValue(row["Product Name"]),
      sessions: numberValue(row["Sessions"]),
      ctr: numberValue(row["CTR"]),
      cpc: numberValue(row["CPC"]),
      spend: numberValue(row["Spend"]),
      orders: numberValue(row["Orders"]),
      sales: numberValue(row["Sales"]),
      conversionRate: numberValue(row["Conversion Rate"]),
      searchTerms: textValue(row["Search Terms"]),
      listingIssues: textValue(row["Listing Issues"])
    }));
}

export function parseAmazonWeeklyOptimizationInputs(bytes: Uint8Array): AmazonWeeklyOptimizationWorkbookInput[] {
  const workbook = XLSX.read(bytes, { type: "array" });
  const sheet = workbook.Sheets["Weekly Optimization Review"];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return rows
    .filter(row => hasWeeklyOptimizationData(row))
    .map(row => ({
      weekStart: textValue(row["Week Start"]),
      sku: textValue(row["SKU"]),
      productName: textValue(row["Product Name"]),
      acos: numberValue(row["ACOS"]),
      tacos: numberValue(row["TACOS"]),
      totalSpend: numberValue(row["Total Spend"]),
      totalSales: numberValue(row["Total Sales"]),
      keywordWinners: textValue(row["Keyword Winners"]),
      negativeKeywordCandidates: textValue(row["Negative Keyword Candidates"]),
      categoryConversionNotes: textValue(row["Category Conversion Notes"])
    }));
}

function hasDailyOptimizationData(row: Record<string, unknown>): boolean {
  return [
    "Date",
    "Sessions",
    "CTR",
    "CPC",
    "Spend",
    "Orders",
    "Sales",
    "Conversion Rate",
    "Search Terms",
    "Listing Issues"
  ].some(header => textValue(row[header]) !== "");
}

function hasWeeklyOptimizationData(row: Record<string, unknown>): boolean {
  return [
    "Week Start",
    "ACOS",
    "TACOS",
    "Total Spend",
    "Total Sales",
    "Keyword Winners",
    "Negative Keyword Candidates",
    "Category Conversion Notes",
    "Category Decision",
    "Budget Recommendation"
  ].some(header => textValue(row[header]) !== "");
}

export function writeAmazonOptimizationRecommendationsWorkbook(input: {
  daily: AmazonDailyOptimizationWorkbookInput[];
  weekly: AmazonWeeklyOptimizationWorkbookInput[];
}): Uint8Array {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    AMAZON_OPTIMIZATION_RECOMMENDATION_HEADERS,
    ...optimizationRecommendationRows(input)
  ]), "Optimization Recommendations");
  return new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }));
}

export function refreshAmazonOptimizationRecommendations(bytes: Uint8Array): Uint8Array {
  const workbook = XLSX.read(bytes, { type: "array" });
  const daily = parseAmazonDailyOptimizationInputs(bytes);
  const weekly = parseAmazonWeeklyOptimizationInputs(bytes);
  delete workbook.Sheets["Optimization Recommendations"];
  workbook.SheetNames = workbook.SheetNames.filter(name => name !== "Optimization Recommendations");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    AMAZON_OPTIMIZATION_RECOMMENDATION_HEADERS,
    ...optimizationRecommendationRows({ daily, weekly })
  ]), "Optimization Recommendations");
  return new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }));
}

export function summarizeAmazonOptimizationRefresh(bytes: Uint8Array) {
  const daily = parseAmazonDailyOptimizationInputs(bytes);
  const weekly = parseAmazonWeeklyOptimizationInputs(bytes);
  const analyzed = analyzeAmazonOptimizationWorkbookInputs({ daily, weekly });
  return {
    dailyInputCount: daily.length,
    weeklyInputCount: weekly.length,
    recommendationCount: analyzed.daily.length + analyzed.weekly.length
  };
}

function optimizationRecommendationRows(input: {
  daily: AmazonDailyOptimizationWorkbookInput[];
  weekly: AmazonWeeklyOptimizationWorkbookInput[];
}) {
  const analyzed = analyzeAmazonOptimizationWorkbookInputs({ daily: input.daily, weekly: input.weekly });
  return [
    ...analyzed.daily.map(row => [
      "daily",
      row.date,
      row.sku,
      row.productName,
      row.status,
      row.recommendation,
      "yes"
    ]),
    ...analyzed.weekly.map(row => [
      "weekly",
      row.weekStart,
      row.sku,
      row.productName,
      row.status,
      row.recommendation,
      "yes"
    ])
  ];
}
