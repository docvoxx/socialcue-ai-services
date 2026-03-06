#!/usr/bin/env python3
"""
Example: How to use the trained ranker model with Qwen/LLM.

This shows the complete workflow:
1. Qwen generates multiple reply candidates
2. Ranker scores and ranks them
3. Return top-3 to user
"""

from sentence_transformers import SentenceTransformer, util
from typing import List, Dict, Tuple


class CrushReplyRanker:
    """Trained ranking model for crush replies."""
    
    def __init__(self, model_path: str = "../../models/ranker_pairwise"):
        """Load trained model."""
        print(f"📂 Loading ranker from: {model_path}")
        self.model = SentenceTransformer(model_path)
        print("✅ Ranker loaded!")
    
    def rank_replies(self, 
                     history: List[Dict[str, str]], 
                     candidates: List[str]) -> List[Tuple[str, float]]:
        """
        Rank reply candidates for conversation history.
        
        Args:
            history: [{"role": "user", "text": "..."}, {"role": "crush", "text": "..."}]
            candidates: ["Reply 1", "Reply 2", "Reply 3", ...]
        
        Returns:
            [(reply, score), ...] sorted by score (highest first)
        """
        # Format history as text
        history_text = " ".join([f"{msg['role']}: {msg['text']}" for msg in history])
        
        # Encode history and candidates
        history_emb = self.model.encode(history_text, convert_to_tensor=True)
        candidate_embs = self.model.encode(candidates, convert_to_tensor=True)
        
        # Compute similarity scores
        scores = util.cos_sim(history_emb, candidate_embs)[0]
        
        # Sort by score (descending)
        ranked = sorted(
            zip(candidates, scores.cpu().numpy()), 
            key=lambda x: x[1], 
            reverse=True
        )
        
        return ranked


# ============================================================================
# EXAMPLE 1: Standalone Ranker (with mock Qwen)
# ============================================================================

def mock_qwen_generate(history: List[Dict], n: int = 5) -> List[str]:
    """
    Mock Qwen LLM - generates reply candidates.
    
    In production, replace this with actual Qwen API call.
    """
    # Simulate Qwen generating 5 different replies
    candidates = [
        "Bạn thích chỗ yên tĩnh hay náo nhiệt? 😊",
        "Mình biết chỗ cà phê view đẹp, bạn có muốn đi không?",
        "Ok vậy chốt luôn nha!",
        "Bạn rảnh thứ Bảy không? Mình rủ bạn đi chill 🎧",
        "Cuối tuần bạn hay làm gì? 🐱"
    ]
    return candidates[:n]


def example_standalone():
    """Example: Use ranker standalone."""
    print("\n" + "="*80)
    print("📝 EXAMPLE 1: Standalone Ranker")
    print("="*80)
    
    # 1. Load ranker
    ranker = CrushReplyRanker(model_path="../../models/ranker_pairwise")
    
    # 2. Conversation history
    history = [
        {"role": "crush", "text": "Mình muốn đổi không khí tí"},
        {"role": "user", "text": "Nghe kể thú vị ghê"},
        {"role": "crush", "text": "Haha vậy hả"}
    ]
    
    # 3. Generate candidates (mock Qwen)
    print("\n🤖 Qwen generates 5 candidates...")
    candidates = mock_qwen_generate(history, n=5)
    for i, c in enumerate(candidates, 1):
        print(f"   {i}. {c}")
    
    # 4. Rank candidates
    print("\n🎯 Ranker scores and ranks...")
    ranked = ranker.rank_replies(history, candidates)
    
    # 5. Show top-3
    print("\n✨ Top-3 Best Replies:")
    for i, (reply, score) in enumerate(ranked[:3], 1):
        print(f"   {i}. [{score:.3f}] {reply}")
    
    return ranked[:3]


# ============================================================================
# EXAMPLE 2: Integration with Qwen API
# ============================================================================

def qwen_api_generate(history: List[Dict], n: int = 5) -> List[str]:
    """
    Call Qwen API to generate reply candidates.
    
    Replace with your actual Qwen API integration.
    """
    # TODO: Replace with actual Qwen API call
    # Example:
    # response = qwen_client.chat.completions.create(
    #     model="qwen-turbo",
    #     messages=history,
    #     n=n,  # Generate n candidates
    #     temperature=0.8
    # )
    # return [choice.message.content for choice in response.choices]
    
    # For now, use mock
    return mock_qwen_generate(history, n)


def example_with_qwen_api():
    """Example: Full pipeline with Qwen API."""
    print("\n" + "="*80)
    print("📝 EXAMPLE 2: Full Pipeline (Qwen + Ranker)")
    print("="*80)
    
    # 1. Load ranker
    ranker = CrushReplyRanker(model_path="../../models/ranker_pairwise")
    
    # 2. User conversation
    history = [
        {"role": "crush", "text": "Hôm nay mình bận quá, chạy deadline muốn xỉu"},
        {"role": "user", "text": "Nghe căng thật"}
    ]
    
    print("\n💬 Conversation:")
    for msg in history:
        print(f"   {msg['role']}: {msg['text']}")
    
    # 3. Qwen generates candidates
    print("\n🤖 Calling Qwen API to generate 5 candidates...")
    candidates = qwen_api_generate(history, n=5)
    for i, c in enumerate(candidates, 1):
        print(f"   {i}. {c}")
    
    # 4. Ranker selects top-3
    print("\n🎯 Ranker selects top-3...")
    top3 = ranker.rank_replies(history, candidates)[:3]
    
    # 5. Return to user
    print("\n✨ Showing to user:")
    for i, (reply, score) in enumerate(top3, 1):
        print(f"   {i}. {reply}")
        print(f"      (confidence: {score:.1%})")
    
    return top3


# ============================================================================
# EXAMPLE 3: API Endpoint Integration
# ============================================================================

def example_api_endpoint():
    """Example: How to integrate into FastAPI/Express endpoint."""
    print("\n" + "="*80)
    print("📝 EXAMPLE 3: API Endpoint Integration")
    print("="*80)
    
    code = '''
# FastAPI Example
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

# Load ranker once at startup
ranker = CrushReplyRanker(model_path="models/ranker_pairwise")

class GenerateRequest(BaseModel):
    history: List[Dict[str, str]]
    n_candidates: int = 5

@app.post("/v1/llm/generate-with-ranking")
async def generate_with_ranking(request: GenerateRequest):
    # 1. Generate candidates with Qwen
    candidates = await qwen_api_generate(
        history=request.history,
        n=request.n_candidates
    )
    
    # 2. Rank with trained model
    ranked = ranker.rank_replies(request.history, candidates)
    
    # 3. Return top-3
    return {
        "top3": [
            {
                "text": reply,
                "score": float(score),
                "rank": i + 1
            }
            for i, (reply, score) in enumerate(ranked[:3])
        ],
        "all_candidates": [
            {"text": reply, "score": float(score)}
            for reply, score in ranked
        ]
    }

# Usage:
# POST /v1/llm/generate-with-ranking
# {
#   "history": [
#     {"role": "crush", "text": "Mình muốn đổi không khí tí"},
#     {"role": "user", "text": "Nghe kể thú vị ghê"}
#   ],
#   "n_candidates": 5
# }
'''
    print(code)


# ============================================================================
# EXAMPLE 4: Batch Processing
# ============================================================================

def example_batch_processing():
    """Example: Process multiple conversations in batch."""
    print("\n" + "="*80)
    print("📝 EXAMPLE 4: Batch Processing")
    print("="*80)
    
    ranker = CrushReplyRanker(model_path="../../models/ranker_pairwise")
    
    # Multiple conversations
    conversations = [
        {
            "id": "conv_1",
            "history": [
                {"role": "crush", "text": "Mình muốn đổi không khí tí"},
                {"role": "user", "text": "Nghe kể thú vị ghê"}
            ],
            "candidates": [
                "Bạn thích chỗ yên tĩnh hay náo nhiệt?",
                "Ok chốt luôn nha!",
                "Mình biết chỗ cà phê view đẹp"
            ]
        },
        {
            "id": "conv_2",
            "history": [
                {"role": "crush", "text": "Hôm nay mình bận quá"},
                {"role": "user", "text": "Nghe căng thật"}
            ],
            "candidates": [
                "Bạn kể thêm chút được không?",
                "Đừng im lặng nữa",
                "Cuối tuần bạn hay làm gì?"
            ]
        }
    ]
    
    # Process batch
    results = []
    for conv in conversations:
        ranked = ranker.rank_replies(conv["history"], conv["candidates"])
        results.append({
            "id": conv["id"],
            "top3": ranked[:3]
        })
    
    # Show results
    for result in results:
        print(f"\n📊 {result['id']}:")
        for i, (reply, score) in enumerate(result['top3'], 1):
            print(f"   {i}. [{score:.3f}] {reply}")
    
    return results


# ============================================================================
# Main
# ============================================================================

if __name__ == "__main__":
    print("🎯 Crush Reply Ranker - Usage Examples")
    print("="*80)
    
    # Run examples
    example_standalone()
    example_with_qwen_api()
    example_api_endpoint()
    example_batch_processing()
    
    print("\n" + "="*80)
    print("✅ All examples completed!")
    print("\n💡 Next steps:")
    print("   1. Replace mock_qwen_generate() with actual Qwen API")
    print("   2. Integrate into your LLM service")
    print("   3. Deploy to production")
    print("="*80)
