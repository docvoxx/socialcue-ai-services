# 🎯 Hướng Dẫn Sinh Data Crush Context - Tài Nguyên Hạn Chế

## 📋 Tổng Quan

Hướng dẫn này giúp bạn sinh **200-300 context crush chất lượng cao** cho RAG + Ranking + Dynamic Generation mà **KHÔNG cần GPU, không fine-tune nặng**.

---

## 🧠 Tư Duy Đúng

### ❌ Sai Lầm Thường Gặp
- Tạo thật nhiều câu (1000+)
- Generate random không có chiến lược
- Không filter chất lượng
- Lưu static quá nhiều

### ✅ Approach Đúng
- Tạo **chiến thuật + biến thể**
- Generate có phân bố rõ ràng
- Filter kỹ càng
- Lưu 250 context tốt nhất + 50 skill cards
- Runtime: RAG lấy tactic → LLM sinh mới

---

## 🔧 Bước 1: Khung Biến Thiên

### Configuration File
**File**: `data/config/generation_config.json`

```json
{
  "variation_framework": {
    "stages": [
      "mở đầu",           // 5 loại
      "đang nói chuyện",
      "rủ hẹn",
      "cứu vãn",
      "sau buổi hẹn"
    ],
    "directness_levels": [
      "low",              // 3 mức độ
      "medium",
      "high"
    ],
    "moods": [
      "cute",             // 5 mood
      "playful",
      "mature",
      "confident",
      "shy"
    ],
    "emoji_density": [0, 1, 2]  // 3 mức độ
  }
}
```

### Tổ Hợp
```
5 stages × 5 moods × 3 directness = 75 kiểu khác nhau
Mỗi kiểu generate 3-4 context = 225-300 contexts
```

**Không cần 1000 contexts!**

---

## 🚀 Bước 2: Generate Data

### Script
**File**: `scripts/data-generation/generate_crush_contexts.py`

### Chạy Generation
```bash
cd socialcue-ai-services

# Set OpenAI API key
export OPENAI_API_KEY="your-key-here"

# Install dependencies
pip install openai sentence-transformers scikit-learn

# Run generator
python scripts/data-generation/generate_crush_contexts.py
```

### Output
```
data/raw/crush_contexts.json
```

### Generation Strategy
- **Batch size**: 20 contexts/lần
- **Total batches**: 15 lần
- **Total generated**: ~300 contexts
- **After filtering**: ~250 quality contexts

### Prompt Strategy
Script tự động generate với phân bố:
- 7 low directness
- 7 medium directness
- 6 high directness

Per batch:
- 4 mở đầu
- 5 đang nói chuyện
- 4 rủ hẹn
- 3 cứu vãn
- 4 sau buổi hẹn

---

## 🧹 Bước 3: Filter Data

### Automatic Filtering

Script tự động filter theo:

#### 1. Duplicate Removal
```python
# Cosine similarity > 0.92 → xóa
similarity_threshold: 0.92
```

#### 2. Quality Scoring
```python
# LLM tự chấm điểm
min_naturalness_score: 7    # Tự nhiên >= 7/10
max_pressure_score: 6       # Áp lực <= 6/10
min_ease_of_reply: 7        # Dễ trả lời >= 7/10
```

#### 3. Structure Validation
- Max 25 words per message
- Must have 3 candidates
- Must have negative_reply
- Must have metadata

### Manual Review (Optional)
```bash
# Review generated contexts
cat data/raw/crush_contexts.json | jq '.[] | {id, stage, mood, gold_reply}'
```

---

## 📊 Bước 4: Data Structure

### Context Format
```json
{
  "id": "ctx_001",
  "stage": "mở đầu",
  "mood": "playful",
  "directness": "low",
  "conversation_history": [
    {"role": "crush", "message": "Hôm nay trời đẹp nhỉ"},
    {"role": "user", "message": "Ừ, mà sao bạn biết tôi thích trời đẹp?"}
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
    "risk_level": "low",
    "has_open_question": false,
    "word_count": 12
  },
  "quality_scores": {
    "naturalness": 8,
    "ease_of_reply": 9,
    "pressure": 2
  }
}
```

### Sample Data
**File**: `data/samples/crush_contexts_sample_30.json`

Contains 30 high-quality example contexts covering all stages and moods.

---

## 🏆 Bước 5: Ranking System

### Script
**File**: `scripts/ranking/rank_replies.py`

### Ranking Algorithm

#### Scoring Components
```python
weights = {
    "context_match": 0.30,      # Semantic similarity
    "mood_alignment": 0.25,     # Mood indicators
    "directness_fit": 0.20,     # Directness level
    "conversation_flow": 0.15,  # Natural continuation
    "risk_level": 0.10          # Safety/appropriateness
}
```

#### Usage
```python
from scripts.ranking.rank_replies import ReplyRanker

ranker = ReplyRanker()

context = {
    "stage": "đang nói chuyện",
    "mood": "playful",
    "directness": "medium",
    "conversation_history": [...]
}

candidates = [
    "Vậy hả? Vậy lần sau mình đi ăn cùng nhé",
    "Thế à? Hay đấy",
    "Ồ, thế chắc mình hợp nhau rồi"
]

# Get top 3 ranked replies
top_3 = ranker.get_top_3(candidates, context)

for item in top_3:
    print(f"#{item['rank']}: {item['reply']}")
    print(f"Score: {item['score']}")
    print(f"Explanation: {item['explanation']}")
```

#### Output Example
```
🏆 Top 3 Ranked Replies:

#1: Vậy hả? Vậy lần sau mình đi ăn cùng nhé
   Score: 0.847
   Điểm mạnh: context match, mood alignment, conversation flow
   Breakdown: {
     "context_match": 0.85,
     "mood_alignment": 0.90,
     "directness_fit": 0.75,
     "conversation_flow": 0.95,
     "risk_level": 0.80
   }

#2: Ồ, thế chắc mình hợp nhau rồi
   Score: 0.792
   Điểm mạnh: mood alignment, risk level
   ...
```

---

## 🔍 Bước 6: RAG Integration

### Architecture

```
User Input
    ↓
RAG Search (retrieve top 5 similar contexts)
    ↓
Extract Tactics + Patterns
    ↓
LLM Generate New Reply (based on tactics)
    ↓
Rank Candidates
    ↓
Return Top 3
```

### RAG Setup

#### 1. Build Vector Index
```python
from sentence_transformers import SentenceTransformer
import chromadb

# Load contexts
with open('data/raw/crush_contexts.json', 'r') as f:
    contexts = json.load(f)

# Initialize
model = SentenceTransformer('keepitreal/vietnamese-sbert')
client = chromadb.Client()
collection = client.create_collection("crush_contexts")

# Index contexts
for ctx in contexts:
    # Create searchable text
    text = f"{ctx['stage']} {ctx['mood']} {ctx['directness']} "
    text += " ".join([msg['message'] for msg in ctx['conversation_history']])
    text += f" {ctx['gold_reply']}"
    
    # Generate embedding
    embedding = model.encode(text)
    
    # Add to collection
    collection.add(
        ids=[ctx['id']],
        embeddings=[embedding.tolist()],
        documents=[text],
        metadatas=[{
            "stage": ctx['stage'],
            "mood": ctx['mood'],
            "directness": ctx['directness']
        }]
    )
```

#### 2. Query RAG
```python
def get_similar_contexts(query, stage, mood, directness, top_k=5):
    """Retrieve similar contexts from RAG"""
    # Generate query embedding
    query_embedding = model.encode(query)
    
    # Search with filters
    results = collection.query(
        query_embeddings=[query_embedding.tolist()],
        n_results=top_k,
        where={
            "$and": [
                {"stage": stage},
                {"mood": mood},
                {"directness": directness}
            ]
        }
    )
    
    return results
```

#### 3. Generate Dynamic Reply
```python
def generate_reply(user_input, conversation_history, stage, mood, directness):
    """Generate reply using RAG + LLM"""
    # 1. Retrieve similar contexts
    similar = get_similar_contexts(
        query=user_input,
        stage=stage,
        mood=mood,
        directness=directness,
        top_k=5
    )
    
    # 2. Extract tactics
    tactics = []
    for ctx_id in similar['ids'][0]:
        ctx = get_context_by_id(ctx_id)
        tactics.append({
            "gold_reply": ctx['gold_reply'],
            "candidates": ctx['candidates']
        })
    
    # 3. Generate new reply with LLM
    prompt = f"""Dựa vào các chiến thuật sau:
{json.dumps(tactics, ensure_ascii=False, indent=2)}

Tạo 3 câu trả lời cho tình huống:
Stage: {stage}
Mood: {mood}
Directness: {directness}

Conversation:
{json.dumps(conversation_history, ensure_ascii=False, indent=2)}

User input: {user_input}

Trả JSON array với 3 câu trả lời tự nhiên, không lặp tactics."""
    
    response = llm.generate(prompt)
    candidates = json.loads(response)
    
    # 4. Rank candidates
    context = {
        "stage": stage,
        "mood": mood,
        "directness": directness,
        "conversation_history": conversation_history
    }
    
    top_3 = ranker.get_top_3(candidates, context)
    
    return top_3
```

---

## 💡 Mẹo Tăng Chất Lượng

### 1. Generate Chậm → Chất Lượng Hơn
```python
# Mỗi batch đợi 2-3 giây
import time
time.sleep(2)
```

### 2. Ép Diversity
```python
# Mỗi batch phải có phân bố rõ ràng
batch_config = {
    "directness": {"low": 7, "medium": 7, "high": 6},
    "stages": {...}
}
```

### 3. Luôn Có Negative Reply
```python
# Để model học được gì KHÔNG nên làm
"negative_reply": "Tại tôi theo dõi bạn từ lâu rồi"
```

### 4. Sample Quality Check
```python
# Chỉ score sample 100 contexts để tiết kiệm API calls
sample_size = min(len(contexts), 100)
sample = random.sample(contexts, sample_size)
quality_filtered = filter_by_quality(sample)
pass_rate = len(quality_filtered) / len(sample)
```

---

## 📈 Workflow Hoàn Chỉnh

### Step 1: Generate
```bash
python scripts/data-generation/generate_crush_contexts.py
# Output: data/raw/crush_contexts.json (~300 contexts)
```

### Step 2: Review Sample
```bash
# Check quality
head -n 100 data/raw/crush_contexts.json | jq '.'
```

### Step 3: Build RAG Index
```bash
python scripts/rag/build_index.py
# Output: data/processed/rag/crush_contexts.index
```

### Step 4: Test Ranking
```bash
python scripts/ranking/rank_replies.py
# Test with sample contexts
```

### Step 5: Integrate with Service
```typescript
// In sentiment-service or new crush-service
import { RAGManager } from './services/RAGManager';
import { ReplyRanker } from './services/ReplyRanker';

const rag = new RAGManager();
const ranker = new ReplyRanker();

async function getSuggestions(input, history, stage, mood, directness) {
  // 1. RAG retrieval
  const similar = await rag.query(input, stage, mood, directness);
  
  // 2. Generate candidates
  const candidates = await llm.generate(similar, input, history);
  
  // 3. Rank
  const top3 = ranker.rank(candidates, {stage, mood, directness, history});
  
  return top3;
}
```

---

## 🎯 Tóm Tắt

### Với Tài Nguyên Hạn Chế

✅ **Sinh**: 20-30 contexts/lần × 15 lần = 300 contexts
✅ **Lọc**: Duplicate + Quality → 250 contexts tốt nhất
✅ **Lưu**: 250 contexts + 50 skill cards
✅ **Runtime**: RAG + Dynamic Generation

### Không Cần
❌ Fine-tune model (quá nặng)
❌ 1000+ contexts (không cần thiết)
❌ GPU training (chỉ dùng embedding)
❌ Static responses (dùng dynamic)

### Kết Quả
- 250 high-quality contexts
- RAG-based retrieval
- Dynamic generation
- Top 3 ranking
- Scalable architecture

---

## 📁 File Structure

```
socialcue-ai-services/
├── data/
│   ├── config/
│   │   └── generation_config.json          # Generation config
│   ├── raw/
│   │   └── crush_contexts.json             # Generated contexts
│   ├── processed/
│   │   └── rag/
│   │       └── crush_contexts.index        # RAG index
│   └── samples/
│       └── crush_contexts_sample_30.json   # Sample contexts
├── scripts/
│   ├── data-generation/
│   │   └── generate_crush_contexts.py      # Generator script
│   ├── ranking/
│   │   └── rank_replies.py                 # Ranking script
│   └── rag/
│       └── build_index.py                  # RAG indexing
└── CRUSH_DATA_GENERATION_GUIDE.md          # This file
```

---

## 🚀 Next Steps

1. **Generate Data**: Run generation script
2. **Review Quality**: Check sample contexts
3. **Build RAG**: Create vector index
4. **Test Ranking**: Verify ranking logic
5. **Integrate**: Add to service

---

**Tóm tắt**: Với approach này, bạn có thể tạo 250 contexts chất lượng cao mà không cần GPU hay fine-tuning nặng. Chỉ cần OpenAI API + embedding model + smart filtering! 🎉
