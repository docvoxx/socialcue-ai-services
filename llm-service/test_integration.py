#!/usr/bin/env python3
"""
Test PhoGPT LLM Service integration with Ranker.

This script demonstrates the complete pipeline:
1. Generate 5 candidates with PhoGPT
2. Rank with trained ranker model
3. Return top-3 best replies
"""

import requests
from sentence_transformers import SentenceTransformer, util

# Configuration
LLM_URL = "http://localhost:7860"  # Change to your HF Space URL
RANKER_MODEL_PATH = "../models/ranker_pairwise"

# Load ranker model
print("Loading ranker model...")
ranker = SentenceTransformer(RANKER_MODEL_PATH)
print("✅ Ranker loaded")


def generate_candidates(history: str, n_candidates: int = 5):
    """Generate reply candidates using PhoGPT."""
    print(f"\n🤖 Generating {n_candidates} candidates...")
    
    response = requests.post(
        f"{LLM_URL}/v1/llm/generate",
        json={
            "history": history,
            "n_candidates": n_candidates,
            "max_tokens": 150,
            "temperature": 0.8
        },
        timeout=60
    )
    
    if response.status_code != 200:
        raise Exception(f"LLM API error: {response.status_code} - {response.text}")
    
    data = response.json()
    candidates = [c["text"] for c in data["candidates"]]
    
    print(f"✅ Generated {len(candidates)} candidates")
    for i, c in enumerate(candidates, 1):
        print(f"   {i}. {c}")
    
    return candidates


def rank_replies(history: str, candidates: list):
    """Rank candidates using trained ranker model."""
    print(f"\n📊 Ranking {len(candidates)} candidates...")
    
    # Encode history and candidates
    history_emb = ranker.encode(history, convert_to_tensor=True)
    candidate_embs = ranker.encode(candidates, convert_to_tensor=True)
    
    # Compute similarity scores
    scores = util.cos_sim(history_emb, candidate_embs)[0]
    
    # Sort by score (descending)
    ranked = sorted(
        zip(candidates, scores.cpu().numpy()),
        key=lambda x: x[1],
        reverse=True
    )
    
    print(f"✅ Ranked candidates")
    for i, (reply, score) in enumerate(ranked, 1):
        print(f"   {i}. [{score:.3f}] {reply}")
    
    return ranked


def get_top3_replies(history: str):
    """Complete pipeline: Generate + Rank + Top-3."""
    print("="*80)
    print("🚀 SocialCue Complete Pipeline")
    print("="*80)
    print(f"\n📝 Input:\n{history}")
    
    # Step 1: Generate candidates
    candidates = generate_candidates(history, n_candidates=5)
    
    # Step 2: Rank candidates
    ranked = rank_replies(history, candidates)
    
    # Step 3: Return top-3
    top3 = ranked[:3]
    
    print("\n" + "="*80)
    print("🎯 Top-3 Replies:")
    print("="*80)
    for i, (reply, score) in enumerate(top3, 1):
        print(f"\n{i}. {reply}")
        print(f"   Score: {score:.3f}")
    
    return top3


# Test cases
test_cases = [
    {
        "name": "Crush mệt",
        "history": "Crush: Hôm nay mình hơi mệt\nUser: Vậy à"
    },
    {
        "name": "Crush muốn đổi không khí",
        "history": "Crush: Mình muốn đổi không khí tí\nUser: Nghe kể thú vị ghê"
    },
    {
        "name": "Crush buồn",
        "history": "Crush: Hôm nay mình buồn quá\nUser: Sao vậy?"
    }
]


def main():
    """Run test cases."""
    print("\n" + "="*80)
    print("🧪 Testing PhoGPT + Ranker Integration")
    print("="*80)
    
    # Test health
    print("\n1️⃣ Testing LLM service health...")
    try:
        response = requests.get(f"{LLM_URL}/health", timeout=10)
        if response.status_code == 200:
            print("✅ LLM service is healthy")
            print(f"   {response.json()}")
        else:
            print(f"❌ LLM service error: {response.status_code}")
            return
    except Exception as e:
        print(f"❌ Cannot connect to LLM service: {e}")
        print(f"   Make sure service is running at {LLM_URL}")
        return
    
    # Run test cases
    print("\n2️⃣ Running test cases...")
    
    for i, test in enumerate(test_cases, 1):
        print(f"\n{'='*80}")
        print(f"Test Case {i}: {test['name']}")
        print(f"{'='*80}")
        
        try:
            top3 = get_top3_replies(test["history"])
            print(f"\n✅ Test case {i} passed")
        except Exception as e:
            print(f"\n❌ Test case {i} failed: {e}")
            import traceback
            traceback.print_exc()
    
    print("\n" + "="*80)
    print("✅ All tests completed!")
    print("="*80)


if __name__ == "__main__":
    main()
