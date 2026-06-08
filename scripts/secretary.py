#!/usr/bin/env python3
"""
AI Company - Secretary CLI
Ollama (qwen3:8b) を使ったローカル秘書システム
"""

import os
import sys
import json
import urllib.request
import urllib.error
from pathlib import Path

# ===== 設定 =====
OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL = "qwen3:8b"
BASE_DIR = Path(__file__).parent.parent  # ai-company/

MEMORY_FILES = [
    BASE_DIR / "memory" / "profile.md",
    BASE_DIR / "memory" / "goals.md",
    BASE_DIR / "memory" / "today.md",
]

PROMPT_FILES = {
    "personal": BASE_DIR / "prompts" / "secretaries" / "personal.md",
    "business": BASE_DIR / "prompts" / "secretaries" / "business.md",
}


# ===== ファイル読み込み =====
def load_file(path: Path) -> str:
    """ファイルを読み込む。存在しない場合は空文字を返す"""
    if path.exists():
        return path.read_text(encoding="utf-8")
    print(f"⚠️  ファイルが見つかりません: {path}")
    return ""


def load_memory() -> str:
    """memoryフォルダを自動読み込みして1つの文字列にまとめる"""
    parts = []
    for f in MEMORY_FILES:
        content = load_file(f)
        if content:
            parts.append(f"=== {f.name} ===\n{content}")
    return "\n\n".join(parts)


def build_system_prompt(secretary_type: str) -> str:
    """システムプロンプト + メモリを結合して返す"""
    prompt_path = PROMPT_FILES.get(secretary_type)
    system_prompt = load_file(prompt_path) if prompt_path else ""
    memory = load_memory()

    return f"""{system_prompt}

---
## あなたが把握しているユーザー情報（自動読み込み）

{memory}
---
"""


# ===== Ollama API =====
def ask_ollama(system_prompt: str, user_message: str) -> str:
    """Ollamaにリクエストを送り、ストリーミングで回答を表示する"""
    payload = {
        "model": MODEL,
        "prompt": f"System: {system_prompt}\n\nUser: {user_message}\n\nAssistant:",
        "stream": True,
    }

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        OLLAMA_URL,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    full_response = ""
    try:
        with urllib.request.urlopen(req, timeout=120) as response:
            print("\n", end="", flush=True)
            for line in response:
                line = line.decode("utf-8").strip()
                if not line:
                    continue
                try:
                    chunk = json.loads(line)
                    token = chunk.get("response", "")
                    print(token, end="", flush=True)
                    full_response += token
                    if chunk.get("done"):
                        break
                except json.JSONDecodeError:
                    continue
        print("\n")
    except urllib.error.URLError as e:
        print(f"\n❌ Ollamaに接続できません: {e}")
        print("   → 'ollama serve' が起動しているか確認してください")
        sys.exit(1)

    return full_response


# ===== メニュー =====
def select_secretary() -> str:
    """秘書を選択する"""
    print("\n╔══════════════════════════════╗")
    print("║      AI Company Secretary    ║")
    print("╠══════════════════════════════╣")
    print("║  1. Personal Secretary       ║")
    print("║     （個人収益・AI会社構築）  ║")
    print("║                              ║")
    print("║  2. Business Secretary       ║")
    print("║     （Crestix経営・営業）     ║")
    print("║                              ║")
    print("║  q. 終了                     ║")
    print("╚══════════════════════════════╝")
    print()

    choice = input("選択してください (1/2/q): ").strip().lower()

    if choice == "1":
        return "personal"
    elif choice == "2":
        return "business"
    elif choice in ("q", "quit", "exit"):
        print("👋 終了します")
        sys.exit(0)
    else:
        print("⚠️  1, 2, または q を入力してください")
        return select_secretary()


def chat_loop(secretary_type: str):
    """選択した秘書とのチャットループ"""
    names = {
        "personal": "Personal Secretary（個人秘書）",
        "business": "Business Secretary（会社秘書）",
    }
    name = names.get(secretary_type, secretary_type)

    print(f"\n✅ {name} を起動しました")
    print("   （終了するには 'q' または 'quit' と入力）")
    print("   （秘書を変更するには 'switch' と入力）\n")

    system_prompt = build_system_prompt(secretary_type)

    while True:
        try:
            user_input = input("あなた: ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\n👋 終了します")
            sys.exit(0)

        if not user_input:
            continue

        if user_input.lower() in ("q", "quit", "exit"):
            print("👋 終了します")
            sys.exit(0)

        if user_input.lower() == "switch":
            return  # メインループに戻る

        print(f"\n🤖 {name}:", end="")
        ask_ollama(system_prompt, user_input)


# ===== エントリーポイント =====
def main():
    # コマンドライン引数で直接起動も可能
    if len(sys.argv) > 1:
        arg = sys.argv[1].lower()
        if arg in ("personal", "p", "1"):
            chat_loop("personal")
            return
        elif arg in ("business", "b", "2"):
            chat_loop("business")
            return

    # メインループ
    while True:
        secretary = select_secretary()
        chat_loop(secretary)


if __name__ == "__main__":
    main()

