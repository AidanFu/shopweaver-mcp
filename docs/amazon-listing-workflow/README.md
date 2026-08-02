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
amazon_ads_run_sku_apply_plan_preview
amazon_ads_run_sku_budget_update_preview
amazon_ads_run_sku_keyword_bid_update_preview
amazon_ads_run_sku_ad_group_bid_update_preview
amazon_ads_run_sku_negative_keywords_preview
amazon_ads_preview_sku_apply_plan_actions
amazon_ads_update_campaign_budgets
amazon_ads_update_campaign_bidding
amazon_ads_update_campaign_states
amazon_ads_update_keyword_bids
amazon_ads_update_ad_group_bids
amazon_ads_create_negative_keywords_from_review
amazon_ads_create_campaigns
amazon_compare_orders_to_ads_sales
```

Run preview mode first. Confirm mode writes only the workbook back to the allowed Google Drive folder for workbook tools, or applies the exact reviewed Amazon Ads payload for Ads tools.

`shopweaver_write_amazon_listing_workbook` generates or replaces the Amazon planning workbook from the approved Google Drive product folder.

`shopweaver_refresh_amazon_optimization_recommendations` reads pasted metrics from the existing Amazon workbook, refreshes only the `Optimization Recommendations` sheet, and uploads the same workbook back to Drive.

`amazon_ads_run_sku_budget_update_preview` runs the read-only SKU optimization cycle and returns a confirmation token for exact budget updates recommended by the optimizer. Confirming still happens through `amazon_ads_update_campaign_budgets` with the unchanged campaigns payload and returned token.

`amazon_ads_run_sku_apply_plan_preview` runs the same read-only SKU optimization cycle and returns a combined review-only plan for conservative campaign pause candidates, budget, bid, and negative-keyword candidates. It does not issue confirmation tokens or change Amazon Ads.

`amazon_ads_preview_sku_apply_plan_actions` converts a reviewed apply plan into separate exact action previews with confirmation tokens for each non-empty action group. It still does not change Amazon Ads; each action must be confirmed through its matching write tool.

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
3. Review the compact summary, `apply-plan`, or a single preview payload.
4. Use the specific preview tool for the approved action type, such as `amazon_ads_run_sku_budget_update_preview` for recommended budget changes.
5. Confirm only after reviewing the exact payload and confirmation token for that action type.
6. Compare later reports against the local change log before making more changes.
7. Pull recent seller orders with item details and compare them with Ads-attributed SKU sales before increasing spend.

The `amazon:ads:sku` CLI supports `--format apply-plan` to show all review-only write candidates together: budget updates, keyword bid updates, ad group bid updates, and negative keywords. The combined plan is not a write command.

The `amazon:orders` CLI supports `--include-items true --target-skus SKU1,SKU2 --ads-report-file /absolute/path.csv` to compare Seller order item sales with Ads-attributed SKU sales. This is read-only and helps avoid cutting budget from SKUs that are selling in Seller Central but not clearly attributed in Ads.

The `amazon_compare_orders_to_ads_sales` MCP tool runs the same read-only seller-order and local Ads report comparison from the normal tool surface.

The comparison also returns `listingOptimizationActions`. These review-only actions translate each SKU signal into the next listing or campaign investigation:

- Ads and Seller sales match: keep monitoring, harvest winning search terms, and avoid unnecessary listing churn.
- Ads shows sales but Seller orders do not: reconcile attribution windows before scaling spend.
- Seller orders exist but Ads attribution is weak: protect the SKU from automatic cuts and inspect unattributed discovery paths.
- Neither Ads nor Seller orders show sales: review title, first image, price, coupon, delivery promise, bullets, and A+ content before adding traffic.

The same comparison result includes a normalized `salesSignals` array. Pass that array directly into existing-listing, A+, or Brand Store workbook tools so listing copy, A+ modules, Store tile order, and campaign decisions use the same Ads-vs-orders evidence.

The Ads SKU optimizer also accepts those signals. In MCP calls, pass `salesSignals` into the SKU preview tools. In CLI usage, pass the order comparison JSON with `npm run amazon:ads:sku -- ... --sales-signals /path/order-comparison.json`; ShopWeaver derives target SKUs with Seller sales, target SKUs without Seller sales, and non-target seller demand from the same normalized signal list.

The same SKU signals can be passed into `amazon_write_brand_store_workbook` as `salesSignals`. Brand Store planning then ranks proven sellers earlier, keeps unattributed sellers visible, and marks no-sale SKUs as diagnostic tiles instead of default hero placements.

The A+ workbook can also carry per-ASIN or per-SKU `salesSignal` data, either attached to each item or passed as top-level `salesSignals`. It adds a `Sales Signal Actions` sheet so weak/no-sale products get stronger benefit, dimension, installation, warranty, and real-use modules before more ad traffic, while proven sellers are protected from unnecessary A+ churn.

Existing listing optimization workbooks can also accept top-level SKU `salesSignals`. The workbook adds listing-specific sales action focus and a `Sales Signal Actions` sheet so title, image, price, bullet, A+, and campaign review decisions use the same Ads-vs-orders signal language.

No Ads write is automatic. Budget, bid, campaign, keyword, negative-keyword, and campaign-creation changes require an explicit confirmation token.

When efficient winner terms are present, the SKU apply plan can include paused `amazon_ads_create_campaigns` candidates. These are review-only exact-campaign ideas with low daily budget defaults; use `amazon_ads_preview_sku_apply_plan_actions` to get a campaign creation confirmation token, then confirm only after reviewing the exact unchanged campaign payload.

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
