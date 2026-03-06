#!/usr/bin/env python3
"""
Benchmark different ranking approaches on crush reply data.

Compares:
- Rule-based (factor scores)
- Embedding similarity (zero-shot)
- Pairwise trained model
- Triplet trained model

Usage:
    python benchmark_rankers.py --data data/processed/llm/ranking_labels_1000.jsonl
"""

import json
import argparse
from pathlib import Path
from typing import List, Dict, Tuple
import numpy as np
from collections import defaultdict

try:
    from sentence_transformers import SentenceTransformer, util
    import torch
    TRANSFORMERS_AVAILABLE = True
except ImportError:
    TRANSFORMERS_AVAILABLE = False


class RuleBasedRanker:
    """Baseline ranker using factor scores."""
    
    def rank_candidates(self, candidates: List[Dict]) -> List[str]:
        """Rank by total score."""
        sorted_candidates = sorted(candidates, key=lambda x: x['total'], reverse=True)
        return [c['text'] for c in sorted_candidates]


class EmbeddingRanker:
    """Zero-shot ranker using sentence embeddings."""
    
    def __init__(self, model_name: str = "sentence-transformers/all-MiniLM-L6-v2"):
        if not TRANSFORMERS_AVAILABLE:
            raise ImportError("sentence-transformers required")
        self.model = SentenceTransformer(model_name)
    
    def _format_history(self, history: List[Dict[str, str]]) -> str:
        return " ".join([f"{msg['role']}: {msg['text']}" for msg in history])
    
    def rank_candidates(self, history: List[Dict], candidates: List[str]) -> List[str]:
        """Rank by embedding similarity."""
        history_text = self._format_history(history)
        
        # Encode
        history_emb = self.model.encode(history_text, convert_to_tensor=True)
        candidate_embs = self.model.encode(candidates, convert_to_tensor=True)
        
        # Compute similarity
        scores = util.cos_sim(history_emb, candidate_embs)[0]
        
        # Sort
        ranked_indices = torch.argsort(scores, descending=True).cpu().numpy()
        return [candidates[i] for i in ranked_indices]


def evaluate_ranker(ranker, test_data: List[Dict], ranker_name: str) -> Dict[str, float]:
    """Evaluate a ranker on test data."""
    metrics = {
        'top1_accuracy': 0.0,
        'top3_accuracy': 0.0,
        'mrr': 0.0,
        'precision@3': 0.0,
        'recall@3': 0.0
    }
    
    stage_metrics = defaultdict(lambda: {'correct': 0, 'total': 0})
    
    for item in test_data:
        # Get predictions
        if isinstance(ranker, RuleBasedRanker):
            predicted = ranker.rank_candidates(item['candidates_scored'])
        else:
            candidates_text = [c['text'] for c in item['candidates_scored']]
            predicted = ranker.rank_candidates(item['history'], candidates_text)
        
        predicted_top3 = predicted[:3]
        
        # Ground truth
        gold_top1 = item['top3'][0]
        gold_top3 = set(item['top3'][:3])
        
        # Top-1 accuracy
        if predicted_top3[0] == gold_top1:
            metrics['top1_accuracy'] += 1
            stage_metrics[item['stage']]['correct'] += 1
        stage_metrics[item['stage']]['total'] += 1
        
        # Top-3 accuracy
        if any(pred in gold_top3 for pred in predicted_top3):
            metrics['top3_accuracy'] += 1
        
        # MRR
        for i, pred in enumerate(predicted_top3):
            if pred == gold_top1:
                metrics['mrr'] += 1.0 / (i + 1)
                break
        
        # Precision@3 and Recall@3
        predicted_set = set(predicted_top3)
        intersection = predicted_set & gold_top3
        
        if len(predicted_set) > 0:
            metrics['precision@3'] += len(intersection) / len(predicted_set)
        if len(gold_top3) > 0:
            metrics['recall@3'] += len(intersection) / len(gold_top3)
    
    # Average
    n = len(test_data)
    metrics = {k: v / n for k, v in metrics.items()}
    
    # Stage breakdown
    stage_acc = {stage: stats['correct'] / stats['total'] 
                 for stage, stats in stage_metrics.items()}
    
    return metrics, stage_acc


def print_results(results: Dict[str, Tuple[Dict, Dict]]):
    """Pretty print benchmark results."""
    print("\n" + "="*80)
    print("📊 RANKING BENCHMARK RESULTS")
    print("="*80)
    
    # Overall metrics table
    print("\n🎯 Overall Metrics:")
    print("-" * 80)
    print(f"{'Ranker':<25} {'Top-1 Acc':<12} {'Top-3 Acc':<12} {'MRR':<10} {'P@3':<10} {'R@3':<10}")
    print("-" * 80)
    
    for ranker_name, (metrics, _) in results.items():
        print(f"{ranker_name:<25} "
              f"{metrics['top1_accuracy']:<12.2%} "
              f"{metrics['top3_accuracy']:<12.2%} "
              f"{metrics['mrr']:<10.3f} "
              f"{metrics['precision@3']:<10.3f} "
              f"{metrics['recall@3']:<10.3f}")
    
    print("-" * 80)
    
    # Stage breakdown
    print("\n📈 Top-1 Accuracy by Stage:")
    print("-" * 80)
    
    # Get all stages
    all_stages = set()
    for _, (_, stage_acc) in results.items():
        all_stages.update(stage_acc.keys())
    
    # Header
    print(f"{'Stage':<20}", end="")
    for ranker_name in results.keys():
        print(f"{ranker_name:<20}", end="")
    print()
    print("-" * 80)
    
    # Rows
    for stage in sorted(all_stages):
        print(f"{stage:<20}", end="")
        for ranker_name, (_, stage_acc) in results.items():
            acc = stage_acc.get(stage, 0.0)
            print(f"{acc:<20.2%}", end="")
        print()
    
    print("-" * 80)
    
    # Best ranker
    best_ranker = max(results.items(), key=lambda x: x[1][0]['top1_accuracy'])
    print(f"\n🏆 Best Ranker: {best_ranker[0]}")
    print(f"   Top-1 Accuracy: {best_ranker[1][0]['top1_accuracy']:.2%}")
    print(f"   Top-3 Accuracy: {best_ranker[1][0]['top3_accuracy']:.2%}")


def main():
    parser = argparse.ArgumentParser(description="Benchmark ranking approaches")
    parser.add_argument('--data', type=str,
                       default='data/processed/llm/ranking_labels_1000.jsonl',
                       help='Path to ranking labels')
    parser.add_argument('--sample', type=int, default=None,
                       help='Sample N examples for quick test')
    parser.add_argument('--models', type=str, nargs='+',
                       default=['models/ranker_pairwise', 'models/ranker_triplet'],
                       help='Paths to trained models')
    
    args = parser.parse_args()
    
    # Load data
    print(f"📥 Loading data from: {args.data}")
    data = []
    with open(args.data, 'r', encoding='utf-8') as f:
        for line in f:
            data.append(json.loads(line))
    
    if args.sample:
        data = data[:args.sample]
    
    print(f"   Loaded {len(data)} examples")
    
    # Initialize rankers
    rankers = {}
    
    # 1. Rule-based (baseline)
    print("\n🔧 Initializing rankers...")
    rankers['Rule-Based'] = RuleBasedRanker()
    print("   ✅ Rule-Based")
    
    # 2. Zero-shot embedding
    if TRANSFORMERS_AVAILABLE:
        try:
            rankers['Embedding (Zero-Shot)'] = EmbeddingRanker()
            print("   ✅ Embedding (Zero-Shot)")
        except Exception as e:
            print(f"   ⚠️  Embedding ranker failed: {e}")
    
    # 3. Trained models
    if TRANSFORMERS_AVAILABLE:
        for model_path in args.models:
            if Path(model_path).exists():
                try:
                    model_name = Path(model_path).name
                    rankers[f'Trained ({model_name})'] = EmbeddingRanker(model_path)
                    print(f"   ✅ Trained ({model_name})")
                except Exception as e:
                    print(f"   ⚠️  Failed to load {model_path}: {e}")
    
    # Benchmark
    results = {}
    for ranker_name, ranker in rankers.items():
        print(f"\n🔄 Evaluating: {ranker_name}")
        metrics, stage_acc = evaluate_ranker(ranker, data, ranker_name)
        results[ranker_name] = (metrics, stage_acc)
    
    # Print results
    print_results(results)
    
    # Save results
    output_path = Path('results/benchmark_results.json')
    output_path.parent.mkdir(exist_ok=True)
    
    # Convert to serializable format
    serializable_results = {
        name: {
            'metrics': metrics,
            'stage_accuracy': stage_acc
        }
        for name, (metrics, stage_acc) in results.items()
    }
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(serializable_results, f, indent=2, ensure_ascii=False)
    
    print(f"\n💾 Results saved to: {output_path}")


if __name__ == '__main__':
    main()
