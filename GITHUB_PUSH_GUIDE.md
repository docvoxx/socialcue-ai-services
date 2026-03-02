# GitHub Push Guide

Hướng dẫn push code lên GitHub repository sau khi cập nhật.

## 📋 Checklist Trước Khi Push

- [x] Đã rename project từ Skippy sang SocialCue
- [x] Đã cấu hình Hugging Face deployment
- [x] Đã tạo data generation systems (OpenAI + Ollama)
- [x] Đã cập nhật README.md với links HF
- [x] Đã tạo CHANGELOG.md
- [x] Đã test build thành công trên HF Space

## 🚀 Push Lên GitHub

### Bước 1: Kiểm tra trạng thái

```bash
cd socialcue-ai-services
git status
```

### Bước 2: Add tất cả files mới và đã sửa

```bash
# Add tất cả files
git add .

# Hoặc add từng file cụ thể
git add README.md
git add CHANGELOG.md
git add GITHUB_PUSH_GUIDE.md
git add Dockerfile
git add gateway/
git add scripts/
git add data/
git add *.md
```

### Bước 3: Commit với message rõ ràng

```bash
git commit -m "feat: Major update - Rename to SocialCue + HF deployment + Data generation systems

- Renamed from skippy-ai-services to socialcue-ai-services
- Added Hugging Face Spaces deployment (https://huggingface.co/spaces/lannnsleepy/socialcue-vn)
- Added OpenAI-based data generation system
- Added Ollama-based data generation system (free, local)
- Updated README with HF links and comprehensive documentation
- Added CHANGELOG.md
- Fixed Dockerfile for HF compatibility
"
```

### Bước 4: Push lên GitHub

```bash
# Push lên main branch
git push origin main

# Nếu cần force push (cẩn thận!)
git push origin main --force
```

### Bước 5: Verify trên GitHub

Sau khi push, kiểm tra:
1. Vào https://github.com/docvoxx/socialcue-ai-services
2. Kiểm tra README.md hiển thị đúng
3. Kiểm tra các files mới đã được push
4. Kiểm tra links Hugging Face hoạt động

## 🔗 Links Quan Trọng

### GitHub Repository
- **Main Repo**: https://github.com/docvoxx/socialcue-ai-services
- **Issues**: https://github.com/docvoxx/socialcue-ai-services/issues
- **Pull Requests**: https://github.com/docvoxx/socialcue-ai-services/pulls

### Hugging Face Space
- **Space URL**: https://huggingface.co/spaces/lannnsleepy/socialcue-vn
- **API Endpoint**: https://lannnsleepy-socialcue-vn.hf.space
- **Space Settings**: https://huggingface.co/spaces/lannnsleepy/socialcue-vn/settings

### Related Repositories
- **Main App**: https://github.com/docvoxx/socialcue-main-app
- **Audio Services**: https://github.com/docvoxx/socialcue-audio-services

## 📝 Các Files Đã Cập Nhật

### Documentation
- ✅ `README.md` - Updated with HF links and comprehensive guide
- ✅ `CHANGELOG.md` - Complete changelog of v2.0.0
- ✅ `GITHUB_PUSH_GUIDE.md` - This file
- ✅ `HUGGINGFACE_DEPLOYMENT.md` - HF deployment guide
- ✅ `CRUSH_DATA_GENERATION_GUIDE.md` - OpenAI data generation
- ✅ `OLLAMA_DATA_FACTORY_GUIDE.md` - Ollama data generation

### Code
- ✅ `Dockerfile` - Fixed for HF Spaces
- ✅ `gateway/src/config.ts` - Updated port and host
- ✅ `gateway/src/index.ts` - Updated server binding

### Scripts
- ✅ `scripts/data-generation/generate_crush_contexts.py`
- ✅ `scripts/data-processing/generate_crush_dataset.py`
- ✅ `scripts/data-processing/convert_to_conversations.py`
- ✅ `scripts/ranking/rank_replies.py`

### Data
- ✅ `data/config/generation_config.json`
- ✅ `data/samples/crush_contexts_sample_30.json`

## 🎯 Next Steps Sau Khi Push

1. **Update GitHub Repository Description**
   - Vào Settings → General
   - Thêm description: "AI Services Gateway for SocialCue - LLM, RAG, and Sentiment Analysis"
   - Thêm topics: `ai`, `llm`, `rag`, `sentiment-analysis`, `huggingface`, `nodejs`, `typescript`

2. **Add GitHub Repository Links**
   - Vào Settings → General
   - Website: `https://lannnsleepy-socialcue-vn.hf.space`

3. **Create GitHub Release** (Optional)
   ```bash
   git tag -a v2.0.0 -m "Version 2.0.0 - SocialCue rename + HF deployment"
   git push origin v2.0.0
   ```

4. **Update README Badges** (Optional)
   Thêm vào đầu README.md:
   ```markdown
   ![Hugging Face](https://img.shields.io/badge/🤗%20Hugging%20Face-Spaces-blue)
   ![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)
   ![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js)
   ![TypeScript](https://img.shields.io/badge/TypeScript-5+-3178C6?logo=typescript)
   ```

## ⚠️ Lưu Ý

- **Không push .env files** - Đã có trong .gitignore
- **Không push node_modules** - Đã có trong .gitignore
- **Không push dist/build folders** - Đã có trong .gitignore
- **Không push models lớn** - Đã có trong .gitignore

## 🆘 Troubleshooting

### Nếu gặp lỗi "rejected" khi push
```bash
# Pull trước rồi push
git pull origin main --rebase
git push origin main
```

### Nếu muốn xóa commit cuối
```bash
# Soft reset (giữ changes)
git reset --soft HEAD~1

# Hard reset (xóa changes)
git reset --hard HEAD~1
```

### Nếu muốn xem diff trước khi commit
```bash
git diff
git diff --staged
```

## ✅ Done!

Sau khi push xong, repository của bạn sẽ có:
- ✅ README đầy đủ với links Hugging Face
- ✅ CHANGELOG chi tiết
- ✅ Documentation đầy đủ
- ✅ Data generation systems
- ✅ Hugging Face deployment ready
- ✅ Professional project structure
