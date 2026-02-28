---
title: SocialCue AI Services
emoji: 🤖
colorFrom: blue
colorTo: purple
sdk: docker
app_port: 7860
pinned: false
---

# SocialCue AI Services Gateway

AI Services Gateway for SocialCue - Authentication and routing for LLM, RAG, and Sentiment Analysis services.

## 🚀 API Endpoints

### Health Check
```bash
curl https://lannnsleepy-socialcue.hf.space/health/live
```

### Sentiment Analysis (requires auth)
```bash
curl -X POST https://lannnsleepy-socialcue.hf.space/v1/sentiment/analyze \
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

For full microservices deployment with LLM, RAG, and Sentiment services, see the main repository.
