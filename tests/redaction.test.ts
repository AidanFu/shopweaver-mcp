import { describe, expect, it } from "vitest";
import { redact, registerSecret } from "../src/redaction.js";

describe("redact", () => {
  it("redacts sensitive keys recursively", () => {
    expect(redact({ access_token: "a", nested: { email: "x@y.test", authorization: "Bearer z" } }))
      .toEqual({ access_token: "[REDACTED]", nested: { email: "[REDACTED]", authorization: "[REDACTED]" } });
  });

  it("redacts registered secret substrings", () => {
    registerSecret("hidden-value");
    expect(redact("failure for hidden-value")).toBe("failure for [REDACTED]");
  });
});
