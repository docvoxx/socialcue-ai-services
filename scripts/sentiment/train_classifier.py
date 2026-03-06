#!/usr/bin/env python3
"""
Train sentiment classifier for crush replies.

This script trains a multi-label classifier to predict:
- Tone (friendly, playful, mature, shy, confident)
- Mood (positive, neutral, negative)
- Directness (low, medium, high)
- Pressure level (0-10)
- Appropriateness (0-10)

Usage:
    python train_classifier.py --data ../../data/processed/sentiment/labeled.jsonl
"""

import json
import argparse
from pathlib import Path
from typing import List, Dict, Tuple
import numpy as np

try:
    from transformers import (
        AutoModelForSequenceClassification,
        AutoTokenizer,
        Trainer,
        TrainingArguments,
        EvalPrediction
    )
    from datasets import Dataset
    import torch
    TRANSFORMERS_AVAILABLE = True
except ImportError:
    TRANSFORMERS_AVAILABLE = False
    print("⚠️  transformers not installed. Install with: pip install transformers torch datasets")

try:
    from sklearn.metrics import accuracy_score, f1_score, classification_report
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False
    print("⚠️  scikit-learn not installed. Install with: pip install scikit-learn")


# Label mappings
TONE_LABELS = ['friendly', 'playful', 'mature', 'shy', 'confident']
MOOD_LABELS = ['positive', 'neutral', 'negative']
DIRECTNESS_LABELS = ['low', 'medium', 'high']


def load_labeled_data(jsonl_path: str) -> List[Dict]:
    """Load labeled sentiment data."""
    print(f"📥 Loading labeled data from: {jsonl_path}")
    
    data = []
    with open(jsonl_path, 'r', encoding='utf-8') as f:
        for line in f:
            item = json.loads(line)
            data.append(item)
    
    print(f"✅ Loaded {len(data)} labeled examples")
    return data


def prepare_dataset(data: List[Dict], test_split: float = 0.2) -> Tuple[Dataset, Dataset]:
    """Prepare dataset for training."""
    print(f"\n🔧 Preparing dataset...")
    
    # Convert to format for transformers
    texts = []
    tone_labels = []
    mood_labels = []
    directness_labels = []
    
    for item in data:
        text = item['text']
        sentiment = item['sentiment']
        
        texts.append(text)
        
        # Encode labels
        tone = sentiment.get('tone', 'friendly')
        mood = sentiment.get('mood', 'neutral')
        directness = sentiment.get('directness', 'medium')
        
        tone_labels.append(TONE_LABELS.index(tone) if tone in TONE_LABELS else 0)
        mood_labels.append(MOOD_LABELS.index(mood) if mood in MOOD_LABELS else 1)
        directness_labels.append(DIRECTNESS_LABELS.index(directness) if directness in DIRECTNESS_LABELS else 1)
    
    # Create dataset
    dataset_dict = {
        'text': texts,
        'tone_label': tone_labels,
        'mood_label': mood_labels,
        'directness_label': directness_labels
    }
    
    dataset = Dataset.from_dict(dataset_dict)
    
    # Split train/test
    split = dataset.train_test_split(test_size=test_split, seed=42)
    train_dataset = split['train']
    test_dataset = split['test']
    
    print(f"✅ Dataset prepared:")
    print(f"   Train: {len(train_dataset)}")
    print(f"   Test: {len(test_dataset)}")
    
    return train_dataset, test_dataset


def tokenize_dataset(dataset: Dataset, tokenizer) -> Dataset:
    """Tokenize dataset."""
    def tokenize_function(examples):
        return tokenizer(
            examples['text'],
            padding='max_length',
            truncation=True,
            max_length=128
        )
    
    return dataset.map(tokenize_function, batched=True)


def compute_metrics(pred: EvalPrediction) -> Dict:
    """Compute evaluation metrics."""
    # For multi-task, we'll focus on tone prediction
    labels = pred.label_ids[:, 0]  # Tone labels
    preds = pred.predictions[0].argmax(-1)
    
    accuracy = accuracy_score(labels, preds)
    f1 = f1_score(labels, preds, average='weighted')
    
    return {
        'accuracy': accuracy,
        'f1': f1
    }


def train_classifier(train_dataset: Dataset,
                    test_dataset: Dataset,
                    model_name: str = "vinai/phobert-base",
                    output_dir: str = "../../models/sentiment_classifier"):
    """Train sentiment classifier."""
    print(f"\n🔥 Training classifier...")
    print(f"   Model: {model_name}")
    
    # Load tokenizer and model
    print(f"📂 Loading model...")
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    
    # For multi-task, we'll train separate models for each task
    # Here we'll train for tone classification as primary task
    model = AutoModelForSequenceClassification.from_pretrained(
        model_name,
        num_labels=len(TONE_LABELS)
    )
    
    # Tokenize datasets
    print(f"🔧 Tokenizing...")
    train_dataset = tokenize_dataset(train_dataset, tokenizer)
    test_dataset = tokenize_dataset(test_dataset, tokenizer)
    
    # Rename label column for trainer
    train_dataset = train_dataset.rename_column('tone_label', 'labels')
    test_dataset = test_dataset.rename_column('tone_label', 'labels')
    
    # Training arguments
    training_args = TrainingArguments(
        output_dir=output_dir,
        num_train_epochs=3,
        per_device_train_batch_size=16,
        per_device_eval_batch_size=16,
        warmup_steps=100,
        weight_decay=0.01,
        logging_dir=f'{output_dir}/logs',
        logging_steps=10,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="accuracy"
    )
    
    # Trainer
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=test_dataset,
        compute_metrics=compute_metrics
    )
    
    # Train
    print(f"🚀 Starting training...")
    trainer.train()
    
    # Evaluate
    print(f"\n📊 Evaluating...")
    results = trainer.evaluate()
    
    print(f"\n✅ Training complete!")
    print(f"   Accuracy: {results['eval_accuracy']:.2%}")
    print(f"   F1 Score: {results['eval_f1']:.3f}")
    
    # Save model
    print(f"\n💾 Saving model to: {output_dir}")
    trainer.save_model(output_dir)
    tokenizer.save_pretrained(output_dir)
    
    # Save label mappings
    with open(Path(output_dir) / 'label_mappings.json', 'w') as f:
        json.dump({
            'tone': TONE_LABELS,
            'mood': MOOD_LABELS,
            'directness': DIRECTNESS_LABELS
        }, f, indent=2)
    
    return trainer, results


def test_classifier(model_path: str):
    """Test trained classifier."""
    print(f"\n🧪 Testing classifier...")
    
    from transformers import pipeline
    
    classifier = pipeline(
        'text-classification',
        model=model_path,
        tokenizer=model_path
    )
    
    # Load label mappings
    with open(Path(model_path) / 'label_mappings.json') as f:
        mappings = json.load(f)
    
    test_texts = [
        "Bạn thích chỗ yên tĩnh hay náo nhiệt? 😊",
        "Ok vậy chốt luôn nha!",
        "Mình biết chỗ cà phê view đẹp, bạn có muốn đi không?",
        "Bạn kể thêm chút được không? 🐱✨",
        "Cuối tuần bạn hay làm gì?"
    ]
    
    print(f"\n💬 Test predictions:")
    for text in test_texts:
        result = classifier(text)[0]
        label_idx = int(result['label'].split('_')[-1])
        tone = mappings['tone'][label_idx]
        confidence = result['score']
        
        print(f"\n   Text: {text}")
        print(f"   Tone: {tone} ({confidence:.1%})")


def main():
    parser = argparse.ArgumentParser(description="Train sentiment classifier")
    parser.add_argument('--data', type=str, required=True,
                       help='Path to labeled data (JSONL)')
    parser.add_argument('--model', type=str,
                       default='vinai/phobert-base',
                       help='Base model name')
    parser.add_argument('--output', type=str,
                       default='../../models/sentiment_classifier',
                       help='Output directory')
    parser.add_argument('--test-split', type=float, default=0.2,
                       help='Test split ratio')
    parser.add_argument('--skip-training', action='store_true',
                       help='Skip training, only test')
    
    args = parser.parse_args()
    
    # Check dependencies
    if not TRANSFORMERS_AVAILABLE:
        print("❌ Missing transformers!")
        print("   Install: pip install transformers torch datasets")
        return
    
    if not SKLEARN_AVAILABLE:
        print("❌ Missing scikit-learn!")
        print("   Install: pip install scikit-learn")
        return
    
    print("🚀 Sentiment Classifier Training")
    print("="*80)
    
    # Test only
    if args.skip_training:
        if Path(args.output).exists():
            test_classifier(args.output)
        else:
            print(f"❌ Model not found: {args.output}")
        return
    
    # Load data
    data = load_labeled_data(args.data)
    
    # Prepare dataset
    train_dataset, test_dataset = prepare_dataset(data, args.test_split)
    
    # Train
    trainer, results = train_classifier(
        train_dataset,
        test_dataset,
        model_name=args.model,
        output_dir=args.output
    )
    
    # Test
    test_classifier(args.output)
    
    print("\n" + "="*80)
    print("✅ Sentiment classifier training complete!")
    print(f"\n📝 Next steps:")
    print(f"   1. Review model: {args.output}")
    print(f"   2. Integrate with sentiment service")
    print(f"   3. Monitor predictions in production")
    print(f"\n💡 Usage:")
    print(f"   from transformers import pipeline")
    print(f"   classifier = pipeline('text-classification', model='{args.output}')")
    print(f"   result = classifier('Your text here')")


if __name__ == '__main__':
    main()
