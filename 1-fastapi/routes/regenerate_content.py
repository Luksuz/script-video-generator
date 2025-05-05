from fastapi import APIRouter, HTTPException, Request
from typing import List, Dict, Any, Optional
import logging
from pydantic import ValidationError

from models import (
    RegenerateContentRequest,
    RegenerateContentResponse,
    VideoResult,
    ImageResult,
    VideoProvider,
    ContentMode
)
from utils.search_helpers import search_pexels_videos, search_pixabay_videos, search_images
from utils.text_generation import generate_text
from utils.image_generation import generate_ai_image

router = APIRouter()
logger = logging.getLogger(__name__)

# Function to search videos based on provider
async def search_videos(query: str, provider: VideoProvider) -> Dict[str, Any]:
    """Search for videos based on provider."""
    if provider == "pexels":
        return await search_pexels_videos(query)
    elif provider == "pixabay":
        return await search_pixabay_videos(query)
    elif provider == "minimax":
        # For now, fall back to Pexels if minimax is selected
        # TODO: Implement Minimax video search
        logger.warning("Minimax video provider not yet implemented, falling back to Pexels")
        return await search_pexels_videos(query)
    else:
        # Default to pexels
        return await search_pexels_videos(query)

@router.post("/")
async def regenerate_content(request: Request):
    """
    Regenerate content for a specific section.
    
    Args:
        request: The HTTP request
        
    Returns:
        RegenerateContentResponse with regenerated content
    """
    try:
        # Parse request body
        body = await request.json()
        
        # Extract parameters
        section_index = body.get("sectionIndex")
        custom_query = body.get("customQuery")
        mode = body.get("mode")
        provider = body.get("provider", "pexels")
        theme = body.get("theme", "")
        generate_new_query = body.get("generateNewQuery", False)
        generate_ai_images = body.get("generateAiImages", False)
        
        # Validate required fields
        if section_index is None or not isinstance(section_index, int):
            raise HTTPException(status_code=400, detail="Invalid section index")
            
        if not mode or mode not in ["images", "videos", "mixed"]:
            raise HTTPException(status_code=400, detail="Invalid mode")
            
        if not provider or provider not in ["pexels", "pixabay", "minimax", "google", "openai-gpt-image"]:
            raise HTTPException(status_code=400, detail="Invalid provider")
            
        # Initialize search query
        search_query = custom_query
        
        # Generate new query based on custom input if requested
        if generate_new_query and custom_query and isinstance(custom_query, str):
            segment = custom_query.strip()
            
            # Prepare the theme context
            theme_context = f'This script is about: "{theme}". ' if theme else ""
            
            # Generate a new search query
            query_prompt = f"""
                {theme_context}Create a short, specific search query for finding {'an image' if mode == 'images' else 'a video'} that matches this text (4 words max).
                The text might be a question, a reference to a scene name, a meme or similar, you have to provide a query
                that refers to general known objects.

                Text:
                "{segment}"
                
                {f'Remember, the overall theme is: "{theme}".' if theme else ""}
                
                The query will be used to search for {'images on a stock photo site' if mode == 'images' else 'stock videos'}.
                Return ONLY the search query, no explanations or quotes.
                Make it descriptive of the visual scene, not just repeating the words.
            """
            
            search_query = await generate_text(query_prompt)
            search_query = search_query.strip()
            
        elif isinstance(custom_query, str):
            # Sanitize the custom query
            search_query = custom_query.strip()[:100]
        else:
            raise HTTPException(status_code=400, detail="Invalid custom query")
            
        logger.info(f"Regenerating content for section {section_index} with query: '{search_query}'")
        
        # Generate content based on the selected mode
        videos = []
        images = []
        ai_image = None
        
        # Get videos if needed
        if mode in ["videos", "mixed"]:
            video_response = await search_videos(search_query, provider)
            videos = [VideoResult(**v) for v in video_response["videos"]]
            
        # Get images if needed and not using AI images
        if mode in ["images", "mixed"] and not generate_ai_images:
            # For image search, we might use a different provider
            # Google provider for images is specifically for AI-generated images
            actual_provider = provider
            if provider == "google":
                generate_ai_images = True
            elif provider == "minimax":
                generate_ai_images = True
            else:
                image_response = await search_images(search_query, provider=provider)
                images = [ImageResult(**img) for img in image_response]
            
        # Generate an AI image if requested or if provider is google or minimax
        if generate_ai_images and mode in ["images", "mixed"]:
            try:
                # Create AI image prompt
                ai_prompt = ""
                if theme:
                    ai_prompt += f"Theme: {theme}. "
                ai_prompt += f'Create a visual representation of: "{custom_query}". '
                ai_prompt += f"Focus on: {search_query}."
                
                logger.info(f"Generating AI image for custom query: {custom_query[:50]}...")
                
                # Use appropriate provider for AI generation
                ai_provider = "openai"
                ai_model = "dall-e-3"  # Default model
                
                if provider == "google":
                    ai_provider = "google"
                elif provider == "minimax":
                    ai_provider = "minimax"
                elif provider == "openai-gpt-image":
                    ai_provider = "openai"
                    ai_model = "gpt-image-1"
                
                # Generate AI image
                ai_image_path = await generate_ai_image(
                    prompt=ai_prompt,
                    provider=ai_provider,
                    width=1536,
                    height=1024,
                    model=ai_model
                )
                
                # Extract the filename from the path
                import os
                ai_image_filename = os.path.basename(ai_image_path)
                
                # Create AI image result
                ai_image_result = {
                    "url": f"/images/{ai_image_filename}",
                    "width": 1024,
                    "height": 1024,
                    "thumbnail": f"/images/{ai_image_filename}",
                    "isAiGenerated": True
                }
                
                ai_image = ai_image_result
                images = [ImageResult(**ai_image_result)]
                
                logger.info("Successfully generated AI image for custom query")
                
            except Exception as e:
                logger.error(f"Failed to generate AI image: {str(e)}")
                
                # Fall back to regular image search
                if mode in ["images", "mixed"]:
                    try:
                        logger.info(f"Falling back to regular image search for query: {search_query}")
                        image_response = await search_images(search_query)
                        images = [ImageResult(**img) for img in image_response]
                    except Exception as img_error:
                        logger.error(f"Failed to fall back to image search: {str(img_error)}")
                        images = []
                        
        # Create response
        response = RegenerateContentResponse(
            success=True,
            sectionIndex=section_index,
            query=search_query,
            videos=videos,
            images=images,
            aiImage=ai_image
        )
        
        return response
        
    except ValidationError as ve:
        logger.error(f"Validation error regenerating content: {str(ve)}")
        raise HTTPException(status_code=422, detail=str(ve))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error regenerating content: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Failed to regenerate content",
                "details": str(e)
            }
        ) 