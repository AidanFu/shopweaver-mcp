import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { DriveImportService } from "../src/import/drive-import.js";
import { previewAmazonListingWorkbookWrite, previewAmazonOptimizationRefresh, previewDraftInputFromEnrichedRow, previewEtsyVariationDraftFromRows, previewEtsyVariationGroups, writeEtsyVariationWorkbook } from "../src/tools/import-tools.js";

function workbookBytes() {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["产品一", "", "描述"]]), "Sheet1");
  return new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }));
}

describe("DriveImportService", () => {
  it("runs Google health preflight before Drive import listing", async () => {
    const drive = {
      listFolderChildren: vi.fn()
    };
    const health = {
      assertReady: vi.fn().mockRejectedValue(new Error("Google Drive authorization expired or was revoked. Run npm run google:setup to reconnect Google Drive."))
    };
    const service = new DriveImportService(drive as never, health as never);
    await expect(service.importFolder("folder")).rejects.toThrow("Google Drive authorization expired");
    expect(drive.listFolderChildren).not.toHaveBeenCalled();
  });

  it("imports workbook records and matched images from an allowed folder", async () => {
    const drive = {
      listFolderChildren: vi.fn().mockResolvedValue([
        { id: "xlsx", name: "Product Information.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
        { id: "images", name: "Images", mimeType: "application/vnd.google-apps.folder" }
      ]),
      listChildrenByParentId: vi.fn()
        .mockResolvedValueOnce([{ id: "p1", name: "产品一", mimeType: "application/vnd.google-apps.folder" }])
        .mockResolvedValueOnce([{ id: "img1", name: "01-main.jpg", mimeType: "image/jpeg" }]),
      downloadFile: vi.fn().mockResolvedValue(workbookBytes())
    };
    const service = new DriveImportService(drive as never);
    const result = await service.importFolder("folder");
    expect(result.products[0]).toMatchObject({ productName: "产品一", imageCount: 1, mainImageName: "01-main.jpg" });
  });

  it("imports Google Sheets product information by exporting it as xlsx", async () => {
    const drive = {
      listFolderChildren: vi.fn().mockResolvedValue([
        { id: "sheet", name: "Product Information", mimeType: "application/vnd.google-apps.spreadsheet" },
        { id: "images", name: "Images", mimeType: "application/vnd.google-apps.folder" }
      ]),
      listChildrenByParentId: vi.fn()
        .mockResolvedValueOnce([{ id: "p1", name: "产品一", mimeType: "application/vnd.google-apps.folder" }])
        .mockResolvedValueOnce([{ id: "img1", name: "01-main.jpg", mimeType: "image/jpeg" }]),
      downloadFile: vi.fn(),
      exportFile: vi.fn().mockResolvedValue(workbookBytes())
    };
    const service = new DriveImportService(drive as never);
    const result = await service.importFolder("folder");
    expect(result.products[0]).toMatchObject({ productName: "产品一", imageCount: 1 });
    expect(drive.exportFile).toHaveBeenCalledWith("sheet", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(drive.downloadFile).not.toHaveBeenCalled();
  });

  it("writes enriched workbook bytes back to Drive", async () => {
    const drive = {
      uploadFile: vi.fn().mockResolvedValue({ id: "enriched", name: "Product Information - Etsy Draft.xlsx" })
    };
    const service = new DriveImportService(drive as never);
    await expect(service.writeEnrichedWorkbook("folder", [{
      productName: "产品一",
      rawChineseDescription: "描述",
      imageFolder: "产品一",
      imageCount: 1,
      validationStatus: "needs_enrichment",
      validationNotes: "Missing English title"
    }])).resolves.toMatchObject({ id: "enriched", name: "Product Information - Etsy Draft.xlsx" });
    expect(drive.uploadFile).toHaveBeenCalledOnce();
  });

  it("writes Amazon listing workbook bytes back to Drive", async () => {
    const drive = {
      uploadFile: vi.fn().mockResolvedValue({ id: "amazon", name: "Product Information - Amazon Listing.xlsx" })
    };
    const service = new DriveImportService(drive as never);
    await expect(service.writeAmazonListingWorkbook("folder", [{
      productName: "产品一",
      sourceChineseDescription: "描述",
      imageFolder: "产品一",
      imageCount: 1,
      amazonProductType: "KEYCHAIN",
      validationStatus: "needs_review",
      validationNotes: "Review Amazon category/product type before submission."
    }])).resolves.toMatchObject({ id: "amazon", name: "Product Information - Amazon Listing.xlsx" });
    expect(drive.uploadFile).toHaveBeenCalledWith(
      "folder",
      "Product Information - Amazon Listing.xlsx",
      expect.any(Uint8Array),
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
  });

  it("refreshes Amazon optimization recommendations in an existing Drive workbook", async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["SKU"], ["AMZ-HMF-0001"]]), "Amazon Listings");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Date", "SKU", "Product Name", "Sessions", "CTR", "CPC", "Spend", "Orders", "Sales", "Conversion Rate", "Search Terms", "Listing Issues"],
      ["2026-07-27", "AMZ-HMF-0001", "Purple Tulip Bunny", "120", "0.9", "0.62", "42", "0", "0", "0", "crochet bag charm", "main image weak"]
    ]), "Daily Optimization Inputs");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Week Start", "SKU", "Product Name", "ACOS", "TACOS", "Total Spend", "Total Sales", "Keyword Winners", "Negative Keyword Candidates", "Category Conversion Notes"],
      ["2026-07-20", "AMZ-HMF-0001", "Purple Tulip Bunny", "72", "30", "180", "250", "", "free; pattern", "0.8% category conversion"]
    ]), "Weekly Optimization Review");
    const drive = {
      listFolderChildren: vi.fn().mockResolvedValue([
        { id: "amazon-file", name: "Product Information - Amazon Listing.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
      ]),
      downloadFile: vi.fn().mockResolvedValue(new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }))),
      uploadFile: vi.fn().mockResolvedValue({ id: "amazon-file", name: "Product Information - Amazon Listing.xlsx" })
    };
    const service = new DriveImportService(drive as never);
    await expect(service.refreshAmazonOptimizationRecommendations("folder")).resolves.toEqual({
      file: { id: "amazon-file", name: "Product Information - Amazon Listing.xlsx" },
      dailyInputCount: 1,
      weeklyInputCount: 1,
      recommendationCount: 2,
      statusCounts: {
        needs_listing_review: 1,
        review_category_and_campaign: 1
      },
      priorityCounts: {
        high: 2
      },
      decisionCount: 0,
      sellerDecisionCounts: {},
      actionDecisionCounts: {},
      followUpDueCount: 0,
      followUpStatusCounts: {}
    });
    expect(drive.downloadFile).toHaveBeenCalledWith("amazon-file");
    expect(drive.uploadFile).toHaveBeenCalledWith(
      "folder",
      "Product Information - Amazon Listing.xlsx",
      expect.any(Uint8Array),
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    const uploadedBytes = drive.uploadFile.mock.calls[0][2] as Uint8Array;
    const uploadedWorkbook = XLSX.read(uploadedBytes, { type: "array" });
    const recommendationRows = XLSX.utils.sheet_to_json<Record<string, string>>(uploadedWorkbook.Sheets["Optimization Recommendations"]);
    expect(recommendationRows[0]["Status"]).toBe("needs_listing_review");
    expect(recommendationRows[1]["Status"]).toBe("review_category_and_campaign");
  });
});

describe("previewDraftInputFromEnrichedRow", () => {
  it("maps an enriched physical row to Etsy draft input", () => {
    const preview = previewDraftInputFromEnrichedRow({
      productName: "产品一",
      englishTitle: "Handmade Wooden Bowl",
      englishDescription: "A handmade wooden bowl.",
      tags: "wood bowl, handmade bowl",
      materials: "wood",
      quantity: 1,
      price: "12.00",
      taxonomyId: 123,
      whoMade: "i_did",
      whenMade: "2020_2026",
      type: "physical",
      readinessStateId: 456,
      imageFolder: "产品一",
      imageCount: 2
    });
    expect(preview.validationErrors).toEqual([]);
    expect(preview.draftInput).toMatchObject({ title: "Handmade Wooden Bowl", type: "physical", taxonomyId: 123 });
  });
});

describe("previewAmazonListingWorkbookWrite", () => {
  it("previews Amazon workbook generation without writing", () => {
    expect(previewAmazonListingWorkbookWrite("folder", 38)).toEqual({
      operation: "write_amazon_listing_workbook",
      folderId: "folder",
      rowCount: 38,
      filename: "Product Information - Amazon Listing.xlsx",
      warning: "This writes an Amazon planning workbook only. It does not call Amazon APIs, submit listings, upload images, create A+ Content, or change ads."
    });
  });
});

describe("previewAmazonOptimizationRefresh", () => {
  it("previews Amazon optimization recommendation refresh without writing", () => {
    expect(previewAmazonOptimizationRefresh("folder")).toEqual({
      operation: "refresh_amazon_optimization_recommendations",
      folderId: "folder",
      filename: "Product Information - Amazon Listing.xlsx",
      warning: "This refreshes the workbook Optimization Recommendations sheet only. It does not call Amazon APIs or change listings, categories, bids, budgets, keywords, or ads."
    });
  });
});

describe("Etsy variation workbook tools", () => {
  it("previews a reviewed Etsy variation draft from workbook rows", async () => {
    const preview = previewEtsyVariationDraftFromRows([{
      productName: "郁金香兔-紫色",
      englishTitle: "Handmade Crochet Tulip Bunny",
      englishDescription: "A soft handmade crochet bunny.",
      quantity: 1,
      price: "18.99",
      taxonomyId: 2078,
      whoMade: "i_did",
      whenMade: "2020_2026",
      type: "physical",
      readinessStateId: 1,
      listingGroup: "郁金香兔",
      parentListingTitle: "Handmade Crochet Tulip Bunny",
      parentListingDescription: "A soft handmade crochet bunny with color options.",
      isVariant: "yes",
      variation1Name: "Color",
      variation1Value: "Purple",
      sku: "tulip-bunny-purple",
      variantPrice: "18.99",
      variantQuantity: 1,
      variantImageFolder: "郁金香兔-紫色"
    } as never], "郁金香兔", 200);
    expect(preview.inventory.products[0].propertyValues[0].propertyId).toBe(200);
  });

  it("previews Etsy variation groups from an allowed Drive folder", async () => {
    const imports = {
      importFolder: vi.fn().mockResolvedValue({
        products: [
          { productName: "郁金香兔-紫色", rawChineseDescription: "紫色兔子", imageFolderId: "p", imageFolderName: "郁金香兔-紫色", imageCount: 4, images: [] },
          { productName: "郁金香兔-蓝色", rawChineseDescription: "蓝色兔子", imageFolderId: "b", imageFolderName: "郁金香兔-蓝色", imageCount: 5, images: [] }
        ]
      })
    };
    const preview = await previewEtsyVariationGroups(imports as never, "folder");
    expect(preview.groups[0]).toMatchObject({ listingGroup: "郁金香兔", variation1Name: "Color" });
    expect(preview.rowCount).toBe(2);
  });

  it("writes an Etsy variation workbook after confirm mode", async () => {
    const imports = {
      importFolder: vi.fn().mockResolvedValue({
        products: [
          { productName: "郁金香兔-紫色", rawChineseDescription: "紫色兔子", imageFolderId: "p", imageFolderName: "郁金香兔-紫色", imageCount: 4, images: [] },
          { productName: "郁金香兔-蓝色", rawChineseDescription: "蓝色兔子", imageFolderId: "b", imageFolderName: "郁金香兔-蓝色", imageCount: 5, images: [] }
        ]
      }),
      writeEnrichedWorkbook: vi.fn().mockResolvedValue({ id: "workbook", name: "Product Information - Etsy Draft.xlsx" })
    };
    const result = await writeEtsyVariationWorkbook(imports as never, "folder");
    expect(imports.writeEnrichedWorkbook).toHaveBeenCalledWith("folder", expect.arrayContaining([
      expect.objectContaining({ listingGroup: "郁金香兔", variation1Value: "Purple" })
    ]));
    expect(result.file.id).toBe("workbook");
  });
});

describe("Amazon optimization refresh tool response", () => {
  it("includes recommendation counts after confirm refresh", async () => {
    const imports = {
      refreshAmazonOptimizationRecommendations: vi.fn().mockResolvedValue({
        file: { id: "amazon-file", name: "Product Information - Amazon Listing.xlsx" },
        dailyInputCount: 2,
        weeklyInputCount: 1,
        recommendationCount: 3,
        statusCounts: {
          needs_listing_review: 2,
          keep_learning: 1
        },
        priorityCounts: {
          high: 2,
          normal: 1
        }
      })
    };
    const { registerImportTools } = await import("../src/tools/import-tools.js");
    const calls: Array<{ name: string; handler: (input: { mode: "confirm"; folderId: string }) => Promise<unknown> }> = [];
    const server = {
      registerTool: vi.fn((name, _config, handler) => calls.push({ name, handler }))
    };
    registerImportTools(server as never, imports as never);
    const tool = calls.find(call => call.name === "shopweaver_refresh_amazon_optimization_recommendations")!;
    const response = await tool.handler({ mode: "confirm", folderId: "folder" }) as { structuredContent: Record<string, unknown> };
    expect(response.structuredContent).toMatchObject({
      dailyInputCount: 2,
      weeklyInputCount: 1,
      recommendationCount: 3,
      statusCounts: {
        needs_listing_review: 2,
        keep_learning: 1
      },
      priorityCounts: {
        high: 2,
        normal: 1
      }
    });
  });
});

describe("Amazon workbook generation flow", () => {
  it("imports Drive products, builds Amazon rows, and writes the workbook", async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["龙猫钥匙扣", "", "手工钩织钥匙扣，适合挂包和送礼"]]), "Sheet1");
    const sourceBytes = new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }));
    const drive = {
      listFolderChildren: vi.fn().mockResolvedValue([
        { id: "xlsx", name: "Product Information.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
        { id: "images", name: "Images", mimeType: "application/vnd.google-apps.folder" }
      ]),
      listChildrenByParentId: vi.fn()
        .mockResolvedValueOnce([{ id: "p1", name: "龙猫钥匙扣", mimeType: "application/vnd.google-apps.folder" }])
        .mockResolvedValueOnce([{ id: "img1", name: "01-main.jpg", mimeType: "image/jpeg" }]),
      downloadFile: vi.fn().mockResolvedValue(sourceBytes),
      uploadFile: vi.fn().mockResolvedValue({ id: "amazon", name: "Product Information - Amazon Listing.xlsx" })
    };
    const service = new DriveImportService(drive as never);
    const imported = await service.importFolder("folder");
    const { buildAmazonListingRows } = await import("../src/import/amazon-listing.js");
    const rows = buildAmazonListingRows(imported.products);
    const written = await service.writeAmazonListingWorkbook("folder", rows);
    expect(written).toEqual({ id: "amazon", name: "Product Information - Amazon Listing.xlsx" });
    expect(rows[0]).toMatchObject({
      productName: "龙猫钥匙扣",
      amazonProductType: "HANDMADE_HANGING_MINI_FIGURE",
      validationStatus: "needs_review"
    });
    expect(drive.uploadFile).toHaveBeenCalledOnce();
  });
});
