# Supabase Integration

This application integrates with Supabase for file storage. Images and videos are stored and served directly from Supabase storage instead of local files.

## Setup

1. Create a Supabase account at [supabase.com](https://supabase.com) if you don't have one already
2. Create a new Supabase project
3. Navigate to Settings > API to find your project URL and API keys
4. Copy the `.env.example` file to `.env` and fill in your Supabase credentials:

```
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_STORAGE_BUCKET=video-assets
```

## Storage Buckets

The application uses a single storage bucket named `video-assets` for storing all assets (created automatically if it doesn't exist).

Within the bucket, files are organized in the following structure:

- `/documents/{task_id}/` - Uploaded script documents
- `/images/` - AI-generated images
- `/videos/{session_id}/` - Concatenated video outputs

## Storage Workflow

The application uses Supabase storage for all file operations:

1. All AI-generated images are saved directly to Supabase Storage in the `/images/` folder
2. Videos are uploaded to Supabase Storage in the `/videos/{session_id}/` folder
3. When retrieving files, the app redirects to the Supabase URL

## Using the Supabase SDK

The Supabase client is initialized in `utils/supabase_storage.py`. The main methods are:

- `upload_file()` - Upload a file to Supabase storage
- `delete_file()` - Delete a file from Supabase storage
- `list_files()` - List files in a folder
- `get_file_url()` - Get the public URL for a file

Example:

```python
from app import get_storage

# Get the Supabase storage instance
storage = get_storage()

# Upload a file
file_url = await storage.upload_file(
    file_content=file_content,
    file_name="example.mp4",
    folder="videos/test",
    content_type="video/mp4"
)

# Get a file URL
url = storage.get_file_url("videos/test/example.mp4")
```

## Troubleshooting

- If you encounter CORS issues with Supabase, configure CORS in your Supabase project settings
- Ensure your Supabase bucket is set to public for serving files
- Make sure the `SUPABASE_ANON_KEY` has the necessary permissions for storage operations
- Check that the environment variables in your `.env` file match the expected names in the code
- If files don't appear, check that the storage bucket exists in your Supabase project 