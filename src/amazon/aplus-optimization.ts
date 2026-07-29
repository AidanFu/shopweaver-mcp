type TextEntry = { value?: string | null };
type AplusModule = {
  contentModuleType?: string;
  standardProductDescription?: { body?: { textList?: TextEntry[] | null } | null } | null;
  standardImageTextOverlay?: {
    block?: {
      image?: { altText?: string | null } | null;
      headline?: { value?: string | null } | null;
      body?: { textList?: TextEntry[] | null } | null;
    } | null;
  } | null;
};

export interface AmazonAplusContentInput {
  asin: string;
  expectedFinish?: string;
  expectedHeightInches?: number;
  contentRecord: {
    contentMetadata?: { status?: string; name?: string };
    contentDocument?: { locale?: string; contentModuleList?: AplusModule[] };
  };
}

export interface AmazonAplusContentRecommendation {
  asin: string;
  status: "needs_aplus_optimization" | "monitor_aplus";
  priority: "high" | "normal";
  contentStatus: string;
  moduleCount: number;
  emptyOverlayModuleCount: number;
  genericAltTextCount: number;
  recommendations: string[];
  proposedModulePlan: string[];
}

export function analyzeAmazonAplusContent(input: AmazonAplusContentInput): AmazonAplusContentRecommendation {
  const modules = input.contentRecord.contentDocument?.contentModuleList ?? [];
  const allText = modules.flatMap(module => moduleTexts(module)).join(" ");
  const emptyOverlayModuleCount = modules.filter(isEmptyOverlayModule).length;
  const genericAltTextCount = modules.filter(hasGenericAltText).length;
  const recommendations: string[] = [];
  const mentionedFinish = allText.match(/\b(Gold|Black|Silver)\b/i)?.[1];
  const mentionedHeight = allText.match(/\b(\d+(?:\.\d+)?)\s*(?:inch|inches|in)\b/i)?.[1];

  if (input.expectedFinish && mentionedFinish && mentionedFinish.toLowerCase() !== input.expectedFinish.toLowerCase()) {
    recommendations.push(`Fix finish mismatch: A+ text mentions ${capitalize(mentionedFinish)}, but this ASIN context expects ${capitalize(input.expectedFinish)}.`);
  }
  if (input.expectedHeightInches !== undefined && mentionedHeight && Number(mentionedHeight) !== input.expectedHeightInches) {
    recommendations.push(`Fix dimension mismatch: A+ text mentions ${Number(mentionedHeight)} inches, but this ASIN context expects ${input.expectedHeightInches} inches.`);
  }
  if (emptyOverlayModuleCount > 0) recommendations.push("Add benefit-led headlines and body copy to image overlay modules instead of relying only on image text.");
  if (genericAltTextCount > 0) recommendations.push("Replace generic image alt text with concise product/use-case descriptions.");
  recommendations.push("Add A+ sections that answer installation, timer, bathroom fit, heating expectation, and post-sale reassurance concerns.");

  const needsOptimization = recommendations.length > 1 || emptyOverlayModuleCount > 0 || genericAltTextCount > 0 || input.contentRecord.contentMetadata?.status !== "APPROVED";
  return {
    asin: input.asin,
    status: needsOptimization ? "needs_aplus_optimization" : "monitor_aplus",
    priority: recommendations.some(value => value.includes("mismatch")) ? "high" : "normal",
    contentStatus: input.contentRecord.contentMetadata?.status ?? "UNKNOWN",
    moduleCount: modules.length,
    emptyOverlayModuleCount,
    genericAltTextCount,
    recommendations,
    proposedModulePlan: [
      "Hero: Electric towel warmer rack for warmer, drier towels in daily bathroom routines.",
      "Benefit strip: save floor space, organize towels, support daily drying, and upgrade bathroom finish.",
      "Installation confidence: plug-in or hardwired options, digital timer, wall-mount fit, and measurement reminder.",
      "Use-case module: bathrooms, laundry rooms, spa spaces, swimsuits, and compact walls.",
      `Spec/reassurance module: 304 stainless steel, 3-bar vertical layout, ${input.expectedHeightInches ?? 38} inch height, ${capitalize(input.expectedFinish ?? "selected")} finish, seller support.`
    ]
  };
}

function moduleTexts(module: AplusModule): string[] {
  return [
    ...(module.standardProductDescription?.body?.textList?.map(entry => entry.value ?? "") ?? []),
    module.standardImageTextOverlay?.block?.headline?.value ?? "",
    ...(module.standardImageTextOverlay?.block?.body?.textList?.map(entry => entry.value ?? "") ?? [])
  ].filter(Boolean);
}

function isEmptyOverlayModule(module: AplusModule): boolean {
  if (module.contentModuleType !== "STANDARD_IMAGE_TEXT_OVERLAY") return false;
  return moduleTexts(module).length === 0;
}

function hasGenericAltText(module: AplusModule): boolean {
  const altText = module.standardImageTextOverlay?.block?.image?.altText ?? "";
  return /^(\d+[a-z]?[-_])?round-\d+$/i.test(altText) || /^3v-round-\d+$/i.test(altText);
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
