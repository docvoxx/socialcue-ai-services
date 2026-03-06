@echo off
REM Prepare ALL data for 4 services (no sampling)
REM RAG + LLM + Sentiment + Ranker

echo.
echo 🚀 Preparing ALL data for 4-service pipeline
echo ==============================================
echo.

REM 1. RAG Service - Extract ALL 1000 contexts
echo 1️⃣ RAG Service: Extracting ALL contexts from conversations_1000.jsonl
python scripts\data-processing\extract_contexts_for_rag.py --input data\processed\llm\conversations_1000.jsonl --output ..\socialcue-space\rag\contexts_full.json

echo.
echo ✅ RAG: contexts_full.json created with ALL 1000 contexts
echo.

REM 2. LLM Service - Already has conversations_1000.jsonl
echo 2️⃣ LLM Service: Using conversations_1000.jsonl (already available)
echo    Location: data\processed\llm\conversations_1000.jsonl
echo    Count: 1000 conversations
echo.

REM 3. Sentiment Service - Already has sentiment_crush_dataset_500.jsonl
echo 3️⃣ Sentiment Service: Using sentiment_crush_dataset_500.jsonl (already available)
echo    Location: data\processed\llm\sentiment_crush_dataset_500.jsonl
echo    Count: 500 labeled replies
echo.

REM 4. Ranker Service - Already has ranking_labels_1000.jsonl + trained model
echo 4️⃣ Ranker Service: Using ranking_labels_1000.jsonl + trained model (already available)
echo    Data: data\processed\llm\ranking_labels_1000.jsonl
echo    Model: models\ranker_pairwise\
echo    Count: 1000 ranking labels
echo.

echo ==============================================
echo ✅ All data prepared!
echo.
echo 📊 Summary:
echo    - RAG: 1000 contexts (contexts_full.json)
echo    - LLM: 1000 conversations (conversations_1000.jsonl)
echo    - Sentiment: 500 labels (sentiment_crush_dataset_500.jsonl)
echo    - Ranker: 1000 labels + trained model
echo.
echo 📝 Next steps:
echo    1. Build RAG index: python scripts\rag\build_rag_index.py --input ..\socialcue-space\rag\contexts_full.json
echo    2. Copy to Space: xcopy /E /I rag_index ..\socialcue-space\rag\chroma_db
echo    3. Copy ranker: xcopy /E /I models\ranker_pairwise ..\socialcue-space\models\ranker
echo    4. Deploy to HF Spaces
echo.
pause
