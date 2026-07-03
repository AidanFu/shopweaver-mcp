import { describe, expect, it, vi } from "vitest";
import { MemoryCredentialStore } from "../src/credentials/memory.js";
import { ConfirmationStore } from "../src/writes/confirmations.js";
import { DraftWriteService, type DraftCreateInput } from "../src/tools/write-tools.js";

const draft: DraftCreateInput = {
  title: "Oak bowl",
  description: "Handmade bowl",
  quantity: 1,
  price: "25.00",
  whoMade: "i_did",
  whenMade: "2020_2026",
  taxonomyId: 123,
  type: "physical"
};

async function dependencies(state = "draft") {
  const store = new MemoryCredentialStore();
  await store.set("shop", { userId: 1, shopId: 42 });
  const client = { request: vi.fn().mockResolvedValue({ listing_id: 9, title: draft.title, state: "draft", quantity: 1, price: { amount: 2500, divisor: 100, currency_code: "USD" } }) };
  const listings = { getListingState: vi.fn().mockResolvedValue(state) };
  return { store, client, listings, service: new DraftWriteService(client as never, listings as never, store, new ConfirmationStore()) };
}

describe("draft write service", () => {
  it("previews creation without sending a write", async () => {
    const { service, client } = await dependencies();
    const preview = await service.previewCreate(draft);
    expect(preview.operation).toBe("create_draft");
    expect(preview.warning).toContain("will not publish");
    expect(client.request).not.toHaveBeenCalled();
  });

  it("creates only after a matching confirmation", async () => {
    const { service, client } = await dependencies();
    const preview = await service.previewCreate(draft);
    const result = await service.confirmCreate(draft, preview.confirmationToken);
    expect(result.listingId).toBe(9);
    expect(client.request).toHaveBeenCalledOnce();
    expect(client.request.mock.calls[0][1].method).toBe("POST");
    expect(client.request.mock.calls[0][1].body.toString()).not.toContain("active");
  });

  it("rejects updates when the remote state is not draft", async () => {
    const { service, client } = await dependencies("active");
    await expect(service.previewUpdate(9, { title: "New" })).rejects.toMatchObject({ code: "DRAFT_REQUIRED" });
    expect(client.request).not.toHaveBeenCalled();
  });

  it("rechecks state immediately before confirmed update", async () => {
    const { service, listings, client } = await dependencies("draft");
    const preview = await service.previewUpdate(9, { title: "New" });
    listings.getListingState.mockResolvedValueOnce("active");
    await expect(service.confirmUpdate(9, { title: "New" }, preview.confirmationToken)).rejects.toMatchObject({ code: "DRAFT_REQUIRED" });
    expect(listings.getListingState).toHaveBeenCalledTimes(2);
    expect(client.request).not.toHaveBeenCalled();
  });
});
