## Minimax Provider Integration

The application now supports Minimax as a provider for AI image generation. To use this feature:

1. Sign up for a Minimax API key at https://api.minimaxi.chat/
2. Add your Minimax API key to your environment variables:
   ```
   MINIMAX_API_KEY=your_minimax_api_key_here
   ```
3. When creating content, select "minimax" as the provider for images.

### Example Minimax API Usage

```python
import requests
import json

url = "https://api.minimaxi.chat/v1/image_generation"
api_key = "your_minimax_api_key_here"

payload = json.dumps({
  "model": "image-01", 
  "prompt": "your prompt here",
  "aspect_ratio": "16:9",  # Options: "1:1", "16:9", "9:16"
  "response_format": "url",
  "n": 1,  # Number of images to generate
  "prompt_optimizer": True
})

headers = {
  'Authorization': f'Bearer {api_key}',
  'Content-Type': 'application/json'
}

response = requests.request("POST", url, headers=headers, data=payload)
response_data = response.json()
print(response_data)

# Access the first generated image URL
if ('data' in response_data and 
    'image_urls' in response_data['data'] and 
    len(response_data['data']['image_urls']) > 0):
    first_image_url = response_data['data']['image_urls'][0]
    print(f"First image URL: {first_image_url}")
```

### Example Response Structure

```json
{
    "id": "03ff3cd0820949eb8a410056b5f21d38",
    "data": {
        "image_urls": [
            "https://example.com/image1.jpg",
            "https://example.com/image2.jpg",
            "https://example.com/image3.jpg"
        ]
    },
    "metadata": {
        "failed_count": "0",
        "success_count": "3"
    },
    "base_resp": {
        "status_code": 0,
        "status_msg": "success"
    }
}
```

The response contains an array of image URLs that can be downloaded and displayed in the application.

## OpenAI GPT-Image-1 Integration

The application now supports OpenAI's GPT-Image-1 model for AI image generation. To use this feature:

1. Ensure you have an OpenAI API key
2. Add your OpenAI API key to your environment variables:
   ```
   OPENAI_API_KEY=your_openai_api_key_here
   ```
3. When creating content in image mode, select "openai-gpt-image" as the provider.

### Example GPT-Image-1 API Usage

```python
from openai import OpenAI
import base64

client = OpenAI()

prompt = "A children's book drawing of a veterinarian using a stethoscope to listen to the heartbeat of a baby otter."

result = client.images.generate(
    model="gpt-image-1",
    prompt=prompt,
    n=1,
    response_format="b64_json"
)

image_base64 = result.data[0].b64_json
image_bytes = base64.b64decode(image_base64)

# Save the image to a file
with open("output.png", "wb") as f:
    f.write(image_bytes)
```

GPT-Image-1 produces photorealistic images with natural lighting and shadows, following your prompts with high fidelity. It's particularly good at generating images in specific styles, detailed scenes, and accurate human anatomy. 