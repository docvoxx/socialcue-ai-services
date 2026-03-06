---
title: SocialCue LLM Service (PhoGPT)
emoji: 💬
colorFrom: blue
colorTo: purple
sdk: docker
app_port: 7860
pinned: false
---

# SocialCue LLM Service - PhoGPT-4B-Chat

Vietnamese language model API for crush conversation suggestions using PhoGPT-4B-Chat.

## 🎯 Features

- **Model**: PhoGPT-4B-Chat-Q4_K_M (2.36GB GGUF)
- **Optimized**: CPU Basic (2 CPU / 16GB RAM)
- **Free**: No API keys, runs on HF Spaces free tier
- **Vietnamese**: Native Vietnamese language support
- **Fast**: Quantized model for efficient inference

## 🚀 API Endpoints

### Health Check
```bash
curl https://YOUR-SPACE.hf.space/health
```

### Generate Candidates (SocialCue API)
```bash
curl -X POST https://YOUR-SPACE.hf.space/v1/llm/generate \
  -H "Content-Type: application/json" \
  -d '{
    "history": "Crush: Hôm nay mình hơi mệt\nUser: Vậy à",
    "n_candidates": 5,
    "max_tokens": 150,
    "temperature": 0.8
  }'
```

**Response:**
```json
{
  "candidates": [
    {"text": "Nghỉ ngơi thêm nhé, đừng làm việc quá sức 😊"},
    {"text": "Vậy tối nay về sớm nghỉ ngơi nhé"},
    {"text": "Mình có thể làm gì giúp bạn không?"},
    {"text": "Muốn mình pha trà thư giãn cho không? 🍵"},
    {"text": "Thế thì hôm nay chill thôi, đừng stress nữa"}
  ],
  "model": "PhoGPT-4B-Chat-Q4_K_M"
}
```

### Generate Single Reply
```bash
curl -X POST https://YOUR-SPACE.hf.space/v1/llm/generate-single \
  -H "Content-Type: application/json" \
  -d '{
    "history": "Crush: Hôm nay mình hơi mệt\nUser: Vậy à",
    "max_tokens": 150,
    "temperature": 0.8
  }'
```

### OpenAI-Compatible Chat
```bash
curl -X POST https://YOUR-SPACE.hf.space/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "system", "content": "Bạn là trợ lý soạn tin nhắn nói chuyện với crush."},
      {"role": "user", "content": "Crush: Hôm nay mình hơi mệt\nUser: Vậy à"}
    ],
    "max_tokens": 150,
    "temperature": 0.8
  }'
```

## 🔧 Configuration

Environment variables:
- `MODEL_REPO_ID`: vinai/PhoGPT-4B-Chat-gguf
- `MODEL_FILENAME`: PhoGPT-4B-Chat-Q4_K_M.gguf
- `N_CTX`: 2048 (context window)
- `N_THREADS`: 2 (CPU threads)

## 📊 Performance

- **Latency**: ~2-5 seconds per generation (CPU Basic)
- **Throughput**: 1-2 requests/second
- **Quality**: Native Vietnamese, natural responses
- **Cost**: $0 (free HF Spaces)

## ⚠️ Important Notes

- **Cold Start**: First request takes 30-60 seconds (model loading)
- **Sleep**: Space sleeps after 48h inactivity
- **Wake Up**: Auto-wakes on request (30-60s delay)
- **Limits**: CPU Basic has resource limits

## 🔗 Integration

### With Ranker Service
```python
import requests

# 1. Generate candidates
response = requests.post(
    "https://YOUR-SPACE.hf.space/v1/llm/generate",
    json={
        "history": "Crush: Hôm nay mình hơi mệt\nUser: Vậy à",
        "n_candidates": 5
    }
)
candidates = [c["text"] for c in response.json()["candidates"]]

# 2. Rank with ranker service
ranked = rank_replies(history, candidates)

# 3. Return top-3
top3 = ranked[:3]
```

## 📚 Model Info

- **Base**: VinAI PhoGPT-4B-Chat
- **Quantization**: Q4_K_M (4-bit)
- **Size**: 2.36GB
- **Language**: Vietnamese
- **License**: Check VinAI license

## 🆘 Troubleshooting

### Space is sleeping
- Just make a request, it will wake up automatically
- First request after wake: 30-60 seconds

### Slow responses
- CPU Basic is limited, expect 2-5s per generation
- Consider upgrading to CPU Upgrade for faster inference

### Out of memory
- Reduce `n_candidates` (default: 5)
- Reduce `max_tokens` (default: 150)
- Reduce `n_ctx` to 1024

## 🚀 Deploy Your Own

1. Create new Space on Hugging Face
2. Choose Docker SDK
3. Upload these files:
   - `Dockerfile`
   - `requirements.txt`
   - `server.py`
   - `README_HF.md` (rename to README.md)
4. Set hardware: CPU Basic (free)
5. Deploy!

## 📖 Documentation

- **Model**: https://huggingface.co/vinai/PhoGPT-4B-Chat-gguf
- **API Docs**: https://YOUR-SPACE.hf.space/docs
- **GitHub**: https://github.com/docvoxx/socialcue-ai-services

---

**Note**: This is a free service running on HF Spaces CPU Basic. For production use with high traffic, consider upgrading to CPU Upgrade or GPU.
