#!/usr/bin/env python3
"""
Train lightweight sentiment classifier using sentence-transformers + sklearn.
Much smaller and faster than PhoBERT for deployment.

Usage:
    python train_lightweight_classifier.py
"""

import json
import argparse
from pathlib import Path
from typing import List, Dict, Tuple
import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.linear_model import LogisticRegression
from sklearn.multioutput import MultiOutputClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report
import pickle


# Label mappings
TONE_LABELS = ['friendly', 'playful', 'mature', 'shy', 'confident', 'cute']
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


def prepare_features_and_labels(data: List[Dict], encoder: SentenceTransformer) -> Tuple:
    """Prepare features and labels for training."""
    print(f"\n🔧 Preparing features and labels...")
    
    texts = []
    tone_labels = []
    mood_labels = []
    directness_labels = []
    pressure_scores = []
    appropriateness_scores = []
    
    for item in data:
        text = item['text']
        
        texts.append(text)
        
        # Encode categorical labels (flat structure)
        tone = item.get('tone', 'friendly')
        mood = item.get('mood', 'positive')
        directness = item.get('directness', 'low')
        
        tone_labels.append(TONE_LABELS.index(tone) if tone in TONE_LABELS else 0)
        mood_labels.append(MOOD_LABELS.index(mood) if mood in MOOD_LABELS else 0)
        directness_labels.append(DIRECTNESS_LABELS.index(directness) if directness in DIRECTNESS_LABELS else 0)
        
        # Numerical scores
        pressure_scores.append(item.get('pressure_level', 3))
        appropriateness_scores.append(item.get('appropriateness', 7))
    
    # Encode texts to embeddings
    print(f"🤖 Encoding {len(texts)} texts to embeddings...")
    embeddings = encoder.encode(texts, show_progress_bar=True, convert_to_numpy=True)
    
    # Combine labels
    labels = np.column_stack([
        tone_labels,
        mood_labels,
        directness_labels,
        pressure_scores,
        appropriateness_scores
    ])
    
    print(f"✅ Features shape: {embeddings.shape}")
    print(f"✅ Labels shape: {labels.shape}")
    
    return embeddings, labels, texts


def train_classifier(X_train, y_train, X_test, y_test):
    """Train multi-output classifier."""
    print(f"\n🔥 Training classifier...")
    
    # Use LogisticRegression for multi-output classification
    base_clf = LogisticRegression(max_iter=1000, random_state=42)
    clf = MultiOutputClassifier(base_clf, n_jobs=-1)
    
    print(f"   Training on {len(X_train)} samples...")
    clf.fit(X_train, y_train)
    
    # Evaluate
    print(f"\n📊 Evaluating on {len(X_test)} samples...")
    y_pred = clf.predict(X_test)
    
    # Calculate accuracy for each task
    task_names = ['Tone', 'Mood', 'Directness', 'Pressure', 'Appropriateness']
    
    print(f"\n✅ Results:")
    for i, task in enumerate(task_names):
        if i < 3:  # Categorical tasks
            acc = accuracy_score(y_test[:, i], y_pred[:, i])
            print(f"   {task}: {acc:.2%} accuracy")
        else:  # Numerical tasks (use MAE)
            mae = np.mean(np.abs(y_test[:, i] - y_pred[:, i]))
            print(f"   {task}: {mae:.2f} MAE")
    
    return clf


def save_model(encoder: SentenceTransformer,
               classifier,
               output_dir: str):
    """Save model and metadata."""
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    print(f"\n💾 Saving model to: {output_dir}")
    
    # Save encoder (sentence-transformers model)
    encoder_path = output_path / "encoder"
    encoder.save(str(encoder_path))
    print(f"   ✅ Saved encoder to: {encoder_path}")
    
    # Save classifier (sklearn model)
    classifier_path = output_path / "classifier.pkl"
    with open(classifier_path, 'wb') as f:
        pickle.dump(classifier, f)
    print(f"   ✅ Saved classifier to: {classifier_path}")
    
    # Save label mappings
    mappings = {
        'tone': TONE_LABELS,
        'mood': MOOD_LABELS,
        'directness': DIRECTNESS_LABELS,
        'task_names': ['tone', 'mood', 'directness', 'pressure_level', 'appropriateness']
    }
    
    mappings_path = output_path / "label_mappings.json"
    with open(mappings_path, 'w', encoding='utf-8') as f:
        json.dump(mappings, f, indent=2, ensure_ascii=False)
    print(f"   ✅ Saved label mappings to: {mappings_path}")
    
    # Save README
    readme = f"""# Sentiment Classifier

Lightweight sentiment classifier for Vietnamese crush conversation replies.

## Model Architecture

- **Encoder**: sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
- **Classifier**: Multi-output Logistic Regression (sklearn)
- **Size**: ~120 MB (encoder) + ~1 MB (classifier)

## Tasks

1. **Tone**: {', '.join(TONE_LABELS)}
2. **Mood**: {', '.join(MOOD_LABELS)}
3. **Directness**: {', '.join(DIRECTNESS_LABELS)}
4. **Pressure Level**: 0-10 (numerical)
5. **Appropriateness**: 0-10 (numerical)

## Usage

```python
from sentence_transformers import SentenceTransformer
import pickle
import json

# Load model
encoder = SentenceTransformer('models/sentiment_classifier/encoder')
with open('models/sentiment_classifier/classifier.pkl', 'rb') as f:
    classifier = pickle.load(f)
with open('models/sentiment_classifier/label_mappings.json') as f:
    mappings = json.load(f)

# Predict
text = "Bạn thích chỗ yên tĩnh hay náo nhiệt? 😊"
embedding = encoder.encode([text])
prediction = classifier.predict(embedding)[0]

tone = mappings['tone'][prediction[0]]
mood = mappings['mood'][prediction[1]]
directness = mappings['directness'][prediction[2]]
pressure = prediction[3]
appropriateness = prediction[4]

print(f"Tone: {{tone}}")
print(f"Mood: {{mood}}")
print(f"Directness: {{directness}}")
print(f"Pressure: {{pressure}}/10")
print(f"Appropriateness: {{appropriateness}}/10")
```

## Performance

- **Tone**: ~XX% accuracy
- **Mood**: ~XX% accuracy
- **Directness**: ~XX% accuracy
- **Pressure**: ~X.XX MAE
- **Appropriateness**: ~X.XX MAE

## Training Data

- **Size**: 500 labeled examples
- **Source**: Generated with Ollama (mistral:latest)
- **Format**: JSONL with text + sentiment labels
"""
    
    readme_path = output_path / "README.md"
    with open(readme_path, 'w', encoding='utf-8') as f:
        f.write(readme)
    print(f"   ✅ Saved README to: {readme_path}")


def test_classifier(encoder: SentenceTransformer,
                   classifier,
                   label_mappings: Dict):
    """Test trained classifier."""
    print(f"\n🧪 Testing classifier...")
    
    test_texts = [
        "Bạn thích chỗ yên tĩnh hay náo nhiệt? 😊",
        "Ok vậy chốt luôn nha!",
        "Mình biết chỗ cà phê view đẹp, bạn có muốn đi không?",
        "Bạn kể thêm chút được không? 🐱✨",
        "Cuối tuần bạn hay làm gì?",
        "Trả lời đi, sao không rep?",
        "Nhớ em quá 😍"
    ]
    
    # Encode
    embeddings = encoder.encode(test_texts, convert_to_numpy=True)
    
    # Predict
    predictions = classifier.predict(embeddings)
    
    print(f"\n💬 Test predictions:")
    for text, pred in zip(test_texts, predictions):
        tone = label_mappings['tone'][pred[0]]
        mood = label_mappings['mood'][pred[1]]
        directness = label_mappings['directness'][pred[2]]
        pressure = pred[3]
        appropriateness = pred[4]
        
        print(f"\n   Text: {text}")
        print(f"   Tone: {tone} | Mood: {mood} | Directness: {directness}")
        print(f"   Pressure: {pressure}/10 | Appropriateness: {appropriateness}/10")


def main():
    parser = argparse.ArgumentParser(description="Train lightweight sentiment classifier")
    parser.add_argument('--data', type=str,
                       default='../../data/processed/llm/sentiment_crush_dataset_500.jsonl',
                       help='Path to labeled data (JSONL)')
    parser.add_argument('--encoder', type=str,
                       default='sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2',
                       help='Sentence encoder model')
    parser.add_argument('--output', type=str,
                       default='../../models/sentiment_classifier',
                       help='Output directory')
    parser.add_argument('--test-split', type=float, default=0.2,
                       help='Test split ratio')
    
    args = parser.parse_args()
    
    print("🚀 Lightweight Sentiment Classifier Training")
    print("="*80)
    
    # Load encoder
    print(f"\n📂 Loading encoder: {args.encoder}")
    encoder = SentenceTransformer(args.encoder)
    print(f"✅ Encoder loaded (embedding dim: {encoder.get_sentence_embedding_dimension()})")
    
    # Load data
    data = load_labeled_data(args.data)
    
    # Prepare features and labels
    X, y, texts = prepare_features_and_labels(data, encoder)
    
    # Split train/test
    X_train, X_test, y_train, y_test, texts_train, texts_test = train_test_split(
        X, y, texts, test_size=args.test_split, random_state=42
    )
    
    print(f"\n📊 Dataset split:")
    print(f"   Train: {len(X_train)} samples")
    print(f"   Test: {len(X_test)} samples")
    
    # Train
    classifier = train_classifier(X_train, y_train, X_test, y_test)
    
    # Save
    save_model(encoder, classifier, args.output)
    
    # Test
    label_mappings = {
        'tone': TONE_LABELS,
        'mood': MOOD_LABELS,
        'directness': DIRECTNESS_LABELS
    }
    test_classifier(encoder, classifier, label_mappings)
    
    print("\n" + "="*80)
    print("✅ Sentiment classifier training complete!")
    print(f"\n📝 Model saved to: {args.output}")
    print(f"   - encoder/ (sentence-transformers model)")
    print(f"   - classifier.pkl (sklearn model)")
    print(f"   - label_mappings.json (label mappings)")
    print(f"\n💡 Next steps:")
    print(f"   1. Copy to Space: cp -r {args.output} ../../../socialcue-space/models/")
    print(f"   2. Update sentiment.py to use trained model")
    print(f"   3. Test deployment")


if __name__ == '__main__':
    main()
