from fastapi import APIRouter, UploadFile, File, HTTPException
import os
import tempfile
import logging
from typing import Optional
import docx  # python-docx
import PyPDF2

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/")
async def extract_text(file: UploadFile = File(...)):
    """
    Extract text from uploaded files (txt, docx, pdf)
    """
    try:
        # Get the file extension
        file_ext = os.path.splitext(file.filename)[1].lower() if file.filename else ""
        
        # Create a temporary file to store the uploaded file
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as temp_file:
            content = await file.read()
            temp_file.write(content)
            temp_path = temp_file.name
        
        extracted_text = ""
        
        # Extract text based on file type
        if file_ext == ".txt":
            with open(temp_path, "r", encoding="utf-8") as f:
                extracted_text = f.read()
                
        elif file_ext == ".docx":
            doc = docx.Document(temp_path)
            extracted_text = "\n".join([paragraph.text for paragraph in doc.paragraphs])
            
        elif file_ext == ".pdf":
            with open(temp_path, "rb") as f:
                pdf_reader = PyPDF2.PdfReader(f)
                for page_num in range(len(pdf_reader.pages)):
                    page = pdf_reader.pages[page_num]
                    extracted_text += page.extract_text() + "\n"
        else:
            # Clean up the temporary file
            os.unlink(temp_path)
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {file_ext}")
        
        # Clean up the temporary file
        os.unlink(temp_path)
        
        return {"text": extracted_text}
        
    except Exception as e:
        logger.error(f"Error extracting text: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to extract text: {str(e)}") 