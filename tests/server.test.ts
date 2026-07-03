import { describe, expect, it } from "vitest";
import { createServer } from "../src/server.js";

describe("createServer", () => {
  it("identifies the server without connecting to Etsy", () => {
    const server = createServer({} as never);
    expect(server).toBeDefined();
  });
});
