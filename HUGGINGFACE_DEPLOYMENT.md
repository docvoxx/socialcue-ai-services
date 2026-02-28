# 🚀 Hướng Dẫn Deploy lên Hugging Face Spaces

## ✅ Chuẩn Bị

1. **Tạo Space trên Hugging Face**
   - Vào https://huggingface.co/new-space
   - Tên Space: `socialcue-ai-services` (hoặc tên bạn muốn)
   - SDK: **Docker**
   - Visibility: Public hoặc Private

2. **Lấy Access Token**
   - Vào https://huggingface.co/settings/tokens
   - Tạo token mới với quyền **Write**
   - Copy token (sẽ dùng khi push)

## 📝 Các File Đã Chuẩn Bị

✅ `Dockerfile` - Docker config cho HF Spaces
✅ `README_HF.md` - README với metadata HF
✅ `.dockerignore` - Loại bỏ files không cần thiết
✅ `gateway/src/config.ts` - Đã sửa port 7860 và host 0.0.0.0
✅ `gateway/src/index.ts` - Đã bind đúng host

## 🔧 Bước 1: Chuẩn Bị Repo

```bash
cd socialcue-ai-services

# Copy README cho HF
cp README_HF.md README.md

# Build để test local (optional)
cd gateway
npm install
npm run build
npm start
# Test: curl http://localhost:7860/health/live
```

## 🚀 Bước 2: Push lên Hugging Face

### Option A: Push từ repo hiện tại

```bash
# Trong thư mục socialcue-ai-services

# Add remote HF
git remote add hf https://huggingface.co/spaces/lannnsleepy/socialcue-ai-services

# Commit các thay đổi
git add .
git commit -m "Deploy AI Services Gateway to Hugging Face"

# Push lên HF
git push hf main
```

Khi hỏi credentials:
- **Username**: `lannnsleepy` (hoặc username HF của bạn)
- **Password**: Paste HF access token (write)

### Option B: Clone và push (nếu chưa có git)

```bash
# Clone Space từ HF
git clone https://huggingface.co/spaces/lannnsleepy/socialcue-ai-services
cd socialcue-ai-services

# Copy files từ project
cp -r ../socialcue-ai-services/gateway ./
cp ../socialcue-ai-services/Dockerfile ./
cp ../socialcue-ai-services/README_HF.md ./README.md
cp ../socialcue-ai-services/.dockerignore ./
cp ../socialcue-ai-services/package.json ./

# Commit và push
git add .
git commit -m "Initial deployment"
git push
```

## 📊 Bước 3: Xem Build Logs

1. Vào Space: https://huggingface.co/spaces/lannnsleepy/socialcue-ai-services
2. Click tab **Logs**
3. Xem build progress:
   - ✅ Building Docker image...
   - ✅ Installing dependencies...
   - ✅ Building TypeScript...
   - ✅ Starting server...
   - ✅ **Running** (khi thành công)

## 🔑 Bước 4: Set Environment Variables

1. Vào Space → **Settings** → **Variables and secrets**
2. Add variable:
   - **Name**: `API_KEYS`
   - **Value**: `dev-key-1,dev-key-2` (hoặc keys của bạn)
3. Click **Save**
4. Space sẽ tự động restart

## 🧪 Bước 5: Test API

### Test Health (không cần auth)
```bash
curl https://lannnsleepy-socialcue-ai-services.hf.space/health/live
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-20T10:00:00.000Z",
  "service": "ai-gateway",
  "version": "1.0.0"
}
```

### Test với Authentication
```bash
curl -X POST https://lannnsleepy-socialcue-ai-services.hf.space/v1/sentiment/analyze \
  -H "Authorization: Bearer dev-key-1" \
  -H "Content-Type: application/json" \
  -d '{
    "candidates": [{
      "id": "1",
      "text": "Great service!",
      "tags": ["feedback"],
      "score": 0.9,
      "explanation": "Positive feedback"
    }],
    "target_tone": "friendly"
  }'
```

## ⚠️ Lưu Ý Quan Trọng

### 1. Gateway-Only Deployment
Deployment này chỉ chạy **Gateway** (API routing layer). Các internal services (LLM, RAG, Sentiment) sẽ trả về stub responses vì không có backend services.

**Để có full functionality**, bạn cần:
- Deploy các services riêng (LLM, RAG, Sentiment) trên các Spaces khác
- Hoặc deploy full stack với docker-compose (cần HF Pro)
- Hoặc point services URLs tới external endpoints

### 2. Service URLs Configuration
Nếu bạn có các services deployed riêng, set trong Space Settings:

```bash
LLM_SERVICE_URL=https://your-llm-service.hf.space
RAG_SERVICE_URL=https://your-rag-service.hf.space
SENTIMENT_SERVICE_URL=https://your-sentiment-service.hf.space
```

### 3. Stub Responses
Khi không có backend services, gateway sẽ trả về errors hoặc stub responses. Đây là behavior mong đợi cho gateway-only deployment.

## 🐛 Troubleshooting

### Lỗi: "Application startup failed"
**Nguyên nhân**: Thiếu API_KEYS environment variable

**Giải pháp**:
1. Vào Settings → Variables
2. Add `API_KEYS=dev-key-1`
3. Save và restart

### Lỗi: "Cannot connect to service"
**Nguyên nhân**: Internal services không available (expected cho gateway-only)

**Giải pháp**:
- Deploy các services riêng
- Hoặc set service URLs tới external endpoints
- Hoặc chấp nhận stub responses

### Lỗi: "Port 7860 not responding"
**Nguyên nhân**: Server không bind đúng host

**Giải pháp**: Đã fix trong code (bind 0.0.0.0:7860)

### Build quá lâu
**Nguyên nhân**: npm install chậm

**Giải pháp**:
- Đợi lần đầu build xong (5-10 phút)
- Lần sau sẽ nhanh hơn (có cache)

## 📈 Next Steps

### Deploy Audio Services
Làm tương tự cho `socialcue-audio-services`:
1. Copy Dockerfile pattern
2. Sửa gateway config (port 7860, host 0.0.0.0)
3. Push lên Space riêng: `lannnsleepy/socialcue-audio-services`

### Deploy Full Stack
Để deploy full microservices:
1. Cần Hugging Face Pro (support docker-compose)
2. Hoặc deploy từng service riêng và link URLs
3. Hoặc deploy trên platform khác (Railway, Render, Fly.io)

## 🎉 Hoàn Thành!

Sau khi deploy thành công, bạn có:
- ✅ Public API endpoint: `https://lannnsleepy-socialcue-ai-services.hf.space`
- ✅ Health check: `/health/live`
- ✅ API routes: `/v1/sentiment`, `/v1/llm`, `/v1/rag`
- ✅ Authentication: Bearer token
- ✅ Auto-restart on code changes

---

**Lưu ý**: Đây là gateway-only deployment. Để có full AI functionality, cần deploy các backend services (LLM, RAG, Sentiment) riêng.
