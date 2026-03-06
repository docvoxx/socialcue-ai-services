#!/bin/bash
# Quick start script for ranking model training and evaluation

set -e

echo "🚀 SocialCue Ranking System - Quick Start"
echo "=========================================="

# Check if data exists
DATA_FILE="../../data/processed/llm/ranking_labels_1000.jsonl"
if [ ! -f "$DATA_FILE" ]; then
    echo "❌ Data file not found: $DATA_FILE"
    echo "   Please ensure ranking_labels_1000.jsonl exists"
    exit 1
fi

echo "✅ Data file found: $DATA_FILE"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
pip install -q -r requirements.txt
echo "✅ Dependencies installed"

# Train pairwise model
echo ""
echo "🔥 Training pairwise ranking model..."
python train_ranker.py \
    --approach pairwise \
    --data "$DATA_FILE" \
    --epochs 3 \
    --batch-size 16 \
    --output ../../models/ranker_pairwise

# Train triplet model
echo ""
echo "🔥 Training triplet ranking model..."
python train_ranker.py \
    --approach triplet \
    --data "$DATA_FILE" \
    --epochs 3 \
    --batch-size 16 \
    --output ../../models/ranker_triplet

# Benchmark all approaches
echo ""
echo "📊 Benchmarking all ranking approaches..."
python benchmark_rankers.py \
    --data "$DATA_FILE" \
    --models ../../models/ranker_pairwise ../../models/ranker_triplet

echo ""
echo "✅ Done! Check results/benchmark_results.json for detailed metrics"
echo ""
echo "🎯 Next steps:"
echo "   1. Review benchmark results"
echo "   2. Choose best model for production"
echo "   3. Integrate with API (see README.md)"
