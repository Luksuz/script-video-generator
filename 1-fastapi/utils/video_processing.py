import os
import logging
import subprocess
import json
import tempfile
import shutil
from pathlib import Path
from typing import Dict, Any, List, Tuple, Optional
import time
import asyncio
import requests
import math
import uuid

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Video configuration constants
TARGET_WIDTH = 854  # Keep 16:9 aspect ratio for web
TARGET_HEIGHT = 480
TARGET_FPS = 30
TARGET_AUDIO_RATE = 44100  # 44.1kHz is common for web/consumer
TARGET_AUDIO_CHANNELS = 2
NORMALIZATION_CRF = "28"  # Higher CRF = smaller file, lower quality (23-28 often good balance)
NORMALIZATION_PRESET = "medium"  # Slower presets = better compression
CONCATENATION_CRF = "28"
CONCATENATION_PRESET = "fast"  # Faster for the final step
PIX_FMT = "yuv420p"  # Crucial for compatibility
AUDIO_CODEC = "aac"
AUDIO_BITRATE = "128k"

async def download_content(url: str, output_path: str, is_video: bool = False) -> None:
    """
    Download content (image or video) from a URL.
    
    Args:
        url: URL to download from
        output_path: Path to save the content
        is_video: Whether the content is a video
    """
    try:
        # Create the directory if it doesn't exist
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        # Check if URL is valid
        if not url.startswith(('http://', 'https://')):
            raise ValueError(f"Invalid URL: {url}")
            
        # Download the content
        response = requests.get(url, stream=True)
        response.raise_for_status()
        
        with open(output_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
                
        # Verify file integrity
        if is_video:
            await verify_video_file(output_path)
        else:
            await verify_image_file(output_path)
            
    except Exception as e:
        logger.error(f"Error downloading content: {str(e)}")
        raise

async def verify_video_file(video_path: str) -> None:
    """
    Verify that a video file is valid using ffprobe.
    
    Args:
        video_path: Path to the video file
    """
    cmd = [
        "ffprobe",
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height,duration",
        "-of", "json",
        video_path
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        info = json.loads(result.stdout)
        
        # Check if we have valid video info
        if not info.get("streams"):
            raise ValueError("Invalid video file: No video streams found")
            
    except subprocess.CalledProcessError as e:
        logger.error(f"Failed to verify video file: {str(e)}")
        raise ValueError(f"Invalid video file: {str(e)}")
    except Exception as e:
        logger.error(f"Error verifying video file: {str(e)}")
        raise

async def verify_image_file(image_path: str) -> None:
    """
    Verify that an image file is valid using ffprobe.
    
    Args:
        image_path: Path to the image file
    """
    # Check if it's an SVG file
    if image_path.lower().endswith('.svg'):
        logger.info(f"Detected SVG file: {image_path}")
        png_path = image_path.replace('.svg', '.png')
        
        try:
            await convert_svg_to_png(image_path, png_path)
            # Replace the original file with the converted PNG
            os.remove(image_path)
            shutil.move(png_path, image_path)
            logger.info(f"Replaced SVG with PNG: {image_path}")
            return
        except Exception as e:
            logger.error(f"Failed to convert SVG to PNG: {str(e)}")
            raise
    
    # Verify image with ffprobe
    cmd = [
        "ffprobe",
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height",
        "-of", "json",
        image_path
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        info = json.loads(result.stdout)
        
        # Check if we have valid image info
        if not info.get("streams"):
            raise ValueError("Invalid image file: No image data found")
            
    except subprocess.CalledProcessError as e:
        logger.error(f"Failed to verify image file: {str(e)}")
        raise ValueError(f"Invalid image file: {str(e)}")
    except Exception as e:
        logger.error(f"Error verifying image file: {str(e)}")
        raise

async def convert_svg_to_png(svg_path: str, output_path: str) -> None:
    """
    Convert SVG to PNG using ffmpeg.
    
    Args:
        svg_path: Path to SVG file
        output_path: Path to save the PNG file
    """
    cmd = [
        "ffmpeg",
        "-y",
        "-i", svg_path,
        "-vf", f"scale={TARGET_WIDTH}:{TARGET_HEIGHT}:force_original_aspect_ratio=decrease",
        output_path
    ]
    
    logger.info(f"Converting SVG to PNG: {' '.join(cmd)}")
    
    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    
    stdout, stderr = await process.communicate()
    
    if process.returncode != 0:
        error_msg = stderr.decode() if stderr else "Unknown error"
        logger.error(f"Failed to convert SVG to PNG: {error_msg}")
        raise ValueError(f"SVG to PNG conversion failed: {error_msg}")
        
    logger.info(f"Successfully converted SVG to PNG: {svg_path} -> {output_path}")

async def image_to_video(image_path: str, output_path: str, duration: float) -> None:
    """
    Convert an image to a video with the specified duration.
    
    Args:
        image_path: Path to the image file
        output_path: Path to save the video file
        duration: Duration of the video in seconds
    """
    # Ensure minimum duration to avoid issues with ffmpeg
    min_duration = 1.0  # 1 second minimum duration
    if duration < min_duration:
        logger.warning(f"Requested duration {duration}s is too short. Using minimum duration of {min_duration}s")
        duration = min_duration
    
    # Use a filter to duplicate the image frame for the desired duration
    # -framerate 30 defines how many frames per second are created
    # -loop 1 tells ffmpeg to loop the input image
    # -t {duration} tells ffmpeg to stop after the specified duration
    cmd = [
        "ffmpeg",
        "-y",
        "-loop", "1",
        "-framerate", str(TARGET_FPS),
        "-i", image_path,
        "-vf", f"scale={TARGET_WIDTH}:{TARGET_HEIGHT}:force_original_aspect_ratio=decrease,pad={TARGET_WIDTH}:{TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2",
        "-t", str(duration),
        "-c:v", "libx264",
        "-tune", "stillimage",  # Optimize encoding for static images
        "-preset", NORMALIZATION_PRESET,
        "-crf", NORMALIZATION_CRF,
        "-pix_fmt", PIX_FMT,
        output_path
    ]
    
    logger.info(f"Converting image to video (duration: {duration}s): {' '.join(cmd)}")
    
    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        stdout, stderr = await process.communicate()
        
        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "Unknown error"
            logger.error(f"Failed to convert image to video: {error_msg}")
            raise ValueError(f"Image to video conversion failed: {error_msg}")
        
        # Verify the created video has the correct duration
        actual_duration = await get_video_duration(output_path)
        logger.info(f"Successfully converted image to video: {image_path} -> {output_path} (duration: {actual_duration}s)")
        
        # If duration is significantly off, log warning but don't fail
        if abs(actual_duration - duration) > 0.5:  # If off by more than half a second
            logger.warning(f"Video duration mismatch. Expected: {duration}s, Got: {actual_duration}s")
            
            # If the video is too short (less than 80% of target), try again with a different approach
            if actual_duration < (duration * 0.8) and actual_duration < 2.0:
                logger.warning(f"Video is too short, attempting alternative conversion method")
                
                # Create a temporary directory for intermediate files
                with tempfile.TemporaryDirectory() as temp_dir:
                    # Create multiple copies of the image and concatenate them
                    concat_file = os.path.join(temp_dir, "concat.txt")
                    duplicate_image = os.path.join(temp_dir, "duplicate.jpg")
                    
                    # Copy the original image
                    shutil.copy2(image_path, duplicate_image)
                    
                    # Create a concat file with multiple references to the same image
                    with open(concat_file, 'w') as f:
                        repeat_count = math.ceil(duration)
                        for _ in range(repeat_count):
                            f.write(f"file '{duplicate_image}'\n")
                            f.write(f"duration {1.0}\n")
                    
                    # Add one last entry without duration
                    with open(concat_file, 'a') as f:
                        f.write(f"file '{duplicate_image}'\n")
                    
                    # Use concat demuxer to create the video
                    alt_cmd = [
                        "ffmpeg",
                        "-y",
                        "-f", "concat",
                        "-safe", "0",
                        "-i", concat_file,
                        "-vf", f"scale={TARGET_WIDTH}:{TARGET_HEIGHT}:force_original_aspect_ratio=decrease,pad={TARGET_WIDTH}:{TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2",
                        "-t", str(duration),
                        "-c:v", "libx264",
                        "-preset", NORMALIZATION_PRESET,
                        "-crf", NORMALIZATION_CRF,
                        "-pix_fmt", PIX_FMT,
                        output_path
                    ]
                    
                    logger.info(f"Trying alternative method: {' '.join(alt_cmd)}")
                    
                    alt_process = await asyncio.create_subprocess_exec(
                        *alt_cmd,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE
                    )
                    
                    alt_stdout, alt_stderr = await alt_process.communicate()
                    
                    if alt_process.returncode != 0:
                        alt_error_msg = alt_stderr.decode() if alt_stderr else "Unknown error"
                        logger.error(f"Alternative method failed: {alt_error_msg}")
                        # We'll just continue with the original video since we at least have something
                    else:
                        # Verify the new video
                        new_duration = await get_video_duration(output_path)
                        logger.info(f"Alternative method created video with duration: {new_duration}s (target: {duration}s)")
    
    except Exception as e:
        logger.error(f"Error in image_to_video: {str(e)}")
        raise

async def standardize_video(input_path: str, output_path: str, target_duration: float, mode: str = "speed") -> None:
    """
    Standardize a video to the target dimensions, framerate, and duration.
    
    Args:
        input_path: Path to the input video
        output_path: Path to save the standardized video
        target_duration: Target duration in seconds
        mode: Mode for duration adjustment:
            - "speed": Adjust video speed (default)
            - "cut": Cut the video to target duration
            - "loop": Loop the video to reach target duration
    """
    # First get the original video duration
    duration = await get_video_duration(input_path)
    
    # Prepare the filter complex for standardizing video
    filter_complex = [
        f"scale={TARGET_WIDTH}:{TARGET_HEIGHT}:force_original_aspect_ratio=decrease",
        f"pad={TARGET_WIDTH}:{TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2",
        f"fps={TARGET_FPS}"
    ]
    
    # Check if the video has audio
    has_audio = await check_video_has_audio(input_path)
    audio_args = []
    
    # Handle different modes for duration adjustment
    if mode == "cut" and duration > target_duration:
        # Cut the video to the target duration
        logger.info(f"Cutting video from {duration}s to {target_duration}s")
        trim_args = ["-t", f"{target_duration}"]
        pts_filter = None  # No speed adjustment needed
        
        # Audio args for cut mode (no speed adjustment)
        if has_audio:
            audio_args = [
                "-c:a", AUDIO_CODEC,
                "-b:a", AUDIO_BITRATE,
                "-ar", str(TARGET_AUDIO_RATE),
                "-ac", str(TARGET_AUDIO_CHANNELS)
            ]
        else:
            audio_args = ["-an"]
            
    elif mode == "loop" and duration < target_duration:
        # Check if the video is extremely short (less than 0.5 seconds)
        if duration < 0.5 and os.path.exists(input_path):
            logger.warning(f"Video is extremely short ({duration}s). Converting to image first and then to video.")
            
            # Extract a frame from the video first
            temp_frame = os.path.join(os.path.dirname(input_path), f"temp_frame_{uuid.uuid4()}.jpg")
            frame_cmd = [
                "ffmpeg",
                "-y",
                "-i", input_path,
                "-vframes", "1",
                "-q:v", "2",
                temp_frame
            ]
            
            try:
                frame_process = await asyncio.create_subprocess_exec(
                    *frame_cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                
                stdout, stderr = await frame_process.communicate()
                
                if frame_process.returncode == 0 and os.path.exists(temp_frame):
                    # Now convert the frame to a video
                    await image_to_video(temp_frame, output_path, target_duration)
                    
                    # Clean up the temporary frame
                    if os.path.exists(temp_frame):
                        os.unlink(temp_frame)
                        
                    return
                else:
                    logger.warning(f"Failed to extract frame from short video: {stderr.decode() if stderr else 'Unknown error'}")
                    # Fall back to normal looping
            except Exception as e:
                logger.warning(f"Error during frame extraction: {str(e)}")
                # Fall back to normal looping
            finally:
                # Clean up the temporary frame if it exists
                if os.path.exists(temp_frame):
                    os.unlink(temp_frame)
                
        # Calculate how many times to loop
        loop_count = math.ceil(target_duration / duration)
        logger.info(f"Looping video {loop_count} times to reach target duration of {target_duration}s")
        
        # Create a temporary file with the loop list
        with tempfile.NamedTemporaryFile('w', suffix='.txt', delete=False) as f:
            for _ in range(loop_count):
                f.write(f"file '{os.path.abspath(input_path)}'\n")
            loop_file = f.name
        
        # Use concat demuxer to loop the video
        cmd = [
            "ffmpeg",
            "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", loop_file,
            "-t", f"{target_duration}",
            "-vf", ",".join(filter_complex),
            "-c:v", "libx264",
            "-preset", NORMALIZATION_PRESET,
            "-crf", NORMALIZATION_CRF,
            "-pix_fmt", PIX_FMT,
        ]
        
        # Add audio args for loop mode
        if has_audio:
            cmd.extend([
                "-c:a", AUDIO_CODEC,
                "-b:a", AUDIO_BITRATE,
                "-ar", str(TARGET_AUDIO_RATE),
                "-ac", str(TARGET_AUDIO_CHANNELS)
            ])
        else:
            cmd.append("-an")
        
        # Add output path
        cmd.append(output_path)
        
        logger.info(f"Looping video: {' '.join(cmd)}")
        
        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await process.communicate()
            
            if process.returncode != 0:
                error_msg = stderr.decode() if stderr else "Unknown error"
                logger.error(f"Failed to loop video: {error_msg}")
                raise ValueError(f"Video looping failed: {error_msg}")
                
            logger.info(f"Successfully looped video: {input_path} -> {output_path}")
            
            # Clean up the temporary file
            os.unlink(loop_file)
            
            return
        except Exception as e:
            # Clean up the temporary file in case of an error
            if os.path.exists(loop_file):
                os.unlink(loop_file)
            raise e
    
    else:
        # Use speed adjustment (default mode)
        # Calculate the speed factor to match the target duration
        speed_factor = duration / target_duration
        logger.info(f"Adjusting video speed by factor {speed_factor} to reach target duration")
        
        # Add speed adjustment to filter complex
        filter_complex.append(f"setpts={1/speed_factor}*PTS")
        
        # Audio args for speed mode
        if has_audio:
            audio_args = [
                "-c:a", AUDIO_CODEC,
                "-b:a", AUDIO_BITRATE,
                "-ar", str(TARGET_AUDIO_RATE),
                "-ac", str(TARGET_AUDIO_CHANNELS),
                "-af", f"atempo={min(2.0, speed_factor)}"  # atempo has limits, usually between 0.5 and 2.0
            ]
            
            # If speed factor is outside the range 0.5-2.0, apply multiple filters
            if speed_factor > 2.0:
                tempo_chain = []
                remaining_factor = speed_factor
                while remaining_factor > 1.0:
                    tempo_factor = min(2.0, remaining_factor)
                    tempo_chain.append(f"atempo={tempo_factor}")
                    remaining_factor /= tempo_factor
                audio_args[-1] = "-af"
                audio_args.append(",".join(tempo_chain))
                
        else:
            audio_args = ["-an"]
    
    # Build the full command
    cmd = [
        "ffmpeg",
        "-y",
        "-i", input_path,
    ]
    
    # Add trim args if in cut mode
    if mode == "cut" and duration > target_duration:
        cmd.extend(trim_args)
    
    # Add the rest of the arguments
    cmd.extend([
        "-vf", ",".join(filter_complex),
        "-c:v", "libx264",
        "-preset", NORMALIZATION_PRESET,
        "-crf", NORMALIZATION_CRF,
        "-pix_fmt", PIX_FMT,
    ])
    
    # Add audio args
    cmd.extend(audio_args)
    
    # Add output path
    cmd.append(output_path)
    
    logger.info(f"Standardizing video: {' '.join(cmd)}")
    
    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    
    stdout, stderr = await process.communicate()
    
    if process.returncode != 0:
        error_msg = stderr.decode() if stderr else "Unknown error"
        logger.error(f"Failed to standardize video: {error_msg}")
        raise ValueError(f"Video standardization failed: {error_msg}")
        
    logger.info(f"Successfully standardized video: {input_path} -> {output_path}")

async def get_video_duration(video_path: str) -> float:
    """
    Get the duration of a video file.
    
    Args:
        video_path: Path to the video file
        
    Returns:
        Duration in seconds
    """
    cmd = [
        "ffprobe",
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "json",
        video_path
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        info = json.loads(result.stdout)
        duration = float(info.get("format", {}).get("duration", 0))
        return duration
    except Exception as e:
        logger.error(f"Error getting video duration: {str(e)}")
        raise ValueError(f"Failed to get video duration: {str(e)}")

async def check_video_has_audio(video_path: str) -> bool:
    """
    Check if a video file has an audio stream.
    
    Args:
        video_path: Path to the video file
        
    Returns:
        True if the video has audio, False otherwise
    """
    cmd = [
        "ffprobe",
        "-v", "error",
        "-select_streams", "a:0",
        "-show_entries", "stream=codec_type",
        "-of", "json",
        video_path
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        info = json.loads(result.stdout)
        streams = info.get("streams", [])
        return len(streams) > 0
    except Exception:
        # If there's an error, assume no audio
        return False

async def concatenate_videos(video_list: List[str], output_path: str) -> None:
    """
    Concatenate a list of videos.
    
    Args:
        video_list: List of video file paths
        output_path: Path to save the concatenated video
    """
    if not video_list:
        raise ValueError("No videos to concatenate")
    
    # Verify all files exist and are valid videos before attempting concatenation
    valid_videos = []
    total_duration = 0
    
    for i, video_path in enumerate(video_list):
        if not os.path.exists(video_path):
            logger.warning(f"Video {i} does not exist: {video_path}")
            continue
            
        try:
            # Check if the video is valid
            duration = await get_video_duration(video_path)
            if duration <= 0:
                logger.warning(f"Video {i} has invalid duration ({duration}s): {video_path}")
                continue
                
            logger.info(f"Video {i}: {video_path} - Duration: {duration:.2f}s")
            valid_videos.append(video_path)
            total_duration += duration
            
        except Exception as e:
            logger.warning(f"Error verifying video {i}: {str(e)}")
            continue
    
    if not valid_videos:
        raise ValueError("No valid videos to concatenate after verification")
    
    logger.info(f"Concatenating {len(valid_videos)} valid videos with total duration: {total_duration:.2f}s")
        
    # Create a temporary file list
    with tempfile.NamedTemporaryFile('w', suffix='.txt', delete=False) as f:
        for video_path in valid_videos:
            f.write(f"file '{os.path.abspath(video_path)}'\n")
        list_file = f.name
        
    try:
        # Build the command to concatenate videos
        cmd = [
            "ffmpeg",
            "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", list_file,
            "-c:v", "libx264",
            "-preset", CONCATENATION_PRESET,
            "-crf", CONCATENATION_CRF,
            "-pix_fmt", PIX_FMT,
            "-c:a", AUDIO_CODEC,
            "-b:a", AUDIO_BITRATE,
            "-ar", str(TARGET_AUDIO_RATE),
            "-ac", str(TARGET_AUDIO_CHANNELS),
            output_path
        ]
        
        logger.info(f"Concatenating videos: {' '.join(cmd)}")
        
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        stdout, stderr = await process.communicate()
        
        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "Unknown error"
            logger.error(f"Failed to concatenate videos: {error_msg}")
            raise ValueError(f"Video concatenation failed: {error_msg}")
        
        # Verify the output file exists and has the expected duration    
        if os.path.exists(output_path):
            final_duration = await get_video_duration(output_path)
            logger.info(f"Successfully concatenated videos to: {output_path}")
            logger.info(f"Final video duration: {final_duration:.2f}s (expected approx: {total_duration:.2f}s)")
        else:
            logger.error(f"Output file does not exist after concatenation: {output_path}")
            raise ValueError("Concatenation failed: output file does not exist")
        
    finally:
        # Clean up the temporary file
        if os.path.exists(list_file):
            os.unlink(list_file) 