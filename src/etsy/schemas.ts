import { z } from "zod";

export const MoneySchema = z.object({
  amount: z.number().int(),
  divisor: z.number().int().positive(),
  currency_code: z.string().min(3).max(3)
}).strip();

export const ListingStateSchema = z.enum(["active", "draft", "inactive", "expired", "sold_out"]);

export type PublicMoney = { amount: string; currency: string };

export function publicMoney(value: z.infer<typeof MoneySchema>): PublicMoney {
  const negative = value.amount < 0;
  const digits = Math.abs(value.amount).toString();
  const decimals = Math.log10(value.divisor);
  const padded = digits.padStart(decimals + 1, "0");
  const amount = decimals === 0 ? padded : `${padded.slice(0, -decimals)}.${padded.slice(-decimals)}`;
  return { amount: `${negative ? "-" : ""}${amount}`, currency: value.currency_code };
}

export const PageSchema = <T extends z.ZodType>(item: T) => z.object({
  count: z.number().int().nonnegative(),
  results: z.array(item)
}).strip();

export const ShopSchema = z.object({
  shop_id: z.number().int().positive(),
  shop_name: z.string(),
  title: z.string().nullable().optional(),
  currency_code: z.string().length(3),
  active_listing_count: z.number().int().nonnegative()
}).strip();

export const ListingSchema = z.object({
  listing_id: z.number().int().positive(),
  title: z.string(),
  description: z.string().optional(),
  state: ListingStateSchema,
  quantity: z.number().int().nonnegative(),
  price: MoneySchema,
  taxonomy_id: z.number().int().positive().optional(),
  tags: z.array(z.string()).optional(),
  materials: z.array(z.string()).optional(),
  url: z.string().url().nullable().optional()
}).strip();

export const PropertyValueSchema = z.object({
  property_id: z.number().int().positive(),
  property_name: z.string().optional(),
  scale_id: z.number().int().positive().nullable().optional(),
  scale_name: z.string().nullable().optional(),
  value_ids: z.array(z.number().int()),
  values: z.array(z.string())
}).strip();

export const OfferingSchema = z.object({
  offering_id: z.number().int().positive().optional(),
  quantity: z.number().int().nonnegative(),
  is_enabled: z.boolean(),
  price: MoneySchema.optional(),
  readiness_state_id: z.number().int().positive().optional()
}).strip();

export const InventorySchema = z.object({
  products: z.array(z.object({
    product_id: z.number().int().positive().optional(),
    sku: z.string().nullable().optional(),
    property_values: z.array(PropertyValueSchema).max(3),
    offerings: z.array(OfferingSchema)
  }).strip())
}).strip();

export const ListingImageSchema = z.object({
  listing_image_id: z.number().int().positive(),
  rank: z.number().int().nonnegative(),
  full_width: z.number().int().positive(),
  full_height: z.number().int().positive(),
  url_fullxfull: z.string().url().optional()
}).strip();

export const ReceiptSchema = z.object({
  receipt_id: z.number().int().positive(),
  status: z.string(),
  created_timestamp: z.number().int().nonnegative(),
  updated_timestamp: z.number().int().nonnegative(),
  grandtotal: MoneySchema,
  transactions: z.array(z.object({
    title: z.string(),
    quantity: z.number().int().positive()
  }).strip())
}).strip();
