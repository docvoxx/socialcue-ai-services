#!/usr/bin/env python3
"""
Smart Crush Context Generator
Generates high-quality conversation contexts for resource-constrained environments
"""

import json
import os
from typing import List, Dict, Any
from openai import OpenAI
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from sentence_transformers import SentenceTransformer
import random

class CrushContextGenerator:
    def __init__(self, config_path: str = "data/config/generation_config.json"):
        with open(config_path, 'r', encoding='utf-8') as f:
            self.config = json.load(f)
        
        self.client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
        self.embedding_model = SentenceTransformer('keepitreal/vietnamese-sbert')
        self.generated_contexts = []
        self.embeddings = []
    
    def get_generation_prompt(self, batch_config: Dict[str, Any]) -> str:
        """Generate prompt with specific distribution requirements"""
        return f"""Bạn là chuyên gia giao tiếp khi nói chuyện với crush.

Tạo 20 ngữ cảnh chat thực tế giữa user và crush.

YÊU CẦU PHÂN BỐ:
- {batch_config['directness']['low']} contexts với directness: low
- {batch_config['directness']['medium']} contexts với directness: medium
- {batch_config['directness']['high']} contexts với directness: high

- {batch_config['stages']['mở đầu']} contexts stage: mở đầu
- {batch_config['stages']['đang nói chuyện']} contexts stage: đang nói chuyện
- {batch_config['stages']['rủ hẹn']} contexts stage: rủ hẹn
- {batch_config['stages']['cứu vãn']} contexts stage: cứu vãn
- {batch_config['stages']['sau buổi hẹn']} contexts stage: sau buổi hẹn

OUTPUT FORMAT (JSON array):
[
  {{
    "id": "ctx_001",
    "stage": "mở đầu",
    "mood": "playful",
    "directness": "low",
    "conversation_history": [
      {{"role": "crush", "message": "Hôm nay trời đẹp nhỉ"}},
      {{"role": "user", "message": "Ừ, mà sao bạn biết tôi thích trời đẹp?"}}
    ],
    "gold_reply": "Thì... quan sát thôi 😊 Thấy bạn hay post ảnh trời đẹp",
    "candidates": [
      "Đoán thế thôi, may mà đúng",
      "Ai cũng thích trời đẹp mà",
      "Bí mật nghề nghiệp 😎"
    ],
    "negative_reply": "Tại tôi theo dõi bạn từ lâu rồi",
    "metadata": {{
      "emoji_density": 1,
      "risk_level": "low",
      "has_open_question": true,
      "word_count": 12
    }}
  }}
]

LUẬT:
- Tự nhiên như chat Messenger/Zalo
- Không sến, không sexual, không gây áp lực
- Luôn có đường lui (không bí câu trả lời)
- Mỗi tin nhắn dưới 25 từ
- Không lặp cấu trúc
- Đa dạng emoji_density (0, 1, 2)
- gold_reply phải tự nhiên nhất
- candidates phải khác vibe nhưng vẫn OK
- negative_reply là ví dụ KHÔNG nên làm

Mood chọn ngẫu nhiên: cute, playful, mature, confident, shy

Không giải thích. Chỉ trả JSON array sạch."""

    def generate_batch(self, batch_num: int) -> List[Dict[str, Any]]:
        """Generate one batch of 20 contexts"""
        print(f"\n🔄 Generating batch {batch_num}...")
        
        # Create batch config with distribution
        batch_config = {
            "directness": self.config["batch_distribution"]["directness_distribution"],
            "stages": self.config["batch_distribution"]["stage_distribution"]
        }
        
        prompt = self.get_generation_prompt(batch_config)
        
        try:
            response = self.client.chat.completions.create(
                model=self.config["llm_config"]["model"],
                messages=[{"role": "user", "content": prompt}],
                temperature=self.config["llm_config"]["temperature"],
                max_tokens=self.config["llm_config"]["max_tokens"]
            )
            
            content = response.choices[0].message.content
            # Extract JSON from markdown code blocks if present
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
            
            contexts = json.loads(content.strip())
            print(f"✅ Generated {len(contexts)} contexts")
            return contexts
            
        except Exception as e:
            print(f"❌ Error generating batch: {e}")
            return []
    
    def calculate_similarity(self, text1: str, text2: str) -> float:
        """Calculate cosine similarity between two texts"""
        emb1 = self.embedding_model.encode([text1])
        emb2 = self.embedding_model.encode([text2])
        return cosine_similarity(emb1, emb2)[0][0]
    
    def filter_duplicates(self, contexts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Remove duplicate contexts based on similarity"""
        print("\n🧹 Filtering duplicates...")
        
        if not contexts:
            return []
        
        # Extract gold_reply for comparison
        texts = [ctx["gold_reply"] for ctx in contexts]
        embeddings = self.embedding_model.encode(texts)
        
        filtered = []
        filtered_embeddings = []
        
        for i, ctx in enumerate(contexts):
            is_duplicate = False
            
            for j, existing_emb in enumerate(filtered_embeddings):
                similarity = cosine_similarity([embeddings[i]], [existing_emb])[0][0]
                if similarity > self.config["quality_filters"]["similarity_threshold"]:
                    is_duplicate = True
                    print(f"  ⚠️  Duplicate found: {ctx['id']} (similarity: {similarity:.3f})")
                    break
            
            if not is_duplicate:
                filtered.append(ctx)
                filtered_embeddings.append(embeddings[i])
        
        print(f"✅ Kept {len(filtered)}/{len(contexts)} contexts")
        return filtered
    
    def score_context(self, context: Dict[str, Any]) -> Dict[str, float]:
        """Score context quality using LLM"""
        prompt = f"""Đánh giá chất lượng context chat với crush này:

Stage: {context['stage']}
Mood: {context['mood']}
Directness: {context['directness']}

Conversation:
{json.dumps(context['conversation_history'], ensure_ascii=False, indent=2)}

Gold reply: {context['gold_reply']}

Đánh giá (1-10):
1. tự nhiên: Câu trả lời có tự nhiên không?
2. dễ trả lời: Crush có dễ trả lời tiếp không?
3. áp lực: Có gây áp lực cho crush không? (càng cao càng tệ)

Trả JSON:
{{
  "naturalness": 8,
  "ease_of_reply": 9,
  "pressure": 2
}}"""

        try:
            response = self.client.chat.completions.create(
                model="gpt-4",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
                max_tokens=100
            )
            
            content = response.choices[0].message.content
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            
            scores = json.loads(content.strip())
            return scores
            
        except Exception as e:
            print(f"  ⚠️  Error scoring context {context['id']}: {e}")
            return {"naturalness": 5, "ease_of_reply": 5, "pressure": 5}
    
    def filter_by_quality(self, contexts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Filter contexts by quality scores"""
        print("\n📊 Scoring contexts for quality...")
        
        filtered = []
        filters = self.config["quality_filters"]
        
        for ctx in contexts:
            scores = self.score_context(ctx)
            ctx["quality_scores"] = scores
            
            # Check quality thresholds
            if (scores["naturalness"] >= filters["min_naturalness_score"] and
                scores["pressure"] <= filters["max_pressure_score"] and
                scores["ease_of_reply"] >= filters["min_ease_of_reply"]):
                filtered.append(ctx)
                print(f"  ✅ {ctx['id']}: nat={scores['naturalness']}, ease={scores['ease_of_reply']}, press={scores['pressure']}")
            else:
                print(f"  ❌ {ctx['id']}: Failed quality check")
        
        print(f"✅ Kept {len(filtered)}/{len(contexts)} contexts after quality filter")
        return filtered
    
    def validate_context(self, context: Dict[str, Any]) -> bool:
        """Validate context structure and rules"""
        # Check word count
        gold_reply_words = len(context["gold_reply"].split())
        if gold_reply_words > self.config["quality_filters"]["max_words_per_message"]:
            return False
        
        # Check required fields
        required_fields = ["id", "stage", "mood", "directness", "conversation_history", 
                          "gold_reply", "candidates", "negative_reply", "metadata"]
        if not all(field in context for field in required_fields):
            return False
        
        # Check candidates count
        if len(context["candidates"]) != 3:
            return False
        
        return True
    
    def generate_dataset(self, output_path: str = "data/raw/crush_contexts.json"):
        """Generate complete dataset"""
        print("🚀 Starting dataset generation...")
        print(f"Target: {self.config['generation_strategy']['target_contexts']} contexts")
        print(f"Batches: {self.config['generation_strategy']['total_batches']}")
        
        all_contexts = []
        
        for batch_num in range(1, self.config['generation_strategy']['total_batches'] + 1):
            # Generate batch
            batch_contexts = self.generate_batch(batch_num)
            
            # Validate contexts
            valid_contexts = [ctx for ctx in batch_contexts if self.validate_context(ctx)]
            print(f"  ✅ {len(valid_contexts)}/{len(batch_contexts)} contexts valid")
            
            # Filter duplicates within batch
            unique_contexts = self.filter_duplicates(valid_contexts)
            
            all_contexts.extend(unique_contexts)
            
            print(f"  📊 Total contexts so far: {len(all_contexts)}")
            
            # Stop if we have enough
            if len(all_contexts) >= self.config['generation_strategy']['target_contexts'] * 1.5:
                print(f"  ⚠️  Reached 1.5x target, stopping generation")
                break
        
        print(f"\n📊 Generated {len(all_contexts)} contexts before quality filter")
        
        # Filter by quality (sample to avoid too many API calls)
        sample_size = min(len(all_contexts), 100)
        sample_contexts = random.sample(all_contexts, sample_size)
        quality_filtered = self.filter_by_quality(sample_contexts)
        
        # Calculate quality pass rate
        pass_rate = len(quality_filtered) / len(sample_contexts)
        print(f"\n📊 Quality pass rate: {pass_rate:.2%}")
        
        # Apply pass rate to estimate final dataset
        estimated_quality = int(len(all_contexts) * pass_rate)
        print(f"📊 Estimated quality contexts: {estimated_quality}")
        
        # Save all contexts (will filter later)
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(all_contexts, f, ensure_ascii=False, indent=2)
        
        print(f"\n✅ Dataset saved to {output_path}")
        print(f"📊 Total contexts: {len(all_contexts)}")
        print(f"📊 Estimated quality: {estimated_quality}")
        
        return all_contexts

def main():
    generator = CrushContextGenerator()
    contexts = generator.generate_dataset()
    
    print("\n🎉 Generation complete!")
    print(f"📁 Output: data/raw/crush_contexts.json")
    print(f"📊 Total: {len(contexts)} contexts")

if __name__ == "__main__":
    main()
