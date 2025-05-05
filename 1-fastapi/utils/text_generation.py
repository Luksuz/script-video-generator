import os
import logging
import time
import openai
from typing import Dict, Any, Optional

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load API keys from environment
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# Rate limiting settings
RATE_LIMIT_CALLS = 5       # Number of calls allowed
RATE_LIMIT_PERIOD = 60     # In seconds (1 minute)

# Keep track of API calls for rate limiting
api_call_timestamps = []

async def generate_text(prompt: str, model: str = "gpt-4o-mini") -> str:
    """
    Generate text using OpenAI API.
    
    Args:
        prompt: Text prompt for generation
        model: OpenAI model name
        
    Returns:
        Generated text
    """
    if not OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY environment variable is not set")
    
    openai.api_key = OPENAI_API_KEY
    
    try:
        response = openai.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=1000,
            temperature=0.7
        )
        
        return response.choices[0].message.content.strip()
        
    except Exception as e:
        logger.error(f"Error generating text: {str(e)}")
        raise 