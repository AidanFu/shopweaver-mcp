import { describe, expect, it } from "vitest";
import { canonicalHash } from "../src/writes/canonical.js";
import { ConfirmationStore } from "../src/writes/confirmations.js";

describe("write confirmations", () => {
  it("hashes objects independently of key insertion order", () => {
    expect(canonicalHash({ a: 1, b: 2 })).toBe(canonicalHash({ b: 2, a: 1 }));
    expect(canonicalHash({ values: [1, 2] })).not.toBe(canonicalHash({ values: [2, 1] }));
  });

  it("rejects changed payloads and consumes the token", () => {
    const store = new ConfirmationStore(() => 1_000);
    const preview = store.issue("update_draft", 2, { title: "A" }, 7);
    expect(() => store.consume(preview.confirmationToken, "update_draft", 2, { title: "B" }, 7))
      .toThrowError(expect.objectContaining({ code: "PREVIEW_MISMATCH" }));
    expect(() => store.consume(preview.confirmationToken, "update_draft", 2, { title: "A" }, 7))
      .toThrowError(expect.objectContaining({ code: "CONFIRMATION_REQUIRED" }));
  });

  it("expires records after ten minutes", () => {
    let now = 1_000;
    const store = new ConfirmationStore(() => now);
    const preview = store.issue("create_draft", 2, { title: "A" });
    now += 600_001;
    expect(() => store.consume(preview.confirmationToken, "create_draft", 2, { title: "A" }))
      .toThrowError(expect.objectContaining({ code: "CONFIRMATION_EXPIRED" }));
  });
});
