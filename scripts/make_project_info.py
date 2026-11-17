"""Builds submission/PROJECT_INFO.docx.

Only the PDF of the course template was available, so this script recreates its exact structure:
title, the intro bullets, 7 sections, each a 3-column table (שדה / הסבר / התשובה שלכם) with every
field in the original order and wording. Only the last column is "ours".
If you get the original PROJECT_INFO.docx, run:  python scripts/make_project_info.py --template path.docx
and the answers are written into its last column instead (field names/rows untouched).

Run (no local python-docx needed):
  docker run --rm -v "$PWD:/w" -w /w python:3.12-slim sh -c "pip install -q python-docx==1.2.0 && python scripts/make_project_info.py"
"""
import argparse
import re
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt, RGBColor

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "submission" / "PROJECT_INFO.docx"

TITLE = "מטלה 3 — קובץ מידע על הפרויקט (PROJECT_INFO)"
HEADER = "Google | Reichman University | AI Tech School · Power Tech 2026"
INTRO = "מלאו את הטבלאות בעמודה האחרונה. הקובץ עוזר לסוכן הבודק ולנו להכיר את האתר שלכם לפני שנכנסים אליו."
BULLETS = [
    "מלאו כל שורה. מה שלא רלוונטי, כתבו none. אפשר לכתוב בעברית או באנגלית.",
    "אל תשנו את שמות השדות ואל תמחקו שורות.",
    "אל תכתבו כאן סיסמאות, מפתחות (Gemini, MongoDB ועוד) או כתובות התחברות למסד הנתונים.",
    "אם משהו כאן סותר את מה שמוצג באתר, מה שמוצג באתר קובע.",
    "כתבו בכנות מה עובד חלקית או חסר. זה נלקח בחשבון בבדיקה ויחסוך בלבול.",
]
SECURITY_NOTE = ("הסעיף הזה מקבל ניקוד (בונוס אבטחה). כתבו תשובות קונקרטיות: שמות של אלגוריתמים, ספריות וערכים. "
                 "תשובה כללית כמו \"השתמשנו באבטחה\" לא תזכה בנקודות. אנחנו גם בודקים דרך הדפדפן את מה שאפשר, "
                 "למשל גישה לפריט של משתמש אחר.")
OUTRO = "תודה! הקובץ הזה נקרא לפני כל בדיקה, ולכן שווה למלא אותו בקפידה."

YT = "https://www.youtube.com/watch?v=aircAruvnKk"

# (section title, [(field, hebrew label, explanation, answer)])
SECTIONS = [
    ("פרטים כלליים", [
        ("project_name", "שם הפרויקט", "", "Rewind – לא מפספסים אף רגע"),
        ("authors", "המגישים", "אימייל grunitech של כל מגיש, מופרדים בפסיק, בלי רווחים",
         "TODO_USER"),
        ("one_sentence_description", "תיאור במשפט", "מה האתר עושה, במשפט אחד",
         "אתר לימוד שמודד ריכוז דרך המצלמה בזמן צפייה בסרטון או קריאת טקסט, מסמן את הקטעים שהוחמצו כ'חוב קשב', "
         "ומאפשר לצפות שוב רק בהם במעבר שני עד שהחוב נסגר."),
    ]),
    ("תוכן", [
        ("main_content_type", "סוג התוכן העיקרי",
         "למשל: video / text / web page / pdf / אחר. הסוג שבו תרצו שנבדוק קודם", "video (YouTube)"),
        ("what_is_a_content_item", "מהו פריט תוכן",
         "למשל: סרטון YouTube עם כותרת. מאמר שהמשתמש מדביק. קישור לדף אינטרנט. ציינו גם סוגים נוספים שנתמכים",
         "סרטון YouTube: כותרת + קישור (כל צורות הקישור: watch?v=, youtu.be, shorts, embed). נתמכים גם: "
         "(2) 'טקסט להדבקה': כותרת + טקסט ארוך, שורה ריקה = פסקה חדשה; (3) 'דף אינטרנט (קישור)': כותרת + קישור, "
         "השרת שולף את הטקסט של הדף ומציג אותו בתצוגת קריאה. בוחרים את הסוג בכפתורי הבחירה בטופס 'הוספת פריט לספרייה'."),
        ("sample_content_type", "סוג תוכן הדוגמה", "הסוג של תוכן הדוגמה שלהלן", "video"),
        ("sample_content_for_testing", "תוכן לדוגמה לבדיקה",
         "קישור קצר שעובד באתר שלכם (YouTube או דף אינטרנט), או טקסט קצר. הסוכן יוסיף אותו כדי לבדוק",
         f"{YT}  (כותרת לדוגמה: \"רשתות נוירונים בקצרה\")"),
        ("interface_language", "שפת הממשק", "hebrew / english / both", "hebrew"),
    ]),
    ("טכנולוגיה", [
        ("backend_framework", "טכנולוגיית שרת", "למשל FastAPI",
         "FastAPI (Python 3.12) + Uvicorn, עם PyMongo Async. תיעוד אינטראקטיבי: http://localhost:8000/docs"),
        ("frontend_framework", "טכנולוגיית לקוח", "למשל React + Vite",
         "React 18 + Vite (JavaScript), מוגש כקבצים סטטיים ב-nginx שגם מעביר את /api לשרת (reverse proxy)"),
        ("database", "מסד נתונים", "למשל MongoDB, כקונטיינר ב-Compose",
         "MongoDB 7 (התמונה הרשמית mongo:7), קונטיינר שלישי ב-Compose עם volume בשם mongo_data. הפורט 27017 לא חשוף החוצה"),
        ("what_is_measured", "מה נמדד",
         "מה האתר מודד על המשתמש: קשב (מודל הקשב המומלץ) או משהו אחר? אם אחר: מה, באיזה טווח ערכים, ואיך מפרשים את הציון",
         "קשב (attention), ציון בין 0 ל-1. מ-0.70 ומעלה = מרוכזת (ירוק), 0.40–0.70 = ביניים (כתום), מתחת ל-0.40 = קשב נמוך "
         "(אדום). ההתראה משתמשת בסף אישי אחרי כיול של 30 שניות (ראו low_focus_reaction). ליד המספר מוצגת גם רמה מילולית מתוך 5: לא מול המצלמה / לא מרוכזת / ריכוז חלש / מרוכזת / מרוכזת מאוד."),
        ("models_used", "המודלים שבשימוש",
         "אילו מודלים רצים אצלכם (מוכנים או שלכם), אחד או כמה, ואיפה (שרת, דפדפן או שניהם). לא חשוב איזה בחרתם, רק שזה עובד",
         "בדפדפן בלבד: MediaPipe FaceLandmarker (478 נקודות, 10 פריימים לשנייה) + מודל הקשב v4_7 (GRU + Attention) "
         "דרך onnxruntime-web (WASM), על חלון נע של 100 פריימים, פעם ב-2 שניות. בשרת לא רץ שום מודל. בחרנו v4_7 ולא "
         "v4_2 אחרי השוואה שלנו של כל 9 המודלים על אותם סרטוני בדיקה: v4_2 החזיר כמעט אותו ציון (≈0.13–0.2) לכל אדם, "
         "ו-v4_7 (אותה ארכיטקטורה, אימון אחר) הבחין בין מי שמביט למצלמה (≈0.7) למי שמסתכל סביב (≈0.5)."),
        ("model_highlights", "מה מיוחד במודל אצלכם",
         "מה אתם גאים בו בשימוש במודל: שילוב מודלים, שיפור, חוויית משתמש. אפשר להתפאר",
         "(1) השוואה מדודה של 9 המודלים וניסוי חיתוך/מרכוז פנים (סקריפטים בפרויקט), שבעקבותיה נבחר v4_7. "
         "(2) התערבות חכמה: החלקת EMA (alpha 0.6) + כיול אישי (חציון 30 השניות הראשונות; קשב נמוך = מוחלק מתחת ל-max(0.40, רמה רגילה פחות 0.15)) "
         "+ היסטרזיס של 0.10 מעל הסף + cooldown של 45 שניות. בנוסף, היוריסטיקה של תנוחת ראש ועיניים מאותן 478 נקודות (בלי מודל נוסף): "
         "מבט הצידה, למטה או עיניים עצומות יותר מ-4 שניות מפעילים מיד מצב קשב נמוך, כי מדדנו ש-v4_7 לא מוריד ציון לראש מסובב "
         "(0.79 לפנים מסובבות 40° לעומת 0.70 מול המצלמה). אין פנים יותר מ-5 שניות נכנס לחוב הקשב. "
         "(3) שימוש בכל 3 הפלטים: ציון, סיווג ל-5 רמות ומשקלי Attention (גרף 'מה המודל ראה' בעמוד הסשן). "
         "(4) 'חוב קשב': הקטעים שבהם הקשב היה נמוך מסומנים על 'סרט הקשב' מתחת לסרטון, ויש כפתור 'חזרה לרגע שהחמצת'. "
         "(5) 'מעבר שני': מנגן רק את הקטעים שהוחמצו, והשרת מחשב אילו קטעים נסגרו (ממוצע ≥ 0.50). "
         "(6) מפת חום על פסקאות בתוכן טקסט. (7) MediaPipe רץ ב-CPU כי מדדנו ש-GPU במכונה בלי כרטיס גרפי נותן 1 פריים בשנייה במקום 10."),
        ("changes_to_recommended_api", "שינויים ב-API המומלץ", "אם שיניתם נתיבים או שדות מהמומלץ, מה שונה בקצרה. אחרת none",
         "כל הנתיבים המומלצים קיימים בשמות ובסטטוסים שלהם. תוספות: readings מקבל גם שדות רשות smoothed, level, attention_peak; "
         "וגם low, threshold ו-looking_away (ההחלטה של הלקוח לפי הסף האישי ומבט הצידה, שממנה השרת בונה את החוב); "
         "POST /api/sessions מקבל גם mode (watch/review) ו-review_of (למעבר שני); /end מחזיר גם missed_segments, debt_seconds, debt_unit "
         "(ובמעבר שני גם segments_closed ו-debt_remaining); נתיבים חדשים: GET /api/content/{id}/debt, PATCH /api/content/{id} "
         "(משך הסרטון), POST /api/sessions/{id}/segments/{idx}/watched, POST /api/sessions/{id}/no-face (קטע בלי פנים מעל 5 שניות), GET /api/analytics/overview, GET /api/ai/status, "
         "POST /api/ai/check-question. login יכול להחזיר גם 429 (הגבלת ניסיונות). שגיאות 422 מחזירות detail כמחרוזת בעברית + errors."),
    ]),
    ("שימוש באתר", [
        ("how_to_register", "איך נרשמים", "איפה מתחילים ומה ממלאים, בכמה מילים",
         "בכניסה לאתר (http://localhost:3000) לוחצים 'הרשמה' בתפריט העליון (או 'אין לך חשבון? להרשמה'), ממלאים "
         "'אימייל', 'סיסמה' (לפחות 8 תווים, לפחות אות אחת ולפחות ספרה אחת, עם סימון ✓ חי לכל כלל) ו'שם תצוגה', ולוחצים 'הרשמה'. "
         "אחר כך עוברים למסך ההתחברות עם האימייל כבר ממולא, ממלאים סיסמה ולוחצים 'כניסה'."),
        ("what_is_a_session", "מהו סשן אצלכם",
         "אם הסשן אצלכם שונה ממה שמתואר במטלה (פעם אחת של צפייה או קריאה בפריט תוכן), תארו מהו סשן אצלכם ומתי הוא מתחיל ונגמר. אם זהה, כתבו same",
         "same. (תוספת: אחרי סשן עם חוב קשב אפשר לפתוח 'מעבר שני', שהוא סשן נוסף מסוג review שמנגן רק את הקטעים שהוחמצו. "
         "הסשן הרגיל נשמר בהיסטוריה גם בלי מעבר שני.)"),
        ("how_to_start_a_session", "איך מתחילים סשן", "אילו מסכים וכפתורים עוברים עד שמתחיל סשן",
         "'הספרייה שלי' ← בטופס 'הוספת פריט לספרייה' ממלאים 'כותרת', משאירים 'סרטון YouTube', מדביקים קישור בשדה "
         "'קישור לסרטון YouTube' ולוחצים 'הוספה לספרייה' ← בכרטיס הפריט לוחצים 'פתיחה' ← בפאנל משמאל 'שלב 1': לוחצים "
         "'התחלת סשן' ← 'שלב 2: הפעלת מצלמה': בוחרים מצלמה (אם יש כמה) ולוחצים 'הפעלת מצלמה' ← הסרטון מתחיל להתנגן והמדידה רצה."),
        ("camera_notes", "המצלמה", "איך המצלמה נבחרת (ברירת מחדל או בחירה), הסבר על הסכמה, כל דבר חריג",
         "ברירת המחדל היא המצלמה הראשונה שהדפדפן מזהה, ויש רשימה 'בחירת מצלמה' לבחירת מצלמה אחרת (כולל וירטואלית/OBS; "
         "שמות המצלמות מופיעים אחרי האישור הראשון). המצלמה נדלקת רק אחרי לחיצה על 'הפעלת מצלמה' ואישור הדפדפן, עם הסבר "
         "שהווידאו לא יוצא מהמחשב. בסירוב מוצגת הודעה ברורה, הסשן ממשיך בלי מדידה, ויש 'ניסיון חוזר'. יש גם 'המשך בלי מצלמה'. "
         "מבוקשת רזולוציה 640×480 כ-ideal בלבד, כך שמצלמה וירטואלית לא נדחית. כשהלשונית לא פעילה המדידה מושהית."),
        ("where_the_score_appears", "איפה מופיע הציון", "באיזה מסך ובאיזו צורה (מספר, פס, צבע)",
         "במסך הצפייה (/content/...), בפאנל השמאלי, בכרטיס 'ציון הריכוז שלך': מספר גדול 0.00–1.00 (הציון האחרון מהמודל), "
         "רמה מילולית מתחתיו, פס צבעוני (ירוק/כתום/אדום) ושורה 'מתעדכן כל 2 שניות · 0 = לא מרוכזת, 1 = מרוכזת מאוד' "
         "וגם 'ציון מוחלק'. מתחת: כרטיס 'חוב קשב'. מתחת לסרטון: 'סרט הקשב' עם משבצת צבעונית לכל מדידה. "
         "לפני הציון הראשון: 'אוספת נתונים... הציון הראשון יופיע בעוד כ-X שניות' עם פס התקדמות."),
        ("seconds_until_first_score", "שניות עד הציון הראשון", "בערך, בשניות",
         "כ-11–12 שניות מהלחיצה על 'הפעלת מצלמה' (חלון של 100 פריימים ב-10 לשנייה = 10 שניות. המודלים נטענים מראש כבר "
         "כשלוחצים 'התחלת סשן'). אחר כך הציון מתעדכן כל 2 שניות."),
        ("low_focus_reaction", "תגובה לקשב נמוך",
         "מאיזה ערך של הציון מופעלת התראה או התערבות (למשל קשב נמוך), ומה קורה",
         "סף אישי: ב-30 השניות הראשונות של המדידה נלמדת 'הרמה הרגילה' (חציון הציונים הגולמיים, מוצג בפאנל: 'כיול אישי: הרמה הרגילה שלך 0.72'). "
         "קשב נמוך = ציון מוחלק (EMA, alpha 0.6) מתחת ל-max(0.40, רמה רגילה פחות 0.15) (עד סוף הכיול: 0.40). "
         "בנוסף, מבט הצידה/למטה או עיניים עצומות יותר מ-4 שניות ברצף (תנוחת ראש ופתיחת עיניים מנקודות MediaPipe) מפעילים קשב נמוך מיד. "
         "אז מופיע באנר '⚠️ הקשב שלך ירד' (ובמבט הצידה גם 'נראה שאת מסתכלת הצידה') עם כפתורים: 'חזרה ל-mm:ss' (מחזיר את הסרטון "
         "לרגע שבו הקשב התחיל לרדת; בטקסט 'חזרה לפסקה'), 'הפסקה של 2 דקות' (עוצר את הסרטון ומציג טיימר נשימה) ו'סגירה'. "
         "חוזרים למצב תקין רק 0.10 מעל הסף, ויש לכל היותר התראה אחת ב-45 שניות. במקביל 'חוב הקשב' גדל והקטע מסומן על 'סרט הקשב'. "
         "אין פנים יותר מ-5 שניות ברצף: ההודעה הצהובה 'לא זוהו פנים' נשארת (בלי חלון נוסף), והזמן הזה נכנס לחוב הקשב."),
        ("how_to_end_a_session", "איך מסיימים סשן", "איך סוגרים סשן ואיפה רואים אותו אחר כך",
         "לוחצים על הכפתור האדום 'סיום סשן' בפאנל. מופיע סיכום 'הסשן נשמר ✓' עם ציון ממוצע, מספר מדידות וחוב קשב, וכפתורים "
         "'לפרטי הסשן' / 'להיסטוריה'. בעמוד 'היסטוריה' (בתפריט העליון) יש טבלה עם תאריך, תוכן וציון ממוצע; כפתור 'פרטים' "
         "פותח את הסשן עם גרף וטבלת כל המדידות. יציאה מהעמוד באמצע סשן סוגרת אותו אוטומטית."),
    ]),
    ("הרצה", [
        ("run_command", "פקודת הרצה", "ברירת מחדל: docker compose up", "docker compose up"),
        ("setup_notes", "הערות להפעלה", "דברים שצריך לדעת על ההפעלה, בלי סיסמאות ומפתחות. אחרת none",
         "הלקוח ב-http://localhost:3000, השרת ב-http://localhost:8000 (בדיקת תקינות: /health). המצלמה עובדת רק ב-localhost או https, "
         "לכן יש לפתוח את האתר בכתובת http://localhost:3000. ההפעלה הראשונה מושכת 3 תמונות (mongo:7 ושתי תמונות שלנו, linux/amd64). "
         "המודלים (v4_7.onnx ו-face_landmarker.task) כבר בתוך תמונת הלקוח ולא יורדים בזמן ריצה. נגן YouTube צריך חיבור לאינטרנט."),
    ]),
    ("אבטחה והגנה על נתונים", [
        ("password_storage", "שמירת סיסמאות",
         "איך נשמרות סיסמאות: אלגוריתם וספרייה (למשל bcrypt/argon2), salt, ושהסיסמה וה-Hash לא מוחזרים ולא נכתבים ללוג",
         "argon2id דרך הספרייה argon2-cffi (PasswordHasher עם ברירות המחדל: time_cost=3, memory_cost=64MiB, parallelism=4), "
         "עם salt אקראי של 16 בתים בכל hash (נשמר בתוך מחרוזת ה-hash). מודלי התגובה של Pydantic מפורשים, ולכן ה-hash והסיסמה "
         "לא מוחזרים בשום תגובה. גוף בקשות לא נכתב ללוג, ושגיאות ולידציה לא מחזירות את הקלט שנשלח. כשהאימייל לא קיים מורץ "
         "אימות על hash דמה, כדי שזמן התגובה לא יסגיר אילו אימיילים רשומים."),
        ("password_rules", "כללי סיסמה", "אורך מינימלי ודרישות נוספות, ומה השרת עושה עם סיסמה חלשה",
         "8 עד 128 תווים, לפחות אות אחת ולפחות ספרה אחת. השרת מחזיר 422 עם הודעה בעברית (למשל 'הסיסמה חייבת להכיל לפחות 8 תווים'), "
         "והלקוח מציג את הכללים מתחת לשדה עם סימון ✓ חי, ובודק אותם גם לפני השליחה. אותם כללים חלים על החלפת סיסמה."),
        ("token_handling", "טיפול בטוקן",
         "סוג הטוקן (למשל JWT), תוקף, איפה הלקוח שומר אותו, ומה קורה בהתנתקות, בפקיעה ובהחלפת סיסמה",
         "JWT בחתימת HS256 (ספריית PyJWT), תוקף 60 דקות (expires_in=3600). בטוקן: sub=מזהה משתמש, jti=UUID ייחודי, "
         "tv=token_version. הסוד JWT_SECRET מגיע ממשתנה סביבה. הלקוח שומר את הטוקן ב-localStorage, כך שרענון לא מנתק, ושולח "
         "אותו בכותרת Authorization: Bearer. בהתנתקות ה-jti נשמר באוסף revoked_tokens (עם TTL index שמוחק אותו כשהטוקן פג "
         "ממילא), והטוקן נדחה מיד. בפקיעה השרת מחזיר 401, והלקוח מוחק את הטוקן ומעביר להתחברות עם ההודעה 'החיבור פג'. "
         "בהחלפת סיסמה token_version עולה ב-1, וכל הטוקנים הקודמים, בכל המכשירים, מתבטלים."),
        ("access_control", "בקרת גישה", "איך השרת מזהה את המשתמש בכל בקשה, ומה מוחזר בלי טוקן או עם טוקן לא תקין",
         "כל נתיב מחובר עובר dependency אחת (get_current_user), שבודקת חתימה ותוקף, שה-jti לא בוטל, שהמשתמש קיים ושה-tv "
         "שווה ל-token_version שלו. כל כשל, וגם בקשה בלי טוקן, מחזיר 401 עם {\"detail\": \"נדרשת התחברות מחדש\"}. "
         "רק register, login ו-/health פתוחים."),
        ("data_isolation", "הפרדת נתונים",
         "איך כל שאילתה מוגבלת לבעלים (למשל סינון לפי מזהה המשתמש מהטוקן ולא מגוף הבקשה), ומה קורה בבקשה לנתוני אחר",
         "כל שאילתה ל-content, sessions ו-readings כוללת {owner_id: <מזהה מהטוקן>}. מזהה הבעלים לעולם לא נלקח מגוף הבקשה. "
         "בקשה לפריט או לסשן של משתמש אחר מחזירה 404 זהה לחלוטין לפריט שלא קיים (גם מזהה לא תקין מחזיר 404), "
         "והלקוח מציג 'לא נמצא' בלי שום פרט. גם במעבר שני השרת בודק שהסשן המקורי שייך למשתמש."),
        ("input_validation", "אימות קלט",
         "איך מאמתים קלט (אימייל, קישור, טקסט, קבצים), והגנה מפני הזרקה ומפני הצגה לא בטוחה של טקסט או דפים (XSS)",
         "כל קלט עובר Pydantic v2 עם טיפוסים קשיחים (str/float/int, לא dict), כך שאי אפשר להזריק אופרטורים של Mongo כמו $ne. "
         "אימייל: email-validator, ונשמר אחרי strip().lower(). כותרת: 1–200 תווים. YouTube: regex שמחלץ מזהה של 11 תווים. "
         "טקסט: עד 200,000 תווים. קישור: http/https ועד 2,000 תווים. ציון: 0–1, ו-NaN ו-Infinity נדחים. מזהים עוברים "
         "ObjectId() בתוך try. שליפת דף (SSRF): ה-hostname מתורגם לכתובת, וכל כתובת שאינה ציבורית נחסמת (פרטית, loopback, "
         "link-local כולל 169.254.169.254, multicast, וגם mongo ו-backend). כל redirect נבדק מחדש (עד 5), timeout של 10 שניות, "
         "מקסימום 3MB, רק text/html. נשמר רק טקסט נקי (trafilatura), אף פעם לא HTML. XSS: React מבצע escape לכל טקסט, ואין "
         "dangerouslySetInnerHTML. nginx שולח Content-Security-Policy מצומצם (רק self, YouTube ו-'wasm-unsafe-eval'), "
         "X-Content-Type-Options: nosniff, Referrer-Policy: strict-origin-when-cross-origin, X-Frame-Options: DENY "
         "ו-Permissions-Policy: camera=(self)."),
        ("camera_and_face_data", "נתוני מצלמה ופנים", "מה נאסף מהמצלמה, איך מתקבלת הסכמה, מה יוצא מהדפדפן ומה נשמר, ואיך זה נמחק",
         "המצלמה נדלקת רק אחרי לחיצה על 'הפעלת מצלמה' ואישור הדפדפן, אחרי הסבר מה נאסף. הווידאו ו-478 נקודות הפנים נשארים "
         "בזיכרון הדפדפן בלבד (MediaPipe והמודל רצים בדפדפן) ולא נשמרים. לשרת נשלחים רק מספרים: ציון, ציון מוחלק, רמה (0–4), "
         "מיקום הרגע המשפיע בחלון (0–1) ומיקום בתוכן. בסיום הסשן או ביציאה מהעמוד המצלמה נעצרת (track.stop). 'מחיקת החשבון' "
         "בעמוד הפרופיל מוחקת את המשתמש וכל התוכן, הסשנים והמדידות שלו."),
        ("secrets_handling", "ניהול סודות", "איפה נשמרים סודות (למשל .env), ושהם לא בקוד, לא בתמונות ולא ב-GitHub",
         "כל הסודות (JWT_SECRET, GEMINI_API_KEY, כתובת המסד) נקראים ממשתני סביבה דרך pydantic-settings, מקובץ .env שמוזן "
         "ל-backend ב-env_file. .env נמצא ב-.gitignore ו-.dockerignore, ולכן לא ב-GitHub ולא בתמונות. GEMINI_API_KEY ריק "
         "בהגשה. אם JWT_SECRET חסר, השרת מייצר סוד אקראי בעלייה ומדפיס אזהרה, בלי להדפיס את הסוד."),
        ("extra_account_security", "אבטחת חשבון נוספת",
         "תוספות מעבר לבסיס: סיסמה חזקה, הגבלת ניסיונות, אישור באימייל, JWT_SECRET. אחרת none",
         "(1) כללי סיסמה: אות + ספרה + 8 תווים. (2) הגבלת ניסיונות: 5 כישלונות ל-(אימייל+IP) בתוך 15 דקות מחזירים 429 "
         "'יותר מדי ניסיונות. נסי שוב בעוד כמה דקות', עם מונה ב-MongoDB ו-TTL index. (3) JWT_SECRET אקראי (64 תווי hex) מ-.env. "
         "(4) logout אמיתי (רשימת jti מבוטלים) וביטול כל הטוקנים בהחלפת סיסמה. (5) אימות זמן קבוע בהתחברות. "
         "(6) MongoDB לא חשוף מחוץ לרשת של Docker, והשרת רץ בקונטיינר כמשתמש לא-root. אין אישור הרשמה באימייל (none)."),
    ]),
    ("מצב הפרויקט", [
        ("works_fully", "מה עובד במלואו", "רשימה קצרה, מופרדת בפסיקים", "__WORKS_FULLY__"),
        ("partially_works_or_missing", "מה עובד חלקית או חסר", "בכנות. מה שכתוב כאן נלקח בחשבון בבדיקה", "__PARTIAL__"),
        ("known_issues", "תקלות ידועות", "תקלות שאתם מכירים. אחרת none", "__KNOWN__"),
    ]),
    ("הפרויקט שלכם", [
        ("plugin", "תוסף Plugin (בונוס)",
         "אם בניתם תוסף (Plugin) לדפדפן או לאפליקציה אחרת: על איזו פלטפורמה הוא בנוי (Chrome, Zoom ועוד), האם הוא תחליף ללקוח "
         "או תוספת לו, איך מתקינים ואיך משתמשים, ואיך אנחנו יכולים לבדוק אותו. אחרת none", "none"),
        ("extra_features", "תוספות מעבר לבסיס", "מה הוספתם מעבר לבסיס המשותף",
         "פרופיל (שינוי שם תצוגה, החלפת סיסמה), מחיקת חשבון עם אישור בהקלדת 'מחיקה' שמוחקת את כל הנתונים, 3 סוגי תוכן "
         "(YouTube, טקסט, דף אינטרנט) עם תצוגה מתאימה לכל אחד, תמיכה מלאה בטלפון (תפריט, פאנל מתחת לתוכן, טבלאות "
         "שהופכות לכרטיסים), אנליטיקה בעמוד ההיסטוריה (גרף ריכוז לאורך זמן, 'השעה הכי טובה שלך', חוב פתוח לכל פריט "
         "ואחוז השלמה בריכוז), עמוד סשן עם גרף וטבלת מדידות ו'מה המודל ראה' (משקלי Attention), חוב קשב, סרט קשב, "
         "חזרה לרגע שהוחמץ, הפסקת נשימה, מעבר שני, מפת חום לפסקאות, עמוד 'איך זה עובד?', ושאלת בדיקה עם Gemini "
         "(כבויה בהגשה כי המפתח ריק: הכפתור לא מוצג, ויש הודעה מנומסת)."),
        ("what_makes_it_yours", "מה הופך אותו לשלכם", "מה הופך את הפרויקט לשלכם ולא לעוד עותק",
         "הרעיון של 'חוב קשב': רוב האתרים רק מודדים, ו-Rewind מתקן. כל שנייה של תוכן שעברה בלי ריכוז נרשמת כחוב, מסומנת "
         "על 'סרט הקשב', ובסוף הסשן 'מעבר שני' מנגן רק את מה שפספסת. השרת (לא הלקוח) מחליט אילו קטעים נסגרו, והמטרה היא "
         "לסיים כל תוכן עם חוב 0. בנוסף לא סמכנו על המודל בעיניים עצומות: השווינו את כל 9 המודלים ובחרנו לפי מדידה, ומדדנו גם "
         "את קצב MediaPipe ב-CPU מול GPU."),
    ]),
]


# ---------- RTL helpers (python-docx has no direct API for these) ----------

def _rtl_paragraph(p, align=WD_ALIGN_PARAGRAPH.RIGHT):
    p.alignment = align
    ppr = p._p.get_or_add_pPr()
    bidi = OxmlElement("w:bidi")
    ppr.append(bidi)


def _run(p, text, bold=False, size=10.5, color=None, mono=False):
    r = p.add_run(text)
    r.bold = bold
    r.font.size = Pt(size)
    r.font.name = "Consolas" if mono else "Arial"
    rpr = r._r.get_or_add_rPr()
    fonts = rpr.find(qn("w:rFonts"))
    if fonts is None:
        fonts = OxmlElement("w:rFonts")
        rpr.append(fonts)
    fonts.set(qn("w:cs"), "Arial")
    if not mono and re.search(r"[֐-׿]", text):
        rpr.append(OxmlElement("w:rtl"))
    if bold:
        rpr.append(OxmlElement("w:bCs"))
    if color:
        r.font.color.rgb = RGBColor.from_string(color)
    return r


def _shade(cell, hex_color):
    tcpr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_color)
    tcpr.append(shd)


def _table_rtl(table):
    tblpr = table._tbl.tblPr
    tblpr.append(OxmlElement("w:bidiVisual"))


def _heading(doc, text, size=14, color="1F4E99"):
    p = doc.add_paragraph()
    _rtl_paragraph(p)
    _run(p, text, bold=True, size=size, color=color)
    return p


def build_new(answers_override: dict | None = None) -> Document:
    doc = Document()
    for s in doc.sections:
        s.right_margin = s.left_margin = Pt(54)
    hp = doc.add_paragraph()
    _rtl_paragraph(hp, WD_ALIGN_PARAGRAPH.CENTER)
    _run(hp, HEADER, size=9, color="666666")
    _heading(doc, TITLE, size=17)
    p = doc.add_paragraph()
    _rtl_paragraph(p)
    _run(p, INTRO)
    for b in BULLETS:
        p = doc.add_paragraph()
        _rtl_paragraph(p)
        _run(p, "• " + b)

    for title, rows in SECTIONS:
        _heading(doc, title)
        if title.startswith("אבטחה"):
            p = doc.add_paragraph()
            _rtl_paragraph(p)
            _run(p, SECURITY_NOTE, size=9.5)
        t = doc.add_table(rows=1, cols=3)
        t.style = "Table Grid"
        _table_rtl(t)
        for i, h in enumerate(("שדה", "הסבר", "התשובה שלכם")):
            c = t.rows[0].cells[i]
            _shade(c, "E8EEF8")
            _rtl_paragraph(c.paragraphs[0])
            _run(c.paragraphs[0], h, bold=True)
        for field, label, expl, answer in rows:
            cells = t.add_row().cells
            p0 = cells[0].paragraphs[0]
            _rtl_paragraph(p0)
            _run(p0, field, mono=True, size=9.5)
            p0b = cells[0].add_paragraph()
            _rtl_paragraph(p0b)
            _run(p0b, label, size=9.5)
            p1 = cells[1].paragraphs[0]
            _rtl_paragraph(p1)
            _run(p1, expl, size=9.5, color="444444")
            p2 = cells[2].paragraphs[0]
            _rtl_paragraph(p2)
            _run(p2, (answers_override or {}).get(field, answer), size=9.5)
        for row in t.rows:
            row.cells[0].width, row.cells[1].width, row.cells[2].width = Pt(120), Pt(150), Pt(230)
    p = doc.add_paragraph()
    _rtl_paragraph(p)
    _run(p, OUTRO)
    return doc


def fill_template(path: Path, answers: dict) -> Document:
    """Write answers into the LAST column of an original template, matching rows by field name."""
    doc = Document(str(path))
    for table in doc.tables:
        for row in table.rows:
            key = row.cells[0].text.strip().split()[0] if row.cells[0].text.strip() else ""
            if key in answers:
                cell = row.cells[-1]
                cell.text = ""
                _rtl_paragraph(cell.paragraphs[0])
                _run(cell.paragraphs[0], answers[key], size=9.5)
    return doc


def status_answers() -> dict:
    """works_fully / partial / known come from docs/TEST_REPORT.md (section 'לקובץ PROJECT_INFO')."""
    path = ROOT / "docs" / "TEST_REPORT.md"
    text = path.read_text(encoding="utf-8") if path.exists() else ""
    out = {}
    for key in ("works_fully", "partially_works_or_missing", "known_issues"):
        m = re.search(rf"<!--{key}-->(.*?)<!--/{key}-->", text, re.S)
        out[key] = " ".join(m.group(1).split()) if m else "TODO"
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--template", type=Path, help="original PROJECT_INFO.docx to fill instead of rebuilding")
    ap.add_argument("--authors", help="grunitech emails, comma separated, no spaces")
    args = ap.parse_args()
    answers = {f: a for _, rows in SECTIONS for f, _, _, a in rows}
    st = status_answers()
    answers["works_fully"] = st["works_fully"]
    answers["partially_works_or_missing"] = st["partially_works_or_missing"]
    answers["known_issues"] = st["known_issues"]
    if args.authors:
        answers["authors"] = args.authors
    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc = fill_template(args.template, answers) if args.template else build_new(answers)
    doc.save(str(OUT))
    leftover = [k for k, v in answers.items() if "TODO" in v]
    print(f"wrote {OUT}")
    if leftover:
        print("WARNING: still contains TODO in:", ", ".join(leftover))


if __name__ == "__main__":
    main()
