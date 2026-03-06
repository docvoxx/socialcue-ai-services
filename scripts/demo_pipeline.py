#!/usr/bin/env python3
"""
SocialCue MVP Pipeline Demo
End-to-end: RAG → PhoGPT → Sentiment → Ranker → Top 3

Usage:
    python demo_pipeline.py --msg "Crush: Hôm nay mình hơi mệt\nUser: Vậy à"
    python demo_pipeline.py --msg "Crush: Cuối tuần có hội chợ đó\nUser: Ồ, nghe hay đó"
"""

import argparse
import json
import time
from pathlib import Path
import sys

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "socialcue-space"))

from utils.rag import retrieve_contexts
from utils.generator import generate_candidates
from utils.ranker import rank_replies


def load_sentiment_filter():
    """Load sentiment dataset for filtering (optional)"""
    sentiment_path = Path(__file__).parent.parent / "data/processed/llm/sentiment_crush_dataset_500.jsonl"
    
    if not sentiment_path.exists():
        print("⚠️ Sentiment dataset not found, skipping sentiment filter")
        return None
    
    # Load sentiment patterns
    patterns = {
        "high_pressure": ["gặp ngay", "qua liền", "trả lời đi", "đừng im"],
        "too_forward": ["nhớ em", "yêu em", "thích em"],
        "generic_compliment": ["xinh quá", "đẹp quá", "cute quá"]
    }
    
    return patterns


def sentiment_filter(candidates, patterns=None):
    """
    Filter candidates by sentiment/appropriateness
    
    Args:
        candidates: List of candidate dicts
        patterns: Dict of bad patterns to filter
        
    Returns:
        Filtered candidates with scores
    """
    if not patterns:
        # No filtering, just pass through with default scores
        return [{"text": c["text"], "tone": c.get("tone", "playful"), "sentiment_score": 1.0} 
                for c in candidates]
    
    filtered = []
    for candidate in candidates:
        text = candidate["text"].lower()
        score = 1.0
        
        # Check for bad patterns
        for pattern_type, pattern_list in patterns.items():
            for pattern in pattern_list:
                if pattern in text:
                    if pattern_type == "high_pressure":
                        score -= 0.5
                    elif pattern_type == "too_forward":
                        score -= 0.7
                    elif pattern_type == "generic_compliment":
                        score -= 0.3
        
        # Only keep candidates with positive score
        if score > 0.3:
            filtered.append({
                "text": candidate["text"],
                "tone": candidate.get("tone", "playful"),
                "sentiment_score": score
            })
    
    return filtered


def run_pipeline(message: str, n_candidates: int = 6, top_k: int = 3, verbose: bool = True):
    """
    Run complete MVP pipeline
    
    Pipeline:
        1. RAG: Retrieve 3 similar contexts
        2. LLM: Generate 6 candidates with PhoGPT
        3. Sentiment: Filter inappropriate candidates
        4. Ranker: Rank and select Top 3
        
    Args:
        message: User's conversation history
        n_candidates: Number of candidates to generate (default 6)
        top_k: Number of top suggestions to return (default 3)
        verbose: Print detailed logs
        
    Returns:
        Dict with top suggestions and metadata
    """
    start_time = time.time()
    
    if verbose:
        print("=" * 80)
        print("🚀 SocialCue MVP Pipeline")
        print("=" * 80)
        print(f"\n📝 Input message:\n{message}\n")
    
    # Step 1: RAG - Retrieve similar contexts
    if verbose:
        print("🔍 Step 1: RAG Retrieval...")
    
    rag_start = time.time()
    contexts = retrieve_contexts(message, n_results=3)
    rag_time = time.time() - rag_start
    
    if verbose:
        print(f"✅ Retrieved {len(contexts)} contexts ({rag_time:.2f}s)")
        for i, ctx in enumerate(contexts, 1):
            print(f"   {i}. {ctx[:80]}...")
        print()
    
    # Step 2: LLM - Generate candidates
    if verbose:
        print(f"🤖 Step 2: PhoGPT Generation ({n_candidates} candidates)...")
    
    gen_start = time.time()
    candidates = generate_candidates(
        message=message,
        contexts=contexts,
        n_candidates=n_candidates,
        temperature=0.8
    )
    gen_time = time.time() - gen_start
    
    if verbose:
        print(f"✅ Generated {len(candidates)} candidates ({gen_time:.2f}s)")
        for i, cand in enumerate(candidates, 1):
            print(f"   {i}. {cand['text']} [{cand.get('tone', 'N/A')}]")
        print()
    
    # Step 3: Sentiment - Filter inappropriate
    if verbose:
        print("🎭 Step 3: Sentiment Filter...")
    
    sent_start = time.time()
    patterns = load_sentiment_filter()
    filtered = sentiment_filter(candidates, patterns)
    sent_time = time.time() - sent_start
    
    if verbose:
        print(f"✅ Filtered to {len(filtered)} candidates ({sent_time:.2f}s)")
        if len(filtered) < len(candidates):
            print(f"   ⚠️ Removed {len(candidates) - len(filtered)} inappropriate candidates")
        print()
    
    # Step 4: Ranker - Select Top K
    if verbose:
        print(f"🏆 Step 4: Ranking (Top {top_k})...")
    
    rank_start = time.time()
    
    # Extract just text for ranker
    candidate_texts = [c["text"] for c in filtered]
    
    # Rank
    ranked = rank_replies(message, candidate_texts, top_k=top_k)
    rank_time = time.time() - rank_start
    
    # Merge with sentiment scores
    for r in ranked:
        for f in filtered:
            if r["text"] == f["text"]:
                r["tone"] = f.get("tone", "playful")
                r["sentiment_score"] = f.get("sentiment_score", 1.0)
                break
    
    if verbose:
        print(f"✅ Ranked top {len(ranked)} suggestions ({rank_time:.2f}s)")
        print()
    
    # Results
    total_time = time.time() - start_time
    
    if verbose:
        print("=" * 80)
        print("🎯 TOP SUGGESTIONS")
        print("=" * 80)
        for i, sugg in enumerate(ranked, 1):
            print(f"\n{i}. {sugg['text']}")
            print(f"   Score: {sugg['score']:.3f} | Tone: {sugg.get('tone', 'N/A')} | Sentiment: {sugg.get('sentiment_score', 1.0):.2f}")
        
        print("\n" + "=" * 80)
        print("⏱️  PERFORMANCE")
        print("=" * 80)
        print(f"RAG:       {rag_time:.2f}s")
        print(f"Generate:  {gen_time:.2f}s")
        print(f"Sentiment: {sent_time:.2f}s")
        print(f"Rank:      {rank_time:.2f}s")
        print(f"Total:     {total_time:.2f}s")
        print("=" * 80)
    
    return {
        "suggestions": ranked,
        "metadata": {
            "n_candidates": n_candidates,
            "n_filtered": len(filtered),
            "rag_contexts": len(contexts),
            "latency_ms": int(total_time * 1000),
            "breakdown": {
                "rag_ms": int(rag_time * 1000),
                "generate_ms": int(gen_time * 1000),
                "sentiment_ms": int(sent_time * 1000),
                "rank_ms": int(rank_time * 1000)
            }
        }
    }


def main():
    parser = argparse.ArgumentParser(description="SocialCue MVP Pipeline Demo")
    parser.add_argument("--msg", type=str, required=True, help="Conversation message")
    parser.add_argument("--n-candidates", type=int, default=6, help="Number of candidates to generate")
    parser.add_argument("--top-k", type=int, default=3, help="Number of top suggestions")
    parser.add_argument("--quiet", action="store_true", help="Minimal output")
    parser.add_argument("--json", action="store_true", help="Output JSON only")
    
    args = parser.parse_args()
    
    # Run pipeline
    result = run_pipeline(
        message=args.msg,
        n_candidates=args.n_candidates,
        top_k=args.top_k,
        verbose=not args.quiet and not args.json
    )
    
    # JSON output
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
