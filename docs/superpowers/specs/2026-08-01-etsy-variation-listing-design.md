# Etsy Variation Listing Design

## Purpose

Add variation-aware Etsy listing preparation and draft creation to ShopWeaver. Many Etsy products should be one listing with selectable options, not one listing per color or style. The workflow must support the current Google Drive structure while allowing a cleaner grouped structure later.

## Scope

Included:

- Infer variation groups from the current flat product-folder names.
- Support an explicit grouped folder structure for future Drive organization.
- Add variation grouping fields to the Etsy enriched workbook.
- Create one Etsy draft for a listing group.
- Upload matched images for the group and variants.
- Replace draft inventory with Etsy variation products, SKUs, prices, quantities, and offerings.
- Keep every Etsy write draft-only, preview-first, and confirmation-gated.

Excluded:

- Publishing listings.
- Deleting listings or images.
- Updating active listings.
- Ads, refunds, shipments, messages, or buyer email.
- Automatic grouping when confidence is low.
- Bulk create without per-listing preview and confirmation.

## Current and future Drive structures

Current supported structure:

```text
HandMade/
├── Product Information
└── Images/
    ├── 郁金香兔-紫色/
    ├── 郁金香兔-蓝色/
    ├── 郁金香兔-黄色/
    └── 郁金香兔-粉色/
```

ShopWeaver infers:

```text
Listing Group: 郁金香兔
Variation 1 Name: Color
Variation 1 Values: Purple, Blue, Yellow, Pink
```

Future preferred structure:

```text
HandMade/
├── Product Information
└── Images/
    └── 郁金香兔/
        ├── Purple/
        ├── Blue/
        ├── Yellow/
        └── Pink/
```

ShopWeaver reads the parent folder as the listing group and child folders as variant image folders.

Both structures remain supported. The workbook becomes the source of truth before Etsy writes, so the user can correct grouping and variation values before creating drafts.

## Grouping rules

Phase one supports conservative inference:

- Product names ending with a known delimiter and color/style suffix can be grouped.
- Examples:
  - `郁金香兔-紫色`
  - `郁金香兔-蓝色`
  - `郁金香兔-黄色`
  - `郁金香兔-粉色`
- The shared prefix becomes `Listing Group`.
- The suffix becomes `Variation 1 Value`.
- Known Chinese color words are translated to English values for Etsy:
  - `紫色` → `Purple`
  - `蓝色` → `Blue`
  - `黄色` → `Yellow`
  - `粉色` / `粉红色` → `Pink`
  - `橙色` → `Orange`
  - `红色` → `Red`
  - `绿色` → `Green`
  - `白色` → `White`
  - `黑色` → `Black`

If inference confidence is low, ShopWeaver does not group silently. It marks the row:

```text
Validation Status: needs_review
Validation Notes: Review listing group and variation values before Etsy draft creation.
```

## Workbook changes

Extend `Product Information - Etsy Draft.xlsx` with variation fields:

```text
Listing Group
Parent Listing Title
Parent Listing Description
Is Variant
Variation 1 Name
Variation 1 Value
Variation 2 Name
Variation 2 Value
SKU
Variant Price
Variant Quantity
Variant Image Folder
Variant Image Count
Variation Validation Status
Variation Validation Notes
```

The existing row-level fields stay in place for single-product listings. For grouped listings:

- parent fields drive draft title and description
- variant rows drive inventory products
- variant image folders drive image upload and optional image mapping
- price and quantity can be shared or variant-specific

## Etsy draft creation flow

The variation-aware flow for one listing group:

1. Import Drive products and images.
2. Generate or update the Etsy workbook with grouping columns.
3. User reviews and edits the grouping.
4. Preview one grouped listing draft.
5. Confirm draft creation.
6. Upload group/variant images to the draft.
7. Preview inventory replacement with variation products.
8. Confirm inventory update on the draft.
9. Stop. Listing remains draft.

The existing low-level `etsy_update_draft_inventory` tool already supports Etsy's inventory shape with up to three property dimensions. The new work is to build correct inventory inputs from the workbook grouping data.

## Inventory model

For color-only listings:

```text
products:
  - sku: tulip-bunny-purple
    propertyValues:
      - propertyName: Color
        values: [Purple]
    offerings:
      - quantity: 1
        enabled: true
        price: 18.99
  - sku: tulip-bunny-blue
    propertyValues:
      - propertyName: Color
        values: [Blue]
    offerings:
      - quantity: 1
        enabled: true
        price: 18.99
priceOnProperty: []
quantityOnProperty: []
skuOnProperty: []
```

If price, quantity, or SKU varies by option, the matching property ID must be included in the corresponding Etsy inventory arrays after the Etsy property IDs are known.

Phase one should generate preview payloads and validation notes. If Etsy requires property IDs/value IDs for a category, the workflow must read or infer them safely before confirmed inventory update.

## Image behavior

Phase one uploads images sorted by filename as today, but grouped by listing:

- Parent/group images can come from the first variant or a parent folder if present.
- Variant-specific images come from each variant folder.
- Rank order starts with the best parent/main image.
- Variant-image association is deferred unless Etsy's required property/value mapping is available.

No image deletion or replacement is included.

## Safety

All existing safety boundaries remain:

- macOS-only local server
- Keychain secrets
- explicitly allowed Google Drive folders only
- draft-only Etsy writes
- preview and exact confirmation token before every write
- no publish
- no delete
- no ads, refunds, shipments, messages, or email
- no active listing updates

## Testing strategy

Automated tests should cover:

- grouping flat names like `郁金香兔-紫色` into one listing group
- reading explicit grouped folder structures
- preserving single-listing products when no safe group is found
- writing new workbook columns
- previewing grouped draft payloads without writing
- building inventory input from grouped workbook rows
- rejecting low-confidence grouping before draft creation
- full `npm run verify`

## First live test

Use current Drive data:

```text
郁金香兔-紫色
郁金香兔-蓝色
郁金香兔-黄色
郁金香兔-粉色
```

Expected result:

```text
One Etsy draft listing group: 郁金香兔
Variation: Color
Values: Purple, Blue, Yellow, Pink
Draft remains unpublished
Images uploaded from the matching variant folders
Inventory preview shows four color products
```
