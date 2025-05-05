import os
import uuid
import logging
from typing import Optional, Dict, Any, List, Union
from supabase import create_client, Client

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# Get Supabase credentials from environment variables
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY")
SUPABASE_STORAGE_BUCKET = os.getenv("SUPABASE_STORAGE_BUCKET", "video-assets")

class SupabaseStorage:
    def __init__(self):
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise ValueError("Supabase credentials not found in environment variables")
        
        self.client: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
        self.bucket_name = SUPABASE_STORAGE_BUCKET
        
    async def upload_file(self, file_content: bytes, file_name: Optional[str] = None, 
                    folder: str = "", content_type: Optional[str] = None) -> str:
        """
        Upload a file to Supabase Storage.
        
        Args:
            file_content: The binary content of the file
            file_name: Optional filename (will generate a UUID if not provided)
            folder: Optional folder path within the bucket
            content_type: Optional MIME type
            
        Returns:
            The URL of the uploaded file
        """
        try:
            # Generate a unique filename if not provided
            if not file_name:
                ext = os.path.splitext(file_name)[1] if file_name else ""
                file_name = f"{uuid.uuid4()}{ext}"
                
            # Create path
            path = f"{folder}/{file_name}" if folder else file_name
            path = path.lstrip("/")
            
            # Upload options
            file_options = {}
            if content_type:
                file_options["contentType"] = content_type
                
            # Upload the file
            logger.info(f"Uploading file to Supabase: {path}")
            
            # Upload using the SDK
            result = self.client.storage.from_(self.bucket_name).upload(
                path,
                file_content,
                file_options
            )
            
            # Return the public URL
            public_url = self.client.storage.from_(self.bucket_name).get_public_url(path)

            
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
            
            self.client.storage.from_(self.bucket_name).remove([path])
            logger.info("File deleted successfully")
            return True
            
        except Exception as e:
            logger.error(f"Error deleting file: {str(e)}")
            return False
    
    async def list_files(self, folder: str = "") -> List[Dict[str, Any]]:
        """
        List files in a folder.
        
        Args:
            folder: Folder path within the bucket
            
        Returns:
            List of file objects
        """
        try:
            # Ensure path is properly formatted
            folder = folder.lstrip("/")
            
            # List files
            logger.info(f"Listing files in Supabase folder: {folder}")
            
            search_options = {"prefix": folder} if folder else None
            files = self.client.storage.from_(self.bucket_name).list(search_options)
            return files
            
        except Exception as e:
            logger.error(f"Error listing files: {str(e)}")
            return []
    
    async def get_file_url(self, path: str) -> str:
        """
        Get the public URL for a file.
        
        Args:
            path: Path to the file within the bucket
            
        Returns:
            Public URL of the file
        """
        path = path.lstrip("/")
        return self.client.storage.from_(self.bucket_name).get_public_url(path)

    async def get_public_url(self, path: str) -> str:
        """
        Get the public URL for a file. This is an alias for get_file_url
        that works with both absolute and relative paths.
        
        Args:
            path: Path to the file within the bucket or a full URL
            
        Returns:
            Public URL of the file
        """
        # If it's already a full URL, return it
        if path.startswith("http"):
            return path
            
        # Otherwise, get the public URL
        return await self.get_file_url(path)

# Create a singleton instance
supabase_storage = SupabaseStorage() 