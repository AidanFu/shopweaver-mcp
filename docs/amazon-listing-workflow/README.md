# Amazon Listing Workflow

This document covers the Amazon listing workbook workflow and the separate Amazon Ads optimization workflow currently inside ShopWeaver MCP.

## Current Scope

The Amazon listing workflow is a planning workflow only. It reads the existing approved Google Drive product folder structure and writes an Amazon-ready workbook:

```text
Product Information - Amazon Listing.xlsx
```

The workbook is meant for review before any future Amazon listing submission work. It includes listing copy, image optimization notes, A+ Content planning fields, advertising seed ideas, category suggestions, validation flags, daily/weekly metric input sheets, and review-only optimization recommendations.

Amazon Ads is a separate workflow. It supports read-only Sponsored Products reporting, SKU-level campaign analysis, and selected campaign controls behind preview/confirmation gates.

## What It Uses

Input comes from the same Google Drive workflow used by the Etsy import:

```text
HandMade/
├── Product Information.xlsx
└── Images/
    └── Product Name/
        ├── 01-main.jpg
        ├── 02-detail.jpg
        └── ...
```

The workflow reuses `shopweaver_import_drive_folder` to find product rows and matched image folders. It then generates Amazon planning rows with category/product-type suggestions.

## Tools

```text
shopweaver_write_amazon_listing_workbook
shopweaver_refresh_amazon_optimization_recommendations
amazon_ads_run_sku_budget_update_preview
amazon_ads_update_campaign_budgets
amazon_ads_update_campaign_bidding
amazon_ads_update_campaign_states
amazon_ads_update_keyword_bids
amazon_ads_update_ad_group_bids
amazon_ads_create_negative_keywords_from_review
amazon_ads_create_campaigns
```

Run preview mode first. Confirm mode writes only the workbook back to the allowed Google Drive folder for workbook tools, or applies the exact reviewed Amazon Ads payload for Ads tools.

`shopweaver_write_amazon_listing_workbook` generates or replaces the Amazon planning workbook from the approved Google Drive product folder.

`shopweaver_refresh_amazon_optimization_recommendations` reads pasted metrics from the existing Amazon workbook, refreshes only the `Optimization Recommendations` sheet, and uploads the same workbook back to Drive.

`amazon_ads_run_sku_budget_update_preview` runs the read-only SKU optimization cycle and returns a confirmation token for exact budget updates recommended by the optimizer. Confirming still happens through `amazon_ads_update_campaign_budgets` with the unchanged campaigns payload and returned token.

## Workbook Contents

The generated workbook includes:

- Amazon product type and category path suggestions
- Category confidence and review flags
- SKU planning fields
- Amazon title, five bullets, description, and backend search terms
- Target customer and use cases
- Main image, lifestyle image, infographic, and size image notes
- A+ Content module planning copy
- Ad keyword seeds, negative keyword seeds, and campaign structure notes
- Suggested price, package, inventory, compliance, and validation fields
- Daily optimization input rows for traffic, CTR, CPC, spend, orders, sales, conversion, search terms, and listing issues
- Weekly optimization review rows for ACOS, TACOS, spend, sales, keyword winners, negative keyword candidates, and category conversion notes
- Optimization recommendations generated from the local analysis engine

The workbook sheets are:

```text
Amazon Listings
Daily Optimization Inputs
Weekly Optimization Review
Optimization Recommendations
```

## Workbook Optimization Loop

The optimization loop is workbook-only:

1. Generate the workbook with `shopweaver_write_amazon_listing_workbook`.
2. Review listing copy, category assumptions, image notes, package fields, and compliance notes.
3. After launch, paste daily metrics into `Daily Optimization Inputs`.
4. Paste weekly rollups into `Weekly Optimization Review`.
5. Run `shopweaver_refresh_amazon_optimization_recommendations` in preview mode.
6. Confirm refresh only after checking the target folder.
7. Review `Optimization Recommendations`.

The local recommendation engine currently flags:

- traffic and spend without orders as listing review before bid increases
- efficient converting terms as manual exact/phrase campaign review candidates
- high ACOS with weak category conversion as category and campaign review
- acceptable ACOS/conversion as keep-learning with keyword winner and negative keyword review

Every workbook recommendation remains a review artifact and is marked as seller-approval-required. It does not change Amazon.

## Amazon Ads Optimization Loop

The Ads loop is API-backed but still gated:

1. Create or poll Sponsored Products reports.
2. Run SKU-level analysis with balanced sales-growth and budget-efficiency recommendations.
3. Review the compact summary or budget-preview payload.
4. Use `amazon_ads_run_sku_budget_update_preview` to create a server-side preview token for recommended budget changes.
5. Confirm only after reviewing the exact campaigns payload.
6. Compare later reports against the local change log before making more changes.

No Ads write is automatic. Budget, bid, campaign, keyword, negative-keyword, and campaign-creation changes require an explicit confirmation token.

## Safety Boundary

The current Amazon listing workflow does not:

- Store Amazon credentials
- Call Amazon SP-API
- Submit listings
- Upload Amazon images
- Submit A+ Content
- Apply optimization recommendations automatically
- Access orders, shipments, refunds, customer messages, or buyer data

The Amazon Ads workflow can read Ads reports and can preview/confirm selected campaign, bid, budget, keyword, negative-keyword, and campaign-creation changes. It must not apply any Ads write without an unchanged preview payload and explicit confirmation token.

Future Amazon listing API work should be designed as a separate phase with read-only checks, Product Type Definitions validation, local preview, and explicit approval before every write.

## Category Flexibility

The first catalog is handmade crochet products, but the workflow is not limited to handmade. Category inference is intentionally conservative. When product type or category confidence is uncertain, rows are marked:

```text
Validation Status: needs_review
Validation Notes: Review Amazon category/product type before submission.
```

This keeps future categories such as home goods, pet products, accessories, kitchen items, or other retail products inside the same workbook model without silently guessing Amazon submission fields.

## Not In Scope

TikTok integration is not part of the current repository scope. It can be handled later as a separate integration phase.
