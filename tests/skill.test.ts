import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("ShopWeaver skill", () => {
  it("contains the required trigger and safety workflow", async () => {
    const skill = await readFile(new URL("../skills/shopweaver/SKILL.md", import.meta.url), "utf8");
    expect(skill).toMatch(/^---\nname: shopweaver\ndescription: Use when /);
    for (const required of [
      "etsy_connection_status",
      "Never ask the user to paste credentials",
      "Preview",
      "explicit confirmation",
      "unchanged payload",
      "not a draft",
      "publish, delete, advertise, refund, cancel, ship, message, or email"
    ]) expect(skill).toContain(required);
  });
});
