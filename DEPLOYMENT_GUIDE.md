# Hướng dẫn Deploy và Gọi API - AI Services

## Bước 1: Chuẩn bị môi trường

### 1.0. Tạo Shared Network (Quan trọng!)

**Chỉ cần làm 1 lần** để AI, Audio và Main App gọi được nhau:
```bash
docker network create socialcue-external
```

**Lưu ý**: Network này cho phép:
- Main App gọi AI Services qua DNS: `http://ai-gateway:3000`
- Main App gọi Audio Services qua DNS: `http://audio-gateway:3000`
- Từ host machine: AI = `http://localhost:3001`, Audio = `http://localhost:3002`

### 1.1. Kiểm tra Docker
```bash
docker --version
docker compose version
```

### 1.2. Tạo file .env
File `.env` đã được tạo từ `.env.example`. Bạn có thể chỉnh sửa nếu cần:
```bash
# Mở file .env để chỉnh sửa
notepad .env
```

**Quan trọng**: Đổi API_KEYS thành key bảo mật của bạn:
```env
API_KEYS=your-secret-key-here
```

## Bước 2: Build và Deploy Services

### 2.1. Build và khởi động services
```bash
cd socialcue-ai-services
docker compose --env-file .env up -d --build
```

Quá trình build sẽ mất 5-10 phút lần đầu.

### 2.2. Kiểm tra services đang chạy
```bash
docker compose ps
```

Bạn sẽ thấy:
- `ai-gateway` - Port 3001:3000 (host:container)
- `llm-service` - Internal only
- `rag-service` - Internal only
- `sentiment-service` - Internal only
- `redis` - Internal only
- `chromadb` - Internal only

### 2.3. Xem logs
```bash
# Xem tất cả logs
docker compose logs -f

# Xem logs của một service cụ thể
docker compose logs -f ai-gateway
docker compose logs -f llm-service
```

## Bước 3: Kiểm tra Health

### 3.1. Kiểm tra Gateway (đúng spec)
```bash
# Health check tổng quan
curl http://localhost:3001/health

# Liveness probe
curl http://localhost:3001/health/live

# Readiness probe
curl http://localhost:3001/health/ready
```

Kết quả mong đợi:
```json
{
  "service": "ai-gateway",
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 123.45,
  "timestamp": "2026-02-27T...",
  "dependencies": {
    "llm": {
      "status": "up",
      "latency": 50,
      "version": "1.0.0"
    },
    "rag": {
      "status": "up",
      "latency": 30,
      "version": "1.0.0"
    },
    "sentiment": {
      "status": "up",
      "latency": 20,
      "version": "1.0.0"
    }
  }
}
```

## Bước 4: Gọi API (Đúng Spec)

### 4.1. Lấy API Key
Từ file `.env`, copy giá trị của `API_KEYS`. Ví dụ: `dev-key-1`

### 4.2. Test API với curl (Đúng Contract)

**LƯU Ý**: Tất cả endpoint phải có prefix `/v1/` theo spec.

#### A. LLM Service - Generate Text
```bash
curl -X POST http://localhost:3001/v1/llm/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-key-1" \
  -H "X-Request-Id: 11111111-1111-1111-1111-111111111111" \
  -d '{
    "prompt": "Bạn là coach giao tiếp tiếng Việt. Hãy gợi ý 3 cách trả lời tin nhắn: \"Em bận rồi\" lịch sự và ngắn gọn.",
    "max_tokens": 256,
    "temperature": 0.7,
    "n": 3
  }'
```

**Response:**
```json
{
  "text": "Cách 1: ...",
  "texts": ["Cách 1: ...", "Cách 2: ...", "Cách 3: ..."],
  "tokens_used": 150,
  "model": "PhoGPT-4B-Chat",
  "trace_id": "11111111-1111-1111-1111-111111111111"
}
```

#### B. RAG Service - Retrieve Context
```bash
curl -X POST http://localhost:3001/v1/rag/retrieve \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-key-1" \
  -H "X-Request-Id: 22222222-2222-2222-2222-222222222222" \
  -d '{
    "query": "cách từ chối khéo trong giao tiếp tiếng Việt",
    "top_k": 5,
    "collection": "default"
  }'
```

**Response:**
```json
{
  "results": [
    {
      "content": "Khi từ chối, nên dùng ngôn từ lịch sự...",
      "score": 0.95,
      "metadata": {
        "source": "communication_guide.pdf",
        "doc_id": "doc-123",
        "chunk_id": "chunk-456"
      }
    }
  ],
  "trace_id": "22222222-2222-2222-2222-222222222222"
}
```

#### C. Sentiment Service - Analyze Text
```bash
curl -X POST http://localhost:3001/v1/sentiment/analyze \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-key-1" \
  -H "X-Request-Id: 33333333-3333-3333-3333-333333333333" \
  -d '{
    "text": "Thôi khỏi, đừng nhắn nữa.",
    "return_scores": true
  }'
```

**Response:**
```json
{
  "sentiment": "negative",
  "confidence": 0.88,
  "tone": "dismissive",
  "scores": {
    "positive": 0.05,
    "negative": 0.88,
    "neutral": 0.07
  },
  "trace_id": "33333333-3333-3333-3333-333333333333"
}
```

### 4.3. Test với Postman

1. Import collection từ `.kiro/specs/ai-services-separation/SocialCue_AI_Audio_Services.postman_collection.json`
2. Tạo Environment mới:
   - `base_url`: `http://localhost:3001`
   - `api_key`: `dev-key-1` (hoặc key của bạn)
3. Chạy các request trong collection

### 4.4. Test với JavaScript/Node.js

```javascript
const axios = require('axios');

const API_BASE_URL = 'http://localhost:3001';
const API_KEY = 'dev-key-1';

async function testLLM() {
  try {
    const response = await axios.post(
      `${API_BASE_URL}/v1/llm/generate`,
      {
        prompt: "Giải thích về trí tuệ nhân tạo",
        max_tokens: 150,
        temperature: 0.7,
        n: 1
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
          'X-Request-Id': crypto.randomUUID()
        }
      }
    );
    
    console.log('LLM Response:', response.data);
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

async function testRAG() {
  try {
    const response = await axios.post(
      `${API_BASE_URL}/v1/rag/retrieve`,
      {
        query: "cách giao tiếp hiệu quả",
        top_k: 5,
        collection: "default"
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
          'X-Request-Id': crypto.randomUUID()
        }
      }
    );
    
    console.log('RAG Response:', response.data);
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

async function testSentiment() {
  try {
    const response = await axios.post(
      `${API_BASE_URL}/v1/sentiment/analyze`,
      {
        text: "Tôi rất hài lòng với dịch vụ này!",
        return_scores: true
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
          'X-Request-Id': crypto.randomUUID()
        }
      }
    );
    
    console.log('Sentiment Response:', response.data);
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

// Run tests
testLLM();
testRAG();
testSentiment();
```

## Bước 5: Gọi từ Main App (Integration)

### 5.1. Cấu hình trong Main App

**Trường hợp 1 - Main App chạy trong Docker (khuyên dùng):**

Main App phải join network `socialcue-external` trong docker-compose:
```yaml
networks:
  - skippy-network
  - external

networks:
  external:
    name: socialcue-external
    external: true
```

Trong `.env` của `socialcue-main-app`:
```env
# AI Services (dùng DNS name trong Docker network)
AI_SERVICES_URL=http://ai-gateway:3000
AI_API_KEY=your-secret-key-here

# Audio Services (dùng DNS name trong Docker network)
AUDIO_SERVICES_URL=http://audio-gateway:3000
AUDIO_API_KEY=your-audio-key-here
```

**Trường hợp 2 - Main App chạy local (không Docker):**

Trong `.env` của `socialcue-main-app`:
```env
# AI Services (dùng localhost với host port)
AI_SERVICES_URL=http://localhost:3001
AI_API_KEY=your-secret-key-here

# Audio Services (dùng localhost với host port)
AUDIO_SERVICES_URL=http://localhost:3002
AUDIO_API_KEY=your-audio-key-here
```

### 5.2. Test từ Main App Container

Nếu Main App chạy trong Docker, test DNS/network:
```bash
# Vào container api-gateway của main app
docker exec -it socialcue-api-gateway sh

# Test gọi AI gateway
curl "$AI_SERVICES_URL/health"

# Test LLM endpoint
curl -X POST "$AI_SERVICES_URL/v1/llm/generate" \
  -H "Authorization: Bearer $AI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"test","max_tokens":16}'
```

### 5.3. Mapping Payload từ Coach Pipeline

**Quan trọng**: Payload "coach pipeline" (context/scenario/goal/user_style/candidates) thuộc Main App, không phải AI Gateway.

Main App sẽ map:
1. Coach request → RAG retrieve (lấy context)
2. Coach request + RAG context → LLM generate (tạo candidates)
3. LLM candidates → Sentiment analyze (chọn best candidate)

AI Gateway chỉ nhận payload đơn giản theo spec:
- LLM: `{ prompt, max_tokens, temperature, context, n }`
- RAG: `{ query, top_k, collection }`
- Sentiment: `{ text, return_scores }`

## Bước 6: Troubleshooting

### 6.1. Service không khởi động
```bash
# Xem logs chi tiết
docker compose logs llm-service

# Restart service
docker compose restart llm-service
```

### 6.2. Lỗi authentication
- Kiểm tra API key trong header `Authorization: Bearer <your-key>`
- Đảm bảo key có trong `API_KEYS` trong file `.env`

### 6.3. Lỗi connection refused
- Kiểm tra services đang chạy: `docker compose ps`
- Kiểm tra port 3001 không bị chiếm: `netstat -ano | findstr :3001`
- Kiểm tra network `socialcue-external` đã tạo: `docker network ls | grep socialcue-external`

### 6.4. Lỗi timeout
- Tăng timeout trong `.env`:
  ```env
  LLM_TIMEOUT=120000
  RAG_TIMEOUT=10000
  SENTIMENT_TIMEOUT=5000
  ```
- Restart services: `docker compose restart`

### 6.5. Lỗi endpoint không tìm thấy (404)
- Đảm bảo dùng prefix `/v1/` cho tất cả endpoint
- Đúng: `/v1/llm/generate`
- Sai: `/llm/generate`

## Bước 7: Dừng Services

### 7.1. Dừng tất cả services
```bash
docker compose down
```

### 7.2. Dừng và xóa volumes
```bash
docker compose down -v
```

### 7.3. Dừng và xóa images
```bash
docker compose down --rmi all
```

## Bước 8: Production Deployment

### 8.1. Sử dụng production config
```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d
```

### 8.2. Cấu hình production
Chỉnh sửa `.env`:
```env
NODE_ENV=production
LOG_LEVEL=warn
API_KEYS=<strong-random-keys>
```

### 8.3. Enable HTTPS
Thêm reverse proxy (nginx/traefik) phía trước gateway để handle SSL.

## API Endpoints Summary (Đúng Spec)

### Gateway Health (Host Port 3001 → Container Port 3000)
- `GET /health` - Overall health check với dependencies
- `GET /health/live` - Liveness probe
- `GET /health/ready` - Readiness probe

**Lưu ý**: 
- Từ host machine: `http://localhost:3001`
- Từ Docker network (Main App): `http://ai-gateway:3000`

### LLM Service (via Gateway)
- `POST /v1/llm/generate` - Generate text

### RAG Service (via Gateway)
- `POST /v1/rag/retrieve` - Retrieve relevant context

### Sentiment Service (via Gateway)
- `POST /v1/sentiment/analyze` - Analyze sentiment

**Lưu ý**: Không có endpoint `/llm/health`, `/rag/health`, `/sentiment/health` qua gateway. Chỉ có `/health` tổng hợp.

## Tài liệu tham khảo

- API Documentation: `.kiro/specs/ai-services-separation/API_DOCUMENTATION.md`
- Manual Testing Guide: `MANUAL_TESTING.md`
- Test Scripts: `test-ai-services.sh`
- Postman Collection: `.kiro/specs/ai-services-separation/SocialCue_AI_Audio_Services.postman_collection.json`
