# 🏭 Ollama Data Factory - Complete Guide

## 🎯 Mục Tiêu

Sinh **250 crush contexts chất lượng cao** trên **máy yếu** (không cần GPU) sử dụng **Ollama local** (vistral).

---

## ✅ Ưu Điểm Approach Này

### Vs. OpenAI API
- ✅ **Miễn phí** (chạy local)
- ✅ **Không giới hạn** requests
- ✅ **Privacy** (data không ra khỏi máy)
- ✅ **Offline** (không cần internet)

### Vs. GPU Training
- ✅ **Không cần GPU**
- ✅ **Chạy trên CPU** (máy yếu OK)
- ✅ **Không cần fine-tune**
- ✅ **Nhanh** (30-60 phút cho 250 contexts)

---

## 📋 Chuẩn Bị

### 1. Install Ollama
```bash
# Download từ: https://ollama.ai
# Hoặc:
curl -fsSL https://ollama.com/install.sh | sh
```

### 2. Pull Model vistral
```bash
ollama pull vistral:latest
```

### 3. Verify Ollama Running
```bash
# Check service
curl http://localhost:11434/api/tags

# Test generation
ollama run vistral "Xin chào"
```

### 4. Install Python Dependencies
```bash
cd socialcue-ai-services
pip install -r scripts/data-processing/requirements.txt
```

**Dependencies** (lightweight, no GPU):
- `requests` - HTTP client
- `tqdm` - Progress bar
- `scikit-learn` - TF-IDF dedup

---

## 🚀 Quick Start

### Option A: Fast Generation (Recommended)
```bash
python scripts/data-processing/generate_crush_dataset.py \
  --n 250 \
  --batch 20 \
  --model vistral:latest
```

**Time**: ~30-45 minutes
**Output**: 250 clean contexts

### Option B: High Quality (with Critic)
```bash
python scripts/data-processing/generate_crush_dataset.py \
  --n 200 \
  --batch 10 \
  --model vistral:latest \
  --critic
```

**Time**: ~60-90 minutes (2x calls)
**Output**: 200 high-quality contexts

---

## 🔧 Script Parameters

### Required
- `--n`: Target number of clean contexts (default: 250)
- `--batch`: Items per generation call (default: 20)

### Optional
- `--model`: Ollama model name (default: vistral:latest)
- `--ollama`: Ollama base URL (default: http://localhost:11434)
- `--out_raw`: Raw output path (default: data/raw/llm/crush_contexts_raw.jsonl)
- `--out_clean`: Clean output path (default: data/processed/llm/crush_contexts_clean.jsonl)
- `--dedup_threshold`: Similarity threshold for dedup (default: 0.92)
- `--critic`: Enable quality scoring (adds extra calls)

### Examples
```bash
# Generate 300 contexts, aggressive dedup
python scripts/data-processing/generate_crush_dataset.py \
  --n 300 \
  --dedup_threshold 0.90

# Generate 150 contexts, batch size 15
python scripts/data-processing/generate_crush_dataset.py \
  --n 150 \
  --batch 15

# Use different Ollama model
python scripts/data-processing/generate_crush_dataset.py \
  --n 250 \
  --model phogpt:latest
```

---

## 📊 Output Files

### 1. Raw Output
**File**: `data/raw/llm/crush_contexts_raw.jsonl`

Contains all generated contexts (before final dedup).

**Format**:
```json
{"id":"crush_0001","stage":"mở đầu","mood":"playful",...}
{"id":"crush_0002","stage":"đang nói chuyện","mood":"cute",...}
```

### 2. Clean Output
**File**: `data/processed/llm/crush_contexts_clean.jsonl`

Contains deduplicated, validated contexts (final dataset).

**Format**: Same as raw, but filtered and deduplicated.

---

## 🧹 Quality Filters

### Automatic Validation

#### 1. Structure Validation
- ✅ All required fields present
- ✅ Stage/mood/directness valid
- ✅ 2-4 messages in history
- ✅ Gold reply <= 25 words
- ✅ 3 candidates, each <= 25 words

#### 2. Safety Filters
**Banned patterns**:
- Sexual content
- Pressure tactics ("trả lời đi", "gặp ngay")
- Inappropriate requests

**Generic patterns**:
- "Em xinh quá"
- "Cho anh làm quen"
- "Nhớ em"

#### 3. Quality Checks
- ✅ Gold reply has question or choice
- ✅ Emoji density matches metadata
- ✅ Not too similar to existing contexts

#### 4. Optional Critic Scoring
When `--critic` enabled:
- Natural score >= 7/10
- Reply likelihood >= 7/10
- Pressure score <= 6/10

### Deduplication

**Method**: TF-IDF + Cosine Similarity

**Threshold**: 0.92 (default)
- 0.90: Aggressive (more diversity)
- 0.94: Lenient (keep more)

**Process**:
1. Extract text from conversation + gold_reply
2. Compute TF-IDF vectors
3. Calculate pairwise similarity
4. Remove contexts with similarity > threshold

---

## 📈 Expected Results

### Generation Stats
```
Target: 250 contexts
Batch size: 20
Batches needed: ~15-20 (with failures)
Time per batch: ~2-3 minutes
Total time: ~30-45 minutes
```

### Quality Stats
```
Generated: ~300-350 contexts
After validation: ~280-300 contexts
After dedup: ~250 contexts
Pass rate: ~70-80%
```

### Output Example
```json
{
  "id": "crush_0001",
  "stage": "mở đầu",
  "mood": "playful",
  "directness": "low",
  "conversation_history": [
    {"role": "crush", "text": "Hôm nay trời đẹp nhỉ"},
    {"role": "user", "text": "Ừ, mà sao bạn biết tôi thích trời đẹp?"}
  ],
  "gold_reply": "Thì... quan sát thôi 😊 Thấy bạn hay post ảnh trời đẹp",
  "candidates": [
    "Đoán thế thôi, may mà đúng",
    "Ai cũng thích trời đẹp mà",
    "Bí mật nghề nghiệp 😎"
  ],
  "negative_reply": "Tại tôi theo dõi bạn từ lâu rồi",
  "metadata": {
    "emoji_density": 1,
    "risk_level": "low"
  }
}
```

---

## 🔄 Convert to Fine-tune Format

### Script
**File**: `scripts/data-processing/convert_to_conversations.py`

### Usage
```bash
python scripts/data-processing/convert_to_conversations.py \
  --input data/processed/llm/crush_contexts_clean.jsonl \
  --output data/processed/llm/conversations.jsonl
```

### Output Format
```json
{
  "messages": [
    {
      "role": "system",
      "content": "Bạn là chuyên gia giao tiếp khi nói chuyện với crush.\n\nContext:\n- Stage: mở đầu\n- Mood: playful\n- Directness: low\n\nNhiệm vụ: Đưa ra câu trả lời tự nhiên, phù hợp với context, không gây áp lực."
    },
    {
      "role": "user",
      "content": "Hội thoại:\nCrush: Hôm nay trời đẹp nhỉ\nBạn: Ừ, mà sao bạn biết tôi thích trời đẹp?\n\nBạn nên trả lời thế nào?"
    },
    {
      "role": "assistant",
      "content": "Thì... quan sát thôi 😊 Thấy bạn hay post ảnh trời đẹp"
    }
  ]
}
```

**Use case**: Fine-tuning LLM models (OpenAI, Llama, etc.)

---

## 💡 Tips & Tricks

### 1. Batch Size Tuning
```bash
# If JSON parse fails often → reduce batch
--batch 10

# If generation is slow → increase batch
--batch 30

# Sweet spot for vistral
--batch 20
```

### 2. Dedup Threshold
```bash
# More diversity (stricter)
--dedup_threshold 0.90

# Keep more contexts (lenient)
--dedup_threshold 0.94

# Default (balanced)
--dedup_threshold 0.92
```

### 3. Critic Mode
```bash
# Use critic for high-quality dataset
--critic

# Skip critic for speed
# (no --critic flag)
```

**Trade-off**:
- With critic: 2x time, higher quality
- Without critic: Faster, good quality

### 4. Model Selection
```bash
# vistral (recommended for Vietnamese)
--model vistral:latest

# phogpt (alternative)
--model phogpt:latest

# llama3 (if you have it)
--model llama3:latest
```

### 5. Resume Generation
```bash
# Script appends to raw file
# If interrupted, just run again
# It will continue from where it stopped
```

---

## 🐛 Troubleshooting

### Issue: Ollama not responding
```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Restart Ollama
ollama serve

# Check model is pulled
ollama list
```

### Issue: JSON parse errors
```bash
# Reduce batch size
--batch 10

# Model might be hallucinating
# Try different model or temperature
```

### Issue: Too many duplicates
```bash
# Lower dedup threshold
--dedup_threshold 0.90

# Or increase batch diversity
# (script already enforces diversity)
```

### Issue: Low quality contexts
```bash
# Enable critic mode
--critic

# Or manually review and filter
cat data/processed/llm/crush_contexts_clean.jsonl | jq '.'
```

### Issue: Generation too slow
```bash
# Increase batch size
--batch 30

# Disable critic
# (no --critic flag)

# Use faster model
--model vistral:7b  # if available
```

---

## 📊 Monitoring Progress

### Real-time Progress
```
Clean items: 100%|████████████| 250/250 [30:15<00:00,  7.26s/it]

Done!
Raw saved:   data/raw/llm/crush_contexts_raw.jsonl (312 lines total)
Clean saved: data/processed/llm/crush_contexts_clean.jsonl (250 lines)
Model: vistral:latest | Critic: False | Dedup: 0.92
```

### Check Output
```bash
# Count contexts
wc -l data/processed/llm/crush_contexts_clean.jsonl

# View sample
head -n 1 data/processed/llm/crush_contexts_clean.jsonl | jq '.'

# Check distribution
cat data/processed/llm/crush_contexts_clean.jsonl | \
  jq -r '.stage' | sort | uniq -c
```

---

## 🎯 Workflow Summary

### Step 1: Generate
```bash
python scripts/data-processing/generate_crush_dataset.py --n 250
```

### Step 2: Review
```bash
# Check quality
head -n 5 data/processed/llm/crush_contexts_clean.jsonl | jq '.'

# Check stats
cat data/processed/llm/crush_contexts_clean.jsonl | \
  jq -r '.stage' | sort | uniq -c
```

### Step 3: Convert (Optional)
```bash
# For fine-tuning
python scripts/data-processing/convert_to_conversations.py
```

### Step 4: Use
```bash
# Build RAG index
python scripts/rag/build_index.py

# Or use directly in service
# See CRUSH_DATA_GENERATION_GUIDE.md
```

---

## 📁 File Structure

```
socialcue-ai-services/
├── data/
│   ├── raw/
│   │   └── llm/
│   │       └── crush_contexts_raw.jsonl      ✅ Raw output
│   └── processed/
│       └── llm/
│           ├── crush_contexts_clean.jsonl    ✅ Clean output
│           └── conversations.jsonl           ✅ Fine-tune format
├── scripts/
│   └── data-processing/
│       ├── generate_crush_dataset.py         ✅ Main script
│       ├── convert_to_conversations.py       ✅ Converter
│       └── requirements.txt                  ✅ Dependencies
└── OLLAMA_DATA_FACTORY_GUIDE.md              ✅ This file
```

---

## 🎉 Advantages

### Resource-Efficient
- ✅ No GPU needed
- ✅ Runs on CPU (even weak machines)
- ✅ ~2GB RAM usage
- ✅ Local processing (no cloud)

### Cost-Effective
- ✅ **$0** (completely free)
- ✅ No API costs
- ✅ Unlimited generations
- ✅ No rate limits

### Privacy-Focused
- ✅ Data stays local
- ✅ No external API calls
- ✅ Offline capable
- ✅ Full control

### Quality-Assured
- ✅ Automatic validation
- ✅ Safety filters
- ✅ Deduplication
- ✅ Optional critic scoring

---

## 🚀 Next Steps

### After Generation
1. ✅ Review quality: Check sample contexts
2. ✅ Build RAG index: For retrieval
3. ✅ Integrate with service: Use in production
4. ✅ Monitor performance: Track metrics

### Optional Improvements
1. ⏳ Fine-tune model: Use conversations.jsonl
2. ⏳ Add more filters: Custom validation rules
3. ⏳ Collect feedback: From real usage
4. ⏳ Iterate: Generate more contexts

---

## 📚 Related Documentation

- **Complete Guide**: `CRUSH_DATA_GENERATION_GUIDE.md`
- **System Summary**: `CRUSH_DATA_SYSTEM_COMPLETE.md`
- **Quick Start**: `START_HERE_CRUSH_DATA.md`

---

**Tóm tắt**: Với Ollama + vistral, bạn có thể sinh 250 contexts chất lượng cao trong 30-45 phút, hoàn toàn miễn phí, chạy trên máy yếu! 🎉

**Command**:
```bash
python scripts/data-processing/generate_crush_dataset.py --n 250 --batch 20 --model vistral:latest
```

Done! 🚀
