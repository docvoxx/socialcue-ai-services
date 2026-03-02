#!/usr/bin/env python3
"""
Convert crush contexts to conversations format for fine-tuning
Input: crush_contexts_clean.jsonl (context format)
Output: conversations.jsonl (messages format for fine-tuning)
"""

import argparse
import json
from typing import List, Dict, Any

def context_to_conversation(context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert context item to conversation format
    
    Input format:
    {
      "id": "crush_0001",
      "stage": "mở đầu",
      "mood": "playful",
      "directness": "low",
      "conversation_history": [
        {"role": "crush", "text": "Hôm nay trời đẹp nhỉ"},
        {"role": "user", "text": "Ừ, mà sao bạn biết tôi thích trời đẹp?"}
      ],
      "gold_reply": "Thì... quan sát thôi 😊",
      ...
    }
    
    Output format:
    {
      "messages": [
        {"role": "system", "content": "..."},
        {"role": "user", "content": "..."},
        {"role": "assistant", "content": "..."}
      ]
    }
    """
    
    # Build system message with context
    system_content = f"""Bạn là chuyên gia giao tiếp khi nói chuyện với crush.

Context:
- Stage: {context['stage']}
- Mood: {context['mood']}
- Directness: {context['directness']}

Nhiệm vụ: Đưa ra câu trả lời tự nhiên, phù hợp với context, không gây áp lực."""
    
    messages = [
        {"role": "system", "content": system_content}
    ]
    
    # Add conversation history
    history = context.get("conversation_history", [])
    
    # Build user message from history
    user_content = "Hội thoại:\n"
    for msg in history:
        role_display = "Crush" if msg["role"] == "crush" else "Bạn"
        user_content += f"{role_display}: {msg['text']}\n"
    
    user_content += "\nBạn nên trả lời thế nào?"
    
    messages.append({
        "role": "user",
        "content": user_content
    })
    
    # Add assistant response (gold_reply)
    messages.append({
        "role": "assistant",
        "content": context["gold_reply"]
    })
    
    return {"messages": messages}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", type=str, 
                    default="data/processed/llm/crush_contexts_clean.jsonl",
                    help="input JSONL file (context format)")
    ap.add_argument("--output", type=str,
                    default="data/processed/llm/conversations.jsonl",
                    help="output JSONL file (messages format)")
    args = ap.parse_args()
    
    # Read contexts
    contexts = []
    with open(args.input, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                contexts.append(json.loads(line))
    
    print(f"Loaded {len(contexts)} contexts from {args.input}")
    
    # Convert to conversations
    conversations = []
    for ctx in contexts:
        conv = context_to_conversation(ctx)
        conversations.append(conv)
    
    # Write conversations
    with open(args.output, "w", encoding="utf-8") as f:
        for conv in conversations:
            f.write(json.dumps(conv, ensure_ascii=False) + "\n")
    
    print(f"Saved {len(conversations)} conversations to {args.output}")
    
    # Show example
    if conversations:
        print("\nExample conversation:")
        print(json.dumps(conversations[0], ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
