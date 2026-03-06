#!/usr/bin/env python3
"""
Build RAG Index from crush_contexts_1000.jsonl
Embed conversation_history + gold_reply + metadata → ChromaDB
"""

import json
import argparse
from pathlib import Path
from sentence_transformers import SentenceTransformer
import chromadb
from tqdm import tqdm

def load_contexts(input_file: str):
    """Load contexts from JSON or JSONL file"""
    contexts = []
    
    # Try JSON first (array format)
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
            if isinstance(data, list):
                return data
            else:
                contexts.append(data)
                return contexts
    except json.JSONDecodeError:
        # Try JSONL format
        with open(input_file, 'r', encoding='utf-8') as f:
            for line in f:
                if line.strip():
                    contexts.append(json.loads(line))
        return contexts

def build_rag_index(
    input_file: str,
    output_dir: str,
    model_name: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
    collection_name: str = "crush_contexts"
):
    """
    Build RAG index from crush contexts
    
    Args:
        input_file: Path to crush_contexts_1000.jsonl
        output_dir: Directory to save ChromaDB
        model_name: Sentence transformer model
        collection_name: ChromaDB collection name
    """
    print("🚀 Building RAG Index")
    print("=" * 80)
    
    # Load contexts
    print(f"📥 Loading contexts from: {input_file}")
    contexts = load_contexts(input_file)
    print(f"✅ Loaded {len(contexts)} contexts")
    
    # Initialize embedding model
    print(f"\n🤖 Loading embedding model: {model_name}")
    model = SentenceTransformer(model_name)
    print("✅ Model loaded")
    
    # Initialize ChromaDB
    print(f"\n💾 Initializing ChromaDB at: {output_dir}")
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    client = chromadb.PersistentClient(path=output_dir)
    
    # Delete existing collection if exists
    try:
        client.delete_collection(collection_name)
        print(f"🗑️  Deleted existing collection: {collection_name}")
    except:
        pass
    
    # Create collection
    collection = client.create_collection(
        name=collection_name,
        metadata={"description": "Crush conversation contexts for RAG"}
    )
    print(f"✅ Created collection: {collection_name}")
    
    # Prepare documents for embedding
    print(f"\n🔨 Preparing documents...")
    documents = []
    metadatas = []
    ids = []
    
    for i, ctx in enumerate(tqdm(contexts, desc="Processing")):
        # Format: conversation_history + " → " + gold_reply
        conversation = ctx.get("conversation_history", "")
        reply = ctx.get("gold_reply", "")
        
        # Create document text
        doc_text = f"{conversation} → {reply}"
        documents.append(doc_text)
        
        # Extract metadata
        metadata = {
            "conversation": conversation,
            "reply": reply,
            "stage": ctx.get("stage", "unknown"),
            "mood": ctx.get("mood", "unknown"),
            "directness": ctx.get("directness", "medium")
        }
        metadatas.append(metadata)
        ids.append(f"ctx_{i}")
    
    # Embed documents
    print(f"\n🧮 Embedding {len(documents)} documents...")
    embeddings = model.encode(
        documents,
        show_progress_bar=True,
        batch_size=32
    )
    print(f"✅ Generated embeddings: {embeddings.shape}")
    
    # Add to ChromaDB
    print(f"\n💾 Adding to ChromaDB...")
    batch_size = 100
    for i in tqdm(range(0, len(documents), batch_size), desc="Batches"):
        batch_end = min(i + batch_size, len(documents))
        collection.add(
            documents=documents[i:batch_end],
            embeddings=embeddings[i:batch_end].tolist(),
            metadatas=metadatas[i:batch_end],
            ids=ids[i:batch_end]
        )
    
    print(f"\n✅ RAG index built successfully!")
    print(f"📊 Stats:")
    print(f"   - Total contexts: {len(documents)}")
    print(f"   - Embedding dim: {embeddings.shape[1]}")
    print(f"   - Storage: {output_dir}")
    print(f"   - Collection: {collection_name}")
    
    # Test query
    print(f"\n🧪 Testing query...")
    test_query = "Crush: Hôm nay mình hơi mệt"
    test_embedding = model.encode([test_query])
    results = collection.query(
        query_embeddings=test_embedding.tolist(),
        n_results=3
    )
    
    print(f"\n📝 Test query: {test_query}")
    print(f"🔍 Top 3 results:")
    for i, doc in enumerate(results['documents'][0], 1):
        print(f"   {i}. {doc[:100]}...")
    
    print("\n" + "=" * 80)
    print("✅ RAG index ready for use!")
    print("\n📝 Next steps:")
    print("   1. Copy to Space: cp -r rag_index/ ../socialcue-space/rag/")
    print("   2. Update RAG service to use this index")
    print("   3. Test API: /v1/rag/search?q=...&k=3")

def main():
    parser = argparse.ArgumentParser(description="Build RAG index from crush contexts")
    parser.add_argument(
        "--input",
        type=str,
        default="data/processed/llm/crush_contexts_1000.jsonl",
        help="Input JSONL file"
    )
    parser.add_argument(
        "--output",
        type=str,
        default="rag_index",
        help="Output directory for ChromaDB"
    )
    parser.add_argument(
        "--model",
        type=str,
        default="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
        help="Embedding model"
    )
    parser.add_argument(
        "--collection",
        type=str,
        default="crush_contexts",
        help="Collection name"
    )
    
    args = parser.parse_args()
    
    build_rag_index(
        input_file=args.input,
        output_dir=args.output,
        model_name=args.model,
        collection_name=args.collection
    )

if __name__ == "__main__":
    main()
