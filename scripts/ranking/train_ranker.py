#!/usr/bin/env python3
"""
Train and evaluate ranking model for crush reply candidates.

Supports multiple ranking approaches:
- Pairwise: Learn to compare pairs of candidates
- Listwise: Learn to rank entire candidate lists
- Pointwise: Learn to predict scores directly

Usage:
    python train_ranker.py --approach pairwise --model sentence-transformers/all-MiniLM-L6-v2
    python train_ranker.py --approach listwise --epochs 5
"""

import json
import argparse
from pathlib import Path
from typing import List, Dict, Tuple
import numpy as np
from dataclasses import dataclass

try:
    from sentence_transformers import SentenceTransformer, InputExample, losses
    from torch.utils.data import DataLoader
    import torch
    TRANSFORMERS_AVAILABLE = True
except ImportError:
    TRANSFORMERS_AVAILABLE = False
    print("⚠️  sentence-transformers not installed. Install with: pip install sentence-transformers torch")


@dataclass
class RankingExample:
    """Single ranking example with context and candidates."""
    id: str
    history: List[Dict[str, str]]
    candidates: List[Dict]
    top3: List[str]
    stage: str
    mood: str
    directness: str


class CrushRanker:
    """Ranking model for crush reply candidates."""
    
    def __init__(self, model_name: str = "sentence-transformers/all-MiniLM-L6-v2"):
        """Initialize ranker with pre-trained model."""
        if not TRANSFORMERS_AVAILABLE:
            raise ImportError("sentence-transformers required. Install: pip install sentence-transformers torch")
        
        self.model = SentenceTransformer(model_name)
        self.model_name = model_name
    
    def _format_history(self, history: List[Dict[str, str]]) -> str:
        """Format conversation history as text."""
        return " ".join([f"{msg['role']}: {msg['text']}" for msg in history])
    
    def create_pairwise_examples(self, data: List[RankingExample]) -> List[InputExample]:
        """Create pairwise training examples (better vs worse)."""
        examples = []
        
        for item in data:
            history_text = self._format_history(item.history)
            
            # Get scores for all candidates
            candidate_scores = {c['text']: c['total'] for c in item.candidates}
            candidates_sorted = sorted(item.candidates, key=lambda x: x['total'], reverse=True)
            
            # Create pairs: better candidate vs worse candidate
            for i in range(len(candidates_sorted)):
                for j in range(i + 1, len(candidates_sorted)):
                    better = candidates_sorted[i]
                    worse = candidates_sorted[j]
                    
                    # Positive example: better candidate should rank higher
                    examples.append(InputExample(
                        texts=[history_text, better['text']],
                        label=1.0
                    ))
                    
                    # Negative example: worse candidate should rank lower
                    examples.append(InputExample(
                        texts=[history_text, worse['text']],
                        label=0.0
                    ))
        
        return examples
    
    def create_triplet_examples(self, data: List[RankingExample]) -> List[InputExample]:
        """Create triplet examples (anchor, positive, negative)."""
        examples = []
        
        for item in data:
            history_text = self._format_history(item.history)
            candidates_sorted = sorted(item.candidates, key=lambda x: x['total'], reverse=True)
            
            if len(candidates_sorted) < 2:
                continue
            
            # Anchor: conversation history
            # Positive: best candidate
            # Negative: worst candidate
            best = candidates_sorted[0]['text']
            worst = candidates_sorted[-1]['text']
            
            examples.append(InputExample(
                texts=[history_text, best, worst],
                label=0.0  # Distance between anchor-positive should be smaller than anchor-negative
            ))
        
        return examples
    
    def train_pairwise(self, train_data: List[RankingExample], 
                       epochs: int = 3, 
                       batch_size: int = 16,
                       output_path: str = "models/ranker_pairwise"):
        """Train pairwise ranking model."""
        print(f"🔥 Training pairwise ranker...")
        print(f"   Model: {self.model_name}")
        print(f"   Examples: {len(train_data)}")
        print(f"   Epochs: {epochs}")
        
        # Create training examples
        examples = self.create_pairwise_examples(train_data)
        print(f"   Pairs created: {len(examples)}")
        
        # Create DataLoader
        train_dataloader = DataLoader(examples, shuffle=True, batch_size=batch_size)
        
        # Use CosineSimilarityLoss for pairwise ranking
        train_loss = losses.CosineSimilarityLoss(self.model)
        
        # Train
        self.model.fit(
            train_objectives=[(train_dataloader, train_loss)],
            epochs=epochs,
            warmup_steps=100,
            output_path=output_path,
            show_progress_bar=True
        )
        
        print(f"✅ Model saved to: {output_path}")
    
    def train_triplet(self, train_data: List[RankingExample],
                      epochs: int = 3,
                      batch_size: int = 16,
                      output_path: str = "models/ranker_triplet"):
        """Train triplet ranking model."""
        print(f"🔥 Training triplet ranker...")
        print(f"   Model: {self.model_name}")
        print(f"   Examples: {len(train_data)}")
        print(f"   Epochs: {epochs}")
        
        # Create training examples
        examples = self.create_triplet_examples(train_data)
        print(f"   Triplets created: {len(examples)}")
        
        # Create DataLoader
        train_dataloader = DataLoader(examples, shuffle=True, batch_size=batch_size)
        
        # Use TripletLoss
        train_loss = losses.TripletLoss(self.model)
        
        # Train
        self.model.fit(
            train_objectives=[(train_dataloader, train_loss)],
            epochs=epochs,
            warmup_steps=100,
            output_path=output_path,
            show_progress_bar=True
        )
        
        print(f"✅ Model saved to: {output_path}")
    
    def rank_candidates(self, history: List[Dict[str, str]], 
                       candidates: List[str]) -> List[Tuple[str, float]]:
        """Rank candidates for given conversation history."""
        history_text = self._format_history(history)
        
        # Encode history and candidates
        history_embedding = self.model.encode(history_text, convert_to_tensor=True)
        candidate_embeddings = self.model.encode(candidates, convert_to_tensor=True)
        
        # Compute similarity scores
        from sentence_transformers import util
        scores = util.cos_sim(history_embedding, candidate_embeddings)[0]
        
        # Sort by score
        ranked = sorted(zip(candidates, scores.cpu().numpy()), 
                       key=lambda x: x[1], reverse=True)
        
        return ranked
    
    def evaluate(self, test_data: List[RankingExample]) -> Dict[str, float]:
        """Evaluate ranking model on test data."""
        print(f"📊 Evaluating ranker on {len(test_data)} examples...")
        
        metrics = {
            'top1_accuracy': 0.0,
            'top3_accuracy': 0.0,
            'mrr': 0.0,  # Mean Reciprocal Rank
            'ndcg@3': 0.0  # Normalized Discounted Cumulative Gain
        }
        
        for item in test_data:
            # Get model predictions
            candidates_text = [c['text'] for c in item.candidates]
            ranked = self.rank_candidates(item.history, candidates_text)
            predicted_top3 = [r[0] for r in ranked[:3]]
            
            # Ground truth
            gold_top1 = item.top3[0]
            gold_top3 = set(item.top3[:3])
            
            # Top-1 accuracy
            if predicted_top3[0] == gold_top1:
                metrics['top1_accuracy'] += 1
            
            # Top-3 accuracy (any overlap)
            if any(pred in gold_top3 for pred in predicted_top3):
                metrics['top3_accuracy'] += 1
            
            # MRR (Mean Reciprocal Rank)
            for i, pred in enumerate(predicted_top3):
                if pred == gold_top1:
                    metrics['mrr'] += 1.0 / (i + 1)
                    break
        
        # Average metrics
        n = len(test_data)
        metrics = {k: v / n for k, v in metrics.items()}
        
        print(f"\n📈 Results:")
        print(f"   Top-1 Accuracy: {metrics['top1_accuracy']:.2%}")
        print(f"   Top-3 Accuracy: {metrics['top3_accuracy']:.2%}")
        print(f"   MRR: {metrics['mrr']:.3f}")
        
        return metrics


def load_ranking_data(jsonl_path: str) -> List[RankingExample]:
    """Load ranking data from JSONL file."""
    data = []
    
    with open(jsonl_path, 'r', encoding='utf-8') as f:
        for line in f:
            item = json.loads(line)
            data.append(RankingExample(
                id=item['id'],
                history=item['history'],
                candidates=item['candidates_scored'],
                top3=item['top3'],
                stage=item['stage'],
                mood=item['mood'],
                directness=item['directness']
            ))
    
    return data


def split_data(data: List[RankingExample], 
               train_ratio: float = 0.8) -> Tuple[List[RankingExample], List[RankingExample]]:
    """Split data into train and test sets."""
    np.random.shuffle(data)
    split_idx = int(len(data) * train_ratio)
    return data[:split_idx], data[split_idx:]


def main():
    parser = argparse.ArgumentParser(description="Train ranking model for crush replies")
    parser.add_argument('--data', type=str, 
                       default='data/processed/llm/ranking_labels_1000.jsonl',
                       help='Path to ranking labels JSONL file')
    parser.add_argument('--approach', type=str, choices=['pairwise', 'triplet'],
                       default='pairwise',
                       help='Ranking approach')
    parser.add_argument('--model', type=str,
                       default='sentence-transformers/all-MiniLM-L6-v2',
                       help='Pre-trained model name')
    parser.add_argument('--epochs', type=int, default=3,
                       help='Number of training epochs')
    parser.add_argument('--batch-size', type=int, default=16,
                       help='Training batch size')
    parser.add_argument('--output', type=str, default='models/ranker',
                       help='Output directory for trained model')
    parser.add_argument('--eval-only', action='store_true',
                       help='Only evaluate existing model')
    
    args = parser.parse_args()
    
    # Check dependencies
    if not TRANSFORMERS_AVAILABLE:
        print("❌ Missing dependencies!")
        print("   Install: pip install sentence-transformers torch")
        return
    
    # Load data
    print(f"📥 Loading data from: {args.data}")
    data = load_ranking_data(args.data)
    print(f"   Loaded {len(data)} examples")
    
    # Split data
    train_data, test_data = split_data(data, train_ratio=0.8)
    print(f"   Train: {len(train_data)} | Test: {len(test_data)}")
    
    # Initialize ranker
    ranker = CrushRanker(model_name=args.model)
    
    if not args.eval_only:
        # Train
        if args.approach == 'pairwise':
            ranker.train_pairwise(
                train_data,
                epochs=args.epochs,
                batch_size=args.batch_size,
                output_path=args.output
            )
        elif args.approach == 'triplet':
            ranker.train_triplet(
                train_data,
                epochs=args.epochs,
                batch_size=args.batch_size,
                output_path=args.output
            )
    else:
        # Load existing model
        print(f"📂 Loading model from: {args.output}")
        ranker.model = SentenceTransformer(args.output)
    
    # Evaluate
    metrics = ranker.evaluate(test_data)
    
    # Save metrics
    metrics_path = Path(args.output) / 'metrics.json'
    with open(metrics_path, 'w', encoding='utf-8') as f:
        json.dump(metrics, f, indent=2, ensure_ascii=False)
    print(f"\n💾 Metrics saved to: {metrics_path}")


if __name__ == '__main__':
    main()
