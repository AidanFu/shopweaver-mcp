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
