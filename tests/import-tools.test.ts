import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { DriveImportService } from "../src/import/drive-import.js";

function workbookBytes() {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["产品一", "", "描述"]]), "Sheet1");
  return new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }));
}

describe("DriveImportService", () => {
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
});
