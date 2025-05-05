from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends, BackgroundTasks, Query
from typing import Optional, List, Dict, Any
import logging
import os
import json
import time
import asyncio
from pydantic import ValidationError, BaseModel
import tempfile
import uuid
import requests
import random

from models import (
    ProcessScriptRequest,
    VideoResult,
    ImageResult,
    ContentSection,
    ProcessScriptResponse,
    VideoProvider,
    ContentMode,
    TaskResponse,
    TaskStatusResponse,
    TaskStatus
)
from utils.search_helpers import search_pexels_videos, search_pixabay_videos, search_images, download_image
from utils.text_generation import generate_text
from utils.image_generation import generate_ai_image, generate_ai_images_batch
from utils.supabase_storage import supabase_storage
from utils.supabaseDB import supabase_db

router = APIRouter()
logger = logging.getLogger(__name__)

# Average speaking rate in words per minute
WORDS_PER_MINUTE = 120

# Minimum durations for content segments (in seconds)
MIN_SEGMENT_DURATION = 2.0
MIN_VIDEO_DURATION = 3.0
MIN_IMAGE_DURATION = 2.0

class ScriptProcessRequest(BaseModel):
    file_content: str
    mode: ContentMode
    videos_per_minute: Optional[int] = 10
    images_per_minute: Optional[int] = 20
    search_provider: Optional[VideoProvider] = "pexels"
    speaking_rate: Optional[int] = WORDS_PER_MINUTE  # Allow custom speaking rate
    generate_ai_images: Optional[bool] = False
    theme: Optional[str] = ""

class RegenerateContentRequest(BaseModel):
    content_id: str
    job_id: str
    query: str

class RestartJobRequest(BaseModel):
    job_id: str

class MarkSegmentsCompletedRequest(BaseModel):
    job_id: str

# Function to search videos based on provider
async def search_videos(query: str, provider: VideoProvider) -> Dict[str, Any]:
    """Search for videos based on provider."""
    if provider == "pexels":
        return await search_pexels_videos(query)
    elif provider == "pixabay":
        return await search_pixabay_videos(query)
    elif provider == "minimax" or provider == "openai-gpt-image":
        # For now, fall back to Pexels for Minimax and OpenAI GPT Image
        logger.warning(f"{provider} video provider not yet implemented, falling back to Pexels")
        return await search_pexels_videos(query)
    else:
        # Default to Pexels for unknown providers
        logger.warning(f"Unknown video provider: {provider}, falling back to Pexels")
        return await search_pexels_videos(query)

@router.post("/")
async def process_script(
    request: ScriptProcessRequest,
    background_tasks: BackgroundTasks
):
    """
    Process a script and generate content segments based on the specified mode.
    
    Args:
        request: Script processing request
        background_tasks: Background tasks runner
        
    Returns:
        TaskResponse with task ID
    """
    try:
        # Extract request parameters
        file_content = request.file_content
        mode = request.mode
        videos_per_minute = max(1, request.videos_per_minute)  # Ensure > 0
        images_per_minute = max(1, request.images_per_minute)  # Ensure > 0
        search_provider = request.search_provider
        speaking_rate = request.speaking_rate
        generate_ai_images = request.generate_ai_images
        theme = request.theme
        
        # Calculate total word count
        word_count = len([w for w in file_content.split() if w.strip()])
        
        # Calculate total audio duration (total script)
        total_duration_in_seconds = (word_count / speaking_rate) * 60
        
        # Create a job in the database with the total duration
        job = await supabase_db.create_job(
            script_text=file_content,
            mode=mode,
            video_url=None,
            status=1,  # Pending status
            total_duration=total_duration_in_seconds
        )
        
        job_id = job["id"]
        if mode == "videos":
            background_tasks.add_task(
                process_video_content,
                job_id=job_id,
                file_content=file_content,
                videos_per_minute=videos_per_minute,
                search_provider=search_provider,
                speaking_rate=speaking_rate
            )
            
            task_message = f"Video content generation started for script"
            
        elif mode == "images":
            # Handle special case: if provider is google, we'll use AI image generation
            use_ai_images = generate_ai_images or search_provider == "google" or search_provider == "openai-gpt-image"
            actual_provider = "pexels"
            
            if search_provider == "google":
                actual_provider = "pexels"
            elif search_provider == "openai-gpt-image":
                actual_provider = "pexels"
            else:
                actual_provider = search_provider
            
            # Start image processing in the background
            background_tasks.add_task(
                process_image_content,
                job_id=job_id,
                file_content=file_content,
                images_per_minute=images_per_minute,
                search_provider=actual_provider,
                generate_ai_images=use_ai_images,
                provider=search_provider,
                speaking_rate=speaking_rate
            )
            
            task_message = f"Image content generation started for script"
            
        elif mode == "mixed":
            # Start mixed content processing in the background
            background_tasks.add_task(
                process_mixed_content,
                job_id=job_id,
                file_content=file_content,
                videos_per_minute=videos_per_minute,
                images_per_minute=images_per_minute,
                search_provider=search_provider,
                theme=theme,
                generate_ai_images=generate_ai_images,
                speaking_rate=speaking_rate
            )
            
            task_message = f"Mixed content generation started for script"
            
        else:
            # Default to mixed mode if an invalid mode is provided
            background_tasks.add_task(
                process_mixed_content,
                job_id=job_id,
                file_content=file_content,
                videos_per_minute=10,  # Default videos_per_minute
                images_per_minute=20,  # Default images_per_minute
                search_provider="pexels",  # Default search_provider
                theme=theme,
                generate_ai_images=False,  # Not generating AI images by default
                speaking_rate=120  # Default speaking_rate
            )
            
            task_message = f"Mixed content generation started for script"
        
        # Return the task response
        return {
            "task_id": job_id,
            "status": TaskStatus.PENDING,
            "message": task_message
        }
        
    except Exception as e:
        logger.error(f"Error creating job: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to process script: {str(e)}")

@router.get("/task/{task_id}")
async def get_task_status(task_id: str):
    """
    Get the status of a script processing task.
    
    Args:
        task_id: The task ID
        
    Returns:
        TaskStatusResponse with task status and result
    """
    job = await supabase_db.get_job(task_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {task_id} not found")
    
    # Convert job to task status response
    status_map = {
        1: TaskStatus.PENDING,
        2: TaskStatus.PROCESSING,
        3: TaskStatus.COMPLETED,
        4: TaskStatus.FAILED
    }
    
    result = job.get("result", {})
    
    # Include video concatenation info if available
    video_segments_completed = job.get("video_segments_completed", False)
    concatenated_video_status = job.get("concatenated_video_status", 0)
    
    if video_segments_completed:
        result["videoSegmentsCompleted"] = True
        
        # Map concatenated video status to user-friendly status
        concatenation_status_map = {
            0: "not_started",
            1: "pending",
            2: "processing",
            3: "completed",
            4: "failed"
        }
        
        result["concatenatedVideoStatus"] = concatenation_status_map.get(concatenated_video_status, "unknown")
        
        # If concatenation is completed, include the video URL
        if concatenated_video_status == 3 and job.get("video_url"):
            video_path = job.get("video_url")
            result["concatenatedVideoUrl"] = f"/api/download/video/{job['id']}/{os.path.basename(video_path)}"
    
    # Include segment count information for progress tracking
    segment_count = job.get("segment_count", 0)
    processed_segment_count = job.get("processed_segment_count", 0)
    if segment_count and segment_count > 0:
        result["progress"] = {
            "total": segment_count,
            "processed": processed_segment_count,
            "percentage": round((processed_segment_count / segment_count) * 100, 1) if segment_count > 0 else 0
        }
    
    # If this is an AI image job and it's completed, fetch content from created_content table
    if job.get("mode") == "ai_images":
        content_records = await supabase_db.get_job_content(task_id, "ai_image")
        if content_records:
            # Format content records into content sections
            # For AI images, we'll create a single section for each image
            content_sections = []
            for idx, record in enumerate(content_records):
                supabase_url = record.get("supabase_url")
                if supabase_url:
                    ai_image_result = {
                        "url": supabase_url,
                        "width": 1024,
                        "height": 1024,
                        "thumbnail": supabase_url,
                        "isAiGenerated": True
                    }
                    
                    content_section = {
                        "segment": f"Segment {idx+1}",
                        "query": "",
                        "videos": [],
                        "images": [ai_image_result],
                        "aiImages": [ai_image_result],
                        "imageDurations": [5.0],  # Default duration
                        "segmentDuration": 5.0,
                        "index": idx
                    }
                    content_sections.append(content_section)
            
            # Add content sections to result
            result["contentSections"] = content_sections
    
    return TaskStatusResponse(
        task_id=job["id"],
        status=status_map.get(job["status"], TaskStatus.PENDING),
        result=result,
        error=job.get("error")
    )

async def process_video_content(
    job_id: str,
    file_content: str,
    videos_per_minute: int,
    search_provider: str,
    speaking_rate: int = WORDS_PER_MINUTE
):
    """
    Process a script to generate video content.
    
    Args:
        job_id: The job ID
        file_content: The script content
        videos_per_minute: Number of videos per minute
        search_provider: Search provider for videos
        speaking_rate: Words per minute speaking rate (default: 120)
    """
    try:
        # Update job status to processing
        await supabase_db.update_job_status(job_id, 2)
        
        # Handle Minimax provider by falling back to Pexels for now
        actual_provider = search_provider
        if search_provider == "minimax":
            logger.warning("Minimax provider not yet implemented, falling back to Pexels")
            actual_provider = "pexels"
        
        # Process the script to generate content sections with videos
        # This will store individual videos in the created_content table
        content_results = await process_text_content_for_videos_fetching(
            file_content=file_content,
            videos_per_minute=videos_per_minute,
            search_provider=actual_provider,
            job_id=job_id,
            speaking_rate=speaking_rate
        )
        
        # Update job status to completed
        await supabase_db.update_job_status(job_id, 3)  # Completed
        
        # Initialize concatenated video status as pending
        await supabase_db.update_concatenated_video_status(job_id, 1)  # Pending
        
        return content_results
        
    except Exception as e:
        logger.error(f"Error processing video content job {job_id}: {str(e)}")
        # Update job status to failed with error
        await supabase_db.update_job_error(job_id, str(e))
        await supabase_db.update_job_status(job_id, 4)  # Failed
        raise

async def process_image_content(
    job_id: str,
    file_content: str,
    images_per_minute: int,
    search_provider: str,
    generate_ai_images: bool = False,
    provider: str = "pexels",
    speaking_rate: int = WORDS_PER_MINUTE
):
    """
    Process image content fetching or AI image generation.
    
    Args:
        job_id: The job ID
        file_content: The text content to process
        images_per_minute: Number of images per minute
        search_provider: Search provider for images
        generate_ai_images: Whether to generate AI images
        provider: The original provider from the request
        speaking_rate: Words per minute speaking rate
    """
    try:
        if provider == "openai-gpt-image" or provider == "google" or provider == "minimax":
            # Choose appropriate AI provider based on the user selection
            ai_provider = "openai"  # Default
            ai_model = "gpt-image-1"  # Default model
            
            if provider == "google":
                ai_provider = "google"
            elif provider == "minimax":
                ai_provider = "minimax"
            elif provider == "openai-gpt-image":
                ai_provider = "openai"
                ai_model = "gpt-image-1"
                
            content_sections = await process_text_content_for_ai_images_generation(
                file_content=file_content,
                images_per_minute=images_per_minute,
                ai_provider=ai_provider,
                ai_model=ai_model,
                job_id=job_id,
                speaking_rate=speaking_rate
            )
        else:
            # Process text content for image fetching
            content_sections = await process_text_content_for_images_fetching(
                file_content=file_content,
                images_per_minute=images_per_minute,
                search_provider=search_provider,
                job_id=job_id,
                speaking_rate=speaking_rate
            )
        
        # Update job result
        if content_sections:
            # Serialize content sections
            content_sections_data = [section.dict() for section in content_sections]
            
            await supabase_db.update_job_result(job_id, {
                "contentSections": content_sections_data
            })
            
        # Update job status to completed
        await supabase_db.update_job_status(job_id, 3)  # Completed
        
    except Exception as e:
        logger.error(f"Error processing images: {str(e)}")
        # Update job status to failed with error
        await supabase_db.update_job_error(job_id, str(e))
        await supabase_db.update_job_status(job_id, 4)  # Failed

async def process_ai_image_content(
    job_id: str,
    file_content: str,
    images_per_minute: int,
    search_provider: str,
    ai_provider: str,
    speaking_rate: int = WORDS_PER_MINUTE
):
    """
    Process a script to generate AI image content.
    
    Args:
        job_id: The job ID
        file_content: The script content
        images_per_minute: Number of images per minute
        search_provider: The search provider (not used but kept for parameter consistency)
        ai_provider: AI provider for image generation
        speaking_rate: Words per minute speaking rate (default: 120)
    """
    try:
        # Update job status to processing
        await supabase_db.update_job_status(job_id, 2)
        
        # Process the script to generate content sections with AI images
        # This will store individual images in the created_content table
        content_results = await process_text_content_for_ai_images_generation(
            file_content=file_content,
            images_per_minute=images_per_minute,
            ai_provider=ai_provider,
            job_id=job_id,
            speaking_rate=speaking_rate
        )
        
        # Update job status to completed
        await supabase_db.update_job_status(job_id, 3)  # Completed
        
        # Initialize concatenated video status as pending
        await supabase_db.update_concatenated_video_status(job_id, 1)  # Pending
        
    except Exception as e:
        logger.error(f"Error processing AI image content job {job_id}: {str(e)}")
        # Update job status to failed with error
        await supabase_db.update_job_error(job_id, str(e))
        await supabase_db.update_job_status(job_id, 4)  # Failed

async def process_text_content_for_ai_images_generation(
    file_content: str,
    images_per_minute: int,
    ai_provider: str,
    job_id: str,
    speaking_rate: int = WORDS_PER_MINUTE,
    ai_model: str = "dall-e-3"
) -> List[ContentSection]:
    """
    Process text content and generate AI images for each segment.
    
    Args:
        file_content: The text content to process
        images_per_minute: Number of images per minute
        ai_provider: AI provider for image generation
        job_id: The job ID
        speaking_rate: Words per minute speaking rate (default: 120)
        ai_model: Model to use for image generation (default: dall-e-3)
        
    Returns:
        List of content sections
    """
    # Calculate total word count
    word_count = len([w for w in file_content.split() if w.strip()])
    print(f"Word count: {word_count}")
    
    # Calculate total audio duration (total script)
    total_duration_in_seconds = (word_count / speaking_rate) * 60
    
    # Calculate segment duration based on content per minute
    content_per_minute = max(1, images_per_minute)  # Ensure > 0
    print(f"Content per minute: {content_per_minute}")
    
    # Calculate segment duration in seconds with minimum safeguard
    segment_duration_in_seconds = max(MIN_IMAGE_DURATION, 60 / content_per_minute)
    
    # Calculate how many segments we can fit
    total_segments = max(1, int(total_duration_in_seconds / segment_duration_in_seconds))
 
    # Initialize segment count in the database
    await supabase_db.update_segment_count(job_id, total_segments)
    # Initialize processed segment count to 0
    await supabase_db.update_processed_segment_count(job_id, 0)
    
    # Split script into words for segmentation
    words = [w for w in file_content.split() if w.strip()]
    
    # Calculate words per segment based on speaking rate and segment duration
    words_per_segment = max(1, int((speaking_rate * segment_duration_in_seconds) / 60))
    
    segments = []
    segment_durations = []
    
    # Create segments with appropriate durations
    for i in range(0, len(words), words_per_segment):
        segment_words = words[i:i + words_per_segment]
        if segment_words:
            segment_text = " ".join(segment_words)
            segments.append(segment_text)
            
            # Calculate duration based on word count
            segment_word_count = len(segment_words)
            segment_duration = (segment_word_count / speaking_rate) * 60
            
            # Ensure minimum duration for image segments
            segment_duration = max(MIN_IMAGE_DURATION, segment_duration)
            segment_durations.append(segment_duration)
    
    # Generate content queries for each segment
    content_queries = []
    
    # Generate prompts concurrently
    async def generate_prompt_for_segment(segment, idx):
        # Generate a search query for this segment
        image_generation_prompt = f"""
            You are an expert in image generation.
            You will be given a segment of text.
            You will need to generate a image generation prompt for an image that matches the segment.
            The image generation prompt should be a short, specific prompt that will return a single image.
            The image generation prompt should be no more than 4 words.
            The image generation prompt should be descriptive of the visual scene, not just repeating the words.
            

            "A stegosaurus rex roaming the savannah" -> "dinosaur in savannah"
            "A cat playing with a ball" -> "cat playing with ball"

            Segment:
            "{segment}"
        """
        
        query = await generate_text(image_generation_prompt)
        
        return {
            "segment": segment,
            "query": query.strip(),
            "duration": segment_durations[idx],
            "index": idx
        }
    
    # Generate all prompts concurrently
    prompt_tasks = [generate_prompt_for_segment(segment, i) for i, segment in enumerate(segments)]
    content_queries = await asyncio.gather(*prompt_tasks)
    
    # Sort queries by index to ensure order
    content_queries.sort(key=lambda x: x["index"])
    
    # Extract just the generation prompts to pass to batch function
    all_prompts = [query_data["query"] for query_data in content_queries]
    
    logger.info(f"Starting batch generation of {len(all_prompts)} images with {ai_provider}")
    
    # Generate all images in a batch (with provider-specific batching)
    image_paths = await generate_ai_images_batch(
        prompts=all_prompts,
        provider=ai_provider,
        width=1536,
        height=1024,
        model=ai_model
    )
    
    # Process the results and create content sections
    content_sections = []
    processed_count = 0
    
    # Process each result
    for idx, (query_data, image_path) in enumerate(zip(content_queries, image_paths)):
        segment = query_data["segment"]
        query = query_data["query"]
        duration = query_data["duration"]
        index = query_data["index"]
        
        # Skip if image generation failed
        if not image_path:
            logger.error(f"Failed to generate image for segment {index+1}")
            content_section = ContentSection(
                segment=segment,
                query=query,
                videos=[],
                images=[],
                aiImages=[],
                imageDurations=[],
                segmentDuration=duration,
                index=index
            )
            content_sections.append(content_section)
            continue
        
        try:
            # Extract the filename from the path
            ai_image_filename = os.path.basename(image_path)
            
            # Upload to Supabase storage
            supabase_url = await supabase_storage.upload_image(
                local_path=image_path,
                destination_filename=ai_image_filename
            )
            
            if not supabase_url:
                logger.warning(f"Failed to upload AI image to Supabase for segment {index+1}, skipping image")
                content_section = ContentSection(
                    segment=segment,
                    query=query,
                    videos=[],
                    images=[],
                    aiImages=[],
                    imageDurations=[],
                    segmentDuration=duration,
                    index=index
                )
                content_sections.append(content_section)
                continue
            
            # Create content record in the created_content table
            await supabase_db.add_content(
                supabase_url=supabase_url,
                job_id=job_id,
                content_type="ai_image",
                thumbnail=supabase_url,  # For AI images, the image itself is the thumbnail
                duration=duration  # Use the calculated segment duration
            )
            
            # Create AI image result for UI display
            ai_image_result = {
                "url": supabase_url,
                "width": 1024,
                "height": 1024,
                "thumbnail": supabase_url,
                "isAiGenerated": True,
                "source": ai_provider
            }
            
            # Create content section
            content_section = ContentSection(
                segment=segment,
                query=query,
                videos=[],
                images=[ImageResult(**ai_image_result)],
                aiImages=[ai_image_result],
                imageDurations=[duration],
                segmentDuration=duration,
                index=index
            )
            
            content_sections.append(content_section)
            
            # Increment processed count
            processed_count += 1
            
            # Increment video segments completed count
            await supabase_db.increment_video_segments_completed(job_id)
            
            logger.info(f"Successfully processed AI image for segment {index+1}")
            
        except Exception as e:
            logger.error(f"Failed to process generated image for segment {index+1}: {str(e)}")
            content_section = ContentSection(
                segment=segment,
                query=query,
                videos=[],
                images=[],
                aiImages=[],
                imageDurations=[],
                segmentDuration=duration,
                index=index
            )
            content_sections.append(content_section)
    
    # Update processed segment count in the database
    await supabase_db.update_processed_segment_count(job_id, processed_count)
    
    # Sort sections by index to ensure order
    content_sections.sort(key=lambda x: x.index)
    
    logger.info(f"Completed AI image generation. Generated {processed_count}/{total_segments} images")
    
    return content_sections

async def process_text_content_for_images_fetching(
    file_content: str,
    images_per_minute: int,
    search_provider: str,
    job_id: str,
    speaking_rate: int = WORDS_PER_MINUTE
) -> List[ContentSection]:
    """
    Process text content and fetch regular images for each segment.
    
    Args:
        file_content: The text content to process
        images_per_minute: Number of images per minute
        search_provider: Search provider for images (pexels, pixabay)
        job_id: The job ID
        speaking_rate: Words per minute speaking rate (default: 120)
        
    Returns:
        List of content sections
    """
    try:
        # Calculate total word count
        word_count = len([w for w in file_content.split() if w.strip()])
        logger.info(f"Word count: {word_count}")
        
        # Calculate total audio duration (total script)
        total_duration_in_seconds = (word_count / speaking_rate) * 60
        
        # Calculate segment duration and number of segments based on the selected mode
        content_per_minute = max(1, images_per_minute)  # Ensure > 0
        logger.info(f"Content per minute: {content_per_minute}")
        
        # Calculate segment duration with minimum safeguard
        segment_duration_in_seconds = max(MIN_IMAGE_DURATION, 60 / content_per_minute)
        
        # Calculate how many segments we can fit
        total_segments = max(1, int(total_duration_in_seconds / segment_duration_in_seconds))
    
        # Initialize segment count in the database
        await supabase_db.update_segment_count(job_id, total_segments)
        # Initialize processed segment count to 0
        await supabase_db.update_processed_segment_count(job_id, 0)
        
        # Start processing status
        await supabase_db.update_job_status(job_id, 2)  # Processing
        
        # Split script into words for segmentation
        words = [w for w in file_content.split() if w.strip()]
        
        # Calculate words per segment based on speaking rate and segment duration
        words_per_segment = max(1, int((speaking_rate * segment_duration_in_seconds) / 60))
        
        segments = []
        segment_durations = []
        
        # Create segments with appropriate durations
        for i in range(0, len(words), words_per_segment):
            segment_words = words[i:i + words_per_segment]
            if segment_words:
                segment_text = " ".join(segment_words)
                segments.append(segment_text)
                
                # Calculate duration based on word count
                segment_word_count = len(segment_words)
                segment_duration = (segment_word_count / speaking_rate) * 60
                
                # Ensure minimum duration
                segment_duration = max(MIN_IMAGE_DURATION, segment_duration)
                segment_durations.append(segment_duration)
        
        # Generate content queries for each segment
        content_queries = []
        for i, segment in enumerate(segments):
            # Generate a search query for this segment
            image_generation_prompt = f"""
                You are an expert in finding relevant images.
                You will be given a segment of text.
                You will need to generate a search query for an image that matches the segment.
                The search query should be a short, specific query that will return relevant images.
                The search query should be no more than 5 words.
                The search query should be descriptive of the visual scene.

                "A stegosaurus rex roaming the savannah" -> "dinosaur in savannah"
                "A cat playing with a ball" -> "cat playing with ball"
                "The company's sales increased by 25%" -> "business growth chart"

                Segment:
                "{segment}"
            """
            
            query = await generate_text(image_generation_prompt)
            
            content_queries.append({
                "segment": segment,
                "query": query.strip(),
                "duration": segment_durations[i],  # Use the calculated duration for this segment
                "index": i
            })
            
        # Process content queries to get images
        content_results = []
        processed_count = 0
        
        for query_data in content_queries:
            segment = query_data["segment"]
            query = query_data["query"]
            duration = query_data["duration"]
            index = query_data["index"]
            
            videos = []
            images = []
            image_durations = []
                
            # Search for images
            try:
                logger.info(f"Fetching images for segment {index+1}/{len(content_queries)} with query: {query}")
                
                # Get images from the specified provider
                search_results = await search_images(query, num_results=3, provider=search_provider.lower())
                
                if not search_results:
                    logger.warning(f"No images found for query: {query}. Trying alternative query.")
                    # Try a simpler query if the first one fails
                    simple_query = " ".join(query.split()[:2])
                    search_results = await search_images(simple_query, num_results=3, provider=search_provider.lower())
                
                if search_results:
                    # We'll use the first image we found
                    image_result = search_results[0]
                    image_url = image_result.get("downloadUrl") or image_result.get("url")
                    
                    if image_url:
                        # Download the image
                        with tempfile.TemporaryDirectory() as temp_dir:
                            try:
                                image_filename = f"image-segment-{index+1}-{int(time.time())}.jpg"
                                image_path = await download_image(image_url, temp_dir)
                                
                                # Upload to Supabase
                                supabase_url = None
                                if supabase_storage:
                                    with open(image_path, "rb") as f:
                                        supabase_url = await supabase_storage.upload_file(
                                            file_content=f.read(),
                                            file_name=image_filename,
                                            folder="images",
                                            content_type="image/jpeg"
                                        )
                                
                                if not supabase_url:
                                    logger.warning(f"Failed to upload image to Supabase, skipping image")
                                    continue
                                
                                # Create content record in the created_content table
                                await supabase_db.add_content(
                                    supabase_url=supabase_url,
                                    job_id=job_id,
                                    content_type="image",
                                    thumbnail=supabase_url,  # For images, the image itself is the thumbnail
                                    duration=duration  # Use the calculated segment duration
                                )
                                
                                # Create image result for UI display
                                image_result_data = {
                                    "url": supabase_url,
                                    "width": image_result.get("width", 1280),
                                    "height": image_result.get("height", 720),
                                    "thumbnail": supabase_url,
                                    "source": image_result.get("source", search_provider)
                                }
                                
                                images = [ImageResult(**image_result_data)]
                                image_durations = [duration]
                                
                                # Increment processed count and update in database
                                processed_count += 1
                                await supabase_db.update_processed_segment_count(job_id, processed_count)
                                
                                # Increment video segments completed count
                                await supabase_db.increment_video_segments_completed(job_id)
                                
                                logger.info(f"Successfully processed image for segment {index+1}. Processed {processed_count}/{total_segments}")
                                
                            except Exception as download_error:
                                logger.error(f"Failed to download/process image: {str(download_error)}")
                                continue
                                
                else:
                    logger.warning(f"No images found for query: {query}")
                
            except Exception as e:
                logger.error(f"Failed to fetch images: {str(e)}")
            
            # Create content section even if no images were found
            content_section = ContentSection(
                segment=segment,
                query=query,
                videos=videos,
                images=images,
                aiImages=[],  # No AI images in this mode
                imageDurations=image_durations,
                segmentDuration=duration,
                index=index
            )
            
            content_results.append(content_section)

        # Update job status to completed
        await supabase_db.update_job_status(job_id, 3)  # Completed
        
        return content_results
        
    except Exception as e:
        logger.error(f"Error in image fetching for job {job_id}: {str(e)}")
        # Update job status to failed with error
        await supabase_db.update_job_error(job_id, str(e))
        await supabase_db.update_job_status(job_id, 4)  # Failed
        raise

async def process_text_content_for_videos_fetching(
    file_content: str,
    videos_per_minute: int,
    search_provider: str,
    job_id: str,
    speaking_rate: int = WORDS_PER_MINUTE
) -> List[ContentSection]:
    """
    Process text content and fetch regular videos for each segment.
    
    Args:
        file_content: The text content to process
        videos_per_minute: Number of videos per minute
        search_provider: Search provider for videos (pexels, pixabay)
        job_id: The job ID
        speaking_rate: Words per minute speaking rate (default: 120)
        
    Returns:
        List of content sections
    """
    try:
        # Calculate total word count
        word_count = len([w for w in file_content.split() if w.strip()])
        logger.info(f"Word count: {word_count}")
        
        # Calculate total audio duration (total script)
        total_duration_in_seconds = (word_count / speaking_rate) * 60
        
        # Calculate segment duration based on content per minute
        content_per_minute = max(1, videos_per_minute)  # Ensure > 0
        logger.info(f"Content per minute: {content_per_minute}")
        
        # Calculate segment duration with minimum safeguard
        segment_duration_in_seconds = max(MIN_VIDEO_DURATION, 60 / content_per_minute)
        
        # Calculate how many segments we can fit
        total_segments = max(1, int(total_duration_in_seconds / segment_duration_in_seconds))
    
        # Initialize segment count in the database
        await supabase_db.update_segment_count(job_id, total_segments)
        # Initialize processed segment count to 0
        await supabase_db.update_processed_segment_count(job_id, 0)
        
        # Start processing status
        await supabase_db.update_job_status(job_id, 2)  # Processing
        
        # Split script into words for segmentation
        words = [w for w in file_content.split() if w.strip()]
        
        # Calculate words per segment based on speaking rate and segment duration
        words_per_segment = max(1, int((speaking_rate * segment_duration_in_seconds) / 60))
        
        segments = []
        segment_durations = []
        
        # Create segments with appropriate durations
        for i in range(0, len(words), words_per_segment):
            segment_words = words[i:i + words_per_segment]
            if segment_words:
                segment_text = " ".join(segment_words)
                segments.append(segment_text)
                
                # Calculate duration based on word count
                segment_word_count = len(segment_words)
                segment_duration = (segment_word_count / speaking_rate) * 60
                
                # Ensure minimum duration
                segment_duration = max(MIN_VIDEO_DURATION, segment_duration)
                segment_durations.append(segment_duration)
        
        # Generate content queries for each segment
        content_queries = []
        for i, segment in enumerate(segments):
            # Generate a search query for this segment
            video_generation_prompt = f"""
                You are an expert in finding relevant videos.
                You will be given a segment of text.
                You will need to generate a search query for a video that matches the segment.
                The search query should be a short, specific query that will return relevant videos.
                The search query should be no more than 5 words.
                The search query should be descriptive of the visual scene.

                "A stegosaurus rex roaming the savannah" -> "dinosaur walking"
                "A cat playing with a ball" -> "cat playing ball"
                "The company's sales increased by 25%" -> "business growth chart"
                "The sun rising over the mountains" -> "sunrise mountains"

                Segment:
                "{segment}"
            """
            
            query = await generate_text(video_generation_prompt)
            
            content_queries.append({
                "segment": segment,
                "query": query.strip(),
                "duration": segment_durations[i],  # Use the calculated duration for this segment
                "index": i
            })
            
        # Process content queries to get videos
        content_results = []
        processed_count = 0
        
        for query_data in content_queries:
            segment = query_data["segment"]
            query = query_data["query"]
            duration = query_data["duration"]
            index = query_data["index"]
            
            videos = []
            images = []
            image_durations = []
                
            # Search for videos
            try:
                logger.info(f"Fetching videos for segment {index+1}/{len(content_queries)} with query: {query}")
                
                # Get videos from the specified provider
                video_response = await search_videos(query, search_provider.lower())
                
                if not video_response or not video_response.get("videos"):
                    logger.warning(f"No videos found for query: {query}. Trying alternative query.")
                    # Try a simpler query if the first one fails
                    simple_query = " ".join(query.split()[:2])
                    video_response = await search_videos(simple_query, search_provider.lower())
                
                video_results = video_response.get("videos", [])
                if video_results:
                    # We'll use the first video we found
                    video_result = video_results[0]
                    logger.info(f"Video result structure: {json.dumps(video_result, default=str)}")
                    video_url = video_result.get("downloadUrl")
                    
                    if video_url:
                        # Download the video
                        with tempfile.TemporaryDirectory() as temp_dir:
                            try:
                                video_filename = f"video-segment-{index+1}-{int(time.time())}.mp4"
                                video_path = os.path.join(temp_dir, video_filename)
                                
                                # Download video with retry logic
                                retry_count = 0
                                max_retries = 3
                                while retry_count <= max_retries:
                                    try:
                                        response = requests.get(video_url, stream=True, timeout=30)
                                        response.raise_for_status()
                                        
                                        # Save the video
                                        with open(video_path, 'wb') as out_file:
                                            for chunk in response.iter_content(chunk_size=8192):
                                                if chunk:
                                                    out_file.write(chunk)
                                        
                                        # Break if successful
                                        break
                                            
                                    except requests.exceptions.RequestException as e:
                                        retry_count += 1
                                        if retry_count > max_retries:
                                            logger.error(f"Failed to download video {video_url} after {max_retries} retries: {str(e)}")
                                            raise
                                            
                                        # Calculate backoff delay with jitter
                                        delay = 2 * (2 ** retry_count) + random.uniform(0, 1)
                                        logger.warning(f"Download error: {str(e)}. Backing off for {delay:.2f} seconds before retry {retry_count}/{max_retries}")
                                        time.sleep(delay)
                                
                                # Upload to Supabase
                                supabase_url = None
                                if supabase_storage and os.path.exists(video_path):
                                    with open(video_path, "rb") as f:
                                        supabase_url = await supabase_storage.upload_file(
                                            file_content=f.read(),
                                            file_name=video_filename,
                                            folder="videos",
                                            content_type="video/mp4"
                                        )
                                
                                if not supabase_url:
                                    logger.warning(f"Failed to upload video to Supabase, skipping video")
                                    continue
                                
                                # Extract thumbnail URL from video result
                                # Now try using the explicit thumbnail field first
                                thumbnail_url = video_result.get("thumbnail", "")
                                
                                # If no thumbnail is found, use fallback methods
                                if not thumbnail_url:
                                    if search_provider.lower() == "pixabay":
                                        # Try to get the thumbnail from Pixabay response
                                        thumbnail_url = video_result.get("image", "")
                                    else:
                                        # For Pexels, first try the image field
                                        thumbnail_url = video_result.get("image", "")
                                        
                                        # If no image is found, try to get the first picture from video_pictures
                                        if not thumbnail_url and "video_pictures" in video_result and video_result["video_pictures"]:
                                            first_picture = video_result["video_pictures"][0]
                                            if first_picture and "picture" in first_picture:
                                                thumbnail_url = first_picture["picture"]
                                
                                logger.info(f"Thumbnail URL: {thumbnail_url}")
                                
                                # Create content record in the created_content table with thumbnail
                                await supabase_db.add_content(
                                    supabase_url=supabase_url,
                                    job_id=job_id,
                                    content_type="video",
                                    thumbnail=thumbnail_url,
                                    duration=float(video_result.get("duration", duration))
                                )
                                
                                # Create video result for UI display
                                video_data = {
                                    "id": str(video_result.get("id", "")),
                                    "width": int(video_result.get("width", 1280)),
                                    "height": int(video_result.get("height", 720)),
                                    "duration": float(video_result.get("duration", duration)),
                                    "image": str(video_result.get("image", "")),
                                    "thumbnail": str(thumbnail_url),
                                    "downloadUrl": str(supabase_url),
                                    "user": str(video_result.get("user", "")),
                                }
                                
                                videos = [VideoResult(**video_data)]
                                
                                # Increment processed count and update in database
                                processed_count += 1
                                await supabase_db.update_processed_segment_count(job_id, processed_count)
                                
                                # Increment video segments completed count
                                await supabase_db.increment_video_segments_completed(job_id)
                                
                                logger.info(f"Successfully processed video for segment {index+1}. Processed {processed_count}/{total_segments}")
                                
                            except Exception as download_error:
                                logger.error(f"Failed to download/process video: {str(download_error)}")
                                continue
                                
                else:
                    logger.warning(f"No videos found for query: {query}")
                
            except Exception as e:
                logger.error(f"Failed to fetch videos: {str(e)}")
            
            # Create content section even if no videos were found
            content_section = ContentSection(
                segment=segment,
                query=query,
                videos=videos,
                images=images,
                aiImages=[],  # No AI images in this mode
                imageDurations=image_durations,
                segmentDuration=duration,
                index=index
            )
            
            content_results.append(content_section)
            
        # Update job status to completed
        await supabase_db.update_job_status(job_id, 3)  # Completed
        
        # Initialize concatenated video status as pending
        await supabase_db.update_concatenated_video_status(job_id, 1)  # Pending
        
        return content_results
        
    except Exception as e:
        logger.error(f"Error in video fetching for job {job_id}: {str(e)}")
        # Update job status to failed with error
        await supabase_db.update_job_error(job_id, str(e))
        await supabase_db.update_job_status(job_id, 4)  # Failed
        raise 

@router.post("/regenerate")
async def regenerate_content(
    request: RegenerateContentRequest,
    background_tasks: BackgroundTasks
):
    """
    Regenerate content for a specific content item with a new query.
    
    Args:
        request: Regeneration request with content_id, job_id, and new query
        background_tasks: Background tasks runner
        
    Returns:
        TaskResponse with success status
    """
    try:
        content_id = request.content_id
        job_id = request.job_id
        query = request.query
        
        # Get the content record
        content = await supabase_db.get_content_by_id(content_id)
        if not content:
            raise HTTPException(status_code=404, detail=f"Content with ID {content_id} not found")
        
        # Get the job to determine the mode
        job = await supabase_db.get_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail=f"Job with ID {job_id} not found")
        
        # Get the content type
        content_type = content.get("content_type")
        if not content_type:
            raise HTTPException(status_code=400, detail="Content type not found in content record")
        
        # Start regeneration in background
        background_tasks.add_task(
            process_content_regeneration,
            content_id=content_id,
            job_id=job_id,
            query=query,
            content_type=content_type,
            job_mode=job.get("mode")
        )
        
        return {
            "success": True,
            "message": f"Content regeneration started for {content_type}",
            "content_id": content_id,
            "job_id": job_id
        }
        
    except Exception as e:
        logger.error(f"Error starting content regeneration: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to start content regeneration: {str(e)}")

async def process_content_regeneration(
    content_id: str,
    job_id: str,
    query: str,
    content_type: str,
    job_mode: str
):
    """
    Process content regeneration based on content type and job mode.
    
    Args:
        content_id: The content ID to regenerate
        job_id: The job ID associated with the content
        query: The new query to use for regeneration
        content_type: The type of content ('video', 'image', 'ai_image')
        job_mode: The job mode ('videos', 'images', 'mixed', 'ai_images')
    """
    try:
        logger.info(f"Starting content regeneration for content ID: {content_id}, job ID: {job_id}")
        logger.info(f"Content type: {content_type}, query: {query}")
        
        # Process based on content type
        if content_type == "video":
            # Regenerate video
            new_content_url, thumbnail_url, duration = await regenerate_video_content(query, job_id, job_mode)
            
        elif content_type == "image":
            # Regenerate regular image
            new_content_url, duration = await regenerate_image_content(query, job_id, job_mode)
            thumbnail_url = new_content_url  # For images, the image itself is the thumbnail
            
        elif content_type == "ai_image":
            # Regenerate AI image
            new_content_url, duration = await regenerate_ai_image_content(query, job_id, job_mode)
            thumbnail_url = new_content_url  # For AI images, the image itself is the thumbnail
            
        else:
            logger.error(f"Unsupported content type for regeneration: {content_type}")
            return
        
        # Update the content record with new URL, thumbnail and duration
        if new_content_url:
            success = await supabase_db.update_content(
                content_id, 
                new_content_url, 
                thumbnail_url, 
                duration
            )
            if success:
                logger.info(f"Successfully regenerated and updated content ID: {content_id}")
                
                # Increment video segments completed count
                # We don't need to increment if it's a regeneration of existing content
                # since the count should already include it
                
            else:
                logger.error(f"Failed to update content record after regeneration: {content_id}")
        else:
            logger.error(f"Failed to regenerate content, no new URL generated: {content_id}")
            
    except Exception as e:
        logger.error(f"Error during content regeneration for content ID {content_id}: {str(e)}")

async def regenerate_video_content(query: str, job_id: str, job_mode: str) -> tuple[Optional[str], Optional[str], Optional[float]]:
    """
    Regenerate video content with a new query.
    
    Args:
        query: The new query to use
        job_id: The job ID
        job_mode: The job mode
        
    Returns:
        Tuple of (new_video_url, thumbnail_url, duration)
    """
    try:
        # Determine search provider based on job mode
        # Default to pexels if not specified
        search_provider = "pexels"
        
        # Get video from search provider
        video_response = await search_videos(query, search_provider.lower())
        
        if not video_response or not video_response.get("videos"):
            logger.warning(f"No videos found for regeneration query: {query}")
            return None, None, None
        
        video_results = video_response.get("videos", [])
        if not video_results:
            logger.warning(f"Empty video results for regeneration query: {query}")
            return None, None, None
        
        # Use the first video result
        video_result = video_results[0]
        video_url = video_result.get("downloadUrl")
        
        if not video_url:
            logger.warning(f"No download URL in video result for regeneration query: {query}")
            return None, None, None
        
        # Get the duration
        video_duration = float(video_result.get("duration", 5.0))
        
        # Download the video
        with tempfile.TemporaryDirectory() as temp_dir:
            video_filename = f"video-regenerated-{int(time.time())}.mp4"
            video_path = os.path.join(temp_dir, video_filename)
            
            # Download video with retry logic
            retry_count = 0
            max_retries = 3
            success = False
            
            while retry_count <= max_retries and not success:
                try:
                    response = requests.get(video_url, stream=True, timeout=30)
                    response.raise_for_status()
                    
                    # Save the video
                    with open(video_path, 'wb') as out_file:
                        for chunk in response.iter_content(chunk_size=8192):
                            if chunk:
                                out_file.write(chunk)
                    
                    success = True
                        
                except requests.exceptions.RequestException as e:
                    retry_count += 1
                    if retry_count > max_retries:
                        logger.error(f"Failed to download video {video_url} after {max_retries} retries: {str(e)}")
                        raise
                        
                    # Calculate backoff delay with jitter
                    delay = 2 * (2 ** retry_count) + random.uniform(0, 1)
                    logger.warning(f"Download error: {str(e)}. Backing off for {delay:.2f} seconds before retry {retry_count}/{max_retries}")
                    time.sleep(delay)
            
            if success:
                # Upload to Supabase
                supabase_url = None
                if supabase_storage and os.path.exists(video_path):
                    with open(video_path, "rb") as f:
                        supabase_url = await supabase_storage.upload_file(
                            file_content=f.read(),
                            file_name=video_filename,
                            folder="videos",
                            content_type="video/mp4"
                        )
                
                if not supabase_url:
                    logger.warning(f"Failed to upload regenerated video to Supabase")
                    return None, None, None
                
                # Extract thumbnail URL from video result
                thumbnail_url = video_result.get("thumbnail", "")
                
                # If no thumbnail is found, use fallback methods
                if not thumbnail_url:
                    if search_provider.lower() == "pixabay":
                        thumbnail_url = video_result.get("image", "")
                    else:
                        thumbnail_url = video_result.get("image", "")
                        if not thumbnail_url and "video_pictures" in video_result and video_result["video_pictures"]:
                            first_picture = video_result["video_pictures"][0]
                            if first_picture and "picture" in first_picture:
                                thumbnail_url = first_picture["picture"]
                
                logger.info(f"Generated new video URL: {supabase_url}, thumbnail: {thumbnail_url}, duration: {video_duration}")
                return supabase_url, thumbnail_url, video_duration
                
        return None, None, None
        
    except Exception as e:
        logger.error(f"Error regenerating video content: {str(e)}")
        return None, None, None

async def regenerate_image_content(query: str, job_id: str, job_mode: str) -> tuple[Optional[str], Optional[float]]:
    """
    Regenerate image content with a new query.
    
    Args:
        query: The new query to use
        job_id: The job ID
        job_mode: The job mode
        
    Returns:
        Tuple of (new_image_url, duration)
    """
    try:
        # Determine search provider based on job mode
        # Default to pexels if not specified
        search_provider = "pexels"
        
        # Get job to determine segment duration
        job = await supabase_db.get_job(job_id)
        # Default duration for images is 5 seconds
        image_duration = 5.0
        
        # Search for images
        search_results = await search_images(query, num_results=3, provider=search_provider.lower())
        
        if not search_results:
            logger.warning(f"No images found for regeneration query: {query}")
            return None, None
        
        # Use the first image
        image_result = search_results[0]
        image_url = image_result.get("downloadUrl") or image_result.get("url")
        
        if not image_url:
            logger.warning(f"No download URL in image result for regeneration query: {query}")
            return None, None
        
        # Download the image
        with tempfile.TemporaryDirectory() as temp_dir:
            image_filename = f"image-regenerated-{int(time.time())}.jpg"
            image_path = await download_image(image_url, temp_dir)
            
            # Upload to Supabase
            supabase_url = None
            if supabase_storage and os.path.exists(image_path):
                with open(image_path, "rb") as f:
                    supabase_url = await supabase_storage.upload_file(
                        file_content=f.read(),
                        file_name=image_filename,
                        folder="images",
                        content_type="image/jpeg"
                    )
            
            if not supabase_url:
                logger.warning(f"Failed to upload regenerated image to Supabase")
                return None, None
            
            logger.info(f"Generated new image URL: {supabase_url}, duration: {image_duration}")
            return supabase_url, image_duration
        
    except Exception as e:
        logger.error(f"Error regenerating image content: {str(e)}")
        return None, None

async def regenerate_ai_image_content(query: str, job_id: str, job_mode: str) -> tuple[Optional[str], Optional[float]]:
    """
    Regenerate AI image content with a new query.
    
    Args:
        query: The new query to use
        job_id: The job ID
        job_mode: The job mode
        
    Returns:
        Tuple of (new_ai_image_url, duration)
    """
    try:
        # Get job to determine AI provider
        job = await supabase_db.get_job(job_id)
        ai_provider = "openai"  # Default to OpenAI
        
        # Default duration for AI images is 5 seconds
        image_duration = 5.0
        
        # Generate AI image
        ai_image_filename = f"ai-image-regenerated-{int(time.time())}.png"
        ai_image_path = await generate_ai_image(
            prompt=query,
            provider=ai_provider,
            width=1536,
            height=1024,
        )
        
        # Upload to Supabase
        supabase_url = None
        if supabase_storage and os.path.exists(ai_image_path):
            with open(ai_image_path, "rb") as f:
                supabase_url = await supabase_storage.upload_file(
                    file_content=f.read(),
                    file_name=ai_image_filename,
                    folder="images",
                    content_type="image/png"
                )
        
        if not supabase_url:
            logger.warning(f"Failed to upload regenerated AI image to Supabase")
            return None, None
        
        logger.info(f"Generated new AI image URL: {supabase_url}, duration: {image_duration}")
        return supabase_url, image_duration
        
    except Exception as e:
        logger.error(f"Error regenerating AI image content: {str(e)}")
        return None, None

@router.post("/restart")
async def restart_job(
    request: RestartJobRequest,
    background_tasks: BackgroundTasks
):
    """
    Restart a job with its existing parameters.
    
    Args:
        request: Restart job request with job_id
        background_tasks: Background tasks runner
        
    Returns:
        TaskResponse with task ID
    """
    try:
        job_id = request.job_id
        
        # Get the original job
        job = await supabase_db.get_job(job_id)
        if not job:
            raise ValueError(f"Job with ID {job_id} not found")
        
        # Extract the original parameters
        file_content = job.get("script_text", "")
        mode = job.get("mode", "mixed")
        
        if not file_content:
            raise ValueError(f"No script text found in job {job_id}")
        
        # Update job status to pending
        await supabase_db.update_job_status(job_id, 1)  # Pending
        
        # Reset segment counts
        await supabase_db.update_segment_count(job_id, 0)
        await supabase_db.update_processed_segment_count(job_id, 0)
        
        # Reset video segments completed
        await supabase_db.update_video_segments_completed(job_id, 0)
        
        # Reset concatenated video status
        await supabase_db.update_concatenated_video_status(job_id, 0)  # Not started
        
        # Determine which process to restart based on mode
        if mode == "videos":
            background_tasks.add_task(
                process_video_content,
                job_id=job_id,
                file_content=file_content,
                videos_per_minute=10,  # Default videos_per_minute
                search_provider="pexels",  # Default search_provider
                speaking_rate=WORDS_PER_MINUTE
            )
            
            task_message = f"Video content generation restarted for job {job_id}"
            
        elif mode == "images":            
            # Start image processing in the background
            background_tasks.add_task(
                process_image_content,
                job_id=job_id,
                file_content=file_content,
                images_per_minute=20,  # Default images_per_minute
                search_provider="pexels",  # Default search_provider
                speaking_rate=WORDS_PER_MINUTE
            )
            
            task_message = f"Image content generation restarted for job {job_id}"
            
        elif mode == "mixed":
            # Start mixed content processing in the background
            background_tasks.add_task(
                process_mixed_content,
                job_id=job_id,
                file_content=file_content,
                videos_per_minute=10,  # Default videos_per_minute
                images_per_minute=20,  # Default images_per_minute
                search_provider="pexels",  # Default search_provider
                theme="",  # Default empty theme
                generate_ai_images=False,  # Not generating AI images by default
                speaking_rate=WORDS_PER_MINUTE
            )
            
            task_message = f"Mixed content generation restarted for job {job_id}"
            
        elif mode == "ai_images":            
            # Start AI image processing in the background
            background_tasks.add_task(
                process_ai_image_content,
                job_id=job_id,
                file_content=file_content,
                images_per_minute=20,  # Default images_per_minute
                search_provider="pexels",  # Default search_provider
                ai_provider="openai",  # Default AI provider
                speaking_rate=WORDS_PER_MINUTE
            )
            
            task_message = f"AI image content generation restarted for job {job_id}"
            
        else:
            raise ValueError(f"Unsupported mode: {mode}")
        
        # Return the task response
        return {
            "task_id": job_id,
            "status": TaskStatus.PENDING,
            "message": task_message
        }
        
    except Exception as e:
        logger.error(f"Error restarting job: {str(e)}")
        await supabase_db.update_job_error(job_id, str(e))
        await supabase_db.update_job_status(job_id, 4)  # Failed
        raise

@router.post("/mark-segments-completed")
async def mark_segments_completed(request: MarkSegmentsCompletedRequest):
    """
    Mark video segments as completed for a job.
    
    Args:
        request: The request containing the job ID
        
    Returns:
        Success status
    """
    try:
        job_id = request.job_id
        
        # Get the job to verify it exists
        job = await supabase_db.get_job(job_id)
        if not job:
            raise ValueError(f"Job with ID {job_id} not found")
        
        # Check if job is completed
        if job.get("status") != 3:  # Completed
            raise ValueError(f"Job {job_id} is not in completed state")
        
        # Get content items to determine total segments
        content_items = await supabase_db.get_job_content(job_id)

        total_segments = len(content_items)
        
        # Mark all video segments as completed by setting count to total segments
        await supabase_db.update_video_segments_completed(job_id, total_segments)
        
        # Initialize concatenated video status as pending
        await supabase_db.update_concatenated_video_status(job_id, 1)  # Pending
        
        return {
            "success": True,
            "message": f"All {total_segments} video segments marked as completed for job {job_id}"
        }
        
    except Exception as e:
        logger.error(f"Error marking segments completed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to mark segments completed: {str(e)}")

async def process_mixed_content(
    job_id: str,
    file_content: str,
    videos_per_minute: int,
    images_per_minute: int,
    search_provider: str,
    theme: str,
    generate_ai_images: bool,
    speaking_rate: int = WORDS_PER_MINUTE
):
    """
    Process a script to generate mixed content (videos and images).
    
    Args:
        job_id: The job ID
        file_content: The script content
        videos_per_minute: Number of videos per minute
        images_per_minute: Number of images per minute
        search_provider: Search provider for content
        theme: Theme for content
        generate_ai_images: Whether to generate AI images for segments
        speaking_rate: Words per minute speaking rate (default: 120)
    """
    try:
        # Update job status to processing
        await supabase_db.update_job_status(job_id, 2)
        
        # Calculate total word count
        word_count = len([w for w in file_content.split() if w.strip()])
        print(f"Word count: {word_count}")
        
        # Calculate total audio duration (total script)
        total_duration_in_seconds = (word_count / speaking_rate) * 60
        
        # For mixed content, distribute between videos and images
        # We'll calculate duration based on total number of combined content pieces
        total_content_per_minute = videos_per_minute + images_per_minute
        
        # Calculate segment duration in seconds
        segment_duration_in_seconds = max(MIN_SEGMENT_DURATION, 60 / total_content_per_minute)
        
        # Calculate how many segments we need
        total_segments = max(1, int(total_duration_in_seconds / segment_duration_in_seconds))
        print(f"Total segments: {total_segments}")
        
        # Initialize segment count in the database
        await supabase_db.update_segment_count(job_id, total_segments)
        # Initialize processed segment count to 0
        await supabase_db.update_processed_segment_count(job_id, 0)
        
        # Split script into words for segmentation
        words = [w for w in file_content.split() if w.strip()]
        
        # Calculate words per segment based on speaking rate and segment duration
        words_per_segment = max(1, int((speaking_rate * segment_duration_in_seconds) / 60))
        
        segments = []
        segment_durations = []
        
        # Create segments with appropriate durations
        for i in range(0, len(words), words_per_segment):
            segment_words = words[i:i + words_per_segment]
            if segment_words:
                segment_text = " ".join(segment_words)
                segments.append(segment_text)
                
                # Calculate duration based on word count
                segment_word_count = len(segment_words)
                segment_duration = (segment_word_count / speaking_rate) * 60
                
                # Ensure minimum duration
                segment_duration = max(MIN_SEGMENT_DURATION, segment_duration)
                segment_durations.append(segment_duration)
        
        # Generate content for each segment
        content_sections = []
        
        # Get the ratio of videos to images
        video_ratio = videos_per_minute / total_content_per_minute if total_content_per_minute > 0 else 0.5
        
        # Handle Minimax provider by falling back to Pexels for now
        actual_provider = search_provider
        if search_provider == "minimax":
            logger.warning("Minimax provider not yet implemented, falling back to Pexels")
            actual_provider = "pexels"
        
        for idx, (segment, duration) in enumerate(zip(segments, segment_durations)):
            try:
                # Decide if this segment gets a video or image
                # We'll use a deterministic approach based on index
                use_video = (idx % 3 == 0) or (video_ratio > random.random())
                
                # Generate search query for this segment
                # Prepare the theme context
                theme_context = f'This script is about: "{theme}". ' if theme else ""
                
                query_prompt = f"""
                    {theme_context}Create a short, specific search query for finding {'a video' if use_video else 'an image'} that matches this text (4 words max).
                    The text might be a question, a reference to a scene name, a meme or similar, you have to provide a query
                    that refers to general known objects.

                    Text:
                    "{segment}"
                    
                    {f'Remember, the overall theme is: "{theme}".' if theme else ""}
                    
                    The query will be used to search for {'stock videos' if use_video else 'stock images'}.
                    Return ONLY the search query, no explanations or quotes.
                    Make it descriptive of the visual scene, not just repeating the words.
                """
                
                search_query = await generate_text(query_prompt)
                search_query = search_query.strip()
                
                # Initialize videos and images for this section
                videos = []
                images = []
                image_durations = []
                ai_images = []
                
                content_type = None
                url = None
                search_terms = search_query
                
                # Generate content based on the decision
                if use_video:
                    # Search for videos
                    video_response = await search_videos(search_query, actual_provider)
                    
                    # Store content record in database
                    if video_response.get("videos"):
                        first_video = video_response["videos"][0]
                        
                        if first_video:
                            video_url = first_video.get("downloadUrl")
                            video_json = json.dumps(first_video)
                            
                            # Create a content record in the database
                            await supabase_db.create_content_record(
                                job_id=job_id,
                                content_type="video",
                                segment_text=segment,
                                search_query=search_query,
                                url=video_url,
                                provider=actual_provider,
                                json_data=video_json
                            )
                            
                            content_type = "video"
                            url = video_url
                            
                            # Add video to the section
                            videos = [VideoResult(**v) for v in video_response["videos"][:3]]
                
                else:
                    # For images, we need to check if we're using AI generation
                    use_ai_image = generate_ai_images or search_provider == "google"
                    
                    if use_ai_image:
                        # Generate AI image
                        # Create AI image prompt
                        ai_prompt = ""
                        if theme:
                            ai_prompt += f"Theme: {theme}. "
                        ai_prompt += f'Create a visual representation of: "{segment}". '
                        ai_prompt += f"Focus on: {search_query}."
                        
                        logger.info(f"Generating AI image for segment {idx}: {segment[:50]}...")
                        
                        # Use google or openai based on provider
                        ai_provider = "google" if search_provider == "google" else "openai"
                        
                        # Generate the AI image
                        try:
                            ai_image_path = await generate_ai_image(
                                prompt=ai_prompt,
                                provider=ai_provider,
                                width=1536,
                                height=1024
                            )
                            
                            # Extract the filename from the path
                            ai_image_filename = os.path.basename(ai_image_path)
                            
                            # Upload to Supabase storage
                            supabase_url = await supabase_storage.upload_image(
                                local_path=ai_image_path,
                                destination_filename=ai_image_filename
                            )
                            
                            # Create AI image result
                            ai_image_result = {
                                "url": supabase_url,
                                "width": 1024,
                                "height": 1024,
                                "thumbnail": supabase_url,
                                "isAiGenerated": True,
                                "source": ai_provider
                            }
                            
                            # Create a content record in the database
                            await supabase_db.create_content_record(
                                job_id=job_id,
                                content_type="ai_image",
                                segment_text=segment,
                                search_query=search_query,
                                url=supabase_url,
                                provider=ai_provider,
                                supabase_url=supabase_url,
                                json_data=json.dumps(ai_image_result)
                            )
                            
                            content_type = "ai_image"
                            url = supabase_url
                            
                            # Add AI image to the section
                            image_result = ImageResult(**ai_image_result)
                            images = [image_result]
                            ai_images = [ai_image_result]
                            image_durations = [min(5.0, duration)]  # Use image for at most 5 seconds
                            
                        except Exception as e:
                            logger.error(f"Failed to generate AI image for segment {idx}: {str(e)}")
                            # Fall back to regular image search if AI generation fails
                            use_ai_image = False
                    
                    # If not using AI images or AI generation failed, search for regular images
                    if not use_ai_image:
                        try:
                            # Search for images using the search provider
                            image_response = await search_images(search_query, provider=actual_provider)
                            
                            # Store content record in database
                            if image_response:
                                first_image = image_response[0]
                                
                                if first_image:
                                    image_url = first_image.get("url")
                                    image_json = json.dumps(first_image)
                                    
                                    # Create a content record in the database
                                    await supabase_db.create_content_record(
                                        job_id=job_id,
                                        content_type="image",
                                        segment_text=segment,
                                        search_query=search_query,
                                        url=image_url,
                                        provider=actual_provider,
                                        json_data=image_json
                                    )
                                    
                                    content_type = "image"
                                    url = image_url
                            
                            # Add images to the section
                            images = [ImageResult(**img) for img in image_response[:3]]
                            
                            # Calculate image durations - distribute segment duration among images
                            if images:
                                # Calculate image durations not exceeding the segment duration
                                # and not shorter than MIN_IMAGE_DURATION
                                single_image_duration = max(MIN_IMAGE_DURATION, duration / len(images))
                                image_durations = [single_image_duration] * len(images)
                        except Exception as e:
                            logger.error(f"Failed to search for images for segment {idx}: {str(e)}")
                
                content_section = ContentSection(
                    segment=segment,
                    query=search_query,
                    videos=videos,
                    images=images,
                    aiImages=ai_images,
                    imageDurations=image_durations,
                    segmentDuration=duration,
                    index=idx
                )
                
                content_sections.append(content_section)
                
                # Update processed segment count in the database
                await supabase_db.update_processed_segment_count(job_id, idx + 1)
                
            except Exception as e:
                logger.error(f"Error processing segment {idx}: {str(e)}")
                # Add a blank section to maintain continuity
                content_sections.append(ContentSection(
                    segment=segment,
                    query="",
                    videos=[],
                    images=[],
                    aiImages=[],
                    imageDurations=[],
                    segmentDuration=duration,
                    index=idx
                ))
        
        # Set result for this job
        await supabase_db.update_job_result(job_id, {
            "contentSections": [section.dict() for section in content_sections]
        })
        
        # Mark video segments as completed
        await supabase_db.update_video_segments_completed(job_id, True)
        
        # Update job status to completed
        await supabase_db.update_job_status(job_id, 3)  # Completed
        
        # Initialize concatenated video status as pending
        await supabase_db.update_concatenated_video_status(job_id, 1)  # Pending
        
        return content_sections
        
    except Exception as e:
        logger.error(f"Error processing mixed content job {job_id}: {str(e)}")
        # Update job status to failed with error
        await supabase_db.update_job_error(job_id, str(e))
        await supabase_db.update_job_status(job_id, 4)  # Failed
        raise