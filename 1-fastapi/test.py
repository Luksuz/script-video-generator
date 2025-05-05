
import requests
import json
import os
from dotenv import load_dotenv
import time

load_dotenv()


# def start_video_generation(prompt: str):
#     url = "https://api.minimaxi.chat/v1/video_generation"
#     api_key = os.getenv("MINIMAX_API_KEY")

#     payload = json.dumps({
#         "model": "T2V-01-Director",
#         "prompt": prompt,
#     })
#     headers = {
#         'authorization': f'Bearer {api_key}',
#         'Content-Type': 'application/json'
#     }

#     response = requests.request("POST", url, headers=headers, data=payload)

#     return response.text.get("task_id")



# def query_video_status(job_id: str):
#     api_key=os.getenv("MINIMAX_API_KEY")
#     task_id=job_id

#     url = f"http://api.minimaxi.chat/v1/query/video_generation?task_id={task_id}"

#     payload = {}
#     headers = {
#     'authorization': f'Bearer {api_key}',
#     'content-type': 'application/json',
#     }

#     response = requests.request("GET", url, headers=headers, data=payload)

#     return response.text.get("status_code")




# job_id = start_video_generation("[Truck left,Pan right]A woman is drinking coffee.")

# print(job_id)



# job_id = start_video_generation("[Truck left,Pan right]A woman is drinking coffee.")
# while True:
#     job_status = query_video_status(job_id)
#     if job_status == 200:
#         break
#     time.sleep(1)



import requests

group_id = "fill in the groupid"
api_key = "fill in the api key"
file_id = "fill in the file id"

url = f'https://api.minimaxi.chat/v1/files/retrieve?GroupId={group_id}&file_id={file_id}'
headers = {
    'authority': 'api.minimaxi.chat',
    'content-type': 'application/json',
    'Authorization': f'Bearer {api_key}'
}

response = requests.get(url, headers=headers)
print(response.text)



# #!/usr/bin/env python3
# import asyncio
# import json
# import os
# from dotenv import load_dotenv
# import sys
# sys.path.append("1-fastapi")  # Add path to the directory with search_helpers

# from utils.search_helpers import search_pixabay_videos

# # Load environment variables from .env file if present
# load_dotenv()

# # Check if API key is set
# if not os.getenv("PIXABAY_API_KEY"):
#     print("Error: PIXABAY_API_KEY environment variable is not set.")
#     print("Please set it in a .env file or export it in your shell.")
#     sys.exit(1)

# async def test_pixabay_videos():
#     """Test the Pixabay video search functionality"""
#     # Define search queries to test
#     test_queries = [
#         'small tree nature'
#     ]
    
#     for query in test_queries:
#         print(f"\n{'='*50}")
#         print(f"Testing search for: '{query}'")
#         print(f"{'='*50}")
        
#         # Call the search function
#         try:
#             results = await search_pixabay_videos(query, per_page=3)
            
#             # Print summary
#             print(f"Total hits: {results.get('totalHits', 0)}")
#             print(f"Videos found: {len(results.get('videos', []))}")
            
#             # Print details of each video
#             for i, video in enumerate(results.get('videos', [])):
#                 print(f"\nVideo {i+1}:")
#                 print(f"  ID: {video.get('id')}")
#                 print(f"  Duration: {video.get('duration')} seconds")
#                 print(f"  Size: {video.get('width')}x{video.get('height')}")
#                 print(f"  Thumbnail: {video.get('thumbnail')}")
#                 print(f"  Download URL: {video.get('downloadUrl')}")
#                 print(f"  User: {video.get('user')}")
#                 print(f"  Tags: {video.get('tags')}")
                
#         except Exception as e:
#             print(f"Error during search: {str(e)}")

# if __name__ == "__main__":
#     # Run the test function
#     asyncio.run(test_pixabay_videos())