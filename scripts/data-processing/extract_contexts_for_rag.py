#!/usr/bin/env python3
"""
Extract contexts from conversations_1000.jsonl for RAG
Format: conversation_history → gold_reply
"""

import json
import argparse
import random
from pathlib import Path

def extract_conversation_context(messages):
    """
    Extract conversation history and reply from messages array.
    
    Format:
    messages = [
        {"role": "system", "content": "..."},
        {"role": "user", "content": "Hội thoại gần nhất:\ncrush: ...\nuser: ...\n\nHãy viết..."},
        {"role": "assistant", "content": "Reply"}
    ]
    
    Returns:
        (conversation_history, gold_reply)
    """
    user_msg = None
    assistant_msg = None
    
    for msg in messages:
        if msg["role"] == "user":
            user_msg = msg["content"]
        elif msg["role"] == "assistant":
            assistant_msg = msg["content"]
    
    if not user_msg or not assistant_msg:
        return None, None
    
    # Extract conversation from user message
    # Format: "Hội thoại gần nhất:\n<conversation>\n\nHãy viết..."
    lines = user_msg.split("\n")
    conversation_lines = []
    
    in_conversation = False
    for line in lines:
        if line.startswith("Hội thoại gần nhất:"):
            in_conversation = True
            continue
        if line.startswith("Hãy viết"):
            break
        if in_conversation and line.strip():
            conversation_lines.append(line.strip())
    
    conversation = "\n".join(conversation_lines)
    reply = assistant_msg.strip()
    
    return conversation, reply


def main():
    parser = argparse.ArgumentParser(description="Extract contexts for RAG from conversations")
    parser.add_argument(
        "--input",
        type=str,
        required=True,
        help="Input JSONL file (conversations_1000.jsonl)"
    )
    parser.add_argument(
        "--output",
        type=str,
        required=True,
        help="Output JSON file (contexts.json)"
    )
    parser.add_argument(
        "--n-contexts",
        type=int,
        default=None,
        help="Number of contexts to sample (default: None = use all)"
    )
    parser.add_argument(
        "--analyze",
        action="store_true",
        help="Analyze contexts without saving"
    )
    
    args = parser.parse_args()
    
    print("🚀 Extracting Contexts for RAG")
    print("=" * 80)
    
    # Load conversations
    print(f"📥 Loading conversations from: {args.input}")
    conversations = []
    with open(args.input, 'r', encoding='utf-8') as f:
        for line in f:
            if line.strip():
                conversations.append(json.loads(line))
    
    print(f"✅ Loaded {len(conversations)} conversations")
    
    # Extract contexts
    print("🔨 Extracting contexts...")
    contexts = []
    
    for conv in conversations:
        messages = conv.get("messages", [])
        metadata = conv.get("metadata", {})
        
        conversation, reply = extract_conversation_context(messages)
        
        if conversation and reply:
            # Format: conversation → reply
            context_text = f"{conversation} → {reply}"
            
            contexts.append({
                "text": context_text,
                "metadata": {
                    "stage": metadata.get("stage", "unknown"),
                    "mood": metadata.get("mood", "unknown"),
                    "directness": metadata.get("directness", "unknown"),
                    "platform": metadata.get("platform", "unknown"),
                    "xung_ho": metadata.get("xung_ho", "mình-bạn")
                }
            })
    
    print(f"✅ Extracted {len(contexts)} contexts")
    
    # Analyze
    if args.analyze:
        print("\n📊 Analysis:")
        print(f"   Total contexts: {len(contexts)}")
        
        # Sample
        print("\n📝 Sample contexts:")
        for i, ctx in enumerate(random.sample(contexts, min(5, len(contexts))), 1):
            print(f"\n{i}. {ctx['text'][:150]}...")
            print(f"   Metadata: {ctx['metadata']}")
        
        return
    
    # Sample (only if n_contexts is specified and less than total)
    if args.n_contexts and args.n_contexts < len(contexts):
        print(f"📊 Sampling {args.n_contexts} contexts...")
        contexts = random.sample(contexts, args.n_contexts)
    else:
        print(f"📊 Using all {len(contexts)} contexts (no sampling)")
    
    # Save
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(contexts, f, ensure_ascii=False, indent=2)
    
    print(f"💾 Saved {len(contexts)} contexts to: {args.output}")
    
    print("\n" + "=" * 80)
    print("✅ Extraction complete!")
    
    # Show samples
    print("\n📝 Sample contexts:")
    for i, ctx in enumerate(contexts[:3], 1):
        print(f"\n{i}. {ctx['text'][:120]}...")
        print(f"   Stage: {ctx['metadata']['stage']} | Mood: {ctx['metadata']['mood']}")
    
    print("\n📝 Next steps:")
    print("   1. Review contexts: cat", args.output, "| head -50")
    print("   2. Build RAG index: python scripts/rag/build_rag_index.py")
    print("   3. Copy to Space: cp -r rag_index/ ../socialcue-space/rag/chroma_db")


if __name__ == "__main__":
    main()
