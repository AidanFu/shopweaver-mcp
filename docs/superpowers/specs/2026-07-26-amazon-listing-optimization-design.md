# Amazon Listing Optimization Design

## Purpose

Add an Amazon-focused optimization workflow that turns product source data and images into Amazon-ready listing, image, A+ Content, and advertising planning assets. The first phase writes a workbook only. It does not submit listings, edit Amazon catalog data, create ads, or change budgets.

Amazon is broader than the current handmade Etsy workflow. The design must support handmade crochet products now, while remaining category-flexible for future products such as home goods, pet products, accessories, kitchen items, or other retail categories.

## Scope

Phase 1 includes:

- Read products and matched images from the existing approved Google Drive folder workflow.
- Generate or update `Product Information - Amazon Listing.xlsx`.
- Produce Amazon-specific listing copy:
  - product title
  - five bullet points
  - product description
  - backend search terms
  - target customer
  - use cases
- Produce image optimization notes:
  - main image guidance
  - lifestyle image guidance
  - infographic/callout image guidance
  - size/dimensions image guidance
  - A+ image/module ideas
- Produce A+ Content planning copy:
  - module headlines
  - module body copy
  - brand/story notes when applicable
- Produce ad planning seed data:
  - launch keyword seeds
  - negative keyword seeds
  - campaign structure recommendation
  - budget/bid notes for review
- Preserve category/product-type uncertainty with review flags instead of guessing silently.

Phase 1 excludes:

- Amazon SP-API authorization.
- Amazon listing submission.
- Amazon image upload.
- A+ Content submission.
- Advertising campaign creation.
- Bid, budget, keyword, targeting, or negative keyword writes.
- Order, shipment, refund, customer-message, or buyer-data access.

## Amazon-specific strategy

Amazon listing quality is different from Etsy listing quality:

- Etsy can emphasize handmade story and shop personality.
- Amazon needs buyer-intent clarity, search coverage, category fit, scannable benefits, compliance-safe claims, and ad-conversion readiness.
- Amazon image strategy must be more structured:
  - main image should be product-focused and marketplace-compliant
  - secondary images should explain scale, use case, details, materials, gifting, and benefits
  - A+ modules should reinforce trust and reduce purchase hesitation
- Amazon ads charge per click, so ad automation must begin with conservative planning and manual approval.

## Workbook output

The first Amazon workbook is:

```text
Product Information - Amazon Listing.xlsx
```

Columns:

```text
Product Name
Source Chinese Description
Image Folder
Image Count
Amazon Product Type
Amazon Category Path
Category Confidence
SKU
Parent SKU
Variation Theme
Color
Size
Amazon Title
Bullet 1
Bullet 2
Bullet 3
Bullet 4
Bullet 5
Product Description
Backend Search Terms
Target Customer
Use Cases
Main Image Notes
Lifestyle Image Notes
Infographic Image Notes
Size Image Notes
A+ Module 1 Headline
A+ Module 1 Body
A+ Module 2 Headline
A+ Module 2 Body
A+ Module 3 Headline
A+ Module 3 Body
Ad Keyword Seeds
Negative Keyword Seeds
Suggested Campaign Structure
Suggested Price
Package Weight
Package Dimensions
Inventory
Compliance Notes
Validation Status
Validation Notes
```

The workbook is a planning and review artifact. Any future API submission must read from reviewed workbook rows and validate against Amazon Product Type Definitions first.

## Category-flexible enrichment

Each product receives an `Amazon Product Type` and `Amazon Category Path` suggestion.

For the current handmade crochet catalog, likely starting buckets include:

- keychain / bag charm
- plush toy / amigurumi-style collectible
- desk or shelf decor
- holiday ornament
- wedding gift decor
- graduation gift charm

For future non-handmade categories, enrichment uses the same fields but changes the content strategy:

- product title structure
- bullet point priorities
- attribute/compliance notes
- package/dimension requirements
- image plan
- ad keyword seed strategy

If category confidence is low, the row is marked:

```text
Validation Status: needs_review
Validation Notes: Review Amazon category/product type before submission.
```

## Listing copy rules

Phase 1 copy generation follows these rules:

- Titles are buyer-search oriented and category-aware.
- Titles avoid unsupported claims, competitor trademarks, and excessive keyword stuffing.
- Bullets are benefit-led and scannable.
- Descriptions expand on use cases, materials, care/display notes, gifting, and handmade or product-specific variation when applicable.
- Backend search terms avoid repeated title terms where possible and exclude prohibited or irrelevant claims.
- Current crochet products may mention handmade/crochet where accurate, but the framework does not assume all future products are handmade.

## Image optimization rules

For each product, the workbook includes an image plan rather than editing images directly in Phase 1.

Image notes should identify:

- which current image is best candidate for main image
- whether a white-background main image is needed
- which images support lifestyle/use-case placement
- which image should become a size/dimension graphic
- which product details should become callout graphics
- which A+ modules need new image assets

Phase 1 does not generate edited Amazon images. Image generation/editing can be designed as a separate phase after the workbook proves useful.

## A+ Content planning

A+ Content fields are generated as reusable module copy, not submitted to Amazon.

For brand-eligible products, the workbook can propose:

- brand story headline
- materials/craft module
- use-case module
- giftability module
- product comparison module when variations exist

Rows that are not brand-ready are marked with review notes.

## Advertising planning

Ads planning starts as recommendations only.

Each product row includes:

- ad keyword seeds
- negative keyword seeds
- suggested campaign structure
- budget/bid notes for manual review

The recommended initial campaign structure is:

```text
Auto discovery campaign
Manual exact campaign for high-intent terms
Manual phrase campaign for discovery terms
Product targeting campaign after ASIN/category research
```

No ad campaign, budget, bid, keyword, or negative-keyword change is made in Phase 1.

## Future Amazon API phases

Future phases should be separate specs and plans:

1. Amazon SP-API authentication and read-only checks.
2. Product Type Definitions lookup and local schema validation.
3. Local Amazon listing preview from reviewed workbook rows.
4. Confirmed listing submission through Listings Items API.
5. Listing issue monitoring and remediation suggestions.
6. A+ Content API or manual export workflow.
7. Amazon Ads reporting ingestion.
8. Approval-gated campaign/bid/keyword optimization.

Safety rules for future API phases:

- read-only first
- local preview before write
- explicit confirmation before every write
- no delete by default
- no budget/bid increase without explicit approval
- no customer messages, refunds, shipments, or buyer personal data

## Testing strategy

Automated tests for Phase 1 should cover:

- Google Drive import reuse.
- Amazon workbook columns.
- category-flexible row model.
- generated titles, bullets, descriptions, image notes, A+ notes, and ad seed fields.
- preserving review flags when category confidence is uncertain.
- writing `Product Information - Amazon Listing.xlsx` to the allowed Drive folder.
- full `npm run verify`.

## First live test

Use the existing `HandMade` Drive folder and generate Amazon workbook rows for all imported products.

Expected result:

```text
Product Information - Amazon Listing.xlsx
38 rows
category/product-type suggestions present
listing copy present
image plan present
A+ planning fields present
ad keyword seed fields present
no Amazon API writes
```
