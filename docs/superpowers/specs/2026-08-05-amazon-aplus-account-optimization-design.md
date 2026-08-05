# Amazon A+ Account Optimization Design

## Goal

Design and publish new, stronger A+ Content for all active Amazon towel-rack listings across the Momokids and Senplus brands, using the existing ShopWeaver Amazon algorithm and the local image set in `/Users/lf595r/Downloads/towel-rack-new`.

## Scope

- Read active Amazon listings and group them by ASIN and published A+ content document.
- Keep Momokids and Senplus A+ content as separate brand systems.
- Create new A+ documents for product families and publish them to the related ASINs, replacing the old A+ assignment through Amazon's A+ relation workflow.
- Preserve all ASIN relations when updating shared A+ documents.
- Use local product-family images only when the image folder safely matches the shared A+ document.
- Validate every A+ document with Amazon before update or approval submission.
- Submit validated A+ updates for Amazon review only after the update payload is known.

## Out Of Scope

- Campaign budget, bid, keyword, negative keyword, or campaign state changes.
- Listing title, bullet, description, price, inventory, or image changes.
- Brand Store publishing.
- Editing the old A+ document content directly, unless a later rollback or emergency correction needs it.

## Current Findings

The US marketplace has 34 active buyable SKUs and 33 unique ASINs. Ten active ASINs currently have published A+ records, represented by five English A+ content documents:

- `momokids 3 vertical round`
- `momokids 4 vertical round regular`
- `momokids 2 vertical round`
- `momokids 4 vertical round luxury new`
- `momokids 4 vertical square`

Several documents are shared across finish variations. Publishing a new content document to a shared family should preserve the complete intended ASIN family and avoid single-finish-only claims.

## Design Rules

1. **Brand correctness**
   - Momokids content uses warmer household-oriented copy.
   - Senplus content uses cleaner utility-oriented copy.
   - Shared catalog facts stay identical across brands.

2. **Product-family correctness**
   - Derive rail count, orientation, shape, finish set, and dimensions from the A+ document relation titles and local folder names.
   - Do not use a single product spec across every A+ document.
   - Do not mention stainless, nickel, brushed nickel, or silver as a finish label when the intended customer-facing finish is polished chrome, matte black, or gold.

3. **Shared-document safety**
   - If one A+ document is attached to black, gold, and polished chrome ASINs, use neutral copy such as "available finish options" or include all attached finishes.
   - Do not replace a shared document with images that show only one finish unless all related ASINs use that finish.
   - Preserve the full related ASIN set when updating relations.

4. **Image use**
   - Use only real product images from `/Users/lf595r/Downloads/towel-rack-new`.
   - Prefer product-family folders:
     - `2-vertical-round-*`
     - `3-vertical-round-*`
     - `4-vertical-round-*`
     - `4-vertical-round-*-luxury`
     - `4-vertical-square-*`
   - Avoid low-resolution, manual/PDF, video, and malformed support files.
   - Upload images through the Amazon Uploads API, then reference returned `uploadDestinationId` values in A+ modules.

5. **Review and live-write sequence**
   - Build optimized A+ document payloads locally.
   - Upload required images.
   - Validate each optimized content document against the full ASIN relation set.
   - Create a new A+ content document.
   - Post the full ASIN relation set to the new document.
   - Submit the new document for Amazon approval.
   - Read back status later; Amazon advises not polling approval status more than once per hour per document.

## American Lifestyle Direction

The new A+ content should feel practical for US households:

- primary bathroom and guest bathroom morning routines
- towels warming after showers, kids' bath time, and cold-weather mornings
- compact apartment, condo, and remodeled bathroom wall spaces
- laundry-room and swimwear drying as secondary use cases
- clear plug-in versus hardwired installation confidence
- timer and auto shut-off as convenience and worry reduction
- finish clarity: polished chrome, matte black, and gold, not nickel or vague silver
- support and warranty reassurance after purchase

## Implementation Notes

The existing code already supports reading publish records, reading content documents, building optimized A+ copy, writing A+ workbooks, and validation. The missing live path is image upload destination creation, image upload, A+ content document creation, ASIN relation posting, and approval submission.

For this step, create replacement A+ documents for the known active product families first, then queue any ASIN that cannot be mapped safely.
