import os
import requests
import logging
from typing import Dict, Any, List, Optional, Set
import time
import random
import tempfile
import shutil
from urllib.parse import urlparse
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# API keys from environment variables
PEXELS_API_KEY = os.getenv("PEXELS_API_KEY")
PIXABAY_API_KEY = os.getenv("PIXABAY_API_KEY")
SERPAPI_KEY = os.getenv("SERPAPI_KEY")

# Rate limiting settings
API_DELAY_MS = 200  # 0.2 seconds delay between API requests
MAX_RETRIES = 3     # Maximum number of retries for API requests
BASE_RETRY_DELAY = 2  # Base delay for exponential backoff (seconds)

# Track used URLs to avoid duplicates
_used_urls: Set[str] = set()

async def _make_api_request_with_retry(url, headers=None, params=None, max_retries=MAX_RETRIES):
    """Make an API request with exponential backoff retry logic."""
    retry_count = 0
    while retry_count <= max_retries:
        try:
            response = requests.get(url, headers=headers, params=params)
            logger.info(f"API response: {response.status_code}")
            logger.info(f"API response: {response.json()}")
            
            # If rate limited, back off and retry
            if response.status_code == 429:  # Too Many Requests
                retry_count += 1
                if retry_count > max_retries:
                    logger.error(f"Maximum retries reached for {url}")
                    response.raise_for_status()
                    
                # Calculate backoff delay with jitter
                delay = BASE_RETRY_DELAY * (2 ** retry_count) + random.uniform(0, 1)
                logger.warning(f"Rate limited. Backing off for {delay:.2f} seconds before retry {retry_count}/{max_retries}")
                time.sleep(delay)
                continue
                
            # For other errors, raise exception
            response.raise_for_status()
            
            # Successful response
            return response.json()
            
        except requests.exceptions.RequestException as e:
            retry_count += 1
            if retry_count > max_retries:
                logger.error(f"Maximum retries reached for {url}: {str(e)}")
                raise
                
            # Calculate backoff delay with jitter
            delay = BASE_RETRY_DELAY * (2 ** retry_count) + random.uniform(0, 1)
            logger.warning(f"Request error: {str(e)}. Backing off for {delay:.2f} seconds before retry {retry_count}/{max_retries}")
            time.sleep(delay)
            
    # If we get here, all retries failed
    raise Exception(f"API request to {url} failed after {max_retries} retries")

async def search_pexels_videos(query: str, per_page: int = 10) -> Dict[str, Any]:
    """
    Search Pexels API for videos matching the query.
    
    Args:
        query: Search query
        per_page: Number of results to return
        
    Returns:
        Dictionary with search results
    """
    if not PEXELS_API_KEY:
        raise ValueError("PEXELS_API_KEY environment variable is not set")
        
    url = "https://api.pexels.com/videos/search"
    headers = {"Authorization": PEXELS_API_KEY}
    params = {"query": query, "per_page": per_page, "orientation": "landscape"}
    
    try:
        data = await _make_api_request_with_retry(url, headers=headers, params=params)
        
        # Log the raw response for debugging
        logger.info(f"API response: {data}")
        
        # Format the response to match the expected structure
        videos = []
        for video in data.get("videos", []):
            # Get the best quality video file
            video_files = sorted(
                video.get("video_files", []),
                key=lambda x: x.get("width", 0) * x.get("height", 0),
                reverse=True
            )
            
            if video_files:
                best_video = video_files[0]
                download_url = best_video.get("link", "")
                
                # Skip if this URL has been used before
                if download_url in _used_urls:
                    logger.info(f"Skipping duplicate video URL: {download_url}")
                    continue
                
                # Get the thumbnail from video_pictures if available
                thumbnail = video.get("image", "")  # Default from the video image
                if "video_pictures" in video and video["video_pictures"]:
                    # Get the first picture from video_pictures
                    first_picture = video["video_pictures"][0]
                    if first_picture and "picture" in first_picture:
                        thumbnail = first_picture["picture"]
                
                # Mark URL as used
                _used_urls.add(download_url)
                
                videos.append({
                    "id": video.get("id"),
                    "width": best_video.get("width"),
                    "height": best_video.get("height"),
                    "duration": video.get("duration"),
                    "image": video.get("image"),
                    "thumbnail": thumbnail,  # Add explicit thumbnail field
                    "downloadUrl": download_url,
                    "user": video.get("user", {}).get("name"),
                    "video_pictures": video.get("video_pictures", [])  # Include video_pictures
                })
                
                # Break if we've collected enough results
                if len(videos) >= per_page:
                    break
                
        # Add delay to avoid rate limiting
        time.sleep(API_DELAY_MS / 1000)
        
        return {"videos": videos, "provider": "pexels", "raw_response": data}  # Include raw response
        
    except Exception as e:
        logger.error(f"Error searching Pexels videos: {str(e)}")
        return {"videos": [], "provider": "pexels", "error": str(e)}

async def search_pexels_images(query: str, per_page: int = 10) -> List[Dict[str, Any]]:
    """
    Search Pexels API for images matching the query.
    
    Args:
        query: Search query
        per_page: Number of results to return
        
    Returns:
        List of image results
    """
    if not PEXELS_API_KEY:
        raise ValueError("PEXELS_API_KEY environment variable is not set")
        
    url = "https://api.pexels.com/v1/search"
    headers = {"Authorization": PEXELS_API_KEY}
    params = {"query": query, "per_page": per_page, "orientation": "landscape"}
    
    try:
        data = await _make_api_request_with_retry(url, headers=headers, params=params)
        
        # Format the response
        images = []
        print(data)
        for photo in data.get("photos", []):
            download_url = photo.get("src", {}).get("original", "")
            
            # Skip if this URL has been used before
            if download_url in _used_urls:
                logger.info(f"Skipping duplicate image URL: {download_url}")
                continue
            
            # Mark URL as used
            _used_urls.add(download_url)
            
            images.append({
                "id": photo.get("id"),
                "url": download_url,
                "width": photo.get("width"),
                "height": photo.get("height"),
                "thumbnail": photo.get("src", {}).get("medium"),
                "source": "pexels",
                "source_url": photo.get("url"),
                "photographer": photo.get("photographer"),
                "downloadUrl": download_url
            })
            
            # Break if we've collected enough results
            if len(images) >= per_page:
                break
                
        # Add delay to avoid rate limiting
        time.sleep(API_DELAY_MS / 1000)
        
        return images
        
    except Exception as e:
        logger.error(f"Error searching Pexels images: {str(e)}")
        return []
        
async def search_pixabay_videos(query: str, per_page: int = 10) -> Dict[str, Any]:
    """
    Search Pixabay API for videos matching the query.
    
    Args:
        query: Search query
        per_page: Number of results to return
        
    Returns:
        Dictionary with search results
    """
    pixabay_api_key = os.getenv("PIXABAY_API_KEY")
        
    url = "https://pixabay.com/api/videos/"
    params = {
        "key": pixabay_api_key,
        "q": query.replace("'", "").replace('"', ''),
        "per_page": per_page,
        "orientation": "landscape"
    }
    
    try:
        logger.info(f"Searching Pixabay videos with query: {query}")
        logger.info(f"Request URL: {url}")
        logger.info(f"Request params: {params}")
        
        data = await _make_api_request_with_retry(url, params=params)
        
        # Log total hits and response structure
        logger.info(f"Pixabay videos search completed. Total hits: {data.get('totalHits', 0)}")
        
        # Format the response to match the expected structure
        videos = []
        for hit in data.get("hits", []):
            # Get the video URLs from the response
            video_files = hit.get("videos", {})
            
            # Choose the best available quality (large, medium, small, tiny)
            video_url = None
            thumbnail = None
            width = 0
            height = 0
            
            # Check for tiny version first, then move up to higher resolutions
            if video_files.get("tiny"):
                video_url = video_files["tiny"].get("url")
                thumbnail = video_files["tiny"].get("thumbnail")
                width = video_files["tiny"].get("width", 0)
                height = video_files["tiny"].get("height", 0)
            elif video_files.get("small"):
                video_url = video_files["small"].get("url")
                thumbnail = video_files["small"].get("thumbnail")
                width = video_files["small"].get("width", 0)
                height = video_files["small"].get("height", 0)
            elif video_files.get("medium"):
                video_url = video_files["medium"].get("url")
                thumbnail = video_files["medium"].get("thumbnail")
                width = video_files["medium"].get("width", 0)
                height = video_files["medium"].get("height", 0)
            elif video_files.get("large"):
                video_url = video_files["large"].get("url")
                thumbnail = video_files["large"].get("thumbnail")
                width = video_files["large"].get("width", 0)
                height = video_files["large"].get("height", 0)
            
            if video_url:
                # Skip if this URL has been used before
                if video_url in _used_urls:
                    logger.info(f"Skipping duplicate video URL: {video_url}")
                    continue
                
                # Mark URL as used
                _used_urls.add(video_url)
                
                videos.append({
                    "id": hit.get("id"),
                    "width": width,
                    "height": height,
                    "duration": hit.get("duration"),
                    "image": thumbnail,  # Use the video thumbnail
                    "thumbnail": thumbnail,
                    "downloadUrl": video_url,
                    "user": hit.get("user"),
                    "tags": hit.get("tags"),
                    "pageURL": hit.get("pageURL"),
                    "source": "pixabay"
                })
                logger.info(f"Added video with ID: {hit.get('id')}")
                
                # Break if we've collected enough results
                if len(videos) >= per_page:
                    break
                
        # Add delay to avoid rate limiting
        time.sleep(API_DELAY_MS / 1000)
        
        return {"videos": videos, "provider": "pixabay", "total": data.get("total", 0), "totalHits": data.get("totalHits", 0)}
        
    except Exception as e:
        logger.error(f"Error searching Pixabay videos: {str(e)}")
        return {"videos": [], "provider": "pixabay", "error": str(e)}

async def search_pixabay_images(query: str, per_page: int = 10) -> List[Dict[str, Any]]:
    """
    Search Pixabay API for images matching the query.
    
    Args:
        query: Search query
        per_page: Number of results to return
        
    Returns:
        List of image results
    """
    if not PIXABAY_API_KEY:
        raise ValueError("PIXABAY_API_KEY environment variable is not set")
        
    url = "https://pixabay.com/api/"
    params = {
        "key": PIXABAY_API_KEY,
        "q": query.replace("'", "").replace('"', ''),
        "per_page": per_page,
        "image_type": "photo",
    }
    
    try:
        logger.info(f"Searching Pixabay images with query: {query}")
        logger.info(f"Request URL: {url}")
        logger.info(f"Request params: {params}")
        
        data = await _make_api_request_with_retry(url, params=params)
        
        # Log total hits and response structure
        logger.info(f"Pixabay images search completed. Total hits: {data.get('totalHits', 0)}")
        
        # Format the response
        images = []
        for hit in data.get("hits", []):
            # Make sure we have all the required fields
            image_url = hit.get("largeImageURL")
            if not image_url:
                logger.warning(f"Missing largeImageURL for hit ID: {hit.get('id')}")
                continue
                
            # Skip if this URL has been used before
            if image_url in _used_urls:
                logger.info(f"Skipping duplicate image URL: {image_url}")
                continue
            
            # Mark URL as used
            _used_urls.add(image_url)
            
            image_data = {
                "id": hit.get("id"),
                "url": image_url,
                "width": hit.get("imageWidth"),
                "height": hit.get("imageHeight"),
                "thumbnail": hit.get("previewURL"),
                "source": "pixabay",
                "source_url": hit.get("pageURL"),
                "photographer": hit.get("user"),
                "downloadUrl": image_url,
                "tags": hit.get("tags"),
                "likes": hit.get("likes"),
                "downloads": hit.get("downloads"),
                "views": hit.get("views")
            }
            
            images.append(image_data)
            logger.info(f"Added image with ID: {hit.get('id')}")
            
            # Break if we've collected enough results
            if len(images) >= per_page:
                break
                
        # Add delay to avoid rate limiting
        time.sleep(API_DELAY_MS / 1000)
        
        return images
        
    except Exception as e:
        logger.error(f"Error searching Pixabay images: {str(e)}", exc_info=True)
        return []
        
async def search_images(query: str, num_results: int = 3, provider: str = None) -> List[Dict[str, Any]]:
    """
    Search for images using SerpAPI or direct image providers.
    
    Args:
        query: Search query
        num_results: Number of results to return
        provider: Optional provider to use (pexels, pixabay)
        
    Returns:
        List of image results
    """
    # If provider is specified, use that provider
    if provider == "pexels":
        return await search_pexels_images(query, num_results)
    elif provider == "pixabay":
        return await search_pixabay_images(query, num_results)
    
    # Otherwise try SerpAPI as default
    if not SERPAPI_KEY:
        logger.warning("SERPAPI_KEY environment variable is not set, using fallback image search")
        # Try to get images from both Pexels and Pixabay
        pexels_images = await search_pexels_images(query, num_results // 2) if PEXELS_API_KEY else []
        pixabay_images = await search_pixabay_images(query, num_results // 2) if PIXABAY_API_KEY else []
        return pexels_images + pixabay_images
        
    url = "https://serpapi.com/search.json"
    params = {
        "api_key": SERPAPI_KEY,
        "engine": "google_images",
        "q": query,
        "ijn": 0,
        "tbm": "isch"
    }
    
    try:
        data = await _make_api_request_with_retry(url, params=params)
        
        images = []
        for image in data.get("images_results", []):
            image_url = image.get("original")
            
            # Skip if this URL has been used before
            if image_url in _used_urls:
                logger.info(f"Skipping duplicate image URL: {image_url}")
                continue
            
            # Mark URL as used
            _used_urls.add(image_url)
            
            images.append({
                "url": image_url,
                "thumbnail": image.get("thumbnail"),
                "width": image.get("original_width"),
                "height": image.get("original_height"),
                "source": image.get("source"),
                "downloadUrl": image_url
            })
            
            # Break if we've collected enough results
            if len(images) >= num_results:
                break
            
        # Add delay to avoid rate limiting
        time.sleep(API_DELAY_MS / 1000)
        
        return images
        
    except Exception as e:
        logger.error(f"Error searching images with SerpAPI: {str(e)}")
        # Fall back to Pexels and Pixabay
        pexels_images = await search_pexels_images(query, num_results // 2) if PEXELS_API_KEY else []
        pixabay_images = await search_pixabay_images(query, num_results // 2) if PIXABAY_API_KEY else []
        return pexels_images + pixabay_images

async def clear_url_cache():
    """Clear the URL cache to allow reusing URLs in a new search session."""
    global _used_urls
    _used_urls.clear()
    logger.info("URL cache cleared")

async def download_image(image_url: str, output_dir: str = None) -> str:
    """
    Download an image from a URL and save it to disk.
    
    Args:
        image_url: URL of the image to download
        output_dir: Directory to save the image to
        
    Returns:
        Path to the downloaded image
    """
    try:
        # Create a temporary directory if not provided
        temp_dir = output_dir or tempfile.mkdtemp()
        
        # Get filename from URL or generate a random one
        parsed_url = urlparse(image_url)
        filename = Path(parsed_url.path).name
        if not filename or len(filename) < 5:
            # Generate a random filename with timestamp
            filename = f"image-{int(time.time())}-{random.randint(1000, 9999)}.jpg"
            
        # Create full path
        image_path = os.path.join(temp_dir, filename)
        
        # Download with retries
        retry_count = 0
        while retry_count <= MAX_RETRIES:
            try:
                response = requests.get(image_url, stream=True, timeout=10)
                response.raise_for_status()
                
                # Save the image
                with open(image_path, 'wb') as out_file:
                    shutil.copyfileobj(response.raw, out_file)
                    
                return image_path
                
            except requests.exceptions.RequestException as e:
                retry_count += 1
                if retry_count > MAX_RETRIES:
                    logger.error(f"Failed to download image {image_url} after {MAX_RETRIES} retries: {str(e)}")
                    raise
                    
                # Calculate backoff delay with jitter
                delay = BASE_RETRY_DELAY * (2 ** retry_count) + random.uniform(0, 1)
                logger.warning(f"Download error: {str(e)}. Backing off for {delay:.2f} seconds before retry {retry_count}/{MAX_RETRIES}")
                time.sleep(delay)
                
    except Exception as e:
        logger.error(f"Error downloading image from {image_url}: {str(e)}")
        raise 