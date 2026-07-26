# Amazon Listing Workflow

This document covers the Amazon work currently inside ShopWeaver MCP.

## Current Scope

The Amazon workflow is a planning workflow only. It reads the existing approved Google Drive product folder structure and writes an Amazon-ready workbook:

```text
Product Information - Amazon Listing.xlsx
```

The workbook is meant for review before any future Amazon submission work. It includes listing copy, image optimization notes, A+ Content planning fields, advertising seed ideas, category suggestions, and validation flags.

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

## Tool

```text
shopweaver_write_amazon_listing_workbook
```

Run preview mode first. Confirm mode writes only the workbook back to the allowed Google Drive folder.

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

## Safety Boundary

The current Amazon workflow does not:

- Store Amazon credentials
- Call Amazon SP-API
- Submit listings
- Upload Amazon images
- Submit A+ Content
- Create or modify ads
- Change bids, budgets, keywords, or targeting
- Access orders, shipments, refunds, customer messages, or buyer data

Future Amazon API work should be designed as a separate phase with read-only checks, Product Type Definitions validation, local preview, and explicit approval before every write.

## Category Flexibility

The first catalog is handmade crochet products, but the workflow is not limited to handmade. Category inference is intentionally conservative. When product type or category confidence is uncertain, rows are marked:

```text
Validation Status: needs_review
Validation Notes: Review Amazon category/product type before submission.
```

This keeps future categories such as home goods, pet products, accessories, kitchen items, or other retail products inside the same workbook model without silently guessing Amazon submission fields.

## Not In Scope

TikTok integration is not part of the current repository scope. It can be handled later as a separate integration phase.
