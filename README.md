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
