# SocialCue AI Services

> **Note**: This project was developed with AI assistance to accelerate development and ensure best practices.

Independent deployment of AI services (LLM, RAG, Sentiment Analysis) for SocialCue application.

## Overview

This project provides AI microservices separated from the main application, enabling:
- Independent deployment on GPU-enabled infrastructure
- Isolated scaling based on AI workload
- Clear API boundaries with authentication
- Health monitoring and observability

## Architecture

```
socialcue-ai-services/
├── gateway/              # API Gateway (Port 3001 - External)
│   ├── src/
│   │   ├── middleware/  # Auth, logging, error handling
│   │   ├── routes/      # LLM, RAG, Sentiment, Health routes
│   │   └── services/    # Health aggregation
│   └── Dockerfile
├── services/
│   ├── llm-service/     # LLM Service (Port 3001 - Internal)
│   ├── rag-service/     # RAG Service (Port 3002 - Internal)
│   └── sentiment-service/ # Sentiment Service (Port 3003 - Internal)
├── shared/              # Shared types and utilities
├── docker-compose.yml   # Base configuration
├── docker-compose.dev.yml # Development overrides
└── docker-compose.production.yml # Production configuration
```

## Services

### AI Gateway (Port 3001 - External)
**Responsibilities:**
- API key authentication (`Authorization: Bearer <API_KEY>`)
- Request routing to internal services
- Health check aggregation
- Request/response logging with trace IDs
- Error normalization

**Endpoints:**
- `POST /v1/llm/generate` - Text generation
- `POST /v1/rag/retrieve` - Knowledge retrieval
- `POST /v1/sentiment/analyze` - Sentiment analysis
- `GET /health` - Detailed health status
- `GET /health/live` - Liveness probe
- `GET /health/ready` - Readiness probe

### LLM Service (Port 3001 - Internal Only)
**Capabilities:**
- Text generation using Vistral-7B or configurable model
- Multiple candidate generation (n parameter)
- Temperature and token control
- Request queuing (max concurrency: 5, queue size: 20)
- Redis caching for repeated prompts

**Note**: Currently running in stub mode - requires ESM migration for full functionality.

### RAG Service (Port 3002 - Internal Only)
**Capabilities:**
- Vector similarity search using ChromaDB
- Hybrid search (BM25 + Vector similarity)
- Knowledge base management (templates, styles, memories)
- Metadata preservation

**Note**: Currently running in stub mode - requires ESM migration for full functionality.

### Sentiment Service (Port 3003 - Internal Only)
**Capabilities:**
- Sentiment classification
- Tone detection and scoring
- Safety filtering
- Candidate ranking

## Prerequisites

### Required
- **Docker**: Version 24.0 or higher
- **Docker Compose**: Version 2.0 or higher
- **Network**: External Docker network `socialcue-external` for service communication

### For GPU Support (LLM Service)
- **NVIDIA GPU**: CUDA-compatible GPU
- **NVIDIA Driver**: Version 525.60.13 or higher
- **NVIDIA Container Toolkit**: For Docker GPU access

## Installation

### 1. Clone and Setup
```bash
cd socialcue-ai-services
cp .env.example .env
```

### 2. Create External Network
```bash
docker network create socialcue-external
```

### 3. Configure Environment Variables

Edit `.env` file:

```bash
# Gateway Configuration
PORT=3000
NODE_ENV=production
API_KEYS=dev-key-1,dev-key-2,dev-key-3

# Redis Configuration
REDIS_URL=redis://redis:6379

# ChromaDB Configuration
CHROMADB_URL=http://chromadb:8000

# PostgreSQL Configuration (for RAG service)
DATABASE_URL=postgresql://user:password@postgres:5432/socialcue

# Service URLs (Internal)
LLM_SERVICE_URL=http://llm-service:3001
RAG_SERVICE_URL=http://rag-service:3002
SENTIMENT_SERVICE_URL=http://sentiment-service:3003

# Logging
LOG_LEVEL=info
```

### 4. Start Services

```bash
# Development mode
docker compose up -d

# Production mode
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d
```

### 5. Verify Deployment

```bash
# Check all services are healthy
curl -H "Authorization: Bearer dev-key-1" http://localhost:3001/health
```

## API Usage

### Authentication

All requests require API key authentication:

```bash
curl -X POST http://localhost:3001/v1/sentiment/analyze \
  -H "Authorization: Bearer dev-key-1" \
  -H "Content-Type: application/json" \
  -d '{
    "candidates": [{
      "id": "1",
      "text": "Great service!",
      "tags": [],
      "score": 0.5,
      "explanation": "test"
    }],
    "target_tone": "friendly"
  }'
```

### Sentiment Analysis

```bash
curl -X POST http://localhost:3001/v1/sentiment/analyze \
  -H "Authorization: Bearer dev-key-1" \
  -H "Content-Type: application/json" \
  -d '{
    "candidates": [
      {
        "id": "1",
        "text": "I love this product!",
        "tags": ["positive"],
        "score": 0.8,
        "explanation": "Enthusiastic response"
      }
    ],
    "target_tone": "friendly",
    "safety_level": "medium"
  }'
```

## Development

### Local Development Setup

```bash
# Install dependencies
npm install

# Build shared package
cd shared && npm run build && cd ..

# Start development mode
npm run dev

# Run tests
npm run test

# Build all services
npm run build
```

## Network Configuration

This project uses an external Docker network (`socialcue-external`) to enable communication with other services (e.g., Audio Services, Main App).

**Services are accessible via DNS names:**
- `ai-gateway:3000` - AI Gateway (from other containers)
- `localhost:3001` - AI Gateway (from host machine)

## Security

### Network Isolation
- Internal services (LLM, RAG, Sentiment) are NOT exposed to the host
- Only the gateway (port 3001) is accessible externally
- Services communicate via internal Docker network

### Authentication
- All requests require `Authorization: Bearer <API_KEY>` header
- Multiple API keys supported for key rotation
- Invalid keys return HTTP 403
- Missing auth returns HTTP 401

## Monitoring and Health Checks

### Health Endpoints

**Liveness Probe** (`GET /health/live`):
```bash
curl http://localhost:3001/health/live
```

**Readiness Probe** (`GET /health/ready`):
```bash
curl http://localhost:3001/health/ready
```

**Detailed Health** (`GET /health`):
```bash
curl -H "Authorization: Bearer dev-key-1" http://localhost:3001/health
```

## Troubleshooting

### Services Won't Start

```bash
# Check Docker logs
docker compose logs -f

# Check specific service
docker compose logs llm-service
```

### Authentication Failures

```bash
# Verify API key in .env
cat .env | grep API_KEYS

# Test with correct key
curl -H "Authorization: Bearer dev-key-1" http://localhost:3001/health
```

### Network Issues

```bash
# Verify external network exists
docker network ls | grep socialcue-external

# Create if missing
docker network create socialcue-external
```

## Deployment

### Production Deployment

1. Configure production environment
2. Build and start services
3. Verify health endpoints
4. Monitor logs for errors

### Scaling

```bash
# Scale individual services
docker compose up -d --scale llm-service=3
docker compose up -d --scale rag-service=2
```

## Integration with Main Application

**Main application configuration:**
```bash
# In main app .env
AI_SERVICES_URL=http://ai-gateway:3000  # Use DNS name in Docker network
AI_API_KEY=your-secret-key-1
```

## Known Limitations

- LLM Service: Running in stub mode, requires ESM migration for `node-llama-cpp`
- RAG Service: Running in stub mode, requires ESM migration for `@xenova/transformers`
- Both services return mock responses until ESM migration is completed

## License

MIT

## Development Notes

This project was developed with AI assistance to:
- Accelerate microservices architecture implementation
- Ensure TypeScript best practices
- Implement comprehensive error handling
- Create production-ready Docker configurations
- Generate API documentation

