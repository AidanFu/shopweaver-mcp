# Google Drive Listing Import Design

## Purpose

Add a Google Drive ingestion workflow to ShopWeaver so a seller can import handmade product information and images from an explicitly allowed Drive folder, organize the content into Etsy-ready listing data, and later create Etsy draft listings with matched images.

The workflow is intentionally staged. Version one proves Drive access, folder authorization, spreadsheet parsing, image matching, enriched workbook generation, and one-product-at-a-time Etsy draft preview. Etsy writes remain draft-only and require explicit confirmation.

## Scope

Version one includes:

- Google Drive OAuth connection.
- User-managed allowed Google Drive folders.
- Import from an allowed folder containing `Product Information.xlsx` and `Images/`.
- Excel parsing using column A product names and column C description blocks.
- Exact product-name matching between Excel rows and image subfolders.
- Supported image discovery and filename-order ranking.
- Creation or update of `Product Information - Etsy Draft.xlsx`.
- Codex-assisted translation and enrichment as a separate workflow step.
- Etsy draft preview from one selected enriched row.
- Etsy draft creation and image upload only after explicit confirmation.

Version one excludes:

- Scanning the full Google Drive.
- Browser folder picker UI.
- Automatic batch creation of Etsy drafts.
- Publishing Etsy listings.
- Deleting Drive files or Etsy listings.
- Uploading Etsy digital download files.
- Adding OpenAI API credentials to ShopWeaver.

## Folder organization

The expected Drive folder structure is:

```text
HandMade/
├── Product Information.xlsx
└── Images/
    ├── Product Name 1/
    │   ├── 01-main.jpg
    │   ├── 02-detail.jpg
    │   └── ...
    └── Product Name 2/
        ├── 01-main.jpg
        └── ...
```

Rules:

- `Product Information.xlsx` lives at the top level of the allowed folder.
- `Images` lives at the top level of the same allowed folder.
- Each product has one image subfolder.
- The image subfolder name must exactly match the product name in column A.
- Each product folder contains only supported product images.
- Images are sorted by filename ascending.
- The first sorted image is treated as the main image.
- Supported image formats match existing ShopWeaver support: PNG, JPEG, GIF, and WebP.

## Excel parsing

The first parser uses the user's existing spreadsheet format:

- A non-empty column A cell starts a new product.
- Column C values from that row until before the next non-empty column A cell are concatenated into that product's raw Chinese description.
- Blank column C rows are skipped.
- The parser reports validation errors rather than guessing when structure is ambiguous.

The import report includes:

- product names found in Excel
- image folder names found in Drive
- matched products
- unmatched Excel products
- unused image folders
- unsupported image files
- missing required workbook/folder paths

## Enriched workbook

ShopWeaver creates or updates this file in the same allowed Drive folder:

```text
Product Information - Etsy Draft.xlsx
```

Columns:

```text
Product Name
Raw Chinese Description
English Title
English Description
Short Summary
Tags
Materials
Quantity
Price
Taxonomy ID
Taxonomy Path
Who Made
When Made
Type
Readiness State ID
Image Folder
Image Count
Validation Status
Validation Notes
```

Behavior:

- First import fills product name, raw Chinese description, image folder, image count, and validation notes.
- Codex performs Chinese-to-English translation and Etsy listing enrichment interactively.
- ShopWeaver writes enriched rows back to Drive only after confirmation.
- If the enriched workbook already exists, ShopWeaver preserves user-edited fields where possible and refreshes import-derived fields.
- Physical products are the only supported listing type for this Drive workflow.

## Google Drive access model

Google Drive support uses a privacy-preserving allowed-folder model:

1. The user connects Google Drive through OAuth.
2. The user adds allowed folders by Drive folder URL or folder ID.
3. ShopWeaver validates the folder and records non-secret metadata.
4. Import tools read only folders in the allowed-folder list.
5. Users can list and remove allowed folders.

Browser picker UI is deferred. URL or folder ID entry is sufficient for version one.

Google OAuth tokens are stored in macOS Keychain. Allowed folder metadata is stored in local ignored config, with a repo-committed example config for documentation.

The recommended config split is:

- `config.example.json` in the repository.
- real config outside Git or in ignored `config.local.json`.
- Google OAuth tokens in Keychain.

Example config:

```json
{
  "googleDrive": {
    "allowedFolders": [
      {
        "id": "your-google-drive-folder-id",
        "name": "HandMade"
      }
    ]
  }
}
```

## MCP tools

New tools:

- `google_drive_connection_status`: report Google Drive connection state without returning tokens.
- `google_drive_connect`: start Google OAuth setup.
- `google_drive_add_allowed_folder`: validate and add one folder by URL or ID.
- `google_drive_list_allowed_folders`: list configured allowed folders.
- `google_drive_remove_allowed_folder`: remove one folder from the allowed list.
- `shopweaver_import_drive_folder`: parse the workbook and image folders, then return structured product records and validation notes.
- `shopweaver_write_enriched_workbook`: create or update `Product Information - Etsy Draft.xlsx` after confirmation.
- `shopweaver_preview_etsy_draft_from_enriched_row`: validate one selected enriched row and produce an Etsy draft preview.

Existing Etsy tools remain responsible for confirmed draft creation and image upload.

## Etsy draft workflow

The first Etsy workflow operates one selected product at a time:

1. Import and validate Drive folder contents.
2. Generate or update the enriched workbook.
3. User reviews or edits the enriched row.
4. Preview an Etsy draft from one enriched row.
5. Confirm draft creation explicitly.
6. Create an Etsy draft only.
7. Preview image uploads.
8. Confirm image upload explicitly.
9. Upload all matched images sorted by filename.
10. Stop without publishing.

Required enriched fields before draft creation:

- English title
- English description
- quantity
- price
- taxonomy ID
- who made
- when made
- type = `physical`
- readiness state ID or equivalent Etsy-required processing value
- matched images

If required data is missing, the preview reports validation notes and does not write to Etsy.

## Safety and privacy

- ShopWeaver never scans the full Google Drive.
- Drive imports are limited to explicitly allowed folders.
- Google tokens and Etsy tokens are never printed or returned by MCP tools.
- Allowed folder IDs and names are not treated as secrets, but real local config is ignored by Git.
- Downloaded Drive files are temporary unless needed for immediate Etsy upload.
- Enriched workbook writes require confirmation.
- Etsy writes require preview and confirmation.
- Etsy tools remain draft-only.
- There are no tools for publish, delete, ads, refunds, shipments, messages, or email.
- Logs and errors must not include Google tokens, Etsy tokens, customer data, or downloaded file contents.

## Testing strategy

Automated tests use mocked Google Drive and mocked Etsy responses. They cover:

- Google OAuth token storage boundaries.
- allowed-folder add/list/remove behavior.
- folder URL and folder ID parsing.
- refusal to import non-allowed folders.
- workbook parsing from column A and column C.
- image folder exact-name matching.
- image ordering by filename.
- unsupported image validation.
- enriched workbook creation and preservation of edited fields.
- Etsy draft preview validation from enriched rows.
- confirmation gates before Drive writes and Etsy writes.
- no broad Drive listing calls outside allowed folders.

Live verification proceeds in stages:

1. Connect Google Drive.
2. Add the `HandMade` folder by URL or ID.
3. Import raw product records.
4. Confirm matched Excel products and image folders.
5. Write `Product Information - Etsy Draft.xlsx`.
6. Preview one Etsy draft from one enriched row.
7. Create one confirmed Etsy draft and upload images only after explicit confirmation.

## Open implementation notes

- The current Etsy inventory schema should be patched to accept `readiness_state_id: null` before relying on full listing readback for digital or incomplete drafts.
- The Drive feature should not add OpenAI API credentials. Codex handles translation and enrichment interactively.
- Batch Etsy draft creation should wait until one-product-at-a-time flow is verified.
