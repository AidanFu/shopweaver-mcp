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
});
