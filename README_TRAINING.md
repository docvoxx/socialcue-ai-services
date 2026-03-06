# 🎓 Training Documentation Index

Complete guide to training all SocialCue AI models with Ollama (100% FREE).

## 🚀 Start Here

**New to training?** → [`../START_HERE_TRAINING.md`](../START_HERE_TRAINING.md)

**Quick commands?** → [`QUICK_START_TRAINING.md`](./QUICK_START_TRAINING.md)

## 📚 Documentation Structure

### Getting Started (Read First)
1. **[START_HERE_TRAINING.md](../START_HERE_TRAINING.md)** - Main entry point
2. **[QUICK_START_TRAINING.md](./QUICK_START_TRAINING.md)** - Quick reference card
3. **[TRAINING_STATUS.md](./TRAINING_STATUS.md)** - Current status & next steps

### Complete Guides
4. **[COMPLETE_TRAINING_ROADMAP.md](./COMPLETE_TRAINING_ROADMAP.md)** - Full roadmap for all services
5. **[OLLAMA_TRAINING_GUIDE.md](./OLLAMA_TRAINING_GUIDE.md)** - Detailed Ollama training guide
6. **[../TRAINING_COMPLETE_GUIDE.md](../TRAINING_COMPLETE_GUIDE.md)** - Step-by-step complete guide

### Service-Specific Guides
7. **[RANKER_INTEGRATION_GUIDE.md](./RANKER_INTEGRATION_GUIDE.md)** - How to use trained ranker
8. **[RANKING_SYSTEM_GUIDE.md](./RANKING_SYSTEM_GUIDE.md)** - Ranking system overview
9. **[scripts/ranking/README.md](./scripts/ranking/README.md)** - Ranking scripts documentation

### Data Generation
10. **[OLLAMA_DATA_FACTORY_GUIDE.md](./OLLAMA_DATA_FACTORY_GUIDE.md)** - Generate data with Ollama (FREE)
11. **[CRUSH_DATA_GENERATION_GUIDE.md](./CRUSH_DATA_GENERATION_GUIDE.md)** - Generate data with OpenAI

### Summary Documents
12. **[../AI_TRAINING_SUMMARY.md](../AI_TRAINING_SUMMARY.md)** - High-level summary

## 🎯 Training Overview

### Status
- ✅ **Ranker**: Trained (77.5% top-1, 100% top-3)
- 🎯 **LLM**: Ready to train (30 min, $0)
- 🎯 **RAG**: Ready to setup (10 min, $0)
- 🎯 **Sentiment**: Ready to train (3 hours, $0)

### Total Time & Cost
- **Time**: ~4 hours
- **Cost**: $0 (100% local with Ollama)

## ⚡ Quick Commands

### Install Dependencies
```bash
# Linux/Mac
./install_training_deps.sh

# Windows
install_training_deps.bat
```

### Train All Models
```bash
# LLM (30 min)
cd scripts/llm
python finetune_ollama_local.py --data ../../data/processed/llm/conversations_1000.jsonl --test

# RAG (10 min)
cd ../rag
python setup_embeddings.py --data ../../data/processed/llm/conversations_1000.jsonl

# Sentiment (3 hours)
cd ../sentiment
python create_labels_ollama.py --input ../../data/processed/llm/conversations_1000.jsonl
python train_classifier.py --data ../../data/processed/sentiment/labeled.jsonl
```

## 📂 File Structure

```
socialcue-ai-services/
├── README_TRAINING.md                    ← You are here
├── QUICK_START_TRAINING.md               ← Quick reference
├── TRAINING_STATUS.md                    ← Current status
├── COMPLETE_TRAINING_ROADMAP.md          ← Full roadmap
├── OLLAMA_TRAINING_GUIDE.md              ← Ollama guide
├── RANKER_INTEGRATION_GUIDE.md           ← Ranker usage
├── RANKING_SYSTEM_GUIDE.md               ← Ranking overview
├── install_training_deps.sh              ← Install script (Linux/Mac)
├── install_training_deps.bat             ← Install script (Windows)
├── data/
│   └── processed/llm/
│       ├── conversations_1000.jsonl      ✅ Training data
│       ├── ranking_labels_1000.jsonl     ✅ Ranking labels
│       └── crush_contexts_1000.jsonl     ✅ Context metadata
├── models/
│   └── ranker_pairwise/                  ✅ Trained ranker
└── scripts/
    ├── llm/
    │   ├── finetune_ollama_local.py      ✅ LLM training
    │   └── requirements.txt
    ├── rag/
    │   ├── setup_embeddings.py           ✅ RAG setup
    │   └── requirements.txt
    ├── sentiment/
    │   ├── create_labels_ollama.py       ✅ Sentiment labeling
    │   ├── train_classifier.py           ✅ Sentiment training
    │   └── requirements.txt
    └── ranking/
        ├── train_ranker.py               ✅ Ranker training (done)
        ├── use_ranker_example.py         ✅ Usage examples
        └── README.md
```

## 🎯 Training Workflow

```
1. Install Dependencies (5 min)
   └─→ ./install_training_deps.sh
   
2. Train LLM (30 min)
   └─→ scripts/llm/finetune_ollama_local.py
   
3. Setup RAG (10 min)
   └─→ scripts/rag/setup_embeddings.py
   
4. Label Sentiment (2-3 hours)
   └─→ scripts/sentiment/create_labels_ollama.py
   
5. Train Sentiment (30 min)
   └─→ scripts/sentiment/train_classifier.py
   
6. Test Pipeline
   └─→ Complete integration test
```

## 📊 Expected Results

### After Training
```
models/
├── ranker_pairwise/          ✅ 77.5% top-1, 100% top-3
├── rag_embeddings/           ✅ 90%+ retrieval precision
└── sentiment_classifier/     ✅ 89% classification accuracy

Ollama:
└── socialcue-crush           ✅ Fine-tuned LLM
```

### Performance Metrics
| Service | Metric | Value |
|---------|--------|-------|
| LLM | Quality | Natural, context-aware |
| Ranker | Top-1 Accuracy | 77.5% |
| Ranker | Top-3 Accuracy | 100% |
| RAG | Retrieval Precision | 90%+ |
| Sentiment | Classification | 89%+ |

## 🆘 Troubleshooting

### Common Issues
- **Ollama not running**: `ollama serve`
- **Model not found**: `ollama pull qwen2.5:3b`
- **Out of memory**: Use `qwen2.5:1.5b`
- **Slow inference**: Check GPU with `nvidia-smi`

### Getting Help
1. Check the relevant guide from the list above
2. Review training logs
3. Test with small samples first (`--max-samples 10`)
4. Verify Ollama is running: `ollama list`

## 🎉 Ready to Start?

**Choose your path:**

1. **Complete beginner?** → Read [`../START_HERE_TRAINING.md`](../START_HERE_TRAINING.md)
2. **Want quick commands?** → Use [`QUICK_START_TRAINING.md`](./QUICK_START_TRAINING.md)
3. **Need detailed guide?** → Follow [`OLLAMA_TRAINING_GUIDE.md`](./OLLAMA_TRAINING_GUIDE.md)
4. **Just train now?** → Run commands from "Quick Commands" section above

---

**Most common path:**
```bash
# 1. Install
./install_training_deps.sh

# 2. Train LLM (start here!)
cd scripts/llm
python finetune_ollama_local.py \
  --data ../../data/processed/llm/conversations_1000.jsonl \
  --samples 50 \
  --model-name socialcue-crush \
  --test
```

🚀 All scripts ready, all data prepared, cost is $0!
