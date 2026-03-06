#!/usr/bin/env python3
"""
Fine-tune Qwen model using Qwen API.

This is the EASIEST and RECOMMENDED approach for fine-tuning.
No GPU needed, production-ready, ~$10-20 for 1000 examples.

Usage:
    python finetune_qwen_api.py --data ../../data/processed/llm/conversations_1000.jsonl
"""

import json
import argparse
import time
from pathlib import Path
from typing import List, Dict

try:
    from openai import OpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False
    print("⚠️  openai not installed. Install with: pip install openai")


def validate_data(jsonl_path: str) -> bool:
    """Validate training data format."""
    print(f"📋 Validating data: {jsonl_path}")
    
    with open(jsonl_path, 'r', encoding='utf-8') as f:
        for i, line in enumerate(f, 1):
            try:
                item = json.loads(line)
                
                # Check required fields
                assert 'messages' in item, f"Line {i}: Missing 'messages' field"
                assert isinstance(item['messages'], list), f"Line {i}: 'messages' must be list"
                assert len(item['messages']) >= 2, f"Line {i}: Need at least 2 messages"
                
                # Check message format
                for msg in item['messages']:
                    assert 'role' in msg, f"Line {i}: Message missing 'role'"
                    assert 'content' in msg, f"Line {i}: Message missing 'content'"
                    assert msg['role'] in ['system', 'user', 'assistant'], \
                        f"Line {i}: Invalid role '{msg['role']}'"
                
            except json.JSONDecodeError:
                print(f"❌ Line {i}: Invalid JSON")
                return False
            except AssertionError as e:
                print(f"❌ {e}")
                return False
    
    print(f"✅ Data validation passed!")
    return True


def upload_training_file(client: OpenAI, file_path: str) -> str:
    """Upload training file to Qwen."""
    print(f"\n📤 Uploading training file...")
    
    with open(file_path, 'rb') as f:
        response = client.files.create(
            file=f,
            purpose='fine-tune'
        )
    
    file_id = response.id
    print(f"✅ File uploaded: {file_id}")
    
    return file_id


def create_finetune_job(client: OpenAI, 
                       file_id: str,
                       model: str = "qwen-turbo",
                       epochs: int = 3,
                       batch_size: int = 4,
                       learning_rate: float = 5e-5) -> str:
    """Create fine-tuning job."""
    print(f"\n🔥 Creating fine-tune job...")
    print(f"   Model: {model}")
    print(f"   Epochs: {epochs}")
    print(f"   Batch size: {batch_size}")
    print(f"   Learning rate: {learning_rate}")
    
    job = client.fine_tuning.jobs.create(
        training_file=file_id,
        model=model,
        hyperparameters={
            "n_epochs": epochs,
            "batch_size": batch_size,
            "learning_rate": learning_rate
        }
    )
    
    job_id = job.id
    print(f"✅ Fine-tune job created: {job_id}")
    
    return job_id


def monitor_job(client: OpenAI, job_id: str):
    """Monitor fine-tuning job progress."""
    print(f"\n📊 Monitoring job: {job_id}")
    print("   (This may take 10-30 minutes...)")
    
    while True:
        job = client.fine_tuning.jobs.retrieve(job_id)
        status = job.status
        
        print(f"\r   Status: {status}", end='', flush=True)
        
        if status == 'succeeded':
            print(f"\n✅ Fine-tuning completed!")
            print(f"   Model: {job.fine_tuned_model}")
            return job.fine_tuned_model
        
        elif status == 'failed':
            print(f"\n❌ Fine-tuning failed!")
            print(f"   Error: {job.error}")
            return None
        
        elif status in ['cancelled', 'expired']:
            print(f"\n⚠️  Job {status}")
            return None
        
        # Wait before checking again
        time.sleep(30)


def test_finetuned_model(client: OpenAI, model_id: str):
    """Test the fine-tuned model."""
    print(f"\n🧪 Testing fine-tuned model...")
    
    test_messages = [
        {
            "role": "system",
            "content": "Bạn là chuyên gia giao tiếp khi nói chuyện với crush."
        },
        {
            "role": "user",
            "content": "Crush: Mình muốn đổi không khí tí\nUser: Nghe kể thú vị ghê\nCrush: Haha vậy hả"
        }
    ]
    
    response = client.chat.completions.create(
        model=model_id,
        messages=test_messages,
        max_tokens=100,
        temperature=0.8
    )
    
    reply = response.choices[0].message.content
    print(f"\n💬 Test reply:")
    print(f"   {reply}")
    
    return reply


def main():
    parser = argparse.ArgumentParser(description="Fine-tune Qwen model")
    parser.add_argument('--data', type=str, required=True,
                       help='Path to training data (JSONL)')
    parser.add_argument('--api-key', type=str,
                       help='Qwen API key (or set DASHSCOPE_API_KEY env var)')
    parser.add_argument('--model', type=str, default='qwen-turbo',
                       choices=['qwen-turbo', 'qwen-plus', 'qwen-max'],
                       help='Base model to fine-tune')
    parser.add_argument('--epochs', type=int, default=3,
                       help='Number of training epochs')
    parser.add_argument('--batch-size', type=int, default=4,
                       help='Training batch size')
    parser.add_argument('--learning-rate', type=float, default=5e-5,
                       help='Learning rate')
    parser.add_argument('--skip-validation', action='store_true',
                       help='Skip data validation')
    parser.add_argument('--no-monitor', action='store_true',
                       help='Don\'t wait for job completion')
    
    args = parser.parse_args()
    
    # Check dependencies
    if not OPENAI_AVAILABLE:
        print("❌ Missing dependencies!")
        print("   Install: pip install openai")
        return
    
    # Validate data
    if not args.skip_validation:
        if not validate_data(args.data):
            print("❌ Data validation failed!")
            return
    
    # Initialize client
    print(f"\n🔧 Initializing Qwen client...")
    
    import os
    api_key = args.api_key or os.getenv('DASHSCOPE_API_KEY')
    
    if not api_key:
        print("❌ API key not provided!")
        print("   Set DASHSCOPE_API_KEY env var or use --api-key")
        print("   Get API key: https://dashscope.console.aliyun.com/")
        return
    
    client = OpenAI(
        api_key=api_key,
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1"
    )
    
    print("✅ Client initialized")
    
    # Upload file
    file_id = upload_training_file(client, args.data)
    
    # Create job
    job_id = create_finetune_job(
        client,
        file_id,
        model=args.model,
        epochs=args.epochs,
        batch_size=args.batch_size,
        learning_rate=args.learning_rate
    )
    
    # Monitor job
    if not args.no_monitor:
        model_id = monitor_job(client, job_id)
        
        if model_id:
            # Test model
            test_finetuned_model(client, model_id)
            
            # Save model info
            output_path = Path('models/llm_finetuned')
            output_path.mkdir(parents=True, exist_ok=True)
            
            with open(output_path / 'model_info.json', 'w') as f:
                json.dump({
                    'model_id': model_id,
                    'base_model': args.model,
                    'job_id': job_id,
                    'file_id': file_id,
                    'hyperparameters': {
                        'epochs': args.epochs,
                        'batch_size': args.batch_size,
                        'learning_rate': args.learning_rate
                    }
                }, f, indent=2)
            
            print(f"\n💾 Model info saved to: {output_path / 'model_info.json'}")
            print(f"\n🎉 Fine-tuning complete!")
            print(f"\n📝 To use the model:")
            print(f"   model_id = '{model_id}'")
            print(f"   response = client.chat.completions.create(")
            print(f"       model=model_id,")
            print(f"       messages=[...]")
            print(f"   )")
    else:
        print(f"\n⏭️  Skipping monitoring")
        print(f"   Check job status: {job_id}")
        print(f"   https://dashscope.console.aliyun.com/")


if __name__ == '__main__':
    main()
