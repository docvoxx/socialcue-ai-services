#!/usr/bin/env python3
"""
Smart Reply Ranking System
Ranks reply candidates based on context, mood, and conversation history
"""

import json
from typing import List, Dict, Any, Tuple
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

class ReplyRanker:
    def __init__(self):
        self.embedding_model = SentenceTransformer('keepitreal/vietnamese-sbert')
        
        # Scoring weights
        self.weights = {
            "context_match": 0.30,      # How well reply matches context
            "mood_alignment": 0.25,     # How well reply matches mood
            "directness_fit": 0.20,     # Appropriate directness level
            "conversation_flow": 0.15,  # Natural conversation continuation
            "risk_level": 0.10          # Safety/appropriateness
        }
    
    def calculate_context_match(self, reply: str, context: Dict[str, Any]) -> float:
        """Calculate how well reply matches the conversation context"""
        # Extract conversation history
        history_text = " ".join([
            msg["message"] for msg in context["conversation_history"]
        ])
        
        # Calculate semantic similarity
        reply_emb = self.embedding_model.encode([reply])
        history_emb = self.embedding_model.encode([history_text])
        
        similarity = cosine_similarity(reply_emb, history_emb)[0][0]
        
        # Normalize to 0-1 range
        return (similarity + 1) / 2
    
    def calculate_mood_alignment(self, reply: str, mood: str) -> float:
        """Calculate how well reply matches the target mood"""
        mood_indicators = {
            "cute": ["🥺", "😊", "hihi", "nè", "nhỉ", "ơi", "á"],
            "playful": ["😎", "😏", "haha", "lol", "nha", "đấy", "kìa"],
            "mature": [".", "ạ", "được", "nghĩ", "hiểu", "cảm ơn"],
            "confident": ["!", "chắc chắn", "tất nhiên", "đương nhiên", "OK"],
            "shy": ["...", "à", "ừm", "có lẽ", "chắc", "hơi", "😅"]
        }
        
        indicators = mood_indicators.get(mood, [])
        
        # Count mood indicators in reply
        reply_lower = reply.lower()
        matches = sum(1 for indicator in indicators if indicator in reply_lower)
        
        # Normalize
        if len(indicators) == 0:
            return 0.5
        
        return min(matches / 3, 1.0)  # Cap at 1.0
    
    def calculate_directness_fit(self, reply: str, target_directness: str) -> float:
        """Calculate if reply matches target directness level"""
        # Directness indicators
        high_directness = ["muốn", "thích", "đi", "gặp", "hẹn", "rủ"]
        medium_directness = ["có thể", "nếu", "hay là", "thử", "xem"]
        low_directness = ["chắc", "có lẽ", "nghĩ", "thấy", "à", "nhỉ"]
        
        reply_lower = reply.lower()
        
        high_count = sum(1 for word in high_directness if word in reply_lower)
        medium_count = sum(1 for word in medium_directness if word in reply_lower)
        low_count = sum(1 for word in low_directness if word in reply_lower)
        
        if target_directness == "high":
            return min(high_count / 2, 1.0)
        elif target_directness == "medium":
            return min(medium_count / 2, 1.0)
        else:  # low
            return min(low_count / 2, 1.0)
    
    def calculate_conversation_flow(self, reply: str, context: Dict[str, Any]) -> float:
        """Calculate how naturally reply continues the conversation"""
        # Check for open-ended questions
        has_question = any(q in reply for q in ["?", "không", "nhỉ", "hả", "sao"])
        
        # Check for acknowledgment
        has_acknowledgment = any(ack in reply.lower() for ack in ["ừ", "à", "ồ", "thế", "vậy"])
        
        # Check for continuation cues
        has_continuation = any(cont in reply.lower() for cont in ["thì", "nên", "lần sau", "tiếp"])
        
        score = 0.0
        if has_question:
            score += 0.4
        if has_acknowledgment:
            score += 0.3
        if has_continuation:
            score += 0.3
        
        return min(score, 1.0)
    
    def calculate_risk_level(self, reply: str, context: Dict[str, Any]) -> float:
        """Calculate safety/appropriateness of reply (higher = safer)"""
        # Red flags (reduce score)
        red_flags = [
            "phải", "bắt buộc", "nhất định", "theo dõi", 
            "yêu", "thương", "crush", "thích bạn"
        ]
        
        # Green flags (increase score)
        green_flags = [
            "nếu bạn muốn", "có thể", "được không", "bạn nghĩ sao",
            "thoải mái", "không sao", "được"
        ]
        
        reply_lower = reply.lower()
        
        red_count = sum(1 for flag in red_flags if flag in reply_lower)
        green_count = sum(1 for flag in green_flags if flag in reply_lower)
        
        # Start at 0.7 (neutral)
        score = 0.7
        score -= red_count * 0.2  # Penalty for red flags
        score += green_count * 0.1  # Bonus for green flags
        
        return max(0.0, min(score, 1.0))
    
    def rank_replies(self, candidates: List[str], context: Dict[str, Any]) -> List[Tuple[str, float, Dict[str, float]]]:
        """
        Rank reply candidates
        
        Returns:
            List of (reply, total_score, score_breakdown) tuples, sorted by score
        """
        ranked = []
        
        for reply in candidates:
            # Calculate individual scores
            scores = {
                "context_match": self.calculate_context_match(reply, context),
                "mood_alignment": self.calculate_mood_alignment(reply, context["mood"]),
                "directness_fit": self.calculate_directness_fit(reply, context["directness"]),
                "conversation_flow": self.calculate_conversation_flow(reply, context),
                "risk_level": self.calculate_risk_level(reply, context)
            }
            
            # Calculate weighted total
            total_score = sum(
                scores[key] * self.weights[key]
                for key in scores.keys()
            )
            
            ranked.append((reply, total_score, scores))
        
        # Sort by total score (descending)
        ranked.sort(key=lambda x: x[1], reverse=True)
        
        return ranked
    
    def get_top_3(self, candidates: List[str], context: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Get top 3 ranked replies with explanations"""
        ranked = self.rank_replies(candidates, context)
        
        top_3 = []
        for i, (reply, score, breakdown) in enumerate(ranked[:3]):
            top_3.append({
                "rank": i + 1,
                "reply": reply,
                "score": round(score, 3),
                "breakdown": {k: round(v, 3) for k, v in breakdown.items()},
                "explanation": self._generate_explanation(breakdown)
            })
        
        return top_3
    
    def _generate_explanation(self, breakdown: Dict[str, float]) -> str:
        """Generate human-readable explanation for ranking"""
        strengths = []
        weaknesses = []
        
        for key, value in breakdown.items():
            if value >= 0.7:
                strengths.append(key.replace("_", " "))
            elif value < 0.4:
                weaknesses.append(key.replace("_", " "))
        
        explanation = ""
        if strengths:
            explanation += f"Điểm mạnh: {', '.join(strengths)}. "
        if weaknesses:
            explanation += f"Cần cải thiện: {', '.join(weaknesses)}."
        
        return explanation.strip()

def main():
    """Example usage"""
    ranker = ReplyRanker()
    
    # Example context
    context = {
        "stage": "đang nói chuyện",
        "mood": "playful",
        "directness": "medium",
        "conversation_history": [
            {"role": "user", "message": "Bạn thích ăn gì nhất?"},
            {"role": "crush", "message": "Mình thích lẩu lắm 🍲"},
            {"role": "user", "message": "Trùng hợp quá, tôi cũng thích"}
        ]
    }
    
    # Example candidates
    candidates = [
        "Vậy hả? Vậy lần sau mình đi ăn cùng nhé",
        "Thế à? Hay đấy",
        "Ồ, thế chắc mình hợp nhau rồi",
        "Tuyệt, có bạn đồng hành rồi"
    ]
    
    # Rank replies
    top_3 = ranker.get_top_3(candidates, context)
    
    print("🏆 Top 3 Ranked Replies:\n")
    for item in top_3:
        print(f"#{item['rank']}: {item['reply']}")
        print(f"   Score: {item['score']}")
        print(f"   {item['explanation']}")
        print(f"   Breakdown: {item['breakdown']}\n")

if __name__ == "__main__":
    main()
