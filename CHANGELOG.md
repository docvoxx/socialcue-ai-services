# Changelog

All notable changes to SocialCue AI Services will be documented in this file.

## [2.0.0] - 2024-01-XX

### 🎉 Major Changes

#### Project Rename
- Renamed from `skippy-ai-services` to `socialcue-ai-services`
- Updated all package names from `@skippy-*` to `@socialcue-*`
- Updated all references across codebase

#### Hugging Face Spaces Deployment
- Added Dockerfile optimized for Hugging Face Spaces
- Configured gateway to listen on `0.0.0.0:7860` (HF requirement)
- Created README_HF.md with proper metadata
- Successfully deployed to: https://huggingface.co/spaces/lannnsleepy/socialcue-vn

### ✨ New Features

#### Data Generation Systems
- **OpenAI-based Generator**: High-quality crush conversation contexts (~$1.50 for 250 contexts)
  - Smart variation framework (5 stages × 5 moods × 3 directness levels)
  - Quality filters and validation
  - 5-factor ranking system
  - See: `CRUSH_DATA_GENERATION_GUIDE.md`

- **Ollama-based Generator**: Free, local data generation (0 cost)
  - Uses Mistral model locally via Ollama
  - Batch processing with progress tracking
  - TF-IDF deduplication
  - Safety filters and structure validation
  - Conversation format converter for fine-tuning
  - See: `OLLAMA_DATA_FACTORY_GUIDE.md`

#### New Scripts
- `scripts/data-generation/generate_crush_contexts.py` - OpenAI-based generation
- `scripts/data-processing/generate_crush_dataset.py` - Ollama-based generation
- `scripts/data-processing/convert_to_conversations.py` - Format converter
- `scripts/ranking/rank_replies.py` - Reply ranking system

### 🔧 Configuration Changes

#### Gateway Configuration
- Updated `gateway/src/config.ts`:
  - Port: `process.env.PORT || 7860`
  - Host: `0.0.0.0` (was `localhost`)
  - Added production environment detection

#### Docker Configuration
- New `Dockerfile` for Hugging Face Spaces
- Optimized build process with workspace support
- Environment variables for HF deployment

### 📚 Documentation

#### New Documentation Files
- `HUGGINGFACE_DEPLOYMENT.md` - Complete HF deployment guide
- `CRUSH_DATA_GENERATION_GUIDE.md` - OpenAI data generation guide
- `OLLAMA_DATA_FACTORY_GUIDE.md` - Ollama data generation guide
- `START_HERE_CRUSH_DATA.md` - Quick start for data generation
- `START_HERE_OLLAMA_DATA.md` - Quick start for Ollama
- `CRUSH_DATA_SYSTEM_COMPLETE.md` - System overview
- `OLLAMA_DATA_FACTORY_COMPLETE.md` - Ollama system overview
- `README_HF.md` - Hugging Face Space README

#### Updated Documentation
- `README.md` - Added HF deployment info, API examples, project structure
- `DEPLOYMENT_GUIDE.md` - Updated with HF deployment steps

### 🐛 Bug Fixes
- Fixed Dockerfile COPY command syntax (removed `2>/dev/null || true`)
- Fixed tsconfig.json path in Docker build
- Resolved package-lock.json conflicts after rename

### 🔄 Breaking Changes
- Package names changed from `@skippy-*` to `@socialcue-*`
- Gateway now binds to `0.0.0.0` instead of `localhost`
- Default port changed to 7860 (configurable via PORT env var)

### 📦 Dependencies
- No new dependencies added
- All existing dependencies updated to work with new package names

### 🚀 Deployment
- **Hugging Face Space**: https://huggingface.co/spaces/lannnsleepy/socialcue-vn
- **GitHub Repository**: https://github.com/docvoxx/socialcue-ai-services

---

## [1.0.0] - 2024-XX-XX

### Initial Release
- API Gateway with authentication
- LLM Service integration
- RAG Service integration
- Sentiment Analysis Service integration
- Health check endpoints
- Request logging and error handling
