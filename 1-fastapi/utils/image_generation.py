import os
import requests
from typing import Optional, Literal
import time
import logging
from io import BytesIO
from openai import OpenAI
import os
import base64
from PIL import Image as PILImage
from dotenv import load_dotenv
import json

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

# Keep track of API calls for rate limiting
api_call_timestamps = []

async def generate_ai_image(
    prompt: str,
    provider: AIImageProvider = "openai",
    width: int = 1024,
    height: int = 1024,
    output_dir: str = "images",
    output_filename: Optional[str] = None,
    aspect_ratio: str = "1:1",
    model: str = "dall-e-3"  # Default model for OpenAI
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
    # Rate limiting check
    global api_call_timestamps
    current_time = time.time()
    
    # Remove timestamps older than the rate limit period
    api_call_timestamps = [ts for ts in api_call_timestamps if current_time - ts < RATE_LIMIT_PERIOD]
    
    # Check if we've hit the rate limit
    if len(api_call_timestamps) >= RATE_LIMIT_CALLS:
        wait_time = RATE_LIMIT_PERIOD - (current_time - api_call_timestamps[0])
        logger.info(f"Rate limit reached. Waiting {wait_time:.2f} seconds...")
        time.sleep(wait_time)
        # Refresh the timestamp list after waiting
        api_call_timestamps = [ts for ts in api_call_timestamps if current_time - ts < RATE_LIMIT_PERIOD]
    
    # Add the current timestamp
    api_call_timestamps.append(current_time)
    
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
            client = OpenAI(api_key=OPENAI_API_KEY)
            
            if model == "gpt-image-1":
                logger.info(f"Generating image with OpenAI GPT-Image-1: prompt={prompt[:50]}...")
                
                # Generate image with GPT-Image-1
                response = client.images.generate(
                    model="gpt-image-1",
                    prompt=prompt,
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
                size = "1024x1024"  # default
                if width == 1024 and height == 1024:
                    size = "1024x1024"
                elif width == 1024 and height == 1792:
                    size = "1024x1792"
                elif width == 1792 and height == 1024:
                    size = "1792x1024"
                
                response = client.images.generate(
                    model="dall-e-3",
                    prompt=prompt,
                    size=size,
                    quality="standard",
                    n=1,
                )
                
                image_url = response.data[0].url
                
                # Download the image
                image_response = requests.get(image_url)
                if image_response.status_code == 200:
                    with open(output_path, 'wb') as f:
                        f.write(image_response.content)
                else:
                    raise Exception(f"Failed to download image: {image_response.status_code}")
                
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
            # Make the API request
            response = requests.post(
                api_url,
                headers={"Content-Type": "application/json"},
                json=payload
            )
            
            if response.status_code != 200:
                raise Exception(f"Gemini API error: {response.status_code} - {response.text}")
            
            # Parse the response to extract the image data
            response_data = response.json()
            logger.debug(f"Gemini API response: {response_data}")
            
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
            
            logger.info(f"Generating image with Minimax API: prompt={prompt[:50]}...")
            
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
            payload = json.dumps({
                "model": "image-01",
                "prompt": prompt,
                "aspect_ratio": aspect_ratio,
                "response_format": "url",
                "n": 1,
                "prompt_optimizer": True
            })
            
            headers = {
                'Authorization': f'Bearer {MINIMAX_API_KEY}',
                'Content-Type': 'application/json'
            }
            
            # Make the API request
            response = requests.request("POST", url, headers=headers, data=payload)
            
            if response.status_code != 200:
                raise Exception(f"Minimax API error: {response.status_code} - {response.text}")
            
            # Parse the response to extract the image URL
            response_data = response.json()
            logger.debug(f"Minimax API response: {response_data}")
            
            # Extract the image URL from the response
            # The structure is: response_data -> data -> image_urls -> [array of URLs]
            if ('data' in response_data and 
                'image_urls' in response_data['data'] and 
                len(response_data['data']['image_urls']) > 0):
                
                # Get the first image URL from the array
                image_url = response_data['data']['image_urls'][0]
                
                if not image_url:
                    raise ValueError("No image URL found in Minimax API response")
                
                # Download the image
                image_response = requests.get(image_url)
                if image_response.status_code == 200:
                    with open(output_path, 'wb') as f:
                        f.write(image_response.content)
                    logger.info(f"Successfully generated image with Minimax API and saved to {output_path}")
                else:
                    raise Exception(f"Failed to download Minimax image: {image_response.status_code}")
            else:
                raise ValueError("Invalid response format from Minimax API")
            
        else:
            raise ValueError(f"Unsupported provider: {provider}")
            
        return output_path
        
    except Exception as e:
        logger.error(f"Error generating AI image: {str(e)}")
        raise 