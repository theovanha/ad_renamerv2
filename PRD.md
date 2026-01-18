Filename schema (V1)
{AdNumber}_{Campaign}_{Product}_{Format}_{Angle}_{Offer}_{YYYY.MM.DD}

Rules
- AdNumber: 3 digits, zero padded, starts from user input (default 1)
- Campaign: user input, if blank default to current month token (JanAds/FebAds/etc)
- Product: inferred, underscores instead of spaces, if unknown use NA
- Format: IMG / VID / CAR
- Angle: ProductFocus, Offer, Price, SocialProof, Education, BehindTheScenes, Founder, Brand, Newness
- Offer: Yes / No
- Date: YYYY.MM.DD (default today)
Placement is implicit (aspect ratio) and NOT in filename.