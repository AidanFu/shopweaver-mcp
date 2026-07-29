export type TextEntry = { value?: string | null; decoratorSet?: string[] };
export type AplusModule = {
  contentModuleType?: string;
  standardProductDescription?: { body?: { textList?: TextEntry[] | null } | null } | null;
  standardImageTextOverlay?: {
    block?: {
      image?: { altText?: string | null } | null;
      headline?: { value?: string | null; decoratorSet?: string[] } | null;
      body?: { textList?: TextEntry[] | null } | null;
    } | null;
  } | null;
};

export type AplusContentDocument = {
  name: string;
  contentType: string;
  locale: string;
  contentModuleList: AplusModule[];
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

export interface OptimizedAmazonAplusContext {
  asin: string;
  finish: string;
  heightInches: number;
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

export function buildOptimizedAmazonAplusContentDocument(document: AplusContentDocument, context: OptimizedAmazonAplusContext): AplusContentDocument {
  return {
    ...document,
    name: `ShopWeaver optimized ${context.asin} ${capitalize(context.finish)}`.slice(0, 100),
    contentModuleList: document.contentModuleList.map((module, index) => {
      if (module.contentModuleType === "STANDARD_PRODUCT_DESCRIPTION") return productDescriptionModule(context);
      if (module.contentModuleType === "STANDARD_IMAGE_TEXT_OVERLAY") return imageTextOverlayModule(module, context, index);
      return module;
    })
  };
}

function productDescriptionModule(context: OptimizedAmazonAplusContext): AplusModule {
  return {
    contentModuleType: "STANDARD_PRODUCT_DESCRIPTION",
    standardProductDescription: {
      body: {
        textList: [{
          value: `Upgrade daily bathroom comfort with a wall mounted electric towel warmer rack designed to warm and dry towels while saving floor space. The 3-bar vertical design uses 304-grade stainless steel with a polished ${capitalize(context.finish)} finish and a ${context.heightInches} inch profile for bathrooms, laundry rooms, spa areas, and compact wall spaces. A digital timer helps manage run time, and plug-in or hardwired installation options give flexibility for different setups.`,
          decoratorSet: []
        }]
      }
    }
  };
}

function imageTextOverlayModule(module: AplusModule, context: OptimizedAmazonAplusContext, index: number): AplusModule {
  const copy = overlayCopy(index);
  return {
    ...module,
    standardImageTextOverlay: {
      ...module.standardImageTextOverlay,
      block: {
        ...module.standardImageTextOverlay?.block,
        image: {
          ...module.standardImageTextOverlay?.block?.image,
          altText: `${capitalize(context.finish)} electric towel warmer shown in a bathroom use case`
        },
        headline: { value: copy.headline, decoratorSet: [] },
        body: { textList: [{ value: copy.body, decoratorSet: [] }] }
      }
    }
  };
}

function overlayCopy(index: number): { headline: string; body: string } {
  const copy = [
    {
      headline: "Warmer, drier towels after daily showers",
      body: "Create a more comfortable bathroom routine while helping towels dry neatly on the wall mounted 3-bar rack."
    },
    {
      headline: "Save floor space with a vertical wall mount",
      body: "The narrow profile keeps towels organized without adding a freestanding rack to compact bathrooms or laundry rooms."
    },
    {
      headline: "Timer control for everyday flexibility",
      body: "Use the digital timer to manage warming time for morning showers, evening routines, or damp towel drying."
    },
    {
      headline: "Plug-in or hardwired installation options",
      body: "Choose the setup that fits your bathroom plan, and review measurements before purchase for the best wall placement."
    },
    {
      headline: "304 stainless steel for daily bathroom use",
      body: "A polished finish and 3-bar layout support regular towel warming while adding a clean bathroom upgrade."
    },
    {
      headline: "Useful beyond bath towels",
      body: "Use it for hand towels, swimsuits, laundry-room drying, spa spaces, or a warmer touch after cold mornings."
    }
  ];
  return copy[Math.max(0, Math.min(index - 1, copy.length - 1))];
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
