#!/usr/bin/env python3
"""
Fine-tune Qwen2.5:3b with Ollama for SocialCue crush conversations.

This script creates a custom Ollama model with:
1. System prompt optimized for crush conversations
2. Few-shot examples from training data
3. Custom parameters for natural responses

Usage:
    python finetune_ollama_local.py --data ../../data/processed/llm/conversations_1000.jsonl --samples 50
"""

import json
import argparse
import subprocess
import random
from pathlib import Path
from typing import List, Dict

def load_conversations(file_path: str, num_samples: int = 50) -> List[Dict]:
    """Load and sample conversations from JSONL file."""
    conversations = []
    with open(file_path, 'r', encoding='utf-8') as f:
        for line in f:
            conversations.append(json.loads(line))
    
    # Sample diverse conversations
    if len(conversations) > num_samples:
        conversations = random.sample(conversations, num_samples)
    
    return conversations

def create_modelfile(conversations: List[Dict], output_path: str = "Modelfile.socialcue"):
    """Create Ollama Modelfile with system prompt and examples."""
    
    # Extract system prompt from first conversation
    system_prompt = conversations[0]['messages'][0]['content']
    
    # Create few-shot examples (use 10 best examples)
    examples = []
    for conv in conversations[:10]:
        messages = conv['messages']
        if len(messages) >= 3:  # system + user + assistant
            user_msg = messages[1]['content']
            assistant_msg = messages[2]['content']
            examples.append(f"User: {user_msg}\nAssistant: {assistant_msg}")
    
    examples_text = "\n\n".join(examples)
    
    # Create Modelfile content
    modelfile_content = f"""# SocialCue Crush Conversation Model
# Fine-tuned from qwen2.5:3b

FROM qwen2.5:3b

# Set parameters for natural, conversational responses
PARAMETER temperature 0.8
PARAMETER top_p 0.9
PARAMETER top_k 40
PARAMETER repeat_penalty 1.1
PARAMETER num_ctx 4096

# System prompt
SYSTEM \"\"\"
{system_prompt}

Dưới đây là một số ví dụ về cách trả lời tốt:

{examples_text}

Hãy học theo phong cách này: tự nhiên, thân thiện, không gây áp lực, và phù hợp với ngữ cảnh.
\"\"\"

# Template for chat format
TEMPLATE \"\"\"
{{{{ if .System }}}}<|im_start|>system
{{{{ .System }}}}<|im_end|>
{{{{ end }}}}{{{{ if .Prompt }}}}<|im_start|>user
{{{{ .Prompt }}}}<|im_end|>
{{{{ end }}}}<|im_start|>assistant
{{{{ .Response }}}}<|im_end|>
\"\"\"
"""
    
    # Write Modelfile
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(modelfile_content)
    
    print(f"✅ Created Modelfile: {output_path}")
    return output_path

def create_ollama_model(modelfile_path: str, model_name: str = "socialcue-crush"):
    """Create custom Ollama model from Modelfile."""
    try:
        print(f"\n🔨 Creating Ollama model: {model_name}")
        print("This may take a few minutes...")
        
        result = subprocess.run(
            ["ollama", "create", model_name, "-f", modelfile_path],
            capture_output=True,
            text=True,
            check=True
        )
        
        print(f"✅ Model created successfully: {model_name}")
        print(result.stdout)
        return True
        
    except subprocess.CalledProcessError as e:
        print(f"❌ Error creating model: {e}")
        print(e.stderr)
        return False
    except FileNotFoundError:
        print("❌ Ollama not found. Please install Ollama first:")
        print("   curl -fsSL https://ollama.com/install.sh | sh")
        return False

def test_model(model_name: str = "socialcue-crush"):
    """Test the fine-tuned model with a sample conversation."""
    test_prompt = """Crush: Mình muốn đổi không khí tí
User: Nghe kể thú vị ghê"""
    
    print(f"\n🧪 Testing model: {model_name}")
    print(f"Input: {test_prompt}")
    print("\nGenerating response...")
    
    try:
        result = subprocess.run(
            ["ollama", "run", model_name, test_prompt],
            capture_output=True,
            text=True,
            check=True,
            timeout=30
        )
        
        print(f"\n✅ Response:\n{result.stdout}")
        return True
        
    except subprocess.TimeoutExpired:
        print("⏱️ Request timed out")
        return False
    except Exception as e:
        print(f"❌ Error testing model: {e}")
        return False

def main():
    parser = argparse.ArgumentParser(description="Fine-tune Qwen2.5:3b with Ollama")
    parser.add_argument(
        "--data",
        type=str,
        default="../../data/processed/llm/conversations_1000.jsonl",
        help="Path to conversations JSONL file"
    )
    parser.add_argument(
        "--samples",
        type=int,
        default=50,
        help="Number of sample conversations to include in Modelfile"
    )
    parser.add_argument(
        "--model-name",
        type=str,
        default="socialcue-crush",
        help="Name for the custom Ollama model"
    )
    parser.add_argument(
        "--test",
        action="store_true",
        help="Test the model after creation"
    )
    
    args = parser.parse_args()
    
    print("🎓 SocialCue Ollama Fine-tuning")
    print("=" * 50)
    
    # Check if base model exists
    print("\n1️⃣ Checking base model (qwen2.5:3b)...")
    try:
        result = subprocess.run(
            ["ollama", "list"],
            capture_output=True,
            text=True,
            check=True
        )
        if "qwen2.5:3b" not in result.stdout:
            print("⚠️ Base model not found. Pulling qwen2.5:3b...")
            subprocess.run(["ollama", "pull", "qwen2.5:3b"], check=True)
        else:
            print("✅ Base model found")
    except Exception as e:
        print(f"❌ Error checking base model: {e}")
        return
    
    # Load conversations
    print(f"\n2️⃣ Loading conversations from {args.data}...")
    conversations = load_conversations(args.data, args.samples)
    print(f"✅ Loaded {len(conversations)} conversations")
    
    # Create Modelfile
    print("\n3️⃣ Creating Modelfile...")
    modelfile_path = create_modelfile(conversations)
    
    # Create Ollama model
    print("\n4️⃣ Creating custom Ollama model...")
    success = create_ollama_model(modelfile_path, args.model_name)
    
    if not success:
        print("\n❌ Failed to create model")
        return
    
    # Test model
    if args.test:
        test_model(args.model_name)
    
    print("\n" + "=" * 50)
    print("✅ Fine-tuning complete!")
    print(f"\n📝 Usage:")
    print(f"   ollama run {args.model_name}")
    print(f"\n🔧 API endpoint:")
    print(f"   curl http://localhost:11434/api/chat -d '{{")
    print(f'     "model": "{args.model_name}",')
    print(f'     "messages": [')
    print(f'       {{"role": "user", "content": "Crush: Hôm nay mình hơi mệt\\nUser: Vậy à"}}')
    print(f'     ]')
    print(f"   }}'")
    print(f"\n💾 Modelfile saved: {modelfile_path}")

if __name__ == "__main__":
    main()
