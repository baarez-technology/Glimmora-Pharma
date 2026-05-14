# app/ai_service.py
# ─────────────────────────────────────────────────────────────
# Updated for Step 7 — customer_id passed through to DB handler
# ─────────────────────────────────────────────────────────────

from openai import OpenAI
from dotenv import load_dotenv
import os

load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


# ── Intent detection ──────────────────────────────────────────
def detect_intent(user_message: str) -> str:
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": """You are an intent classifier for a quality management system.
Reply with ONLY one of these exact words:

DB_QUERY   → user asks for counts, lists, status, or data
             (e.g. "how many CAPAs", "show open RCAs", "list action plans")

RAG_SEARCH → user asks about documents, procedures, policies, how-to
             (e.g. "what is closure process", "how do I fill a CAPA",
              "explain effectiveness check", "what is severity")

GENERAL    → anything else

Reply with ONLY the one word.""",
            },
            {"role": "user", "content": user_message},
        ],
        temperature=0,
    )
    intent = response.choices[0].message.content.strip()
    if intent not in ["DB_QUERY", "RAG_SEARCH", "GENERAL"]:
        intent = "GENERAL"
    return intent


# ── General chat ──────────────────────────────────────────────
def general_chat(user_message: str, chat_history: list = []) -> str:
    messages = [
        {
            "role": "system",
            "content": """You are a helpful assistant for Glimmora quality management system.
You help users with CAPA, RCA, Action Plans, Monitoring, Effectiveness, and Closure.
Be concise, friendly, and professional.""",
        }
    ]
    messages.extend(chat_history)
    messages.append({"role": "user", "content": user_message})
    response = client.chat.completions.create(
        model="gpt-4o-mini", messages=messages, temperature=0.7
    )
    return response.choices[0].message.content


# ── Format raw DB result → natural language ───────────────────
def format_db_result(raw_data: str, original_question: str) -> str:
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": "Convert raw database results into clear, friendly sentences. Be concise.",
            },
            {
                "role": "user",
                "content": f"Question: {original_question}\nData: {raw_data}\n\nWrite one friendly sentence answering the question using this data.",
            },
        ],
        temperature=0.3,
    )
    return response.choices[0].message.content


# ── Context resolver ──────────────────────────────────────────
# Rewrites a follow-up question that depends on prior turns into a
# self-contained one, so the intent classifier and DB / RAG handlers
# (which don't see chat_history) can route it correctly. Without this,
# voice-style follow-ups like "how many got by that time?" lose all
# context and get answered with the generic "which module?" intro.
def resolve_with_context(user_message: str, chat_history: list) -> str:
    if not chat_history:
        return user_message
    # Only pull recent turns so the prompt stays small.
    recent = chat_history[-8:]
    transcript = "\n".join(
        f"{m.get('role', 'user')}: {m.get('content', '')}" for m in recent
    )
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    "You rewrite a user's latest message to be self-contained, "
                    "using the prior conversation only when the latest message is "
                    "ambiguous, vague, or refers to something earlier (it/that/those, "
                    "or missing the noun). Return ONLY the rewritten message — no "
                    "preface, no quotes, no explanation. If the latest message is "
                    "already self-contained, return it unchanged."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Conversation so far:\n{transcript}\n\n"
                    f"Latest message:\n{user_message}\n\n"
                    "Rewritten message:"
                ),
            },
        ],
        temperature=0,
    )
    rewritten = response.choices[0].message.content.strip()
    # Strip any wrapping quotes the model might add.
    if (rewritten.startswith('"') and rewritten.endswith('"')) or (
        rewritten.startswith("'") and rewritten.endswith("'")
    ):
        rewritten = rewritten[1:-1].strip()
    if not rewritten:
        return user_message
    if rewritten.lower() != user_message.lower():
        print(f"[AI] Context-resolved: {user_message!r} → {rewritten!r}")
    return rewritten


# ── Main chat entry point ─────────────────────────────────────
def chat(
    user_message: str,
    db=None,
    chat_history: list = [],
    customer_id: str = None,       # ✅ NEW — received from ai_router
) -> str:
    # Resolve vague follow-ups against history before routing. The DB query
    # and RAG handlers don't see chat_history themselves, so this is the
    # one place we can fold context in for them.
    resolved = resolve_with_context(user_message, chat_history)
    intent = detect_intent(resolved)
    print(f"[AI] Intent: {intent} | Customer: {customer_id}")

    if intent == "DB_QUERY":
        if db is None:
            return "I need database access to answer that. Please try again."
        from app.ai_db_handler import handle_db_query
        raw_result = handle_db_query(resolved, db, customer_id)
        return format_db_result(raw_result, resolved)

    elif intent == "RAG_SEARCH":
        from app.rag.rag_service import rag_search
        return rag_search(resolved)

    else:
        # general_chat keeps the original message + history so the model
        # sees the conversation as it actually happened.
        return general_chat(user_message, chat_history)