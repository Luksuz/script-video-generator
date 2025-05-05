from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
import os
import logging
from utils.supabaseDB import supabase_db

router = APIRouter()
logger = logging.getLogger(__name__)

class DownloadRequest(BaseModel):
    file_path: str

@router.post("/")
def download_file(request: DownloadRequest):
    """
    Download a file using explicit path and filename.
    
    Args:
        request: DownloadRequest with file path and filename
        
    Returns:
        FileResponse with the requested file
    """
    return FileResponse(path=request.file_path, filename="concatenated.mp4", media_type='application/octet-stream')

@router.get("/video/{job_id}/{filename}")
async def download_job_video(job_id: str, filename: str):
    """
    Download a concatenated video by job ID and filename.
    
    Args:
        job_id: The job ID
        filename: The video filename
        
    Returns:
        FileResponse with the requested video
    """
    try:
        # Get the job to get the video path
        job = await supabase_db.get_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail=f"Job with ID {job_id} not found")
        
        # Get the absolute file path from the job
        file_path = job.get("video_url")
        if not file_path:
            raise HTTPException(status_code=404, detail=f"No video found for job {job_id}")
        
        # Check if the file exists
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail=f"Video file not found at {file_path}")
        
        # Return the file as a response
        return FileResponse(
            path=file_path,
            filename=filename,
            media_type='video/mp4'
        )
        
    except Exception as e:
        logger.error(f"Error downloading video for job {job_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to download video: {str(e)}")
