# Test Assets

This folder is for testing the VANHA Creative Auto-Namer without Google Drive integration.

## How to Use

1. Add your test images and videos to this folder
2. Run the analysis from the web UI using this folder path

## Supported Formats

**Images:** .jpg, .jpeg, .png, .gif, .webp, .bmp
**Videos:** .mp4, .mov, .avi, .webm, .mkv, .m4v

## Expected Asset Dimensions

For proper grouping, use these aspect ratios:

| Placement | Aspect Ratio | Example Size |
|-----------|--------------|--------------|
| Story | 9:16 | 1080×1920 |
| Feed | 4:5 | 1080×1350 |
| Feed | 1:1 | 1080×1080 |
| Carousel | 1:1 | 1080×1080 |

## Generate Test Assets

You can use the included Python script to generate placeholder test assets:

```bash
cd test_assets
python generate_test_assets.py
```

This will create:
- 2 Story+Feed ad pairs (images)
- 1 Story+Feed video pair
- 1 Carousel (6 square images)

## Naming Convention for Testing

While the tool analyzes visual content and OCR, you can use descriptive filenames to help verify grouping:

- `ad1_story_product.jpg` + `ad1_feed_product.jpg` (should group together)
- `carousel_01.jpg` through `carousel_06.jpg` (should form a carousel group)
