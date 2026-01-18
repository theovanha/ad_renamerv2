V1 Build Order

1) Scaffold repo
- backend (FastAPI)
- frontend (React)
- shared types

2) Local test harness
- load local folder of assets
- extract metadata (type, width, height, duration)
- extract video frames (ffmpeg)
- OCR images + frames
- fingerprint assets
- group Story+Feed and carousels
- propose filenames
- export CSV

3) Review UI
- setup screen inputs (client, campaign, start number, date, local folder path for v1)
- review screen with previews + editable tokens + bulk tools
- export button

4) Drive integration (service account)
- parse Drive folder link
- list files
- download to temp
- run same pipeline