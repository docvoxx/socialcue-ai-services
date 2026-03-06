#!/usr/bin/env python3
"""
SocialCue LLM Service - PhoGPT-4B-Chat API
Optimized for Hugging Face Spaces CPU Basic (2 CPU / 16GB RAM)
"""

import os
import json
from typing import List, Optional
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from llama_cpp import Llama

app = FastAPI(
    title="SocialCue LLM Service",
    description="PhoGPT-4B-Chat API for crush conversation suggestions",
    version="1.0.0"
)

# Configuration
REPO_ID = os.getenv("MODEL_REPO_ID", "vinai/PhoGPT-4B-Chat-gguf")
FILENAME = os.getenv("MODEL_FILENAME", "PhoGPT-4B-Chat-Q4_K_M.gguf")
N_CTX = int(os.getenv("N_CTX", "2048"))
N_THREADS = int(os.getenv("N_THREADS", "2"))

# System prompt for crush conversations
SYSTEM_PROMPT = """Bạn là chuyên gia giao tiếp khi nói chuyện với crush.

Nhiệm vụ: Gợi ý câu trả lời phù hợp, tự nhiên, không gây áp lực.

Nguyên tắc:
- Tự nhiên, thân thiện, không gượng ép
- Phù hợp với ngữ cảnh và tâm trạng
- Không quá trực tiếp hoặc gây áp lực
- Tạo cơ hội để cuộc trò chuyện tiếp diễn
- Sử dụng emoji phù hợp (1-2 emoji)

Hãy gợi ý câu trả lời hay nhất."""

# Load model (lazy loading on first request)
llm = None

def get_llm():
    """Lazy load LLM model."""
    global llm
    if llm is None:
        print(f"Loading model: {REPO_ID}/{FILENAME}")
        llm = Llama.from_pretrained(
            repo_id=REPO_ID,
            filename=FILENAME,
            n_ctx=N_CTX,
            n_threads=N_THREADS,
            verbose=False,
        )
        print("Model loaded successfully")
    return llm


# Request/Response Models
class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    max_tokens: int = 256
    temperature: float = 0.8
    top_p: float = 0.9
    n: int = 1  # Number of candidates to generate


class GenerateRequest(BaseModel):
    history: str  # Conversation history
    n_candidates: int = 5  # Number of candidates to generate
    max_tokens: int = 150
    temperature: float = 0.8


class Candidate(BaseModel):
    text: str
    score: Optional[float] = None


class GenerateResponse(BaseModel):
    candidates: List[Candidate]
    model: str = "PhoGPT-4B-Chat-Q4_K_M"


# Health check
@app.get("/health")
def health():
    """Health check endpoint."""
    return {
        "status": "ok",
        "model_repo": REPO_ID,
        "model_file": FILENAME,
        "n_ctx": N_CTX,
        "n_threads": N_THREADS
    }


@app.get("/health/live")
def health_live():
    """Liveness probe."""
    return {"status": "alive"}


@app.get("/health/ready")
def health_ready():
    """Readiness probe."""
    try:
        model = get_llm()
        return {"status": "ready", "model_loaded": model is not None}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Model not ready: {str(e)}")


# OpenAI-compatible chat endpoint
@app.post("/v1/chat/completions")
def chat_completions(req: ChatRequest):
    """
    OpenAI-compatible chat completions endpoint.
    
    Example:
    ```
    curl -X POST http://localhost:7860/v1/chat/completions \
      -H "Content-Type: application/json" \
      -d '{
        "messages": [
          {"role": "system", "content": "Bạn là trợ lý..."},
          {"role": "user", "content": "Crush: Hôm nay mình hơi mệt\nUser: Vậy à"}
        ],
        "max_tokens": 150,
        "temperature": 0.8
      }'
    ```
    """
    try:
        model = get_llm()
        
        # Build prompt from messages
        prompt_parts = []
        for msg in req.messages:
            if msg.role == "system":
                prompt_parts.append(f"SYSTEM: {msg.content}\n")
            elif msg.role == "user":
                prompt_parts.append(f"USER: {msg.content}\n")
            elif msg.role == "assistant":
                prompt_parts.append(f"ASSISTANT: {msg.content}\n")
        
        prompt_parts.append("ASSISTANT: ")
        prompt = "".join(prompt_parts)
        
        # Generate response
        output = model(
            prompt,
            max_tokens=req.max_tokens,
            temperature=req.temperature,
            top_p=req.top_p,
            stop=["USER:", "SYSTEM:", "\n\n"],
        )
        
        text = output["choices"][0]["text"].strip()
        
        return {
            "id": "chatcmpl-phogpt",
            "object": "chat.completion",
            "created": output.get("created", 0),
            "model": FILENAME,
            "choices": [
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": text
                    },
                    "finish_reason": "stop"
                }
            ],
            "usage": {
                "prompt_tokens": output.get("usage", {}).get("prompt_tokens", 0),
                "completion_tokens": output.get("usage", {}).get("completion_tokens", 0),
                "total_tokens": output.get("usage", {}).get("total_tokens", 0)
            }
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")


# SocialCue-specific endpoint
@app.post("/v1/llm/generate", response_model=GenerateResponse)
def generate_candidates(req: GenerateRequest):
    """
    Generate multiple reply candidates for crush conversation.
    
    This endpoint generates N diverse candidates that will be ranked
    by the ranker service to select the best top-3.
    
    Example:
    ```
    curl -X POST http://localhost:7860/v1/llm/generate \
      -H "Content-Type: application/json" \
      -d '{
        "history": "Crush: Hôm nay mình hơi mệt\nUser: Vậy à",
        "n_candidates": 5,
        "max_tokens": 150,
        "temperature": 0.8
      }'
    ```
    """
    try:
        model = get_llm()
        
        # Build prompt with system instructions
        prompt = f"""SYSTEM: {SYSTEM_PROMPT}

USER: {req.history}

Hãy gợi ý {req.n_candidates} câu trả lời khác nhau, mỗi câu trên một dòng, đánh số từ 1 đến {req.n_candidates}.

ASSISTANT: """
        
        # Generate candidates
        output = model(
            prompt,
            max_tokens=req.max_tokens * req.n_candidates,  # More tokens for multiple candidates
            temperature=req.temperature,
            top_p=0.9,
            stop=["USER:", "SYSTEM:"],
        )
        
        text = output["choices"][0]["text"].strip()
        
        # Parse candidates (split by newlines and numbers)
        lines = [line.strip() for line in text.split('\n') if line.strip()]
        candidates = []
        
        for line in lines:
            # Remove numbering (1., 2., etc.)
            clean_line = line
            if line and line[0].isdigit():
                # Remove "1. " or "1) " prefix
                parts = line.split('.', 1)
                if len(parts) > 1:
                    clean_line = parts[1].strip()
                else:
                    parts = line.split(')', 1)
                    if len(parts) > 1:
                        clean_line = parts[1].strip()
            
            if clean_line and len(clean_line) > 5:  # Filter out too short responses
                candidates.append(Candidate(text=clean_line))
            
            if len(candidates) >= req.n_candidates:
                break
        
        # If we didn't get enough candidates, generate more individually
        while len(candidates) < req.n_candidates:
            output = model(
                prompt,
                max_tokens=req.max_tokens,
                temperature=req.temperature + 0.1 * len(candidates),  # Increase temp for diversity
                top_p=0.9,
                stop=["USER:", "SYSTEM:", "\n\n"],
            )
            
            text = output["choices"][0]["text"].strip()
            if text and len(text) > 5:
                candidates.append(Candidate(text=text))
        
        return GenerateResponse(
            candidates=candidates[:req.n_candidates]
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")


# Simple generate endpoint (single response)
@app.post("/v1/llm/generate-single")
def generate_single(req: GenerateRequest):
    """
    Generate a single reply for crush conversation.
    
    Example:
    ```
    curl -X POST http://localhost:7860/v1/llm/generate-single \
      -H "Content-Type: application/json" \
      -d '{
        "history": "Crush: Hôm nay mình hơi mệt\nUser: Vậy à",
        "max_tokens": 150,
        "temperature": 0.8
      }'
    ```
    """
    try:
        model = get_llm()
        
        # Build prompt
        prompt = f"""SYSTEM: {SYSTEM_PROMPT}

USER: {req.history}

ASSISTANT: """
        
        # Generate response
        output = model(
            prompt,
            max_tokens=req.max_tokens,
            temperature=req.temperature,
            top_p=0.9,
            stop=["USER:", "SYSTEM:", "\n\n"],
        )
        
        text = output["choices"][0]["text"].strip()
        
        return {
            "reply": text,
            "model": FILENAME
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7860)
