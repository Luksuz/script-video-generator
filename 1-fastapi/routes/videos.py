from fastapi import APIRouter, HTTPException, Path, Depends
from fastapi.responses import StreamingResponse, RedirectResponse
import os
from typing import BinaryIO
import logging
import stat
import requests
from urllib.parse import urlparse
from utils.supabase_storage import supabase_storage


router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/{session_id}/{filename}")
async def get_video(session_id: str = Path(...), filename: str = Path(...)):
    """
    Stream a video file from Supabase storage or local temp directory.
    
    Args:
        session_id: The session ID
        filename: The filename
        storage: Supabase storage instance
        
    Returns:
        Streaming or redirect response of the video
    """
    try:
        # First try to get from Supabase storage
        file_path = f"videos/{session_id}/{filename}"
        try:
            # Get the file URL from Supabase
            file_url = supabase_storage.get_file_url(file_path)
            if file_url:
                # Return a redirect to the Supabase URL
                return RedirectResponse(url=file_url)
        except Exception as e:
            logger.warning(f"Could not retrieve from Supabase, falling back to local: {str(e)}")
            
        # Fallback to local file if Supabase fails
        local_file_path = os.path.join("temp", session_id, filename)
        
        if not os.path.exists(local_file_path):
            raise HTTPException(status_code=404, detail="File not found in Supabase or local storage")

        # Check file permissions
        if not os.access(local_file_path, os.R_OK):
            raise HTTPException(status_code=403, detail="Permission denied")
            
        # Get file size
        file_stats = os.stat(local_file_path)
        file_size = file_stats.st_size
        
        # Define a generator function to stream the file
        def iterfile(file_path: str, chunk_size: int = 1024 * 1024):
            with open(file_path, 'rb') as f:
                while chunk := f.read(chunk_size):
                    yield chunk
        
        # Create a streaming response
        return StreamingResponse(
            iterfile(local_file_path),
            media_type="video/mp4",
            headers={
                "Content-Length": str(file_size),
                "Accept-Ranges": "bytes"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error serving video: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to serve video: {str(e)}") 