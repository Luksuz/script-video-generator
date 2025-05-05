import os
import requests
from typing import Optional, Literal, Dict, Any, List, Tuple
import time
import logging
import asyncio
from io import BytesIO
from openai import OpenAI, AsyncOpenAI
import os
import base64
from PIL import Image as PILImage
from dotenv import load_dotenv
import json
import aiohttp

load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Type for the AI Image Provider
AIImageProvider = Literal["openai", "google", "minimax"]

# Load API keys from environment
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
MINIMAX_API_KEY = os.getenv("MINIMAX_API_KEY")

# Rate limiting settings (to avoid overwhelming the API)
RATE_LIMIT_CALLS = 5       # Number of calls allowed
RATE_LIMIT_PERIOD = 60     # In seconds (1 minute)

# Provider-specific rate limiting settings
provider_rate_limits: Dict[str, Dict[str, Any]] = {
    "openai": {
        "calls": 5,
        "period": 60,
        "timestamps": [],
        "lock": asyncio.Lock()
    },
    "google": {
        "calls": 5,
        "period": 60,
        "timestamps": [],
        "lock": asyncio.Lock()
    },
    "minimax": {
        "calls": float('inf'),  # Unlimited
        "period": 60,
        "timestamps": [],
        "lock": asyncio.Lock()
    }
}

async def check_rate_limit(provider: AIImageProvider) -> None:
    """Check rate limit for the specified provider and wait if necessary."""
    # Skip rate limiting for providers with unlimited calls
    if provider_rate_limits[provider]["calls"] == float('inf'):
        return
    
    async with provider_rate_limits[provider]["lock"]:
        current_time = time.time()
        timestamps = provider_rate_limits[provider]["timestamps"]
        
        # Remove timestamps older than the rate limit period
        provider_rate_limits[provider]["timestamps"] = [
            ts for ts in timestamps if current_time - ts < provider_rate_limits[provider]["period"]
        ]
        
        # Check if we've hit the rate limit
        if len(provider_rate_limits[provider]["timestamps"]) >= provider_rate_limits[provider]["calls"]:
            wait_time = provider_rate_limits[provider]["period"] - (current_time - provider_rate_limits[provider]["timestamps"][0])
            logger.info(f"Rate limit reached for {provider}. Waiting {wait_time:.2f} seconds...")
            await asyncio.sleep(wait_time)
            # Refresh the timestamp list after waiting
            current_time = time.time()
            provider_rate_limits[provider]["timestamps"] = [
                ts for ts in timestamps if current_time - ts < provider_rate_limits[provider]["period"]
            ]
        
        # Add the current timestamp
        provider_rate_limits[provider]["timestamps"].append(current_time)

async def generate_ai_image(
    prompt: str,
    provider: AIImageProvider = "openai",
    width: int = 1536,
    height: int = 1024,
    output_dir: str = "images",
    output_filename: Optional[str] = None,
    aspect_ratio: str = "1:1",
    model: str = "gpt-image-1"  # Default model for OpenAI
) -> str:
    """
    Generate an AI image using the specified provider.
    
    Args:
        prompt: The text prompt for image generation
        provider: The AI provider to use (openai, google, or minimax)
        width: Image width
        height: Image height
        output_dir: Directory to save the image
        output_filename: Optional filename for the image
        aspect_ratio: Aspect ratio for the image (used by Minimax)
        model: Model to use for image generation (for OpenAI: "dall-e-3" or "gpt-image-1")
    
    Returns:
        Path to the generated image
    """
    logger.info(f"Generating image with {provider} provider: prompt={prompt[:50]}...")
    
    # Apply rate limiting based on provider
    await check_rate_limit(provider)
    
    # Create output filename if not provided
    if not output_filename:
        output_filename = f"ai-image-{int(time.time())}.png"
    
    # Ensure output directory exists
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, output_filename)
    
    try:
        if provider == "openai":
            if not OPENAI_API_KEY:
                raise ValueError("OPENAI_API_KEY environment variable is not set")
            
            # Initialize OpenAI client
            client = AsyncOpenAI(api_key=OPENAI_API_KEY)
            
            if model == "gpt-image-1":
                # Generate image with GPT-Image-1
                response = await client.images.generate(
                    model="gpt-image-1",
                    prompt=prompt,
                    size="1536x1024",
                    n=1,
                )
                
                # Decode and save the image
                image_base64 = response.data[0].b64_json
                image_bytes = base64.b64decode(image_base64)
                
                with open(output_path, 'wb') as f:
                    f.write(image_bytes)
                
                logger.info(f"Successfully generated image with GPT-Image-1 and saved to {output_path}")
            else:
                # Use DALL-E 3 (default)
                # Determine size format based on width and height
                size = "1536x1024"  # default
                if width == 1024 and height == 1024:
                    size = "1024x1024"
                elif width == 1024 and height == 1792:
                    size = "1024x1792"
                elif width == 1792 and height == 1024:
                    size = "1792x1024"
                
                response = await client.images.generate(
                    model="dall-e-3",
                    prompt=prompt,
                    size=size,
                    quality="standard",
                    n=1,
                )
                
                image_url = response.data[0].url
                
                # Download the image asynchronously
                async with aiohttp.ClientSession() as session:
                    async with session.get(image_url) as response:
                        if response.status == 200:
                            image_content = await response.read()
                            with open(output_path, 'wb') as f:
                                f.write(image_content)
                        else:
                            raise Exception(f"Failed to download image: {response.status}")
                
        elif provider == "google":
            if not GEMINI_API_KEY:
                raise ValueError("GEMINI_API_KEY environment variable is not set")
            
            logger.info(f"Generating image with Gemini API: prompt={prompt[:50]}...")
            
            # Using requests to call Gemini API directly
            api_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key={GEMINI_API_KEY}"
            
            # Prepare the request payload
            payload = {
                "contents": [{
                    "parts": [
                        {"text": prompt}
                    ]
                }],
                "generationConfig": {"responseModalities": ["Text", "Image"]}
            }
            
            # Use aiohttp for asynchronous API call
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    api_url,
                    headers={"Content-Type": "application/json"},
                    json=payload
                ) as response:
                    if response.status != 200:
                        raise Exception(f"Gemini API error: {response.status} - {await response.text()}")
                    
                    # Parse the response to extract the image data
                    response_data = await response.json()
                    
                    # Extract the image data from the response
                    image_binary = None
                    
                    if "candidates" in response_data and response_data["candidates"]:
                        for part in response_data["candidates"][0]["content"]["parts"]:
                            if part.get("text") is not None:
                                logger.info(f"Text response from Gemini: {part['text']}")
                            elif part.get("inlineData") is not None:
                                # Get the base64 encoded image data
                                image_data = part["inlineData"]["data"]
                                image_binary = base64.b64decode(image_data)
                                break
                    
                    if not image_binary:
                        raise ValueError("No image data found in Gemini API response")
                    
                    # Save the image
                    with open(output_path, 'wb') as f:
                        f.write(image_binary)
                    logger.info(f"Successfully generated image with Gemini API and saved to {output_path}")
            
        elif provider == "minimax":
            if not MINIMAX_API_KEY:
                raise ValueError("MINIMAX_API_KEY environment variable is not set")
            
            # Determine aspect ratio based on width and height
            if width > height:
                aspect_ratio = "16:9"
            elif width < height:
                aspect_ratio = "9:16"
            else:
                aspect_ratio = "1:1"
            
            # API endpoint
            url = "https://api.minimaxi.chat/v1/image_generation"
            
            # Prepare the request payload
            logger.info(f"Generating image with Minimax API: prompt={prompt[:50]}...")
            logger.info(f"Aspect ratio: {aspect_ratio}")
            logger.info(f"Width: {width}")
            logger.info(f"Height: {height}")
            payload = json.dumps({
                "model": "image-01",
                "prompt": prompt,
                "aspect_ratio": aspect_ratio,
                "response_format": "url",
                "width": width,
                "height": height,
                "n": 1,
                "prompt_optimizer": True
            })
            
            headers = {
                'Authorization': f'Bearer {MINIMAX_API_KEY}',
                'Content-Type': 'application/json'
            }
            
            # Use aiohttp for asynchronous API call
            async with aiohttp.ClientSession() as session:
                async with session.post(url, headers=headers, data=payload) as response:
                    if response.status != 200:
                        raise Exception(f"Minimax API error: {response.status} - {await response.text()}")
                    
                    # Parse the response to extract the image URL
                    response_data = await response.json()
                    
                    # Extract the image URL from the response
                    if ('data' in response_data and 
                        'image_urls' in response_data['data'] and 
                        len(response_data['data']['image_urls']) > 0):
                        
                        # Get the first image URL from the array
                        image_url = response_data['data']['image_urls'][0]
                        
                        if not image_url:
                            raise ValueError("No image URL found in Minimax API response")
                        
                        # Download the image
                        async with session.get(image_url) as img_response:
                            if img_response.status == 200:
                                image_content = await img_response.read()
                                with open(output_path, 'wb') as f:
                                    f.write(image_content)
                                logger.info(f"Successfully generated image with Minimax API and saved to {output_path}")
                            else:
                                raise Exception(f"Failed to download Minimax image: {img_response.status}")
                    else:
                        raise ValueError("Invalid response format from Minimax API")
            
        else:
            raise ValueError(f"Unsupported provider: {provider}")
            
        return output_path
        
    except Exception as e:
        logger.error(f"Error generating AI image: {str(e)}")
        raise

async def generate_ai_images_batch(
    prompts: List[str],
    provider: AIImageProvider = "openai",
    width: int = 1536,
    height: int = 1024,
    output_dir: str = "images",
    model: str = "gpt-image-1"  # Default model for OpenAI
) -> List[str]:
    """
    Generate multiple AI images concurrently using the specified provider.
    This function handles batch processing with proper rate limiting.
    
    Args:
        prompts: List of text prompts for image generation
        provider: The AI provider to use (openai, google, or minimax)
        width: Image width
        height: Image height
        output_dir: Directory to save the images
        model: Model to use for image generation (for OpenAI)
    
    Returns:
        List of paths to the generated images
    """
    logger.info(f"Batch generating {len(prompts)} images with {provider} provider")
    
    # Ensure output directory exists
    os.makedirs(output_dir, exist_ok=True)
    
    # Group prompts by provider for efficient processing
    if provider == "minimax":
        # For Minimax, we can process all prompts concurrently
        # since it has no rate limits
        tasks = []
        for i, prompt in enumerate(prompts):
            output_filename = f"ai-image-batch-{i}-{int(time.time())}.png"
            task = generate_ai_image(
                prompt=prompt,
                provider=provider,
                width=width,
                height=height,
                output_dir=output_dir,
                output_filename=output_filename
            )
            tasks.append(task)
        
        # Execute all tasks concurrently
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Process results and handle exceptions
        paths = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error(f"Error generating image for prompt {i}: {str(result)}")
                paths.append(None)
            else:
                paths.append(result)
        
        return paths
    
    elif provider == "openai":
        # For OpenAI, we need to respect the rate limits
        # We'll process in small batches of 5 (the rate limit) every minute
        batch_size = provider_rate_limits["openai"]["calls"]
        results = []
        
        # Process prompts in batches
        for i in range(0, len(prompts), batch_size):
            batch_prompts = prompts[i:i+batch_size]
            logger.info(f"Processing OpenAI batch {i//batch_size + 1} with {len(batch_prompts)} prompts")
            
            # Create tasks for this batch
            batch_tasks = []
            for j, prompt in enumerate(batch_prompts):
                output_filename = f"ai-image-batch-{i+j}-{int(time.time())}.png"
                task = generate_ai_image(
                    prompt=prompt,
                    provider=provider,
                    width=width,
                    height=height,
                    output_dir=output_dir,
                    output_filename=output_filename,
                    model=model
                )
                batch_tasks.append(task)
            
            # Execute this batch concurrently
            batch_results = await asyncio.gather(*batch_tasks, return_exceptions=True)
            results.extend(batch_results)
            
            # If we have more batches to process, wait to respect rate limits
            if i + batch_size < len(prompts):
                wait_time = provider_rate_limits["openai"]["period"]
                logger.info(f"Waiting {wait_time} seconds before processing next OpenAI batch")
                await asyncio.sleep(wait_time)
        
        # Process results and handle exceptions
        paths = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error(f"Error generating image for prompt {i}: {str(result)}")
                paths.append(None)
            else:
                paths.append(result)
        
        return paths
    
    elif provider == "google":
        # For Google, use a similar approach as OpenAI
        batch_size = provider_rate_limits["google"]["calls"]
        results = []
        
        # Process prompts in batches
        for i in range(0, len(prompts), batch_size):
            batch_prompts = prompts[i:i+batch_size]
            logger.info(f"Processing Google batch {i//batch_size + 1} with {len(batch_prompts)} prompts")
            
            # Create tasks for this batch
            batch_tasks = []
            for j, prompt in enumerate(batch_prompts):
                output_filename = f"ai-image-batch-{i+j}-{int(time.time())}.png"
                task = generate_ai_image(
                    prompt=prompt,
                    provider=provider,
                    width=width,
                    height=height,
                    output_dir=output_dir,
                    output_filename=output_filename
                )
                batch_tasks.append(task)
            
            # Execute this batch concurrently
            batch_results = await asyncio.gather(*batch_tasks, return_exceptions=True)
            results.extend(batch_results)
            
            # If we have more batches to process, wait to respect rate limits
            if i + batch_size < len(prompts):
                wait_time = provider_rate_limits["google"]["period"]
                logger.info(f"Waiting {wait_time} seconds before processing next Google batch")
                await asyncio.sleep(wait_time)
        
        # Process results and handle exceptions
        paths = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error(f"Error generating image for prompt {i}: {str(result)}")
                paths.append(None)
            else:
                paths.append(result)
        
        return paths
    
    else:
        raise ValueError(f"Unsupported provider: {provider}") 