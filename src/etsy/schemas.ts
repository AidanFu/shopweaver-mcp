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
