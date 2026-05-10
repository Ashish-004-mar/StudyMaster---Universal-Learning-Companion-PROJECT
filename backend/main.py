from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from google import genai
import requests
from bs4 import BeautifulSoup
import json
import tempfile
import os
import PyPDF2

app = FastAPI()

# Enable CORS so the frontend can communicate with the backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TextRequest(BaseModel):
    api_key: str
    text: str
    summary_mode: str
    language: str
    num_questions: int

class UrlRequest(BaseModel):
    api_key: str
    url: str
    summary_mode: str
    language: str
    num_questions: int

def generate_content_core(client, source, source_type, s_mode, count, lang):
    model_name = 'gemini-2.5-flash'
    
    if "Detailed" in s_mode: 
        role = "You are a Textbook Writer."
        task = "TASK: Rewrite the content into a FULL, COMPREHENSIVE CHAPTER. LENGTH: Do NOT summarize. Retain 100% of the information. Expand on every point. STRUCTURE: Use Headings (##), Subheadings (###), and extensive Bullet Points."
    elif "Concise" in s_mode: 
        role = "You are a Revision Expert."
        task = "TASK: Create a 80% length summary. Retain 100% of the information. Focus on key concepts but explain them clearly. STRUCTURE: Use Headings (##), Subheadings (###), and extensive Bullet Points."
    else: 
        role = "You are a Note Taker."
        task = "TASK: Convert content into structured, hierarchical Bullet Points. Retain 85% details. STRUCTURE: Use Headings (##), Subheadings (###), and extensive Bullet Points."

    base_prompt = f"{role}\nAnalyze the provided content.\n{task}\nSTRICT RULES:\n1. LANGUAGE: {lang} ONLY.\n2. VOCABULARY: Simple, Grade 8 level.\n3. COVERAGE: Cover EVERY single sub-topic."
    
    try:
        if source_type == "text":
            summary_resp = client.models.generate_content(model=model_name, contents=f"{base_prompt}\n\nTEXT: {source}")
        else:
            summary_resp = client.models.generate_content(model=model_name, contents=[base_prompt, source])
        summary_text = summary_resp.text
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Summary Error: {e}")

    quiz_prompt = f"Based on this study guide, generate {count} Flashcards and {count} Quiz Questions.\nOUTPUT JSON ONLY:\n{{\n\"flashcards\": [{{\"question\": \"...\", \"answer\": \"...\"}}],\n\"quiz\": [{{\"question\": \"...\", \"options\": [\"A\",\"B\",\"C\",\"D\"], \"correct_answer\": 0, \"explanation\": \"...\"}}]\n}}\nContext: {summary_text}"
    
    try:
        quiz_resp = client.models.generate_content(model=model_name, contents=quiz_prompt)
        clean_json = quiz_resp.text.replace("```json", "").replace("```", "").strip()
        data = json.loads(clean_json)
        return {"summary": summary_text, "flashcards": data.get("flashcards", []), "quiz": data.get("quiz", [])}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Quiz Error: {e}")

@app.post("/api/process_text")
async def process_text(req: TextRequest):
    if not req.api_key: raise HTTPException(status_code=400, detail="API Key required")
    client = genai.Client(api_key=req.api_key)
    return generate_content_core(client, req.text, "text", req.summary_mode, req.num_questions, req.language)

@app.post("/api/process_url")
async def process_url(req: UrlRequest):
    if not req.api_key: raise HTTPException(status_code=400, detail="API Key required")
    try:
        response = requests.get(req.url, headers={"User-Agent": "Mozilla/5.0"})
        if response.status_code != 200: raise HTTPException(status_code=400, detail="Failed to fetch URL")
        soup = BeautifulSoup(response.text, 'html.parser')
        for el in soup(["script", "style", "form"]): el.extract()
        extracted_text = ' '.join(soup.get_text(separator=' ').split())[:150000]
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    client = genai.Client(api_key=req.api_key)
    return generate_content_core(client, extracted_text, "text", req.summary_mode, req.num_questions, req.language)

@app.post("/api/process_pdf")
async def process_pdf(
    api_key: str = Form(...),
    summary_mode: str = Form(...),
    language: str = Form(...),
    num_questions: int = Form(...),
    force_ocr: bool = Form(False),
    file: UploadFile = File(...)
):
    if not api_key: raise HTTPException(status_code=400, detail="API Key required")
    client = genai.Client(api_key=api_key)
    
    content = await file.read()
    source, source_type = None, None

    if not force_ocr:
        try:
            from io import BytesIO
            pdf_reader = PyPDF2.PdfReader(BytesIO(content))
            text_content = "".join([page.extract_text() or "" for page in pdf_reader.pages])
            if len(text_content) > 300:
                source, source_type = text_content[:150000], "text"
        except: pass

    if not source:
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
                tmp.write(content)
                tmp_path = tmp.name
            
            gemini_file = client.files.upload(file=tmp_path)
            os.remove(tmp_path)
            source, source_type = gemini_file, "file"
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    return generate_content_core(client, source, source_type, summary_mode, num_questions, language)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)