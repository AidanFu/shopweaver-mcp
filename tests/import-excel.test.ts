import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseProductInformationWorkbook } from "../src/import/excel.js";

function workbookBytes(rows: Array<Array<string>>) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Sheet1");
  return new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }));
}

describe("parseProductInformationWorkbook", () => {
  it("groups column C descriptions under the nearest column A product", () => {
    const bytes = workbookBytes([
      ["产品一", "", "第一行描述"],
      ["", "", "第二行描述"],
      ["", "", ""],
      ["产品二", "", "另一个描述"],
      ["", "", "更多描述"]
    ]);
    expect(parseProductInformationWorkbook(bytes)).toEqual([
      { productName: "产品一", rawChineseDescription: "第一行描述\n第二行描述", rowStart: 1, rowEnd: 2 },
      { productName: "产品二", rawChineseDescription: "另一个描述\n更多描述", rowStart: 4, rowEnd: 5 }
    ]);
  });
});
