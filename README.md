# VANHA Creative Auto-Namer

An internal web application that analyzes ad creative assets, groups them intelligently, proposes standardized filenames, and exports a CSV mapping for bulk renaming.

## Features

- **Asset Analysis**: Automatically analyzes images and videos from a local folder
- **Smart Grouping**: Groups Story (9:16) + Feed (4:5/1:1) pairs and detects carousels
- **OCR Text Extraction**: Extracts text from images and video frames
- **Visual Fingerprinting**: Uses perceptual hashing to match visually similar assets
- **Intelligent Inference**: Auto-detects Product, Angle, and Offer from content
- **Confidence Scoring**: Shows confidence levels for each inferred field
- **Review UI**: Interactive interface to review and edit proposed names
- **Bulk Tools**: Find/replace and apply-to-selected for efficient editing
- **CSV Export**: Generates mapping of old_name → new_name

## Filename Schema

```
{AdNumber}_{Campaign}_{Product}_{Format}_{Angle}_{Offer}_{YYYY.MM.DD}
```

| Field | Description |
|-------|-------------|
| AdNumber | 3-digit zero-padded (001, 002, ...) |
| Campaign | User input or month default (JanAds, FebAds, ...) |
| Product | Inferred from OCR, underscores for spaces, NA if unknown |
| Format | IMG / VID / CAR |
| Angle | ProductFocus, Offer, Price, SocialProof, Education, BehindTheScenes, Founder, Brand, Newness |
| Offer | Yes / No |
| Date | YYYY.MM.DD |

## Prerequisites

### System Dependencies

1. **Python 3.10+**
2. **Node.js 18+**
3. **ffmpeg** (for video processing)
   ```bash
   # macOS
   brew install ffmpeg
   
   # Ubuntu/Debian
   sudo apt-get install ffmpeg
   ```

4. **Tesseract OCR** (for text extraction)
   ```bash
   # macOS
   brew install tesseract
   
   # Ubuntu/Debian
   sudo apt-get install tesseract-ocr
   ```

## Setup

### Backend

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run the server
uvicorn app.main:app --reload
```

The API will be available at http://localhost:8000

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev
```

The UI will be available at http://localhost:5173

## Usage

1. **Prepare Assets**: Place your ad creative assets in a local folder
2. **Open the App**: Navigate to http://localhost:5173
3. **Configure**:
   - Enter the folder path
   - Select client
   - Set campaign name (or use month default)
   - Set starting ad number
   - Set date (or use today)
4. **Analyze**: Click "Analyze Assets" to process
5. **Review**: 
   - Review grouped assets and proposed names
   - Edit any inferred fields (Product, Angle, Offer)
   - Use bulk tools for batch changes
   - Groups are sorted by lowest confidence first
6. **Export**: Click "Export CSV" to download the mapping

## Testing with Sample Assets

Generate test assets without needing real ad creatives:

```bash
cd test_assets
python generate_test_assets.py
```

Then use the `test_assets` folder path in the app.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/config` | Get default configuration |
| POST | `/api/analyze` | Analyze assets in a folder |
| GET | `/api/groups` | Get current grouped assets |
| PUT | `/api/groups/{id}` | Update a group's fields |
| POST | `/api/bulk/replace` | Find/replace across all groups |
| POST | `/api/bulk/apply` | Apply value to selected groups |
| POST | `/api/export` | Download CSV export |
| GET | `/api/export/preview` | Preview export data |

## CSV Output Columns

| Column | Description |
|--------|-------------|
| file_id | Unique identifier (file path for local) |
| old_name | Original filename |
| new_name | Proposed standardized filename |
| group_id | UUID of the ad group |
| group_type | "standard" or "carousel" |
| placement_inferred | "story", "feed", "square", or "unknown" |
| confidence_group | Grouping confidence (0-1) |
| confidence_product | Product inference confidence (0-1) |
| confidence_angle | Angle inference confidence (0-1) |
| confidence_offer | Offer inference confidence (0-1) |

## Project Structure

```
.
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI entry point
│   │   ├── config.py            # Settings
│   │   ├── models/              # Pydantic models
│   │   ├── services/            # Business logic
│   │   │   ├── source/          # Asset sources (local, drive)
│   │   │   ├── metadata.py      # Dimension/duration extraction
│   │   │   ├── frames.py        # Video frame extraction
│   │   │   ├── ocr.py           # Text extraction
│   │   │   ├── fingerprint.py   # Perceptual hashing
│   │   │   ├── grouper.py       # Asset grouping
│   │   │   ├── inference.py     # Field inference
│   │   │   ├── namer.py         # Filename generation
│   │   │   └── exporter.py      # CSV export
│   │   └── routers/             # API routes
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/               # SetupPage, ReviewPage
│   │   ├── components/          # GroupCard, EditableField, BulkToolbar
│   │   ├── api/                 # API client
│   │   └── types/               # TypeScript types
│   └── package.json
├── test_assets/                 # Test asset folder + generator
└── README.md
```

## Future Enhancements (V2)

- [ ] Google Drive integration via service account
- [ ] Actual file renaming in Drive (not just CSV export)
- [ ] Client-specific product lists
- [ ] Asset preview thumbnails
- [ ] Undo/redo for edits
- [ ] Save/load session state
