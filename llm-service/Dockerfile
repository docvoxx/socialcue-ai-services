FROM python:3.10-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl ca-certificates build-essential && \
    rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy application code
COPY server.py /app/server.py

# Environment variables
ENV PORT=7860
ENV MODEL_REPO_ID=vinai/PhoGPT-4B-Chat-gguf
ENV MODEL_FILENAME=PhoGPT-4B-Chat-Q4_K_M.gguf
ENV N_CTX=2048
ENV N_THREADS=2

EXPOSE 7860

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "7860"]
