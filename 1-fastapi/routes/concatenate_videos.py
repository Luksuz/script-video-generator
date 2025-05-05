from fastapi import APIRouter, HTTPException, Request, BackgroundTasks, Depends
from typing import List, Dict, Any, Optional
import logging
import os
import json
import time
import tempfile
import uuid
import asyncio
import shutil
from pydantic import ValidationError, BaseModel

from models import (
    ConcatenateVideosRequest,
    ConcatenateVideosResponse,
    ContentSequenceItem,
    VideoResult,
    ImageResult,
    TaskResponse,
    TaskStatusResponse,
    TaskStatus
)
from utils.video_processing import (
    download_content,
    image_to_video,
    standardize_video,
    concatenate_videos,
    get_video_duration
)

from utils.supabase_storage import supabase_storage
from utils.supabaseDB import supabase_db

router = APIRouter()
logger = logging.getLogger(__name__)

class ConcatenateJobRequest(BaseModel):
    job_id: str

@router.post("/from-job")
async def concatenate_from_job(request: ConcatenateJobRequest, background_tasks: BackgroundTasks):
    """
    Concatenate all content from a specific job.
    
    Args:
        request: The request containing the job ID
        background_tasks: FastAPI background tasks for processing in the background
        
    Returns:
        TaskResponse with job ID and status
    """
    try:
        job_id = request.job_id
        
        # Get the job to verify it exists
        job = await supabase_db.get_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail=f"Job with ID {job_id} not found")
        
        # Get content from the job
        content_items = await supabase_db.get_job_content(job_id)
        print(content_items)
        if not content_items:
            raise HTTPException(status_code=404, detail=f"No content found for job {job_id}")
            
        logger.info(f"Found {len(content_items)} content items for job {job_id}")
        
        # Check current concatenated video status
        current_status = job.get("concatenated_video_status", 0)
        print(current_status)
        if current_status == 2:  # Processing
            return {
                "task_id": job_id,
                "status": TaskStatus.PROCESSING,
                "message": f"Video concatenation is already in progress for job {job_id}"
            }
        elif current_status == 3:  # Completed
            # Check if the video file exists
            video_url = job.get("video_url")
            if video_url and os.path.exists(video_url):
                return {
                    "task_id": job_id,
                    "status": TaskStatus.COMPLETED,
                    "message": f"Video has already been concatenated for job {job_id}",
                    "video_url": f"/api/download/video/{job_id}/{os.path.basename(video_url)}"
                }
        
        # Update concatenated video status to processing
        await supabase_db.update_concatenated_video_status(job_id, 2)  # Processing
        
        # Start processing in the background using FastAPI background tasks
        background_tasks.add_task(
            process_job_concatenation_task,
            job_id,
            content_items,
            background_tasks  # Pass the background_tasks to use for cleanup
        )
        
        return {
            "task_id": job_id,
            "status": TaskStatus.PENDING,
            "message": f"Video concatenation started for job {job_id}"
        }
        
    except Exception as e:
        logger.error(f"Error starting video concatenation: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to start video concatenation: {str(e)}")

async def process_job_concatenation_task(
    job_id: str,
    content_items: List[Dict[str, Any]],
    background_tasks: BackgroundTasks
):
    """
    Process a job-based video concatenation task in the background.
    
    Args:
        job_id: The job ID
        content_items: List of content items from the database
        background_tasks: FastAPI background tasks
    """
    try:
        # Create session ID for this request
        session_id = str(uuid.uuid4())
        temp_dir = os.path.join("temp", session_id)
        os.makedirs(temp_dir, exist_ok=True)
        
        logger.info(f"Starting video concatenation for job {job_id} with {len(content_items)} items")
        
        # Sort content items by timestamp to maintain correct order
        if content_items:
            # Try sorting by created_at timestamp first
            content_items.sort(key=lambda x: x.get('created_at', ''))
            logger.info("Content items sorted by created_at timestamp")
        
        
        # Download and process all content
        processed_files = []
        for i, item in enumerate(content_items):
            content_type = item.get("content_type")
            supabase_url = item.get("supabase_url")
            thumbnail_url = item.get("thumbnail")
            
            # Get the duration for this item (default to 5 seconds if not specified)
            item_duration = float(item.get("duration", 5.0))
            
            logger.info(f"Processing item {i+1}/{len(content_items)}: {content_type} (duration: {item_duration}s)")
            
            try:
                if content_type == "video":
                    # Download the video from Supabase URL
                    input_path = os.path.join(temp_dir, f"input_{i}.mp4")
                    if supabase_url.startswith("http"):
                        await download_content(supabase_url, input_path, is_video=True)
                    else:
                        # If it's a relative path, get the full URL
                        full_url = await supabase_storage.get_public_url(supabase_url)
                        await download_content(full_url, input_path, is_video=True)
                    
                    # Check actual duration of the video
                    actual_duration = await get_video_duration(input_path)
                    
                    # Standardize the video (cut if too long, loop if too short)
                    output_path = os.path.join(temp_dir, f"processed_{i}.mp4")
                    if actual_duration > item_duration:
                        # Video is too long, cut it
                        await standardize_video(input_path, output_path, item_duration, mode="cut")
                    elif actual_duration < item_duration:
                        # Video is too short, loop it
                        await standardize_video(input_path, output_path, item_duration, mode="loop")
                    else:
                        # Duration is already correct, just copy
                        await standardize_video(input_path, output_path, item_duration)
                    
                    # Add to processed files
                    processed_files.append(output_path)
                    
                elif content_type in ["image", "ai_image"]:
                    # Download the image
                    input_path = os.path.join(temp_dir, f"input_{i}.jpg")
                    if supabase_url.startswith("http"):
                        await download_content(supabase_url, input_path, is_video=False)
                    else:
                        # If it's a relative path, get the full URL
                        full_url = await supabase_storage.get_public_url(supabase_url)
                        await download_content(full_url, input_path, is_video=False)
                    
                    logger.info(f"Converting image to video with duration {item_duration}s: {input_path}")
                    # Convert image to video with the specified duration
                    output_path = os.path.join(temp_dir, f"processed_{i}.mp4")
                    await image_to_video(input_path, output_path, item_duration)
                    
                    # Verify the created video has the correct duration
                    actual_duration = await get_video_duration(output_path)
                    logger.info(f"Created video from image: duration={actual_duration}s, target={item_duration}s")
                    
                    # Add to processed files
                    processed_files.append(output_path)
                
            except Exception as e:
                logger.error(f"Error processing item {i}: {str(e)}")
                # Continue with next item
                continue
                
        if not processed_files:
            raise ValueError("No valid content to concatenate")
            
        # Create the final output path
        output_filename = f"job_{job_id}_{int(time.time())}.mp4"
        output_path = os.path.join(temp_dir, output_filename)
        
        # Concatenate all processed files
        await concatenate_videos(processed_files, output_path)
        
        # Get the duration of the final video
        video_duration = await get_video_duration(output_path)
        
        # Create permanent storage path in /temp directory
        permanent_dir = os.path.join("temp", "concatenated")
        os.makedirs(permanent_dir, exist_ok=True)
        permanent_path = os.path.join(permanent_dir, output_filename)
        
        # Copy the file to the permanent location
        shutil.copy2(output_path, permanent_path)
        logger.info(f"Final video saved to: {permanent_path}")
        
        # Get absolute path for storage in the database
        absolute_path = os.path.abspath(permanent_path)
        
        # Store the local path in Supabase instead of uploading the file
        video_url = f"/api/download/video/{job_id}/{output_filename}"
        await supabase_db.update_job_video_url(job_id, absolute_path)
        
        # Update concatenated video status to completed
        await supabase_db.update_concatenated_video_status(job_id, 3)  # Completed
        
        # Schedule cleanup after 1 hour using background_tasks
        background_tasks.add_task(
            cleanup_temp_files,
            temp_dir,
            processed_files,
            output_path
        )
        
        logger.info(f"Video concatenation completed for job {job_id}")
        
    except Exception as e:
        logger.error(f"Error in video concatenation task for job {job_id}: {str(e)}")
        # Update concatenated video status to failed
        await supabase_db.update_concatenated_video_status(job_id, 4)  # Failed

async def cleanup_temp_files(temp_dir: str, processed_files: List[str], output_path: str):
    """
    Clean up temporary files after a delay.
    
    We keep the output file but remove intermediate files to save space.
    
    Args:
        temp_dir: Temporary directory
        processed_files: List of processed files
        output_path: Path to the final output file
    """
    try:
        # Wait a while before cleaning up (to ensure file is fully served)
        # We can still use asyncio.sleep even in a background task
        await asyncio.sleep(3600)  # 1 hour
        
        # Delete processed files but keep the final output
        for file_path in processed_files:
            if os.path.exists(file_path) and file_path != output_path:
                os.unlink(file_path)
                
        logger.info(f"Cleaned up temporary files in {temp_dir}")
        
    except Exception as e:
        logger.error(f"Error cleaning up temporary files: {str(e)}")

@router.get("/status/{job_id}")
async def get_concatenation_status(job_id: str):
    """
    Get the status of video concatenation for a job.
    
    Args:
        job_id: The job ID
        
    Returns:
        Status information for the concatenation process
    """
    try:
        # Get the job
        job = await supabase_db.get_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail=f"Job with ID {job_id} not found")
        
        # Get content items to determine total segments
        content_items = await supabase_db.get_job_content(job_id)
        total_segments = len(content_items)
        
        # Get segment progress information
        video_segments_completed = job.get("video_segments_completed", 0)
        processed_segment_count = job.get("processed_segment_count", 0)
        concatenated_video_status = job.get("concatenated_video_status", 0)
        
        # Map status code to user-friendly status
        status_map = {
            0: "not_started",
            1: "pending",
            2: "processing",
            3: "completed",
            4: "failed"
        }
        
        # Prepare response
        response = {
            "job_id": job_id,
            "videoSegmentsCompleted": video_segments_completed,
            "totalSegments": total_segments,
            "processedSegments": processed_segment_count,
            "segmentsProgress": f"{processed_segment_count}/{total_segments}",
            "concatenationStatus": status_map.get(concatenated_video_status, "unknown")
        }
        
        # If completed, include video URL
        if concatenated_video_status == 3 and job.get("video_url"):
            video_path = job.get("video_url")
            if os.path.exists(video_path):
                response["videoUrl"] = f"/api/download/video/{job_id}/{os.path.basename(video_path)}"
                response["videoExists"] = True
            else:
                response["videoExists"] = False
        
        return response
        
    except Exception as e:
        logger.error(f"Error getting concatenation status for job {job_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get concatenation status: {str(e)}") 