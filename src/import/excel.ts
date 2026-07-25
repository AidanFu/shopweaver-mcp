import * as XLSX from "xlsx";

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
  rows.forEach((row, index) => {
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
  });
  if (current) products.push({ productName: current.productName, rawChineseDescription: current.descriptions.join("\n"), rowStart: current.rowStart, rowEnd: current.rowEnd });
  return products;
}
