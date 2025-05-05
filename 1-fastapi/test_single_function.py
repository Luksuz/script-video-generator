import os
import asyncio
import logging
from dotenv import load_dotenv
import sys
from unittest.mock import patch, AsyncMock

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Import the models but patch the dependencies to avoid DB calls
from models import ContentSection, ImageResult

# Create mocks for dependencies
class MockSupabaseStorage:
    async def upload_file(self, file_content, file_name, folder, content_type):
        logger.info(f"Mock: Uploading file {file_name} to {folder}")
        return f"https://mock-storage-url.com/{folder}/{file_name}"

class MockSupabaseDB:
    async def create_job(self, **kwargs):
        logger.info(f"Mock: Creating job in Supabase db")
        return {"id": "mock-job-id"}

# Apply mocks before importing the function
sys.modules['utils.supabase_storage'] = AsyncMock()
sys.modules['utils.supabase_storage'].supabase_storage = MockSupabaseStorage()
sys.modules['utils.supabaseDB'] = AsyncMock()
sys.modules['utils.supabaseDB'].supabase_db = MockSupabaseDB()

# Mock generate_text function
async def mock_generate_text(prompt):
    """Mock function for text generation API calls."""
    logger.info(f"Mock: Generating text for prompt: {prompt[:50]}...")
    return "sample descriptive prompt"

# Mock generate_ai_image function
async def mock_generate_ai_image(prompt, provider, width, height):
    """Mock function for AI image generation."""
    logger.info(f"Mock: Generating AI image for prompt: {prompt}")
    # Create a temporary file path that would be returned by the real function
    temp_path = f"/tmp/mock-image-{prompt[:10].replace(' ', '-')}.png"
    # Create an empty file
    with open(temp_path, "w") as f:
        f.write("mock image data")
    return temp_path

# Now import the function
from routes.process_script import process_text_content_for_ai_images_generation

async def test_process_text_content_for_ai_images_generation():
    """Test the process_text_content_for_ai_images_generation function in isolation."""
    try:
        # Sample input data
        test_content = """
        This is a test script. It contains sample text that will be processed.
        The function should generate AI images based on this text.
        We're testing how it splits the content and generates appropriate prompts.
        """
        
        # Function parameters
        images_per_minute = 10
        ai_provider = "openai"  # Change to the provider you want to test
        
        # Patch the dependencies
        with patch('routes.process_script.generate_text', mock_generate_text), \
             patch('routes.process_script.generate_ai_image', mock_generate_ai_image), \
             patch('routes.process_script.supabase_storage', MockSupabaseStorage()):
            
            # Call the function
            logger.info("Testing process_text_content_for_ai_images_generation function...")
            result = await process_text_content_for_ai_images_generation(
                file_content=test_content,
                images_per_minute=images_per_minute,
                ai_provider=ai_provider,
            )
            
            # Log the results
            logger.info(f"Generated {len(result)} content sections")
            for i, section in enumerate(result):
                logger.info(f"Section {i+1}:")
                logger.info(f"  Segment: {section.segment}")
                logger.info(f"  Query: {section.query}")
                if section.aiImages:
                    logger.info(f"  AI Images: {len(section.aiImages)}")
                    for img in section.aiImages:
                        logger.info(f"    URL: {img.get('url')}")
                else:
                    logger.info("  No AI images generated")
            
            return result
    
    except Exception as e:
        logger.error(f"Error testing function: {str(e)}")
        import traceback
        traceback.print_exc()
        raise

if __name__ == "__main__":
    try:
        # Run the async test function
        result = asyncio.run(test_process_text_content_for_ai_images_generation())
        logger.info("Test completed!")
    except Exception as e:
        logger.error(f"Test failed: {str(e)}")
        import traceback
        traceback.print_exc() 