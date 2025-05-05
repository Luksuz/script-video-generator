from fastapi import FastAPI
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from typing import List, Dict, Any, Optional, Union
import os
import shutil
from pydantic import BaseModel
import tempfile
import uvicorn
from pathlib import Path
from dotenv import load_dotenv
from utils.supabase_storage import supabase_storage

# Load environment variables
load_dotenv()

app = FastAPI(title="Script Video Generator API")


# Add CORS middleware with more specific settings
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:[0-9]+)?",  # Regex for local development with any port
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "Content-Length"],
    max_age=600,  # Cache preflight requests for 10 minutes
)

# Create necessary directories for local development and testing
def ensure_dirs():
    os.makedirs("temp", exist_ok=True)
    os.makedirs("temp/concatenated", exist_ok=True)
    os.makedirs("images", exist_ok=True)

# Call on startup
@app.on_event("startup")
async def startup_event():
    ensure_dirs()

# Import routers
from routes.videos import router as videos_router
from routes.process_script import router as process_script_router
from routes.concatenate_videos import router as concatenate_videos_router
from routes.regenerate_content import router as regenerate_content_router
from routes.download import router as download_router
from routes.extract_text import router as extract_text_router

# Include routers
app.include_router(videos_router, prefix="/api/videos")
app.include_router(process_script_router, prefix="/api/process-script")
app.include_router(concatenate_videos_router, prefix="/api/concatenate-videos")
app.include_router(regenerate_content_router, prefix="/api/regenerate-content")
app.include_router(download_router, prefix="/api/download")
app.include_router(extract_text_router, prefix="/api/extract-text")

# Mount static folders for serving images and videos directly
app.mount("/images", StaticFiles(directory="images"), name="images")
app.mount("/temp", StaticFiles(directory="temp"), name="temp")

@app.get("/")
async def root():
    return {"message": "Script Video Generator API"}

# Get the Supabase Storage instance for routes
def get_storage():
    return supabase_storage

if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
