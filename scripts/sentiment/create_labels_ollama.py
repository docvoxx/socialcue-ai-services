#!/usr/bin/env python3
"""
Create sentiment labels for crush replies using Ollama (local, free).

This script:
1. Loads replies from training data
2. Uses Ollama (qwen2.5:3b) to label sentiment
3. Saves labeled data for training sentiment classifier

Usage:
    python create_labels_ollama.py --input ../../data/processed/llm/conversations_1000.jsonl
"""

import json
import argparse
import requests
from pathlib import Path
from typing import Dict
from tqdm import tqdm
import time


SENTIMENT_PROMPT = """Phân tích sentiment của câu trả lời khi chat với crush.

Đánh giá theo các tiêu chí:

1. **tone** (giọng điệu):
   - friendly: Thân thiện, dễ gần
   - playful: Vui vẻ, đùa giỡn
   - mature: Chín chắn, nghiêm túc
   - shy: Nhút nhát, e dè
   - confident: Tự tin, quyết đoán

2. **mood** (tâm trạng):
   - positive: Tích cực, vui vẻ
   - neutral: Trung lập
   - negative: Tiêu cực, buồn

3. **directness** (mức độ trực tiếp):
   - low: Gián tiếp, khéo léo
   - medium: Vừa phải
   - high: Trực tiếp, rõ ràng

4. **pressure_level** (mức độ gây áp lực): 0-10
   - 0-3: Không áp lực, thoải mái
   - 4-6: Vừa phải
   - 7-10: Gây áp lực cao

5. **appropriateness** (mức độ phù hợp): 0-10
   - 0-3: Không phù hợp
   - 4-6: Tạm được
   - 7-10: Rất phù hợp

6. **has_question** (có câu hỏi mở): true/false
   - true: Có câu hỏi để kéo dài cuộc trò chuyện
   - false: Không có câu hỏi

7. **emoji_usage** (sử dụng emoji):
   - none: Không có emoji
   - light: 1-2 emoji
   - moderate: 3-4 emoji
   - heavy: 5+ emoji

Trả về JSON với format:
{
  "tone": "friendly",
  "mood": "positive",
  "directness": "medium",
  "pressure_level": 3,
  "appropriateness": 8,
  "has_question": true,
  "emoji_usage": "light",
  "explanation": "Giải thích ngắn gọn"
}

CHỈ TRẢ VỀ JSON, KHÔNG GIẢI THÍCH THÊM."""


def label_sentiment_ollama(text: str, context: str = "", 
                           model: str = "qwen2.5:3b",
                           base_url: str = "http://localhost:11434") -> Dict:
    """Label sentiment using Ollama."""
    
    prompt = f"{SENTIMENT_PROMPT}\n\nContext: {context}\n\nReply: {text}"
    
    try:
        response = requests.post(
            f"{base_url}/api/generate",
            json={
                "model": model,
                "prompt": prompt,
                "stream": False,
                "format": "json",
                "options": {
                    "temperature": 0.3,
                    "top_p": 0.9
                }
            },
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            response_text = result.get('response', '{}')
            
            # Parse JSON from response
            try:
                sentiment = json.loads(response_text)
                return sentiment
            except json.JSONDecodeError:
                # Try to extract JSON from text
                import re
                json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
                if json_match:
                    sentiment = json.loads(json_match.group())
                    return sentiment
                else:
                    print(f"⚠️  Could not parse JSON: {response_text[:100]}")
                    return None
        else:
            print(f"⚠️  API error: {response.status_code}")
            return None
    
    except Exception as e:
        print(f"⚠️  Error labeling: {e}")
        return None


def load_and_label(input_path: str, 
                   output_path: str,
                   model: str = "qwen2.5:3b",
                   base_url: str = "http://localhost:11434",
                   max_samples: int = None,
                   resume: bool = True):
    """Load data and create sentiment labels."""
    
    # Test Ollama connection
    print(f"🔌 Testing Ollama connection: {base_url}")
    try:
        response = requests.get(f"{base_url}/api/tags", timeout=5)
        if response.status_code == 200:
            models = response.json().get('models', [])
            model_names = [m['name'] for m in models]
            print(f"✅ Connected to Ollama")
            print(f"   Available models: {', '.join(model_names)}")
            
            if model not in model_names:
                print(f"⚠️  Model {model} not found!")
                print(f"   Pull it with: ollama pull {model}")
                return
        else:
            print(f"❌ Could not connect to Ollama")
            return
    except Exception as e:
        print(f"❌ Ollama not running: {e}")
        print(f"   Start it with: ollama serve")
        return
    
    # Load existing labels if resuming
    existing_ids = set()
    if resume and Path(output_path).exists():
        print(f"📂 Resuming from existing labels...")
        with open(output_path, 'r', encoding='utf-8') as f:
            for line in f:
                item = json.loads(line)
                existing_ids.add(item.get('id', ''))
        print(f"   Found {len(existing_ids)} existing labels")
    
    # Load input data
    print(f"📥 Loading data from: {input_path}")
    
    items = []
    with open(input_path, 'r', encoding='utf-8') as f:
        for line in f:
            item = json.loads(line)
            
            # Skip if already labeled
            if item.get('id', '') in existing_ids:
                continue
            
            items.append(item)
            
            if max_samples and len(items) >= max_samples:
                break
    
    print(f"✅ Loaded {len(items)} items to label")
    
    if len(items) == 0:
        print("✅ All items already labeled!")
        return
    
    # Label each item
    print(f"\n🏷️  Labeling sentiment with {model}...")
    
    labeled_count = 0
    error_count = 0
    
    with open(output_path, 'a', encoding='utf-8') as out:
        for item in tqdm(items):
            # Extract text
            messages = item.get('messages', [])
            
            context = ""
            reply = ""
            
            for msg in messages:
                if msg['role'] == 'user':
                    context = msg['content']
                elif msg['role'] == 'assistant':
                    reply = msg['content']
            
            if not reply:
                continue
            
            # Label sentiment
            sentiment = label_sentiment_ollama(reply, context, model, base_url)
            
            if sentiment:
                # Save labeled data
                labeled_item = {
                    'id': item.get('id', f"sent_{labeled_count}"),
                    'text': reply,
                    'context': context,
                    'sentiment': sentiment,
                    'metadata': {
                        'stage': item.get('stage', 'unknown'),
                        'mood': item.get('mood', 'unknown'),
                        'directness': item.get('directness', 'unknown')
                    }
                }
                
                out.write(json.dumps(labeled_item, ensure_ascii=False) + '\n')
                out.flush()
                
                labeled_count += 1
            else:
                error_count += 1
            
            # Small delay to avoid overwhelming Ollama
            time.sleep(0.1)
    
    print(f"\n✅ Labeling complete!")
    print(f"   Labeled: {labeled_count}")
    print(f"   Errors: {error_count}")
    print(f"   Output: {output_path}")


def analyze_labels(output_path: str):
    """Analyze label distribution."""
    print(f"\n📊 Analyzing labels...")
    
    from collections import Counter
    
    tones = Counter()
    moods = Counter()
    directness = Counter()
    pressure_levels = []
    appropriateness_scores = []
    
    with open(output_path, 'r', encoding='utf-8') as f:
        for line in f:
            item = json.loads(line)
            sentiment = item['sentiment']
            
            tones[sentiment.get('tone', 'unknown')] += 1
            moods[sentiment.get('mood', 'unknown')] += 1
            directness[sentiment.get('directness', 'unknown')] += 1
            pressure_levels.append(sentiment.get('pressure_level', 0))
            appropriateness_scores.append(sentiment.get('appropriateness', 0))
    
    print(f"\n📈 Label Distribution:")
    print(f"\n   Tone:")
    for tone, count in tones.most_common():
        print(f"      {tone}: {count}")
    
    print(f"\n   Mood:")
    for mood, count in moods.most_common():
        print(f"      {mood}: {count}")
    
    print(f"\n   Directness:")
    for direct, count in directness.most_common():
        print(f"      {direct}: {count}")
    
    if pressure_levels:
        avg_pressure = sum(pressure_levels) / len(pressure_levels)
        print(f"\n   Avg Pressure Level: {avg_pressure:.2f}/10")
    
    if appropriateness_scores:
        avg_appropriate = sum(appropriateness_scores) / len(appropriateness_scores)
        print(f"   Avg Appropriateness: {avg_appropriate:.2f}/10")


def main():
    parser = argparse.ArgumentParser(description="Create sentiment labels with Ollama")
    parser.add_argument('--input', type=str, required=True,
                       help='Input JSONL file')
    parser.add_argument('--output', type=str,
                       default='../../data/processed/sentiment/labeled.jsonl',
                       help='Output JSONL file')
    parser.add_argument('--model', type=str, default='qwen2.5:3b',
                       help='Ollama model to use')
    parser.add_argument('--base-url', type=str, default='http://localhost:11434',
                       help='Ollama API base URL')
    parser.add_argument('--max-samples', type=int,
                       help='Max samples to label (for testing)')
    parser.add_argument('--no-resume', action='store_true',
                       help='Start fresh (don\'t resume)')
    parser.add_argument('--analyze-only', action='store_true',
                       help='Only analyze existing labels')
    
    args = parser.parse_args()
    
    # Analyze only
    if args.analyze_only:
        if Path(args.output).exists():
            analyze_labels(args.output)
        else:
            print(f"❌ Output file not found: {args.output}")
        return
    
    print("🚀 Sentiment Labeling with Ollama (FREE)")
    print("="*80)
    
    # Create output directory
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    
    # Label data
    load_and_label(
        args.input,
        args.output,
        model=args.model,
        base_url=args.base_url,
        max_samples=args.max_samples,
        resume=not args.no_resume
    )
    
    # Analyze
    if Path(args.output).exists():
        analyze_labels(args.output)
    
    print("\n" + "="*80)
    print("✅ Sentiment labeling complete!")
    print(f"\n📝 Next steps:")
    print(f"   1. Review labels: {args.output}")
    print(f"   2. Train classifier: python train_classifier.py")
    print(f"   3. Integrate with sentiment service")


if __name__ == '__main__':
    main()
