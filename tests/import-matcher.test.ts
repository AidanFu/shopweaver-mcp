import { describe, expect, it } from "vitest";
import { matchProductsToImages } from "../src/import/matcher.js";

describe("matchProductsToImages", () => {
  it("matches exact product folder names and sorts supported images", () => {
    const result = matchProductsToImages(
      [{ productName: "产品一", rawChineseDescription: "描述", rowStart: 1, rowEnd: 1 }],
      [
        { id: "folder1", name: "产品一", mimeType: "application/vnd.google-apps.folder" }
      ],
      new Map([["folder1", [
        { id: "img2", name: "02-detail.png", mimeType: "image/png" },
        { id: "img1", name: "01-main.jpg", mimeType: "image/jpeg" },
        { id: "txt", name: "notes.txt", mimeType: "text/plain" }
      ]]])
    );
    expect(result.products[0].images.map(image => image.name)).toEqual(["01-main.jpg", "02-detail.png"]);
    expect(result.products[0].mainImage?.name).toBe("01-main.jpg");
    expect(result.unsupportedFiles).toEqual([{ productName: "产品一", fileName: "notes.txt", mimeType: "text/plain" }]);
  });
});
