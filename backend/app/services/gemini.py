"""Optional Gemini integration for 'quick check' questions. Fails politely without a key."""
import json

from ..config import settings

TIMEOUT = 15.0


def is_enabled() -> bool:
    return bool(settings.gemini_api_key.strip())


async def generate_question(paragraphs: list[str]) -> dict:
    """Ask Gemini for one Hebrew multiple-choice question about the given paragraphs.

    `paragraphs` is the target paragraph plus 1-2 preceding ones (fetched server-side).
    Returns {question, options[4], answer_index}. Raises on failure.
    """
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=settings.gemini_api_key)
    context = "\n\n".join(paragraphs)
    prompt = (
        "להלן קטע טקסט בעברית. כתוב שאלת רב-ברירה אחת קצרה בעברית שבודקת הבנה של הקטע, "
        "עם בדיוק 4 אפשרויות ותשובה נכונה אחת. החזר JSON בלבד במבנה: "
        '{"question": str, "options": [str, str, str, str], "answer_index": int}.\n\n'
        f"הקטע:\n{context}"
    )

    resp = await client.aio.models.generate_content(
        model=settings.gemini_model,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.4,
        ),
    )

    data = json.loads(resp.text)
    question = data.get("question")
    options = data.get("options")
    answer_index = data.get("answer_index")

    if (not isinstance(question, str) or not question
            or not isinstance(options, list) or len(options) != 4
            or not all(isinstance(o, str) and o for o in options)
            or not isinstance(answer_index, int) or not (0 <= answer_index < 4)):
        raise ValueError("Gemini returned an unexpected structure")

    return {"question": question, "options": options, "answer_index": answer_index}
