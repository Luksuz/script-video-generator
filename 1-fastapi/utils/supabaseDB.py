import os
import uuid
import logging
from typing import Optional, Dict, Any, List, Union, Literal
from supabase import create_client, Client

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# Get Supabase credentials from environment variables
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY")

class SupabaseDB:
    def __init__(self):
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise ValueError("Supabase credentials not found in environment variables")
        
        self.client: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
        
    async def add_img_data(self, public_url: str, job_id: str, prompt: str, provider: str) -> str:
        """
        Upload a image data to Supabase.
        
        Args:
            provider: The provider of the image
            prompt: The prompt of the image
            public_url: The public URL of the image
        Returns:
            The URL of the uploaded file
        """
        try:

                
            # Upload the file
            logger.info(f"Uploading image data to Supabase db: {public_url}")
            
            # Upload using the SDK
            result = self.client.table("images").insert({
                "supabase_storage_path": public_url,
                "job_id": job_id,
                "prompt": prompt,
                "provider": provider
            }).execute()

            
            logger.info(f"File uploaded successfully: {public_url}")
            return public_url
            
        except Exception as e:
            logger.error(f"Error uploading file: {str(e)}")
            raise
    
    async def delete_file(self, path: str) -> bool:
        """
        Delete a file from Supabase Storage.
        
        Args:
            path: Path to the file within the bucket
            
        Returns:
            True if deleted successfully
        """
        try:
            # Ensure path is properly formatted
            path = path.lstrip("/")
            
            # Delete the file
            logger.info(f"Deleting file from Supabase: {path}")
            
            self.client.table(self.bucket_name).remove([path])
            logger.info("File deleted successfully")
            return True
            
        except Exception as e:
            logger.error(f"Error deleting file: {str(e)}")
            return False
    
    async def get_img_data(self, job_id: str) -> List[Dict[str, Any]]:
        """
        Get image data from Supabase db.
        
        Args:
            job_id: The id of the job
            
        Returns:
            List of file objects
        """
        try:
            # Ensure path is properly formatted
            job_id = job_id.lstrip("/")
            
            # List records
            logger.info(f"Listing records in Supabase db: {job_id}")
            
            files = self.client.table("images").select("*").eq("job_id", job_id).execute()
            return files
            
        except Exception as e:
            logger.error(f"Error listing files: {str(e)}")
            return []
        

    async def create_job(self, script_text: str, mode: Literal["videos", "images", "mixed", "ai_images"], video_url: str, status: Literal[1, 2, 3, 4], total_duration: Optional[float] = None) -> Dict[str, Any]:

        #atatus: 1: pending, 2: processing, 3: completed, 4: failed
        """
        Create a job in Supabase db.
        
        Args:
            script_text: The script text
            mode: The content mode
            video_url: The video URL (if any)
            status: Job status (1=pending, 2=processing, 3=completed, 4=failed)
            total_duration: Total duration of the content in seconds
            
        Returns:
            Created job record
        """
        try:
            # Create a job
            logger.info(f"Creating job in Supabase db: {script_text[:10]}")
            
            job_data = {
                "script_text": script_text,
                "mode": mode,
                "video_url": video_url,
                "status": status
            }
            
            if total_duration is not None:
                job_data["total_duration"] = total_duration
            
            response = self.client.table("jobs").insert(job_data).execute()
            
            # Extract the actual data from the response
            if hasattr(response, 'data') and response.data:
                # Return the first result if available
                return response.data[0] if response.data else {}
            
            # Fallback to return full response if data attribute not available
            return response
        
        except Exception as e:
            logger.error(f"Error creating job: {str(e)}")
            raise
            
    async def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a job from Supabase db by ID.
        
        Args:
            job_id: The job ID
            
        Returns:
            Job data or None if not found
        """
        try:
            # Get job by ID
            logger.info(f"Getting job from Supabase db: {job_id}")
            
            response = self.client.table("jobs").select("*").eq("id", job_id).execute()
            
            # Extract data from response
            if hasattr(response, 'data') and response.data:
                return response.data[0] if response.data else None
            
            return None
            
        except Exception as e:
            logger.error(f"Error getting job: {str(e)}")
            return None
            
    async def update_job_status(self, job_id: str, status: Literal[1, 2, 3, 4]) -> bool:
        """
        Update job status in Supabase db.
        
        Args:
            job_id: The job ID
            status: The new status (1=pending, 2=processing, 3=completed, 4=failed)
            
        Returns:
            True if updated successfully
        """
        try:
            logger.info(f"Updating job status to {status} for job: {job_id}")
            
            response = self.client.table("jobs").update({
                "status": status
            }).eq("id", job_id).execute()
            
            return True
            
        except Exception as e:
            logger.error(f"Error updating job status: {str(e)}")
            return False
    
    
    async def update_job_error(self, job_id: str, error: str) -> bool:
        """
        Update job error in Supabase db.
        
        Args:
            job_id: The job ID
            error: The error message
            
        Returns:
            True if updated successfully
        """
        try:
            logger.info(f"Updating job error for job: {job_id}")
            
            response = self.client.table("jobs").update({
                "error": error
            }).eq("id", job_id).execute()
            
            return True
            
        except Exception as e:
            logger.error(f"Error updating job error: {str(e)}")
            return False
        

    async def update_segment_count(self, job_id: str, segment_count: int) -> bool:
        """
        Update segment count in Supabase db.
        """
        try:
            logger.info(f"Updating segment count for job: {job_id}")

            response = self.client.table("jobs").update({
                "segment_count": segment_count
            }).eq("id", job_id).execute()
            
            return True
        
        except Exception as e:
            logger.error(f"Error updating segment count: {str(e)}")
            return False

    async def add_content(self, supabase_url: str, job_id: str, content_type: str, thumbnail: Optional[str] = None, duration: Optional[float] = None) -> Dict[str, Any]:
        """
        Create a record in the created_content table.
        
        Args:
            supabase_url: The Supabase URL of the content
            job_id: The associated job ID
            content_type: The type of content (e.g., 'ai_image', 'video', 'image')
            thumbnail: Optional thumbnail URL for the content
            duration: Optional duration of the content in seconds
            
        Returns:
            The created content record
        """
        try:
            logger.info(f"Adding {content_type} content record for job {job_id}: {supabase_url}")
            
            # Prepare record data
            record_data = {
                "supabase_url": supabase_url,
                "job_id": job_id,
                "content_type": content_type
            }
            
            # Add thumbnail if provided
            if thumbnail:
                record_data["thumbnail"] = thumbnail
                
            # Add duration if provided
            if duration is not None:
                record_data["duration"] = duration
            
            response = self.client.table("created_content").insert(record_data).execute()
            
            # Extract the actual data from the response
            if hasattr(response, 'data') and response.data:
                # Return the first result if available
                return response.data[0] if response.data else {}
            
            # Fallback to return full response if data attribute not available
            return response
            
        except Exception as e:
            logger.error(f"Error adding content record: {str(e)}")
            raise
            
    async def get_job_content(self, job_id: str, content_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Get content records for a job.
        
        Args:
            job_id: The job ID
            content_type: Optional content type filter
            
        Returns:
            List of content records
        """
        try:
            logger.info(f"Getting content records for job: {job_id}")
            
            query = self.client.table("created_content").select("*").eq("job_id", job_id)
            
            if content_type:
                query = query.eq("content_type", content_type)
                
            response = query.execute()
            # Extract data from response
            if hasattr(response, 'data'):
                return response.data
            
            return []
            
        except Exception as e:
            logger.error(f"Error getting content records: {str(e)}")
            return []

    async def update_processed_segment_count(self, job_id: str, processed_count: int) -> bool:
        """
        Update processed segment count in Supabase db.
        
        Args:
            job_id: The job ID
            processed_count: The number of segments processed
            
        Returns:
            True if updated successfully
        """
        try:
            logger.info(f"Updating processed segment count to {processed_count} for job: {job_id}")
            
            response = self.client.table("jobs").update({
                "processed_segment_count": processed_count
            }).eq("id", job_id).execute()
            
            return True
            
        except Exception as e:
            logger.error(f"Error updating processed segment count: {str(e)}")
            return False

    async def get_processed_segment_count(self, job_id: str) -> int:
        """
        Get the processed segment count for a job.
        
        Args:
            job_id: The job ID
            
        Returns:
            The number of segments processed
        """
        try:
            logger.info(f"Getting processed segment count for job: {job_id}")
            
            job = await self.get_job(job_id)
            if job and "processed_segment_count" in job:
                return job["processed_segment_count"] or 0
                
            return 0
            
        except Exception as e:
            logger.error(f"Error getting processed segment count: {str(e)}")
            return 0

    async def increment_processed_segment_count(self, job_id: str, segments_processed: int = 1) -> bool:
        """
        Increment the processed segment count for a job.
        
        Args:
            job_id: The job ID
            segments_processed: Number of segments to increment by (default: 1)
            
        Returns:
            True if successful, False otherwise
        """
        try:
            logger.info(f"Incrementing processed segment count for job: {job_id} by {segments_processed}")
            
            current_count = await self.get_processed_segment_count(job_id)
            new_count = current_count + segments_processed
            
            result = await self.client.from_("jobs").update({
                "processed_segment_count": new_count
            }).eq("id", job_id).execute()
            
            if result and hasattr(result, "data") and len(result.data) > 0:
                logger.info(f"Updated processed segment count to {new_count} for job: {job_id}")
                return True
            else:
                logger.error(f"Failed to update processed segment count for job: {job_id}")
                return False
                
        except Exception as e:
            logger.error(f"Error incrementing processed segment count: {str(e)}")
            return False

    async def get_content_by_id(self, content_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a content record by ID.
        
        Args:
            content_id: The content ID
            
        Returns:
            Content record or None if not found
        """
        try:
            logger.info(f"Getting content record by ID: {content_id}")
            
            response = self.client.table("created_content").select("*").eq("id", content_id).execute()
            
            # Extract data from response
            if hasattr(response, 'data') and response.data:
                return response.data[0] if response.data else None
            
            return None
            
        except Exception as e:
            logger.error(f"Error getting content record: {str(e)}")
            return None

    async def update_content(self, content_id: str, supabase_url: str, thumbnail: Optional[str] = None, duration: Optional[float] = None) -> bool:
        """
        Update a content record with new URL, thumbnail, and duration.
        
        Args:
            content_id: The content ID
            supabase_url: The new Supabase URL
            thumbnail: The new thumbnail URL (optional)
            duration: The content duration in seconds (optional)
            
        Returns:
            True if updated successfully
        """
        try:
            logger.info(f"Updating content record: {content_id}")
            
            update_data = {
                "supabase_url": supabase_url
            }
            
            if thumbnail is not None:
                update_data["thumbnail"] = thumbnail
                
            if duration is not None:
                update_data["duration"] = duration
            
            response = self.client.table("created_content").update(update_data).eq("id", content_id).execute()
            
            return True
            
        except Exception as e:
            logger.error(f"Error updating content record: {str(e)}")
            return False

    async def update_job_total_duration(self, job_id: str, total_duration: float) -> bool:
        """
        Update the total duration of a job.
        
        Args:
            job_id: The job ID
            total_duration: Total duration in seconds
            
        Returns:
            True if updated successfully
        """
        try:
            logger.info(f"Updating total duration to {total_duration} seconds for job: {job_id}")
            
            response = self.client.table("jobs").update({
                "total_duration": total_duration
            }).eq("id", job_id).execute()
            
            return True
            
        except Exception as e:
            logger.error(f"Error updating job total duration: {str(e)}")
            return False

    async def update_job_video_url(self, job_id: str, video_url: str) -> bool:
        """
        Update the video URL for a job.
        
        Args:
            job_id: The job ID
            video_url: The video URL
            
        Returns:
            True if updated successfully
        """
        try:
            logger.info(f"Updating video URL for job: {job_id}")
            
            response = self.client.table("jobs").update({
                "video_url": video_url
            }).eq("id", job_id).execute()
            
            return True
            
        except Exception as e:
            logger.error(f"Error updating job video URL: {str(e)}")
            return False

    async def update_video_segments_completed(self, job_id: str, count: int) -> bool:
        """
        Update the video_segments_completed count for a job.
        
        Args:
            job_id: The job ID
            count: The number of video segments that have been completed
            
        Returns:
            True if updated successfully
        """
        try:
            logger.info(f"Updating video_segments_completed to {count} for job: {job_id}")
            
            response = self.client.table("jobs").update({
                "video_segments_completed": count
            }).eq("id", job_id).execute()
            
            return True
            
        except Exception as e:
            logger.error(f"Error updating video_segments_completed: {str(e)}")
            return False
            
    async def update_concatenated_video_status(self, job_id: str, status: int) -> bool:
        """
        Update the concatenated video status for a job.
        
        Args:
            job_id: The job ID
            status: The status code (1=pending, 2=processing, 3=completed, 4=failed)
            
        Returns:
            True if updated successfully
        """
        try:
            logger.info(f"Updating concatenated_video_status to {status} for job: {job_id}")
            
            response = self.client.table("jobs").update({
                "concatenated_video_status": status
            }).eq("id", job_id).execute()
            
            return True
            
        except Exception as e:
            logger.error(f"Error updating concatenated_video_status: {str(e)}")
            return False

    async def get_video_segments_completed(self, job_id: str) -> int:
        """
        Get the video segments completed count for a job.
        
        Args:
            job_id: The job ID
            
        Returns:
            The number of video segments completed
        """
        try:
            logger.info(f"Getting video segments completed count for job: {job_id}")
            
            job = await self.get_job(job_id)
            if job and "video_segments_completed" in job:
                return int(job["video_segments_completed"] or 0)
                
            return 0
            
        except Exception as e:
            logger.error(f"Error getting video segments completed count: {str(e)}")
            return 0

    async def increment_video_segments_completed(self, job_id: str, segments_completed: int = 1) -> bool:
        """
        Increment the video segments completed count for a job.
        
        Args:
            job_id: The job ID
            segments_completed: Number of segments to increment by (default: 1)
            
        Returns:
            True if successful, False otherwise
        """
        try:
            logger.info(f"Incrementing video segments completed count for job: {job_id} by {segments_completed}")
            
            current_count = await self.get_video_segments_completed(job_id)
            new_count = current_count + segments_completed
            
            result = await self.update_video_segments_completed(job_id, new_count)
            
            if result:
                logger.info(f"Updated video segments completed count to {new_count} for job: {job_id}")
                return True
            else:
                logger.error(f"Failed to update video segments completed count for job: {job_id}")
                return False
                
        except Exception as e:
            logger.error(f"Error incrementing video segments completed count: {str(e)}")
            return False

# Create a singleton instance
supabase_db = SupabaseDB() 