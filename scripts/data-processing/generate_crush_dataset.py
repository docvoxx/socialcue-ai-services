#!/usr/bin/env python3
"""
Crush Context Data Factory - Ollama Edition
Auto-generate + auto-filter + dedup + export JSONL
Optimized for weak machines (no GPU needed, uses Ollama local)
"""

import argparse
import json
import os
import re
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Tuple

import requests
from tqdm import tqdm
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


# ----------------------------
# Config / Utils
# ----------------------------

STAGES = ["mở đầu", "đang nói chuyện", "rủ hẹn", "cứu vãn", "sau buổi hẹn"]
MOODS = ["cute", "playful", "mature", "confident", "shy"]
DIRECTNESS = ["low", "medium", "high"]

# Rough safety/quality regex (tùy bạn mở rộng)
BANNED_PATTERNS = [
    r"\b(nude|sex|quan hệ|chịch|địt|bú|xxx)\b",
    r"\b(gửi ảnh|ảnh nóng|clip)\b",
    r"\b(đi khách sạn|nhà nghỉ)\b",
    r"\b(tao sẽ qua liền|qua liền|đến ngay|gặp ngay)\b",
    r"\b(trả lời đi|rep đi|sao không trả lời|đừng im lặng)\b",
]

# Câu "sến/generic" thường gặp
GENERIC_PATTERNS = [
    r"\b(em xinh quá|xinh thế|đẹp quá)\b",
    r"\b(cho anh làm quen|làm quen nhé)\b",
    r"\b(nhớ em|yêu em)\b",
]

def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)

def write_jsonl(path: str, items: List[Dict[str, Any]]) -> None:
    with open(path, "a", encoding="utf-8") as f:
        for it in items:
            f.write(json.dumps(it, ensure_ascii=False) + "\n")

def read_jsonl(path: str) -> List[Dict[str, Any]]:
    if not os.path.exists(path):
        return []
    out = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                out.append(json.loads(line))
    return out

def normalize_text(s: str) -> str:
    s = s.strip().lower()
    s = re.sub(r"\s+", " ", s)
    return s

def has_banned(text: str) -> Tuple[bool, str]:
    t = normalize_text(text)
    for pat in BANNED_PATTERNS:
        if re.search(pat, t, flags=re.IGNORECASE):
            return True, pat
    return False, ""

def is_generic(text: str) -> Tuple[bool, str]:
    t = normalize_text(text)
    for pat in GENERIC_PATTERNS:
        if re.search(pat, t, flags=re.IGNORECASE):
            return True, pat
    return False, ""

def count_emojis(text: str) -> int:
    # heuristic: count common emoji ranges + some common chars
    return len(re.findall(r"[\U0001F300-\U0001FAFF\u2600-\u26FF\u2700-\u27BF]", text))

def word_count(text: str) -> int:
    return len(re.findall(r"\w+", text, flags=re.UNICODE))

def has_question_or_choice(text: str) -> bool:
    t = text.strip()
    if "?" in t:
        return True
    # choice patterns: "A hay B", "A hoặc B"
    if re.search(r"\b(hay|hoặc)\b", t, flags=re.IGNORECASE):
        return True
    return False


# ----------------------------
# Ollama client
# ----------------------------

@dataclass
class OllamaConfig:
    base_url: str = "http://localhost:11434"
    model: str = "vistral:latest"
    temperature: float = 0.9

def ollama_generate(cfg: OllamaConfig, prompt: str, max_retries: int = 3) -> str:
    url = f"{cfg.base_url}/api/generate"
    payload = {
        "model": cfg.model,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": cfg.temperature,
        },
    }
    
    last_err = None
    for _ in range(max_retries):
        try:
            r = requests.post(url, json=payload, timeout=180)
            r.raise_for_status()
            data = r.json()
            return data.get("response", "")
        except Exception as e:
            last_err = e
            time.sleep(1.5)
    
    raise RuntimeError(f"Ollama generate failed: {last_err}")


# ----------------------------
# Prompts
# ----------------------------

def build_generation_prompt(batch_size: int, seed_id_start: int) -> str:
    # Ép output JSON sạch để parse
    return f"""
Bạn là chuyên gia giao tiếp khi nói chuyện với crush (chỉ crush).

Hãy tạo {batch_size} mẫu dữ liệu hội thoại dạng JSON array. KHÔNG giải thích.

Mỗi item gồm các field:
- id: string dạng crush_XXXX (bắt đầu từ crush_{seed_id_start:04d}, tăng dần)
- stage: 1 trong {STAGES}
- mood: 1 trong {MOODS}
- directness: 1 trong {DIRECTNESS}
- conversation_history: mảng 2-4 tin nhắn, mỗi tin nhắn có role (user/crush) và text
- gold_reply: câu trả lời tốt nhất của user cho tin nhắn cuối
- candidates: mảng 3 câu trả lời khác vibe (khác cấu trúc, khác ý)
- negative_reply: 1 câu KHÔNG nên dùng (gấp gáp/sến/áp lực)
- metadata: object gồm emoji_density (0-2), risk_level (low/medium/high)

Luật bắt buộc:
- Tự nhiên như chat Messenger/Zalo
- Không sexual, không nhạy cảm
- Không gây áp lực (không "trả lời đi", "gặp ngay", "qua liền"…)
- Không sến, không khen rỗng
- Mỗi câu <= 25 từ
- gold_reply và candidates nên có câu hỏi mở hoặc gợi phản hồi (có ? hoặc "A hay B")
- Negative_reply chỉ "kỳ/áp lực/sến" nhẹ, không độc hại nặng.

Output đúng JSON array hợp lệ. Không được có markdown, không code fence.
""".strip()


def build_critic_prompt(item: Dict[str, Any]) -> str:
    # Chấm nhanh 3 điểm, để filter chất lượng (không cần model lớn)
    history = item.get("conversation_history", [])
    history_text = "\n".join([f"{m.get('role')}: {m.get('text')}" for m in history])
    gold = item.get("gold_reply", "")
    
    return f"""
Bạn là người chấm chất lượng câu chat với crush. Chỉ trả JSON object.

Chấm các điểm (1-10):
- natural: mức tự nhiên như người thật
- reply_likelihood: mức "dễ khiến crush trả lời"
- pressure: mức gây áp lực (điểm cao = áp lực cao)

Ngoài ra trả:
- notes: string ngắn (tối đa 12 từ)

Dữ liệu:
Hội thoại:
{history_text}

Câu trả lời đề xuất: {gold}

Chỉ trả JSON:
{{"natural":..,"reply_likelihood":..,"pressure":..,"notes":"..."}}
""".strip()


# ----------------------------
# Filtering / Dedup
# ----------------------------

def basic_validate(item: Dict[str, Any]) -> Tuple[bool, str]:
    # required keys
    required = ["id", "stage", "mood", "directness", "conversation_history",
                "gold_reply", "candidates", "negative_reply", "metadata"]
    for k in required:
        if k not in item:
            return False, f"missing_{k}"
    
    if item["stage"] not in STAGES:
        return False, "bad_stage"
    if item["mood"] not in MOODS:
        return False, "bad_mood"
    if item["directness"] not in DIRECTNESS:
        return False, "bad_directness"
    
    hist = item["conversation_history"]
    if not isinstance(hist, list) or not (2 <= len(hist) <= 4):
        return False, "bad_history_len"
    for m in hist:
        if m.get("role") not in ["user", "crush"]:
            return False, "bad_role"
        if not isinstance(m.get("text", ""), str) or not m["text"].strip():
            return False, "bad_history_text"
    
    gold = item["gold_reply"]
    if not isinstance(gold, str) or not gold.strip():
        return False, "bad_gold"
    if word_count(gold) > 25:
        return False, "gold_too_long"
    
    cand = item["candidates"]
    if not isinstance(cand, list) or len(cand) != 3:
        return False, "bad_candidates"
    for c in cand:
        if not isinstance(c, str) or not c.strip():
            return False, "bad_candidate_text"
        if word_count(c) > 25:
            return False, "candidate_too_long"
    
    neg = item["negative_reply"]
    if not isinstance(neg, str) or not neg.strip():
        return False, "bad_negative"
    
    # safety filters
    banned, why = has_banned(gold + " " + " ".join(cand) + " " + neg)
    if banned:
        return False, f"banned:{why}"
    
    # generic filters (gold/candidates)
    gen, why = is_generic(gold)
    if gen:
        return False, f"generic_gold:{why}"
    
    # Ensure question/choice in gold
    if not has_question_or_choice(gold):
        return False, "no_opening_question"
    
    # Emoji density check vs metadata
    emoji_density = item.get("metadata", {}).get("emoji_density", None)
    if emoji_density is not None:
        # heuristic: 0: 0 emoji, 1: 1-2 emoji, 2: 3+ emoji
        ecount = count_emojis(gold)
        if emoji_density == 0 and ecount != 0:
            return False, "emoji_density_mismatch"
        if emoji_density == 1 and not (1 <= ecount <= 2):
            return False, "emoji_density_mismatch"
        if emoji_density == 2 and ecount < 3:
            return False, "emoji_density_mismatch"
    
    return True, "ok"


def tfidf_dedup(items: List[Dict[str, Any]], sim_threshold: float = 0.92) -> List[Dict[str, Any]]:
    if len(items) <= 1:
        return items
    
    texts = []
    for it in items:
        hist = it.get("conversation_history", [])
        hist_txt = " ".join([m.get("text", "") for m in hist])
        texts.append(normalize_text(hist_txt + " " + it.get("gold_reply", "")))
    
    vec = TfidfVectorizer(min_df=1, ngram_range=(1, 2))
    X = vec.fit_transform(texts)
    sims = cosine_similarity(X)
    
    keep = []
    removed = set()
    for i in range(len(items)):
        if i in removed:
            continue
        keep.append(items[i])
        for j in range(i + 1, len(items)):
            if sims[i, j] >= sim_threshold:
                removed.add(j)
    return keep


# ----------------------------
# Main generation loop
# ----------------------------

def try_parse_json_array(text: str) -> List[Dict[str, Any]]:
    text = text.strip()
    # đôi khi model thêm rác trước/sau -> cố tìm đoạn JSON array
    start = text.find("[")
    end = text.rfind("]")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("No JSON array found")
    blob = text[start:end+1]
    return json.loads(blob)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=250, help="target number of clean items")
    ap.add_argument("--batch", type=int, default=20, help="items per generation call")
    ap.add_argument("--model", type=str, default="vistral:latest", help="ollama model name")
    ap.add_argument("--ollama", type=str, default="http://localhost:11434", help="ollama base url")
    ap.add_argument("--out_raw", type=str, default="data/raw/llm/crush_contexts_raw.jsonl")
    ap.add_argument("--out_clean", type=str, default="data/processed/llm/crush_contexts_clean.jsonl")
    ap.add_argument("--dedup_threshold", type=float, default=0.92)
    ap.add_argument("--critic", action="store_true", help="enable critic scoring (extra calls)")
    args = ap.parse_args()
    
    ensure_dir(os.path.dirname(args.out_raw))
    ensure_dir(os.path.dirname(args.out_clean))
    
    cfg = OllamaConfig(base_url=args.ollama, model=args.model, temperature=0.9)
    
    raw_items: List[Dict[str, Any]] = []
    clean_items: List[Dict[str, Any]] = []
    
    seed_id = 1
    pbar = tqdm(total=args.n, desc="Clean items")
    
    while len(clean_items) < args.n:
        prompt = build_generation_prompt(args.batch, seed_id)
        resp = ollama_generate(cfg, prompt)
        try:
            batch_items = try_parse_json_array(resp)
        except Exception:
            # nếu parse fail, bỏ lượt
            continue
        
        # bump seed_id theo batch_size dự kiến (dù có thể thiếu)
        seed_id += args.batch
        
        # validate + optional critic
        passed = []
        for it in batch_items:
            ok, reason = basic_validate(it)
            if not ok:
                continue
            
            if args.critic:
                # gọi critic để lọc quality (tốn thêm calls)
                crit = ollama_generate(cfg, build_critic_prompt(it))
                try:
                    cobj = json.loads(crit.strip()[crit.find("{"):crit.rfind("}")+1])
                    nat = float(cobj.get("natural", 0))
                    rep = float(cobj.get("reply_likelihood", 0))
                    pres = float(cobj.get("pressure", 10))
                    it["metadata"]["critic"] = cobj
                    if nat < 7 or rep < 7 or pres > 6:
                        continue
                except Exception:
                    # critic parse fail => bỏ để giữ sạch
                    continue
            
            passed.append(it)
        
        if passed:
            raw_items.extend(passed)
            write_jsonl(args.out_raw, passed)
        
        # merge into clean pool + dedup periodically
        clean_items.extend(passed)
        clean_items = tfidf_dedup(clean_items, sim_threshold=args.dedup_threshold)
        
        # update progress bar
        while pbar.n < min(len(clean_items), args.n):
            pbar.update(1)
    
    pbar.close()
    
    # final trim
    clean_items = clean_items[: args.n]
    
    # rewrite clean file (overwrite)
    with open(args.out_clean, "w", encoding="utf-8") as f:
        for it in clean_items:
            f.write(json.dumps(it, ensure_ascii=False) + "\n")
    
    print("\nDone!")
    print(f"Raw saved:   {args.out_raw} ({len(read_jsonl(args.out_raw))} lines total)")
    print(f"Clean saved: {args.out_clean} ({len(clean_items)} lines)")
    print(f"Model: {args.model} | Critic: {args.critic} | Dedup: {args.dedup_threshold}")

if __name__ == "__main__":
    main()
