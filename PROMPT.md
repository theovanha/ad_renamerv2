You are building an internal web app called “VANHA Creative Auto-Namer”.

Goal
- Given a Google Drive folder link shared to a Google service account, analyse images and videos, group assets into ads, propose standardised filenames, allow review and edits, then export a CSV mapping old_name -> new_name.

Non-negotiables
- Authentication to Drive is via Google service account.
- V1 outputs CSV only (no renaming in Drive yet).
- Each non-carousel ad group must contain exactly 2 assets: Story (9:16) + Feed (4:5 or 1:1). Placement is implicit and NOT in the filename.
- Carousels are 5-10 square cards.
- User inputs: Client (dropdown), Campaign (optional, default to current month: JanAds/FebAds/etc), Starting ad number (optional, default 1), Date (default today).
- Tool infers: Product token, Angle token, Offer Yes/No, and Format (IMG/VID/CAR).
- Product token sits right after Campaign and uses underscores instead of spaces.
- Angle dropdown (universal v1): ProductFocus, Offer, Price, SocialProof, Education, BehindTheScenes, Founder, Brand, Newness.
- Add a review UI to override any element before exporting.
- Add bulk tools: find/replace token values across all rows, apply field value to selected rows.
- Add confidence scores per group and per inferred field. Sort view by lowest confidence first.

Filename schema
{AdNumber}_{Campaign}_{Product}_{Format}_{Angle}_{Offer}_{YYYY.MM.DD}
- AdNumber: 3 digits, zero padded starting at user starting number
- Campaign: input or default
- Product: inferred or NA
- Format: IMG/VID/CAR
- Angle: dropdown
- Offer: Yes/No
- Date: YYYY.MM.DD

CSV columns
file_id, old_name, new_name, group_id, group_type, placement_inferred, confidence_group, confidence_product, confidence_angle, confidence_offer

Implementation requirements
- Use a Python backend (FastAPI preferred).
- Use ffmpeg to extract frames from video (first, last, plus 1 fps).
- Use OCR on images and extracted frames.
- Use perceptual hashing / embeddings + OCR overlap to cluster and match Story+Feed.
- Build a simple frontend (React preferred) with 2 screens:
  1) Setup screen for inputs
  2) Review screen showing grouped previews and editable fields + bulk tools + CSV export button

Deliverables
- Working app runnable locally.
- Clear README with setup steps (Google service account creds, env vars).
- Basic test folder harness (local files) so we can test without Drive.
- Drive integration behind a clean interface so local harness and Drive can share the same pipeline.