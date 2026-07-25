import * as XLSX from "xlsx";
import { z } from "zod";

export const EnrichedDraftRowSchema = z.object({
  productName: z.string().min(1),
  rawChineseDescription: z.string().optional(),
  englishTitle: z.string().optional(),
  englishDescription: z.string().optional(),
  tags: z.string().optional(),
  materials: z.string().optional(),
  quantity: z.number().int().nonnegative().optional(),
  price: z.string().optional(),
  taxonomyId: z.number().int().positive().optional(),
  taxonomyPath: z.string().optional(),
  whoMade: z.string().optional(),
  whenMade: z.string().optional(),
  type: z.string().optional(),
  readinessStateId: z.number().int().positive().optional(),
  imageFolder: z.string().optional(),
  imageCount: z.number().int().nonnegative().optional()
}).passthrough();

export type EnrichedDraftRow = z.infer<typeof EnrichedDraftRowSchema>;

export function parseEnrichedRows(bytes: Uint8Array): EnrichedDraftRow[] {
  const workbook = XLSX.read(bytes, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
  const text = (value: unknown) => value === undefined || value === "" ? undefined : String(value);
  const number = (value: unknown) => value === undefined || value === "" ? undefined : Number(value);
  return rows.map(row => EnrichedDraftRowSchema.parse({
    productName: row["Product Name"],
    rawChineseDescription: text(row["Raw Chinese Description"]),
    englishTitle: text(row["English Title"]),
    englishDescription: text(row["English Description"]),
    tags: text(row["Tags"]),
    materials: text(row["Materials"]),
    quantity: number(row["Quantity"]),
    price: text(row["Price"]),
    taxonomyId: number(row["Taxonomy ID"]),
    taxonomyPath: text(row["Taxonomy Path"]),
    whoMade: text(row["Who Made"]),
    whenMade: text(row["When Made"]),
    type: text(row["Type"]),
    readinessStateId: number(row["Readiness State ID"]),
    imageFolder: text(row["Image Folder"]),
    imageCount: number(row["Image Count"])
  }));
}

export function validateEnrichedDraftRow(row: EnrichedDraftRow): string[] {
  const errors: string[] = [];
  if (!row.englishTitle) errors.push("English Title is required.");
  if (!row.englishDescription) errors.push("English Description is required.");
  if (row.quantity === undefined) errors.push("Quantity is required.");
  if (!row.price) errors.push("Price is required.");
  if (row.taxonomyId === undefined) errors.push("Taxonomy ID is required.");
  if (!row.whoMade) errors.push("Who Made is required.");
  if (!row.whenMade) errors.push("When Made is required.");
  if (row.type !== "physical") errors.push("Type must be physical.");
  if (row.readinessStateId === undefined) errors.push("Readiness State ID is required.");
  if (!row.imageFolder) errors.push("Image Folder is required.");
  if (!row.imageCount) errors.push("At least one image is required.");
  return errors;
}
