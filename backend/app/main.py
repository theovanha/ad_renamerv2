"""FastAPI application entry point."""

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from app.routers import pipeline, export, auth
from app.config import settings

app = FastAPI(
    title="VANHA Creative Auto-Namer",
    description="Analyze ad assets, group them, and generate standardized filenames",
    version="1.0.0",
)

# CORS middleware for frontend - allow configured origins plus localhost for dev
allowed_origins = [
    "http://localhost:5173",
    "http://localhost:3000",
]
# Add production frontend URL from environment variable
frontend_url = os.getenv("FRONTEND_URL")
if frontend_url:
    allowed_origins.append(frontend_url)
    # Also allow without trailing slash
    allowed_origins.append(frontend_url.rstrip("/"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure temp directory exists
settings.temp_dir.mkdir(parents=True, exist_ok=True)

# Mount temp directory for serving thumbnails/frames
app.mount("/temp", StaticFiles(directory=str(settings.temp_dir)), name="temp")

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(pipeline.router, prefix="/api", tags=["pipeline"])
app.include_router(export.router, prefix="/api", tags=["export"])


@app.get("/")
async def root():
    """Health check endpoint."""
    return {"status": "ok", "app": "VANHA Creative Auto-Namer"}


@app.get("/api/config")
async def get_config():
    """Get application configuration defaults."""
    from app.config import ANGLE_OPTIONS, CLIENT_OPTIONS
    
    return {
        "default_campaign": "",  # Blank by default
        "default_date": settings.get_default_date(),
        "default_start_number": settings.default_start_number,
        "angle_options": ANGLE_OPTIONS,
        "client_options": CLIENT_OPTIONS,
    }
