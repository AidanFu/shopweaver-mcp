import { describe, expect, it } from "vitest";
import { inferEtsyVariationGroups, toEtsyVariationWorkbookRows } from "../src/import/etsy-variations.js";

const products = [
  { productName: "郁金香兔-紫色", rawChineseDescription: "紫色兔子", imageFolderId: "purple-folder", imageFolderName: "郁金香兔-紫色", imageCount: 4, images: [] },
  { productName: "郁金香兔-蓝色", rawChineseDescription: "蓝色兔子", imageFolderId: "blue-folder", imageFolderName: "郁金香兔-蓝色", imageCount: 5, images: [] },
  { productName: "独立挂件", rawChineseDescription: "单独产品", imageFolderId: "solo-folder", imageFolderName: "独立挂件", imageCount: 3, images: [] }
];

describe("Etsy variation grouping", () => {
  it("groups flat Chinese color product names into one Color variation listing", () => {
    const groups = inferEtsyVariationGroups(products);
    expect(groups.find(group => group.listingGroup === "郁金香兔")).toMatchObject({
      listingGroup: "郁金香兔",
      variation1Name: "Color",
      validationStatus: "ready"
    });
    expect(groups.find(group => group.listingGroup === "郁金香兔")?.variants.map(variant => variant.variation1Value)).toEqual(["Purple", "Blue"]);
  });

  it("marks duplicate translated option values for review", () => {
    const groups = inferEtsyVariationGroups([
      { productName: "郁金香兔-粉色", imageFolderId: "pink-folder", imageFolderName: "郁金香兔-粉色", imageCount: 4, images: [] },
      { productName: "郁金香兔-粉红色 ", imageFolderId: "pink-red-folder", imageFolderName: "郁金香兔-粉红色", imageCount: 4, images: [] }
    ]);
    expect(groups.find(group => group.listingGroup === "郁金香兔")).toMatchObject({
      validationStatus: "needs_review",
      validationNotes: "Duplicate variation value: Pink"
    });
  });

  it("keeps products without safe suffix inference as single listings", () => {
    const groups = inferEtsyVariationGroups(products);
    expect(groups.find(group => group.listingGroup === "独立挂件")).toMatchObject({
      listingGroup: "独立挂件",
      validationStatus: "single"
    });
  });

  it("writes workbook rows with explicit grouping fields", () => {
    const rows = toEtsyVariationWorkbookRows(inferEtsyVariationGroups(products));
    expect(rows.find(row => row.productName === "郁金香兔-紫色")).toMatchObject({
      listingGroup: "郁金香兔",
      isVariant: "yes",
      variation1Name: "Color",
      variation1Value: "Purple",
      variantImageFolder: "郁金香兔-紫色",
      variationValidationStatus: "ready"
    });
    expect(rows.find(row => row.productName === "独立挂件")).toMatchObject({
      listingGroup: "独立挂件",
      isVariant: "no",
      variationValidationStatus: "single"
    });
  });
});
