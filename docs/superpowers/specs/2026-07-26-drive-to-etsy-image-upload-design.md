# Drive-to-Etsy Image Upload Design

## Purpose

Add an automatic image upload path from the approved Google Drive product image folders to an Etsy draft listing. This completes the first end-to-end product flow after draft creation: Drive product data creates the draft, and matched Drive images populate the draft listing.

## Scope

Included:

- Upload images from an explicitly allowed Google Drive folder to one Etsy draft listing.
- Use the existing product/image matching rules from the Drive import workflow.
- Upload images in filename sort order.
- Treat the first image as rank `1`, making it the main listing image.
- Keep the existing draft-only Etsy safety boundary.
- Require preview and confirmation before uploading images.
- Return uploaded Etsy image IDs, ranks, dimensions, and URLs.

Excluded:

- Publishing or activating listings.
- Deleting or replacing existing Etsy images.
- Bulk draft creation for all products.
- Full Google Drive scanning.
- Permanent local image storage.
- Video upload.
- Variation image mapping.

## Data flow

The upload flow is:

```text
Allowed Google Drive folder
→ Images/<product name>/
→ sorted supported image files
→ in-memory download
→ image type and size validation
→ Etsy draft image upload endpoint
→ Etsy listing image records
```

The tool does not ask Etsy to fetch a Google Drive URL. Etsy's listing image API accepts binary image uploads or an existing Etsy `listing_image_id`, not arbitrary external image URLs. Therefore ShopWeaver must transfer the bytes from Drive to Etsy.

Images are downloaded into memory only for the immediate upload. They are not written permanently to the repository or local disk.

## Tool behavior

Add a Drive-backed image upload workflow with two modes:

- `preview`: validates the target draft and Drive images, then returns the planned upload list and a confirmation token.
- `confirm`: revalidates the target draft and image list, consumes the matching confirmation token, then uploads the images to Etsy.

Inputs:

- Etsy draft `listingId`.
- allowed Drive root `folderId`.
- `productName`.
- optional `maxImages`.

Preview output:

- listing ID
- product name
- image count
- planned uploads with Drive file ID, filename, MIME type, size if available, and rank
- confirmation token
- warning that this writes only to an Etsy draft

Confirm output:

- listing ID
- uploaded image count
- uploaded Etsy image IDs
- ranks
- dimensions when Etsy returns them
- Etsy image URLs when Etsy returns them

## Validation rules

Before any upload:

- The Etsy listing must belong to the connected shop.
- The Etsy listing state must be `draft`.
- The Drive root folder must be in the allowed-folder config.
- The Drive root must contain `Images/<product name>/`.
- Only supported image MIME types are uploaded: PNG, JPEG, GIF, and WebP.
- Images larger than Etsy's existing ShopWeaver 10 MB limit are rejected.
- Images are ranked by filename ascending.
- `maxImages`, when provided, limits the sorted list before preview and confirmation.

If validation fails, the tool returns an error and does not upload any image.

## Safety boundaries

This feature preserves the existing ShopWeaver safety model:

- draft-only Etsy writes
- preview before confirmation
- confirmation token must match the exact planned upload payload
- no publish tools
- no delete tools
- no ads, refunds, shipments, messages, or email
- no Google Drive writes
- no full Drive scanning
- no token output

The first implementation does not overwrite or delete Etsy images. If a draft already has images, the tool still uploads new images at requested ranks; cleanup or replacement behavior must be designed separately.

## Testing

Automated tests should cover:

- preview rejects non-draft listings.
- preview rejects folders outside the allowed Drive config.
- preview finds the matching product image folder.
- unsupported files are ignored or reported consistently with the importer.
- confirmation requires an exact preview token match.
- confirmation uploads sorted images with ranks starting at `1`.
- image bytes are uploaded through Etsy's multipart image parameter.
- full `npm run verify` passes.

## Live test plan

After implementation and verification:

1. Use listing `4544312498`.
2. Use product `郁金香兔-紫色`.
3. Preview upload of the seven matched images.
4. Ask for explicit confirmation.
5. Upload the seven images to the Etsy draft.
6. Read back the draft images to verify count and ranks.
