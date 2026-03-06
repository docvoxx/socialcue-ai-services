#!/usr/bin/env python3
"""
Setup RAG embeddings and vector database.

This script:
1. Loads crush contexts from training data
2. Generates embeddings using sentence-transformers
3. Stores in ChromaDB for fast retrieval

Usage:
    python setup_embeddings.py --data ../../data/processed/llm/conversations_1000.jsonl
"""

import json
import argparse
from pathlib import Path
from typing import List, Dict
from tqdm import tqdm

try:
    from sentence_transformers import SentenceTransformer
    TRANSFORMERS_AVAILABLE = True
except ImportError:
    TRANSFORMERS_AVAILABLE = False
    print("⚠️  sentence-transformers not installed. Install with: pip install sentence-transformers")

try:
    import chromadb
    from chromadb.config import Settings
    CHROMADB_AVAILABLE = True
except ImportError:
    CHROMADB_AVAILABLE = False
    print("⚠️  chromadb not installed. Install with: pip install chromadb")


def load_contexts(jsonl_path: str) -> List[Dict]:
    """Load contexts from JSONL file."""
    print(f"📥 Loading contexts from: {jsonl_path}")
    
    contexts = []
    with open(jsonl_path, 'r', encoding='utf-8') as f:
        for line in f:
            item = json.loads(line)
            
            # Extract conversation history
            messages = item.get('messages', [])
            
            # Find user message (contains history)
            history_text = ""
            reply_text = ""
            
            for msg in messages:
                if msg['role'] == 'user':
                    history_text = msg['content']
                elif msg['role'] == 'assistant':
                    reply_text = msg['content']
            
            if history_text and reply_text:
                contexts.append({
                    'id': item.get('id', f"ctx_{len(contexts)}"),
                    'history': history_text,
                    'reply': reply_text,
                    'stage': item.get('stage', 'unknown'),
                    'mood': item.get('mood', 'unknown'),
                    'directness': item.get('directness', 'unknown')
                })
    
    print(f"✅ Loaded {len(contexts)} contexts")
    return contexts


def generate_embeddings(contexts: List[Dict], 
                       model_name: str = "paraphrase-multilingual-mpnet-base-v2") -> tuple:
    """Generate embeddings for contexts."""
    print(f"\n🔧 Loading embedding model: {model_name}")
    model = SentenceTransformer(f"sentence-transformers/{model_name}")
    
    print(f"📊 Generating embeddings...")
    
    # Combine history + reply for better context
    texts = [f"{ctx['history']}\n{ctx['reply']}" for ctx in contexts]
    
    embeddings = model.encode(
        texts,
        show_progress_bar=True,
        convert_to_numpy=True
    )
    
    print(f"✅ Generated {len(embeddings)} embeddings")
    print(f"   Dimension: {embeddings.shape[1]}")
    
    return embeddings, model


def setup_chromadb(contexts: List[Dict], 
                   embeddings,
                   db_path: str = "../../data/chromadb"):
    """Setup ChromaDB with embeddings."""
    print(f"\n💾 Setting up ChromaDB at: {db_path}")
    
    # Create client
    client = chromadb.PersistentClient(
        path=db_path,
        settings=Settings(anonymized_telemetry=False)
    )
    
    # Delete existing collection if exists
    try:
        client.delete_collection("crush_contexts")
        print("   Deleted existing collection")
    except:
        pass
    
    # Create collection
    collection = client.create_collection(
        name="crush_contexts",
        metadata={"description": "Crush conversation contexts for RAG"}
    )
    
    print(f"📤 Adding {len(contexts)} contexts to ChromaDB...")
    
    # Add in batches
    batch_size = 100
    for i in tqdm(range(0, len(contexts), batch_size)):
        batch_contexts = contexts[i:i+batch_size]
        batch_embeddings = embeddings[i:i+batch_size]
        
        collection.add(
            embeddings=batch_embeddings.tolist(),
            documents=[ctx['history'] for ctx in batch_contexts],
            metadatas=[{
                'reply': ctx['reply'],
                'stage': ctx['stage'],
                'mood': ctx['mood'],
                'directness': ctx['directness']
            } for ctx in batch_contexts],
            ids=[ctx['id'] for ctx in batch_contexts]
        )
    
    print(f"✅ ChromaDB setup complete!")
    print(f"   Collection: crush_contexts")
    print(f"   Documents: {collection.count()}")
    
    return collection


def test_retrieval(collection, model: SentenceTransformer):
    """Test RAG retrieval."""
    print(f"\n🧪 Testing retrieval...")
    
    test_queries = [
        "Crush: Mình muốn đổi không khí tí\nUser: Nghe kể thú vị ghê",
        "Crush: Hôm nay mình bận quá\nUser: Nghe căng thật",
        "Crush: Bạn thích ăn cay không?\nUser: Tùy món"
    ]
    
    for i, query in enumerate(test_queries, 1):
        print(f"\n📝 Test {i}: {query[:50]}...")
        
        # Generate query embedding
        query_emb = model.encode(query)
        
        # Search
        results = collection.query(
            query_embeddings=[query_emb.tolist()],
            n_results=3
        )
        
        print(f"   Top 3 similar contexts:")
        for j, (doc, metadata, distance) in enumerate(zip(
            results['documents'][0],
            results['metadatas'][0],
            results['distances'][0]
        ), 1):
            print(f"   {j}. [{1-distance:.3f}] {doc[:60]}...")
            print(f"      Reply: {metadata['reply'][:60]}...")
            print(f"      Stage: {metadata['stage']}, Mood: {metadata['mood']}")


def save_model_info(model_name: str, output_path: str):
    """Save model configuration."""
    output_dir = Path(output_path)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    with open(output_dir / 'model_info.json', 'w') as f:
        json.dump({
            'model_name': model_name,
            'model_type': 'sentence-transformers',
            'purpose': 'RAG embeddings for crush contexts',
            'usage': {
                'load': f"SentenceTransformer('sentence-transformers/{model_name}')",
                'encode': "model.encode(text)",
                'query': "collection.query(query_embeddings=[emb], n_results=3)"
            }
        }, f, indent=2)
    
    print(f"\n💾 Model info saved to: {output_dir / 'model_info.json'}")


def main():
    parser = argparse.ArgumentParser(description="Setup RAG embeddings")
    parser.add_argument('--data', type=str, required=True,
                       help='Path to training data (JSONL)')
    parser.add_argument('--model', type=str,
                       default='paraphrase-multilingual-mpnet-base-v2',
                       help='Sentence-transformers model name')
    parser.add_argument('--db-path', type=str,
                       default='../../data/chromadb',
                       help='ChromaDB storage path')
    parser.add_argument('--output', type=str,
                       default='../../models/rag_embeddings',
                       help='Output directory for model info')
    parser.add_argument('--skip-test', action='store_true',
                       help='Skip retrieval test')
    
    args = parser.parse_args()
    
    # Check dependencies
    if not TRANSFORMERS_AVAILABLE:
        print("❌ Missing sentence-transformers!")
        print("   Install: pip install sentence-transformers")
        return
    
    if not CHROMADB_AVAILABLE:
        print("❌ Missing chromadb!")
        print("   Install: pip install chromadb")
        return
    
    print("🚀 RAG Embeddings Setup")
    print("="*80)
    
    # Load contexts
    contexts = load_contexts(args.data)
    
    # Generate embeddings
    embeddings, model = generate_embeddings(contexts, args.model)
    
    # Setup ChromaDB
    collection = setup_chromadb(contexts, embeddings, args.db_path)
    
    # Test retrieval
    if not args.skip_test:
        test_retrieval(collection, model)
    
    # Save model info
    save_model_info(args.model, args.output)
    
    print("\n" + "="*80)
    print("✅ RAG setup complete!")
    print("\n📝 Next steps:")
    print("   1. Integrate with RAG service")
    print("   2. Test retrieval in production")
    print("   3. Monitor relevance metrics")
    print("\n💡 Usage example:")
    print(f"   from sentence_transformers import SentenceTransformer")
    print(f"   import chromadb")
    print(f"   ")
    print(f"   model = SentenceTransformer('sentence-transformers/{args.model}')")
    print(f"   client = chromadb.PersistentClient(path='{args.db_path}')")
    print(f"   collection = client.get_collection('crush_contexts')")
    print(f"   ")
    print(f"   query_emb = model.encode('Your query here')")
    print(f"   results = collection.query(query_embeddings=[query_emb.tolist()], n_results=3)")


if __name__ == '__main__':
    main()
