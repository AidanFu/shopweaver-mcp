export function normalizeTowelWarmerFinish(value: string): "Gold" | "Matte Black" | "Polished Chrome" {
  if (/black/i.test(value)) return "Matte Black";
  if (/gold/i.test(value)) return "Gold";
  return "Polished Chrome";
}

export function displayFinishMention(value: string): string {
  if (/polished chrome/i.test(value)) return "Polished Chrome";
  if (/matte black|black/i.test(value)) return "Black";
  if (/gold/i.test(value)) return "Gold";
  if (/silver/i.test(value)) return "Silver";
  if (/chrome/i.test(value)) return "Chrome";
  if (/nickel/i.test(value)) return "Nickel";
  if (/stainless/i.test(value)) return "Stainless";
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
