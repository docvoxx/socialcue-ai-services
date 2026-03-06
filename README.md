---
title: SocialCue AI Services
emoji: 🤖
colorFrom: blue
colorTo: purple
sdk: docker
app_port: 7860
pinned: false
---

# SocialCue AI Services

AI Services Gateway for SocialCue - Authentication and routing for LLM, RAG, and Sentiment Analysis services.

## 🌐 Live Demo

**Hugging Face Space**: [lannnsleepy/socialcue-vn](https://huggingface.co/spaces/lannnsleepy/socialcue-vn)

**API Endpoint**: `https://lannnsleepy-socialcue-vn.hf.space`

## 📦 Repository

**GitHub**: [docvoxx/socialcue-ai-services](https://github.com/docvoxx/socialcue-ai-services)

## 🚀 Quick Start

### Option 1: Use Hugging Face Space (Recommended)

The easiest way to use SocialCue AI Services is through our hosted Hugging Face Space:

```bash
# Health check
curl https://lannnsleepy-socialcue-vn.hf.space/health/live

# Sentiment analysis (requires API key)
curl -X POST https://lannnsleepy-socialcue-vn.hf.space/v1/sentiment/analyze \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "candidates": [{
      "id": "1",
      "text": "Hello world",
      "tags": ["greeting"],
      "score": 0.8,
      "explanation": "Simple greeting"
    }],
    "target_tone": "friendly"
  }'
```

### Option 2: Deploy PhoGPT LLM (FREE on HF Spaces)

Deploy Vietnamese LLM API on Hugging Face Spaces - no API keys, 100% free:

```bash
# 1. Create HF Space with Docker SDK
# 2. Upload files from llm-service/
#    - Dockerfile
#    - requirements.txt
#    - server.py
#    - README_HF.md
# 3. Deploy on CPU Basic (free)

# Test your deployed service
curl https://YOUR-SPACE.hf.space/health

curl -X POST https://YOUR-SPACE.hf.space/v1/llm/generate \
  -H "Content-Type: application/json" \
  -d '{
    "history": "Crush: Hôm nay mình hơi mệt\nUser: Vậy à",
    "n_candidates": 5
  }'
```

**Model**: PhoGPT-4B-Chat-Q4_K_M (2.36GB, Vietnamese-optimized)
**Cost**: $0 (HF Spaces CPU Basic)
**Performance**: 2-5s per generation, native Vietnamese

**See**: `PHOGPT_DEPLOYMENT_GUIDE.md` for complete instructions

### Option 3: Train Models Locally (FREE with Ollama)

Train all AI models locally with Ollama - no API keys, 100% free:

```bash
# Prerequisites: Install Ollama
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5:3b

# Train all models (~4 hours, $0 cost)
cd scripts/llm
python finetune_ollama_local.py --data ../../data/processed/llm/conversations_1000.jsonl --test

cd ../rag
python setup_embeddings.py --data ../../data/processed/llm/conversations_1000.jsonl

cd ../sentiment
python create_labels_ollama.py --input ../../data/processed/llm/conversations_1000.jsonl
python train_classifier.py --data ../../data/processed/sentiment/labeled.jsonl
```

**See**: `OLLAMA_TRAINING_GUIDE.md` for complete instructions

### Option 2: Deploy Your Own Space

1. Fork this repository
2. Create a new Space on Hugging Face
3. Connect your GitHub repo or push directly:
```bash
git remote add hf https://huggingface.co/spaces/YOUR_USERNAME/YOUR_SPACE
git push hf main
```

### Option 3: Run Locally with Docker

```bash
# Clone the repository
git clone https://github.com/docvoxx/socialcue-ai-services.git
cd socialcue-ai-services

# Build and run
docker build -t socialcue-ai-services .
docker run -p 7860:7860 -e API_KEYS=dev-key-1 socialcue-ai-services
```

## 🚀 API Endpoints

### Health Check
```bash
curl https://lannnsleepy-socialcue-vn.hf.space/health/live
curl https://lannnsleepy-socialcue-vn.hf.space/health/ready
```

### LLM Service
```bash
curl -X POST https://lannnsleepy-socialcue-vn.hf.space/v1/llm/generate \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Generate a friendly reply",
    "context": "casual conversation"
  }'
```

### RAG Service
```bash
curl -X POST https://lannnsleepy-socialcue-vn.hf.space/v1/rag/query \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "How to start a conversation with crush?",
    "top_k": 3
  }'
```

### Sentiment Analysis (requires auth)
```bash
curl -X POST https://lannnsleepy-socialcue-vn.hf.space/v1/sentiment/analyze \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "candidates": [{
      "id": "1",
      "text": "Hello world",
      "tags": ["greeting"],
      "score": 0.8,
      "explanation": "Simple greeting"
    }],
    "target_tone": "friendly"
  }'
```

## 🔑 Authentication

All API endpoints (except `/health`) require Bearer token authentication:

```
Authorization: Bearer YOUR_API_KEY
```

Set your API keys in Space Settings → Variables:
```
API_KEYS=key1,key2,key3
```

## 📝 Environment Variables

Required:
- `API_KEYS` - Comma-separated list of valid API keys

Optional:
- `LLM_SERVICE_URL` - URL for LLM service (default: http://llm-service:3001)
- `RAG_SERVICE_URL` - URL for RAG service (default: http://rag-service:3002)
- `SENTIMENT_SERVICE_URL` - URL for Sentiment service (default: http://sentiment-service:3003)

## 🏗️ Architecture

This is the API Gateway for SocialCue AI Services. It handles:
- Authentication via API keys
- Request routing to internal services
- Rate limiting and logging
- Error handling

### Services

1. **Gateway** (Port 7860) - API Gateway with authentication
2. **LLM Service** (Port 3001) - Language model for text generation
3. **RAG Service** (Port 3002) - Retrieval-Augmented Generation for context-aware responses
4. **Sentiment Service** (Port 3003) - Sentiment analysis and tone matching

For full microservices deployment with all services, see the main repository.

## 📊 Data Generation

This repository includes two complete data generation systems for creating high-quality crush conversation contexts:

### Option 1: OpenAI-based Generation (~$1.50 for 250 contexts)
```bash
cd scripts/data-generation
python generate_crush_contexts.py
```

### Option 2: Ollama-based Generation (Free, local)
```bash
cd scripts/data-processing
python generate_crush_dataset.py
```

See [CRUSH_DATA_GENERATION_GUIDE.md](./CRUSH_DATA_GENERATION_GUIDE.md) and [OLLAMA_DATA_FACTORY_GUIDE.md](./OLLAMA_DATA_FACTORY_GUIDE.md) for detailed instructions.

## 🎓 Model Training

Train all AI models locally with Ollama - 100% free, no API keys needed:

### Training Status
- ✅ **Ranker**: Trained (77.5% top-1, 100% top-3 accuracy)
- 🎯 **LLM**: Ready to train (30 min, $0)
- 🎯 **RAG**: Ready to setup (10 min, $0)
- 🎯 **Sentiment**: Ready to train (3 hours, $0)

### Quick Start Training
```bash
# 1. Install Ollama
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5:3b

# 2. Train LLM (30 min)
cd scripts/llm
python finetune_ollama_local.py \
  --data ../../data/processed/llm/conversations_1000.jsonl \
  --samples 50 \
  --model-name socialcue-crush \
  --test

# 3. Setup RAG (10 min)
cd ../rag
python setup_embeddings.py \
  --data ../../data/processed/llm/conversations_1000.jsonl \
  --output ../../models/rag_embeddings

# 4. Train Sentiment (3 hours)
cd ../sentiment
python create_labels_ollama.py \
  --input ../../data/processed/llm/conversations_1000.jsonl \
  --output ../../data/processed/sentiment/labeled.jsonl

python train_classifier.py \
  --data ../../data/processed/sentiment/labeled.jsonl \
  --output ../../models/sentiment_classifier
```

**Total time**: ~4 hours | **Total cost**: $0

See [OLLAMA_TRAINING_GUIDE.md](./OLLAMA_TRAINING_GUIDE.md) for complete training instructions.

## 🔧 Development

### Prerequisites
- Node.js 20+
- npm or yarn
- Docker (optional)

### Local Setup
```bash
# Install dependencies
npm install

# Build gateway
cd gateway
npm run build

# Run tests
npm test

# Start development server
npm run dev
```

### Project Structure
```
socialcue-ai-services/
├── gateway/              # API Gateway service
│   ├── src/
│   │   ├── index.ts     # Main entry point
│   │   ├── config.ts    # Configuration
│   │   ├── middleware/  # Auth, logging, error handling
│   │   ├── routes/      # API routes
│   │   └── services/    # Health aggregator
│   └── __tests__/       # Tests
├── services/            # Microservices
│   ├── llm-service/
│   ├── rag-service/
│   └── sentiment-service/
├── data/                # Training data and samples
├── scripts/             # Data generation scripts
└── Dockerfile           # Hugging Face deployment
```

## 📚 Documentation

- [Hugging Face Deployment Guide](./HUGGINGFACE_DEPLOYMENT.md)
- [Crush Data Generation Guide](./CRUSH_DATA_GENERATION_GUIDE.md)
- [Ollama Data Factory Guide](./OLLAMA_DATA_FACTORY_GUIDE.md)
- [Deployment Guide](./DEPLOYMENT_GUIDE.md)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License - see LICENSE file for details

## 🔗 Links

- **Hugging Face Space**: https://huggingface.co/spaces/lannnsleepy/socialcue-vn
- **GitHub Repository**: https://github.com/docvoxx/socialcue-ai-services
- **Main SocialCue App**: https://github.com/docvoxx/socialcue-main-app
