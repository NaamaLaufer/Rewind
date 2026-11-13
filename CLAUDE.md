# CLAUDE.md — Rewind ⏪ · לא מפספסים אף רגע
### הוראות ביצוע מלאות ל-Claude Code: מטלה 3 (Power Tech 2026, אתר בהשראת FocusFlow)

---

## 0. איך לעבוד: קרא קודם

אתה בונה פרויקט Full-Stack מלא, מאפס ועד קובץ הגשה. **עבוד באופן אוטונומי לגמרי.**

**כלל ההחלטות (חשוב מאוד):**
- **אל תשאל את המשתמשת שאלות ואל תחכה לאישור.** כשיש התלבטות (ספרייה, שם שדה, עיצוב, מבנה תיקיות, גרסה), בחר את האפשרות **המומלצת ביותר**: הכי יציבה, הכי פשוטה להסביר בהגנה על הפרויקט, ושהכי פחות מסכנת את 100 נקודות הבסיס. תמשיך לעבוד.
- **כל החלטה כזו נרשמת מיד** בקובץ `docs/DECISIONS.md` (פורמט בסעיף 13). לא בסוף, אלא תוך כדי עבודה.
- המקום היחיד שבו מותר לעצור: פעולה שדורשת פרטים אישיים שאין לך (סיסמת Docker Hub, האימיילים של המגישות). גם שם **אל תיעצר**: השאר placeholder ברור (`TODO_USER: ...`), רשום אותו ב-`docs/USER_TODO.md` והמשך.
- סדר העדיפויות בכל התנגשות: **(1) 100 נקודות הבסיס עובדות בוודאות** ← (2) בהירות לסוכן ה-AI הבודק ← (3) בונוסים ← (4) יצירתיות ויופי. פיצ'ר יצירתי לעולם לא מסתיר או מחליף דרישת חובה.
- כתוב קוד נקי עם הערות קצרות **באנגלית** בקוד, ותיעוד למשתמשת **בעברית**.

**חומרי המקור** נמצאים בתיקייה `materials/` (אם הם לא שם, חפש אותם בתיקיית הפרויקט):
- `FocusFlow_Assignment3.pdf`: הוראות המטלה. **זה המקור הקובע.** קרא אותו במלואו לפני שמתחילים.
- `PROJECT_INFO.pdf` (או `.docx`): התבנית של קובץ המידע.
- `focusflow-models/*.onnx`: תשעת המודלים.
- `focusflow_docker/`: docker-compose לדוגמה מהפרויקט המקורי (השראה בלבד: Postgres ופורטים אחרים, **לא להעתיק**).
- `env.example`, `Diagrams/`: תבנית env ודיאגרמות UML לדוגמה.

---

## 1. הרעיון: Rewind ⏪ · לא מפספסים אף רגע

רוב אתרי הקשב רק **מודדים**. Rewind **מתקן**. הרעיון המרכזי הוא **"חוב קשב"**:

> כל שנייה של תוכן שעברה בזמן שלא היית מרוכזת נרשמת כ"חוב". Rewind מסמן על ציר הזמן בדיוק את הקטעים שפספסת, מציע לחזור אליהם ברגע שהקשב יורד, ובסוף הסשן מפעיל **"מעבר שני" (Second Pass)**: מנגן ברצף **רק** את הקטעים שהחמצת (או מציג רק את הפסקאות שלא קראת בריכוז). אם הפעם את מרוכזת, הקטע מסומן "נסגר ✓" והחוב יורד. המטרה: לסיים כל תוכן עם חוב 0.

### שישה רכיבי החוויה
| # | רכיב | מה זה | למה זה טוב לציון |
|---|------|-------|------------------|
| 1 | **מד חוב הקשב** | מונה חי ליד הציון: "חוב קשב: 1:20 דק׳". גדל בכל מדידה שבה הציון המוחלק < 0.40 (לפי משך התוכן שעבר מאז המדידה הקודמת) | מושג מקורי שקל להסביר בהגנה. **תמיד לצד** הציון המספרי, לא במקומו |
| 2 | **סרט הקשב (Focus Tape)** | פס בעיצוב "סרט הקלטה" מתחת לסרטון או לטקסט: כל מדידה היא משבצת בצבע לפי הציון, במיקום שלה בתוכן. קטעים שהוחמצו מסומנים במסגרת אדומה עם ⏪. לחיצה קופצת לשם | עונה ל"חזרה לקטע שהוחמץ" מהמטלה. בונוס אנליטיקה |
| 3 | **"חזרי לרגע שהחמצת"** | כשהקשב יורד מופיעה התראה עם כפתור שמחזיר את הסרטון לנקודה שבה הקשב התחיל לרדת (או גולל לפסקה) | התערבות חכמה. בונוס "סף חכם / החלקת ציון" |
| 4 | **מעבר שני (Second Pass)** | בסיום סשן עם חוב > 0: כפתור "מעבר שני: לצפות רק במה שפספסתי (2:40 דק׳)". מצב ניגון שמקפיץ מקטע לקטע ועוצר בסוף כל אחד. זה סשן חדש (`mode: "review"`) עם מדידה, ובסופו השרת מחשב אילו קטעים נסגרו | הלב היצירתי: לולאת למידה שלמה. השרת עושה לוגיקה אמיתית ולא רק שמירה |
| 5 | **מפת חום בקריאה** | בתוכן טקסט ודף אינטרנט כל פסקה נצבעת בעדינות לפי הקשב שנמדד בזמן שקראו אותה. פסקאות "בחוב" מקבלות פס אדום בשוליים. המעבר השני בטקסט = מצב שבו רק הפסקאות האלה גלויות ושאר הטקסט מקופל | ממש את כיוון "אתר קריאה" מהמטלה. בונוס סוגי תוכן |
| 6 | **ארכיון ההקלטות (היסטוריה ואנליטיקה)** | רשימת הסשנים המלאה (חובה) + לכל פריט תוכן "אחוז השלמה בריכוז" (כמה מהתוכן נצפה בקשב, כולל מעברים שניים) + גרף מגמה בין סשנים + "השעה הכי טובה שלך" + בכל סשן גרף מדידות ו"רגעים שהמודל הסתכל עליהם" (משקלי Attention של v4_2) | בונוס אנליטיקה ובונוס עבודה עם המודל |

**מיתוג:** שם האתר **Rewind**, תת-כותרת "לא מפספסים אף רגע". שפה עיצובית של "סטודיו הקלטות" מודרני ונקי: רקע קרם או אפור-חם בהיר, כחול-דיו עמוק לטקסט, **ירוק-מנטה** לקשב גבוה, **ענבר** לביניים, **אדום-קורל** לחוב. אלמנטים עדינים של סרט או קסטה (פס ה-Tape, אייקון ⏪), טיפוגרפיה נקייה, פינות מעוגלות. ממשק **בעברית, RTL מלא**. (שימי לב: הציר וה-Tape מוצגים בכיוון התוכן: התחלה מימין.)

> ⚠️ **אזהרה לעצמך:** הסוכן הבודק הוא AI שמחפש טקסט ברור. לכן כל אלמנט יצירתי מגיע עם טקסט. מד החוב לא מחליף את המספר. הארכיון לא מחליף את רשימת ההיסטוריה. המעבר השני הוא **אופציה** אחרי סיום, והסשן הרגיל נסגר ומופיע בהיסטוריה בלעדיו. כל כפתור הוא טקסט מלא בעברית (אייקון רק בנוסף).

### הגדרות מדויקות (כדי שהמימוש יהיה עקבי)
- **קטע שהוחמץ (missed segment):** רצף מדידות סמוכות בסשן שבהן `smoothed < 0.40`. הקטע מתחיל ב-`position` של המדידה הראשונה ברצף **פחות 10 שניות** (החלון של המודל מכסה 10 שניות אחורה) ונגמר ב-`position` של המדידה האחרונה ברצף. קטעים שהמרחק ביניהם עד 5 שניות מתמזגים. גבול תחתון 0. בטקסט היחידה היא פסקה: פסקה בחוב היא פסקה שהממוצע המוחלק שלה < 0.40.
- **חוב קשב של סשן:** סכום אורכי הקטעים (שניות, או מספר פסקאות בטקסט).
- **סגירת קטע:** בסשן `review`, קטע נסגר אם הממוצע של מדידות ה-review שה-position שלהן בטווח הקטע ≥ 0.50, ויש לפחות מדידה אחת. כשאין מדידות (קטע קצר מ-10 שניות), הקטע נסגר אם המשתמשת צפתה בו עם פנים מזוהות לאורך כולו. במקרה הזה הלקוח שולח `POST /api/sessions/{id}/segments/{idx}/watched`. תעד את הבחירה.
- **אחוז השלמה בריכוז לפריט:** `1 - (חוב פתוח / משך התוכן)`. ל-YouTube המשך מגיע מ-`player.getDuration()` ונשמר בפריט (`duration_seconds`) בפעם הראשונה שנפתח.
- כל החישובים האלה **בשרת** (`services/segments.py`, פונקציות טהורות עם בדיקות pytest). הלקוח רק מציג.

## 2. ארכיטקטורה וטכנולוגיות (ההחלטות כבר התקבלו, אל תשנה בלי סיבה חזקה)

| שכבה | בחירה | הערות |
|------|-------|-------|
| שרת | **Python 3.12 + FastAPI + Uvicorn** | `/docs` אוטומטי |
| מסד נתונים | **MongoDB 7** (תמונה רשמית `mongo:7`) + volume | |
| דרייבר | **PyMongo Async** (`pymongo.AsyncMongoClient`, pymongo ≥ 4.10) | Motor הוצא משימוש לטובתו. אם משהו לא עובד, Motor הוא הגיבוי ונרשם ב-DECISIONS |
| סיסמאות | **argon2id** דרך `argon2-cffi` (`PasswordHasher` עם ברירות המחדל) | salt אקראי מובנה בכל hash |
| טוקן | **JWT HS256** דרך `PyJWT`, תוקף **60 דקות**, סוד מ-`JWT_SECRET` | כולל `jti` ו-`tv` (token_version) |
| ולידציה | Pydantic v2 + `email-validator` | |
| שליפת דפי אינטרנט | `httpx` + `trafilatura` | עם הגנת SSRF (סעיף 6.4) |
| Gemini (רשות) | `google-genai`, שם מודל מ-`GEMINI_MODEL` | נכשל בנימוס בלי מפתח |
| לקוח | **React 18 + Vite + JavaScript (JSX)**, `react-router-dom` | JS ולא TS כדי שיהיה קל ללמוד ולהסביר |
| עיצוב | CSS רגיל עם CSS variables (קובץ `theme.css`) ו-CSS Modules לקומפוננטות | בלי Tailwind ובלי UI kit, כדי שיהיה קל להבין |
| גרפים | `recharts` | |
| פנים | `@mediapipe/tasks-vision` (FaceLandmarker, 478 נקודות) | |
| מודל | `onnxruntime-web` (WASM), מודל **v4_2** | |
| הגשת הלקוח | build סטטי ב-**nginx:alpine**, שגם עושה reverse proxy ל-`/api` | |

### זרימת המערכת
```
דפדפן (localhost:3000)                        nginx (client container)            backend:8000         mongo:27017
 ├─ React UI                                      ├─ מגיש קבצים סטטיים
 ├─ מצלמה → MediaPipe (10fps) → 478×3              └─ /api/* ──proxy──►  FastAPI ──────────► MongoDB
 ├─ חלון נע של 100 פריימים → onnxruntime-web (v4_2)                        /health
 └─ ציון → POST /api/sessions/{id}/readings
```
**הווידאו ונקודות הפנים לא עוזבים את הדפדפן.** לשרת נשלחים רק ציון, רמה ומיקום בתוכן.

### למה לקוח ושרת מדברים דרך proxy של nginx
הלקוח פונה תמיד לנתיב יחסי `/api/...`. nginx בקונטיינר הלקוח מעביר את `/api/` ל-`http://backend:8000`. היעד נקבע במשתנה הסביבה `BACKEND_URL` (ברירת מחדל `http://backend:8000`) דרך תבנית `nginx/default.conf.template` (מנגנון `envsubst` המובנה בתמונת nginx). כך:
1. אין CORS ואין כתובת שרת קבועה בקוד (דרישה מפורשת במטלה: "כתובת השרת ניתנת להגדרה").
2. במעבר לענן משנים רק משתנה סביבה.
3. בפיתוח מקומי `vite.config.js` עושה proxy ל-`http://localhost:8000`.
- **בנוסף** השרת חשוף בפורט 8000 עם `GET /health` (דרישה). הוסף גם CORSMiddleware עם `ALLOWED_ORIGINS` (ברירת מחדל `http://localhost:3000`) לביטחון.

---

## 3. מבנה הריפו

```
rewind/
├── CLAUDE.md                     ← הקובץ הזה
├── README.md                     ← איך מריצים (עברית, קצר)
├── .gitignore                    ← כולל .env, node_modules, __pycache__, dist, *.zip
├── .env.example
├── docker-compose.yml            ← גרסת ההגשה: image בלבד (בלי build)
├── docker-compose.dev.yml        ← לפיתוח: build מקומי של backend ו-frontend
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt          ← גרסאות נעולות
│   ├── app/
│   │   ├── main.py               ← יצירת האפליקציה, lifespan, /health, handlers לשגיאות
│   │   ├── config.py             ← pydantic-settings: כל משתני הסביבה
│   │   ├── db.py                 ← AsyncMongoClient, אינדקסים בעלייה
│   │   ├── security.py           ← hash, JWT, get_current_user
│   │   ├── rate_limit.py         ← הגבלת ניסיונות התחברות
│   │   ├── schemas.py            ← מודלי Pydantic לבקשות ולתגובות
│   │   ├── routers/ auth.py users.py content.py sessions.py analytics.py ai.py
│   │   └── services/ webpage.py (שליפה + SSRF) gemini.py segments.py (קטעים שהוחמצו, חוב, סגירה)
│   └── tests/                    ← pytest
├── frontend/
│   ├── Dockerfile                ← multi-stage: node build → nginx
│   ├── nginx/default.conf.template
│   ├── package.json, vite.config.js, index.html (lang="he" dir="rtl")
│   ├── public/models/v4_2.onnx   ← מועתק מ-materials בזמן build (ראו סעיף 9)
│   ├── public/mediapipe/         ← face_landmarker.task + קבצי wasm (בתוך התמונה, בלי הורדה בזמן ריצה)
│   └── src/
│       ├── main.jsx, App.jsx, theme.css
│       ├── api/client.js         ← fetch wrapper: Bearer, טיפול ב-401, הודעות שגיאה
│       ├── auth/AuthContext.jsx, ProtectedRoute.jsx
│       ├── focus/                ← הלב הטכני
│       │   ├── camera.js         ← רשימת מצלמות, getUserMedia
│       │   ├── landmarker.js     ← MediaPipe FaceLandmarker
│       │   ├── model.js          ← onnxruntime-web, טעינה חד-פעמית
│       │   ├── useFocusEngine.js ← hook: לולאת 10fps, buffer, הסקה, החלקה
│       │   └── smoothing.js      ← EMA והיסטרזיס (פונקציות טהורות + בדיקות)
│       ├── components/ NavBar, ScoreCard, DebtMeter, FocusTape, AlertBanner, SecondPassPlayer,
│       │               ConsentPanel, ConfirmDialog, EmptyState, Spinner, Field
│       └── pages/ Register, Login, Library, ContentView (Session), History (Archive),
│                  SessionDetail, Profile, NotFound, About (איך זה עובד + פרטיות)
├── docs/
│   ├── DECISIONS.md              ← כל ההחלטות ולמה (בעברית)
│   ├── PROJECT_GUIDE.md          ← מדריך לימוד מלא (בעברית)
│   ├── USER_TODO.md              ← מה המשתמשת צריכה לעשות בעצמה
│   ├── TEST_REPORT.md            ← מה נבדק ואיך
│   └── diagrams/                 ← Mermaid (.md) + PNG אם אפשר
├── scripts/
│   ├── build_and_push.sh         ← buildx --platform linux/amd64 + push
│   ├── make_project_info.py      ← מייצר PROJECT_INFO.docx
│   └── package_submission.sh     ← בונה assignment3.zip
└── submission/                   ← התוצר הסופי
```

---

## 4. מסד הנתונים (MongoDB)

**אוסף `users`**
```
_id: ObjectId, email: str (lowercase, ייחודי), password_hash: str, display_name: str,
created_at: datetime(UTC), token_version: int (מתחיל ב-0)
```
אינדקס ייחודי על `email`. האימייל נשמר אחרי `strip().lower()`, וכך הייחודיות לא תלויה באותיות גדולות או קטנות.

**אוסף `content`**
```
_id, owner_id: ObjectId, title: str, type: "youtube"|"text"|"web",
source: str (קישור, או גוף הטקסט),
youtube_id: str|null, body_paragraphs: [str]|null (ל-text ו-web: הטקסט מחולק לפסקאות),
site_name: str|null, duration_seconds: float|null (YouTube, נשמר בפתיחה הראשונה), created_at
```
אינדקס: `(owner_id, created_at desc)`.

**אוסף `sessions`**
```
_id, owner_id, content_id, content_title (עותק, כדי שההיסטוריה תעבוד גם אם הפריט נמחק),
content_type, started_at, ended_at: datetime|null, model_version: "v4_2",
reading_count: int, score_sum: float  (מאפשר ממוצע בלי לחשב מחדש),
mode: "watch"|"review", review_of: ObjectId|null (הסשן המקורי במעבר שני),
missed_segments: [{start: float, end: float, closed: bool, closed_by: ObjectId|null}]  (מחושב ב-end של סשן watch),
debt_seconds: float (חוב פתוח של הסשן; מתעדכן כשקטעים נסגרים)
```
**הערה:** בתוכן טקסט `start` ו-`end` הם אינדקסי פסקאות, ו-`debt_seconds` נשמר כמספר פסקאות (השדה `debt_unit: "seconds"|"paragraphs"`).
אינדקס: `(owner_id, started_at desc)`.

**אוסף `readings`** (נפרד מהסשן, כדי שהמסמך לא יגדל בלי גבול)
```
_id, session_id, owner_id, position: float (שניות בסרטון, או אינדקס פסקה עשרוני בטקסט),
score: float [0,1], smoothed: float [0,1], level: int 0–4 | null,
attention_peak: float|null (אחוז מיקום הפריים המשפיע ביותר בחלון, 0–1), created_at
```
אינדקס: `(session_id, created_at)`.

**אוסף `revoked_tokens`**: `{jti, expires_at}` עם **TTL index** על `expires_at`, כך שטוקן שבוטל נמחק אוטומטית כשהוא פג ממילא.

**אוסף `login_attempts`**: `{key, created_at}` עם TTL של 15 דקות (להגבלת ניסיונות).

---

## 5. ה-API (צמוד להמלצה של המטלה, בלי לשנות שמות)

כללים לכל הנתיבים:
- כל המזהים במחרוזת (`str(ObjectId)`). כל הזמנים ב-ISO 8601 UTC עם `Z` (למשל `2026-11-13T10:00:00Z`).
- כל שגיאה מחזירה `{"detail": "הודעה"}`. הוסף exception handler ל-`RequestValidationError` שמחזיר 422 עם `detail` **כמחרוזת קריאה** (למשל "הסיסמה חייבת להכיל לפחות 8 תווים"), ובנוסף שדה `errors` עם הפירוט. הלקוח מציג את `detail`.
- `ObjectId` לא תקין בנתיב מחזיר **404** (לא 422 ולא 500).
- משאב של משתמש אחר מחזיר **404** זהה לחלוטין למשאב שלא קיים.
- כל שאילתה כוללת `{"owner_id": current_user.id}`, **ומזהה הבעלים נלקח מהטוקן בלבד**, לעולם לא מגוף הבקשה.

| נתיב | הרשאה | גוף | הצלחה | שגיאות |
|------|-------|-----|-------|--------|
| `GET /health` | פתוח | | 200 `{"status":"ok"}` (אחרי ping מוצלח למונגו. אחרת 503) | |
| `POST /api/auth/register` | פתוח | email, password, display_name | 201 `{id,email,display_name}` | 409 אימייל קיים, 422 קלט |
| `POST /api/auth/login` | פתוח | email, password | 200 `{access_token, token_type:"bearer", expires_in:3600}` | 401 פרטים שגויים, 429 יותר מדי ניסיונות |
| `POST /api/auth/logout` | מחובר | | 204 (ה-jti נכנס ל-revoked_tokens) | |
| `GET /api/users/me` | מחובר | | 200 `{id,email,display_name,created_at}` | |
| `PATCH /api/users/me` | מחובר | display_name | 200 משתמש מעודכן | 422 |
| `POST /api/users/me/password` | מחובר | current_password, new_password | 204 (token_version++ ← כל הטוקנים הישנים מתבטלים. הלקוח מתחבר מחדש) | 400 סיסמה נוכחית שגויה, 422 |
| `DELETE /api/users/me` | מחובר | | 204 (מוחק user, content, sessions, readings) | |
| `POST /api/content` | מחובר | title, type, source | 201 `{id,title,type,source,created_at, ...}` | 422 סוג או מקור לא תקין, 422 דף שאי אפשר לשלוף ממנו טקסט (עם הודעה ברורה) |
| `GET /api/content` | מחובר | | 200 רשימה (חדש ראשון) | |
| `GET /api/content/{id}` | מחובר | | 200 פריט מלא (כולל body_paragraphs) | 404 |
| `DELETE /api/content/{id}` | מחובר | | 204 (הסשנים נשארים בהיסטוריה עם content_title) | 404 |
| `POST /api/sessions` | מחובר | content_id, mode? ("watch" ברירת מחדל / "review"), review_of? | 201 `{id,content_id,mode,started_at}` | 404 תוכן או review_of לא שלי, 422 review_of בלי קטעים פתוחים |
| `POST /api/sessions/{id}/readings` | מחובר | position, score, smoothed?, level?, attention_peak? | 201 `{position,score,created_at}` | 404, 409 סשן סגור, 422 (score מחוץ ל-[0,1], position שלילי) |
| `POST /api/sessions/{id}/end` | מחובר | | 200 `{id,started_at,ended_at,reading_count,average_score, mode, missed_segments, debt_seconds, debt_unit}`. ב-review גם `segments_closed`, `debt_remaining` (של הסשן המקורי). average_score הוא null אם אין מדידות. קריאה חוזרת מחזירה את אותו סיכום (אידמפוטנטי) | 404 |
| `POST /api/sessions/{id}/segments/{idx}/watched` | מחובר | | 200 (רק בסשן review פתוח, לקטע קצר בלי מדידות; ראו סעיף 1) | 404, 409 |
| `GET /api/content/{id}/debt` | מחובר | | 200 `{open_segments:[{session_id,start,end}], debt_total, debt_unit, completion}` | 404 |
| `PATCH /api/content/{id}` | מחובר | duration_seconds | 200 (נשלח מהלקוח בפתיחה הראשונה של YouTube) | 404, 422 |
| `GET /api/sessions` | מחובר | | 200 רשימת סיכומים: `id, content_id, content_title, content_type, mode, started_at, ended_at, reading_count, average_score, debt_seconds, debt_unit` | |
| `GET /api/sessions/{id}` | מחובר | | 200 סיכום + `missed_segments` + `readings:[{position,score,smoothed,level,attention_peak,created_at}]` | 404 |
| `GET /api/analytics/overview` | מחובר | | 200: סה"כ סשנים, דקות, ממוצע כללי, מגמה (ממוצע לכל סשן לפי זמן), ממוצע לפי שעה ביום, ממוצע לפי סוג תוכן, חוב פתוח כולל, ורשימת פריטים עם חוב פתוח ואחוז השלמה | |
| `GET /api/ai/status` | מחובר | | 200 `{"enabled": bool}` | |
| `POST /api/ai/check-question` | מחובר | content_id, paragraph_index | 200 `{question, options[4], answer_index}` | 503 `{"detail":"תכונת ה-AI לא מוגדרת בשרת הזה"}` בלי מפתח |

סשן לא נסגר? כש-`GET /api/sessions` רץ, סשן פתוח שהמדידה האחרונה שלו לפני יותר משעתיים מסומן `ended_at` לפי זמן המדידה האחרונה (סגירה עצלה, כולל חישוב הקטעים). רשום את ההחלטה הזו.

**לוגיקת החוב בשרת (`services/segments.py`):** `compute_missed_segments(readings, unit)` ← רשימת קטעים לפי ההגדרות בסעיף 1. `close_segments(original_segments, review_readings, watched_idx)` ← אילו נסגרו. ב-end של review: מעדכנים את `missed_segments[].closed` ואת `debt_seconds` **בסשן המקורי** (עם בדיקת בעלות). מדידה ב-review **לא** יוצרת קטעים חדשים (תעד).

---

## 6. אבטחה (בונוס עד 5+4 נקודות, צריך להיות קונקרטי)

1. **סיסמאות:** argon2id (`argon2-cffi`, ברירות מחדל: time_cost=3, memory_cost=64MiB, parallelism=4) עם salt אקראי לכל hash. ה-hash לעולם לא מוחזר בתגובה (מודלי תגובה מפורשים) ולא נכתב ללוג. גם גוף הבקשות לא נכתב ללוג.
2. **כללי סיסמה:** מינימום 8 תווים, **לפחות אות אחת ולפחות ספרה אחת**, מקסימום 128. השרת מחזיר 422 עם הודעה בעברית, והלקוח מציג את הכללים מתחת לשדה מראש, עם סימון ✓ חי לכל כלל. (לא מחמירים יותר, כדי לא להכשיל את הסוכן הבודק.)
3. **טוקן:** JWT HS256, `exp` = 60 דקות, `sub`=user_id, `jti`=uuid4, `tv`=token_version. בכל בקשה בודקים חתימה, תוקף, ש-jti לא ב-revoked_tokens, וש-tv תואם למשתמש. כל כשל מחזיר 401 `"נדרשת התחברות מחדש"`. `JWT_SECRET` מגיע מ-env. אם חסר, השרת מייצר סוד אקראי בעלייה ומדפיס אזהרה (בלי להדפיס את הסוד).
4. **שליפת דף אינטרנט (SSRF):** רק `http`/`https`. ה-hostname עובר resolve, וכל כתובת פרטית, loopback, link-local או multicast נחסמת (`ipaddress`), כולל `mongo`, `backend`, `localhost` ו-`169.254.169.254`. timeout של 10 שניות, מקסימום 3MB, מקסימום 5 redirects, וכל redirect נבדק מחדש. רק `text/html`. מה שנשמר הוא טקסט נקי בלבד (trafilatura) ולא HTML.
5. **XSS:** React מבצע escape לכל טקסט. **אסור** `dangerouslySetInnerHTML` בכל הפרויקט. תוכן web ו-text מוצג כפסקאות טקסט. ב-nginx: `Content-Security-Policy` שמתיר רק את מה שצריך (`self`, `https://www.youtube.com`, `https://www.youtube-nocookie.com`, `https://i.ytimg.com`, `'wasm-unsafe-eval'` ל-onnx/mediapipe), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` (**חובה**: נגן YouTube מוטמע נכשל עם no-referrer), `Permissions-Policy: camera=(self)`. **בדוק בפועל** שה-CSP לא שובר את YouTube, MediaPipe או ONNX. אם כן, רכך ותעד.
6. **הגבלת ניסיונות התחברות:** 5 כישלונות ל-(email+IP) בתוך 15 דקות מחזירים 429 `"יותר מדי ניסיונות. נסי שוב בעוד כמה דקות"`. נשמר במונגו עם TTL.
7. **הזרקה:** כל קלט עובר דרך Pydantic עם טיפוסים קשיחים (str, לא dict), כך שאי אפשר להזריק אופרטורים של מונגו (`$ne`). מזהים עוברים `ObjectId()` עם try.
8. **ולידציה של קלט:** title 1–200 תווים. YouTube: regex שמוציא video id (11 תווים) מכל הצורות: `watch?v=`, `youtu.be/`, `shorts/`, `embed/`. text: 1–200,000 תווים. URL: עד 2,000 תווים.
9. **סודות:** כל סוד ב-`.env`, ש-`.gitignore` מתעלם ממנו. אין סודות בקוד או בתמונות (`.dockerignore` מוציא את `.env`). `GEMINI_API_KEY` ריק בהגשה.
10. **מצלמה:** נדלקת רק אחרי לחיצה על כפתור ייעודי ואישור. לשרת נשלחים רק מספרים (ציון, רמה, מיקום). מחיקת חשבון מוחקת הכול.

---

## 7. הלקוח: מסכים מדויקים

**כללי בהירות לסוכן הבודק (קריטי):**
- `<html lang="he" dir="rtl">`. כל input עם `<label>` אמיתי (`htmlFor`), שם ו-`autocomplete` מתאים.
- כל כפתור הוא טקסט עברי מלא ("הוספת פריט", "התחלת סשן", "הפעלת מצלמה", "סיום סשן", "התנתקות"). אייקון רק לצד הטקסט.
- כל פעולה מראה מצב: כפתור מושבת עם "שומר...", הודעת הצלחה, ושגיאה **ליד השדה** בעברית פשוטה.
- כותרת `<h1>` ברורה בכל עמוד, ו-`document.title` מתעדכן.
- ניגודיות AA. גופן: `Rubik` או `Heebo` (מקומי דרך `@fontsource`, בלי CDN).

**NavBar (מחוברת):** לוגו Rewind ⏪ · "הספרייה שלי" · "היסטוריה" · "הפרופיל שלי" · "איך זה עובד?" · "שלום, {display_name}" · כפתור **"התנתקות"**.
**לא מחוברת:** "התחברות" · "הרשמה". כל נתיב מוגן מפנה ל-`/login`. כל 401 מהשרת מוחק את הטוקן ומפנה ל-`/login` עם הודעה "החיבור פג, נא להתחבר שוב".
הטוקן נשמר ב-`localStorage` (כדי שרענון לא ינתק). בעלייה: `GET /api/users/me` לאימות.

### 7.1 הרשמה `/register`
שדות: "אימייל", "סיסמה" (עם רשימת כללים חיה ✓), "שם תצוגה". כפתור **"הרשמה"**. קישור "כבר יש לך חשבון? להתחברות".
409 ← "כתובת האימייל הזו כבר רשומה. אפשר להתחבר במקום." תחת שדה האימייל. סיסמה קצרה ← הודעה תחת הסיסמה (גם בדיקה בצד הלקוח וגם הודעת השרת).
הצלחה ← מעבר ל-`/login` עם האימייל ממולא מראש והודעה ירוקה "נרשמת בהצלחה! עכשיו אפשר להתחבר."

### 7.2 התחברות `/login`
"אימייל", "סיסמה", כפתור **"כניסה"**, קישור "אין לך חשבון? להרשמה". 401 ← "האימייל או הסיסמה שגויים". הצלחה ← `/library`.

### 7.3 הספרייה שלי `/library`
- כותרת "הספרייה שלי". שורת הסבר קצרה: "כאן נמצא כל מה שאת לומדת. פתחי פריט כדי להתחיל סשן מדידת ריכוז."
- **טופס הוספה בולט בראש העמוד** (לא מוסתר במודאל): "כותרת", בחירת סוג ב-radio עם טקסט מלא: **"סרטון YouTube"** (ברירת מחדל) / "טקסט להדבקה" / "דף אינטרנט (קישור)". השדה הבא משתנה לפי הסוג: "קישור לסרטון YouTube" / "הטקסט" (textarea) / "קישור לדף". כפתור **"הוספה לספרייה"**.
- ספרייה ריקה ← EmptyState עם אייקון קסטה ⏪: "הספרייה שלך עדיין ריקה. הוסיפי סרטון, טקסט או דף כדי להתחיל."
- כרטיס פריט: thumbnail (YouTube: `https://i.ytimg.com/vi/{id}/hqdefault.jpg`, אחרת אייקון סוג), **כותרת**, תגית סוג, תאריך, כפתור **"פתיחה"** (הכרטיס כולו גם קישור), כפתור **"מחיקה"** ← ConfirmDialog: "למחוק את '{title}'? ההיסטוריה של הסשנים תישמר." עם "כן, למחוק" / "ביטול".

### 7.4 צפייה וקריאה `/content/:id`: המסך המרכזי
**פריסה בדסקטופ:** תוכן מימין (≈65%), פאנל ריכוז משמאל (≈35%). **במובייל:** אחד מעל השני.

**תוכן:**
- YouTube: נגן דרך **YouTube IFrame Player API** (`youtube-nocookie.com` לא חובה. אם יש בעיה, `youtube.com`). צריך את `getCurrentTime()` ואת `seekTo()`.
- text / web: תצוגת קריאה (רוחב שורה ≈70 תווים, גופן 18px, רווח שורות 1.8). כל פסקה היא `<p data-idx>`. במהלך סשן כל פסקה מקבלת רקע עדין לפי הקשב (מפת חום). ל-web: שם האתר וקישור "פתיחת הדף המקורי בחלון חדש" (`rel="noopener noreferrer"`).
- **מיקום בתוכן:** YouTube = `getCurrentTime()` בשניות. טקסט = מעקב פסקה נראית עם IntersectionObserver: הפסקה הנראית העליונה ועוד החלק היחסי שנגלל (למשל `3.4`).

**פאנל ריכוז: מכונת מצבים ברורה עם שלבים ממוספרים:**
1. **לפני סשן:** כרטיס "שלב 1: התחלת סשן" עם הסבר בשורה וכפתור ראשי **"התחלת סשן"** (← `POST /api/sessions`).
2. **ConsentPanel: "שלב 2: הפעלת מצלמה":** טקסט: "כדי למדוד ריכוז, Rewind משתמש במצלמה. **הווידאו לא יוצא מהמחשב שלך.** הדפדפן מזהה נקודות על הפנים, ומודל קטן מחשב מהן ציון ריכוז בין 0 ל-1. לשרת נשלח רק הציון." + Select "בחירת מצלמה" (מ-`enumerateDevices`, ברירת מחדל: הראשונה. **חובה** כדי שמצלמה וירטואלית של OBS תעבוד) + כפתור **"הפעלת מצלמה"** + קישור משני "המשך בלי מצלמה".
   - סירוב או שגיאה ← הודעה ברורה: "לא קיבלנו גישה למצלמה, אז הסשן ממשיך בלי מדידה. אפשר לאפשר מצלמה בהגדרות הדפדפן ולנסות שוב." + כפתור "ניסיון חוזר". התוכן ממשיך לעבוד.
   - אחרי שמתקבלת רשימת התוויות (רק אחרי הרשאה), רענן את רשימת המצלמות.
3. **בזמן מדידה:**
   - preview קטן של המצלמה (מראה, `muted playsInline`) עם תווית "רק את רואה את זה".
   - **ScoreCard**, הכי בולט במסך: כותרת **"ציון הריכוז שלך"**, מספר גדול `0.82` (2 ספרות) + תווית רמה בעברית (מהסיווג ל-5 רמות: "לא מול המצלמה" / "לא מרוכזת" / "ריכוז חלש" / "מרוכזת" / "מרוכזת מאוד") + פס צבעוני. מתחת: "מתעדכן כל 2 שניות · 0 = לא מרוכזת, 1 = מרוכזת מאוד".
   - לפני הציון הראשון: "אוספת נתונים... הציון הראשון יופיע בעוד כ-{n} שניות" עם progress bar של מילוי החלון (0–100 פריימים).
   - **DebtMeter** מתחת לציון: "חוב קשב: 0:00" (mm:ss לסרטון, "X פסקאות" לטקסט) + שורת הסבר קטנה "זמן תוכן שעבר בלי ריכוז. אפשר להשלים במעבר שני בסוף." המספר מהבהב בעדינות כשהוא גדל. `aria-live="polite"`.
   - **אין פנים:** כשאין פנים ב-≥ 70% מהפריימים בשנייה האחרונה, מוצגת מיד הודעה צהובה בולטת **"לא זוהו פנים. ודאי שהפנים שלך מול המצלמה ובתאורה טובה."** + ה-Tape מציג משבצת אפורה מקווקוות ("אין פנים"). **לא מריצים את המודל** ולא שולחים מדידה. המדידה חוזרת אוטומטית כשהפנים חוזרות.
   - **התראת קשב נמוך (AlertBanner):** כשהציון המוחלק < **0.40** (היסטרזיס: חוזרים למצב "תקין" רק מעל 0.50). באנר בולט עם `role="alert"`: **"⚠️ הקשב שלך ירד"** + "החוב שלך גדל. רוצה לחזור לרגע שבו התחלת לאבד ריכוז?" + כפתורים: **"חזרה ל-{mm:ss}"** (YouTube: `seekTo`) / **"חזרה לפסקה"** (טקסט: scrollIntoView) + "הפסקה של 2 דקות" (עוצר את הסרטון ומציג טיימר נשימה קצר) + "סגירה". לטקסט, כשיש AI: גם "שאלת בדיקה קצרה". cooldown: לא יותר מהתראה אחת כל 45 שניות. נקודת החזרה = המיקום של המדידה האחרונה שבה הציון המוחלק עוד היה ≥ 0.5, פחות 5 שניות.
   - **FocusTape** מתחת לתוכן (קטעים שהוחמצו במסגרת אדומה עם ⏪): משבצות לפי מיקום וצבע ציון, tooltip "{mm:ss} · 0.74", לחיצה קופצת למיקום.
   - כפתור **"סיום סשן"**, תמיד גלוי בפאנל.
4. **סיום:** עוצרים מצלמה (`track.stop()`), `POST /end`. מוצג סיכום: "הסשן נשמר ✓" + ציון ממוצע + מספר מדידות + **חוב קשב** + רשימת הקטעים שהוחמצו (mm:ss–mm:ss, או מספרי פסקאות) + כפתורים: **"מעבר שני: לצפות רק במה שפספסתי ({debt})"** (מוצג רק אם חוב > 0. אם חוב 0: "כל הכבוד! צפית בכל התוכן בריכוז 🎉") / "לפרטי הסשן" / "להיסטוריה" / "חזרה לספרייה".
5. **מעבר שני (SecondPassPlayer):** נכנסים אליו מכפתור הסיכום, או מ"השלמת חוב" בעמוד הפריט, או מעמוד הסשן. נפתח סשן `POST /api/sessions {content_id, mode:"review", review_of}`. אם המצלמה כבר פעילה ממשיכים איתה, אחרת אותו ConsentPanel. כותרת: **"מעבר שני: קטע 1 מתוך 3"**. YouTube: `seekTo(start)` ← ניגון ← בדיקה כל 250ms, וכש-`currentTime ≥ end` עוברים לקטע הבא (או לחיצה על "לקטע הבא"). טקסט: מוצגות רק הפסקאות שבחוב, עם "הצגת כל הטקסט" לבחירה. כל אותו פאנל ריכוז פעיל (ציון, אין פנים, התראה). בסוף: `POST /end` ← השרת מחזיר `segments_closed` ו-`debt_remaining` ← מסך "סגרת 2 מתוך 3 קטעים. נשאר חוב של 0:25" + אפשרות לסבב נוסף.
- יציאה מהעמוד באמצע סשן (`beforeunload` או unmount) ← ניסיון `end` ב-`fetch` עם `keepalive: true` ועצירת המצלמה.

**פריט לא קיים או לא שלי:** עמוד NotFound: **"לא נמצא"** + "הפריט לא קיים או שאין לך גישה אליו." + קישור לספרייה. **בלי שום פרט** על הפריט. אותו דבר ל-`/sessions/:id` ולכל נתיב לא מוכר.

### 7.5 היסטוריה (ארכיון ההקלטות) `/history`
- כותרת **"היסטוריה"** ותת-כותרת "ארכיון ההקלטות שלך".
- למעלה: 4 כרטיסי סטטיסטיקה (סשנים, דקות למידה, ממוצע כללי, **חוב פתוח כולל**), גרף קו "הריכוז שלך לאורך זמן" (ממוצע לכל סשן), ו-"השעה הכי טובה שלך" (גרף עמודות לפי שעה).
- **"תוכן עם חוב פתוח":** לכל פריט שיש לו קטעים לא סגורים: כותרת + אחוז השלמה בריכוז (פס התקדמות) + כפתור "השלמת חוב (מעבר שני)".
- **רשימת סשנים (טבלה), שהיא החלק החובה:** עמודות **"תאריך"**, **"תוכן"**, **"ציון ממוצע"** (מספר + פס צבע), "סוג" (צפייה רגילה / מעבר שני), "משך", "חוב קשב", כפתור **"פרטים"**. חדש ראשון. ריקה ← "עוד אין הקלטות. התחילי סשן מהספרייה."
- **`/sessions/:id`:** כותרת עם שם התוכן ותאריך, סיכום, **גרף מדידות** (ציון גולמי + מוחלק, קו סף 0.4), **טבלת מדידות** (מיקום, ציון, רמה, זמן), ובלוק **"מה המודל ראה"**: הסבר שמשקלי Attention של v4_2 מראים איזה רגע בכל חלון של 10 שניות השפיע הכי הרבה, ופיזור של `attention_peak`. כפתור "המשך ללמוד את התוכן הזה" (אם הפריט עוד קיים).

### 7.6 הפרופיל שלי `/profile` (בונוס)
פרטים נוכחיים (אימייל, שם, תאריך הצטרפות). טופס "שינוי שם תצוגה" ← "שמירה". טופס "החלפת סיסמה" ("סיסמה נוכחית", "סיסמה חדשה") ← בהצלחה: "הסיסמה הוחלפה. מטעמי אבטחה צריך להתחבר מחדש" ← login. **"אזור מסוכן": "מחיקת החשבון"** ← dialog שדורש להקליד `מחיקה` ← הכול נמחק ← `/register` עם הודעה.

### 7.7 "איך זה עובד?" `/about`
עמוד קצר וברור: מה נמדד, איך (MediaPipe ← v4_2), מה נשמר ומה לא, מגבלות המודל ("הערכה סטטיסטית, לא קריאת מחשבות"), ומה זה "חוב קשב" ו"מעבר שני". מועיל גם לסוכן הבודק וגם להגנה על הפרויקט.

### 7.8 מובייל (בונוס)
Breakpoint ב-768px: NavBar הופך לתפריט עם כפתור "תפריט", הפאנל יורד מתחת לתוכן, הטבלאות הופכות לכרטיסים, וכל הכפתורים לפחות 44px. בדוק ב-375px.

---

## 8. מנוע הריכוז (`src/focus/`): המפרט הטכני

### 8.1 MediaPipe
- `FaceLandmarker` עם `runningMode: "VIDEO"`, `numFaces: 1`, `outputFaceBlendshapes: false`.
- **קבצים מקומיים (בלי CDN בזמן ריצה):** העתק את `node_modules/@mediapipe/tasks-vision/wasm/*` אל `public/mediapipe/wasm/`. את `face_landmarker.task` הורד **בזמן build של Docker** (שלב ב-Dockerfile עם `curl` מ-`https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`) או בסקריפט `npm run fetch-assets`, ושמור ב-`public/mediapipe/`. אם אין גישת רשת בסביבה שלך, הכן את הסקריפט ותעד ב-USER_TODO.
- `delegate: "GPU"` עם fallback אוטומטי ל-`"CPU"` אם יצירת המודל נכשלת (חשוב למכונת הבדיקה).

### 8.2 לולאה ב-10fps
- טיימר כל 100ms (`setInterval`, או `requestVideoFrameCallback` עם throttle ל-100ms). בכל טיק: `detectForVideo(video, performance.now())`.
- פנים נמצאו ← `Float32Array(478*3)` של x, y, z **גולמיים** (בלי נרמול: הנרמול בתוך המודל) נכנס ל-ring buffer של 100 פריימים.
- אין פנים ← סופרים פריים חסר ולא מכניסים לחלון. אם ב-10 הטיקים האחרונים ≥ 7 בלי פנים, מצב `noFace = true`. **כשהפנים חוזרות, ממשיכים למלא את החלון** (לא מאפסים, כדי שהציון יחזור מהר. תעד את הבחירה).
- אם הלשונית מוסתרת (`document.hidden`), עוצרים מדידה ומציגים "המדידה מושהית כשהלשונית לא פעילה".

### 8.3 הסקה
- `ort.env.wasm.wasmPaths = "/ort/"` (העתק את קבצי ה-wasm של onnxruntime-web ל-`public/ort/`). `numThreads = 1` כדי לא להזדקק ל-cross-origin isolation (תעד).
- טעינה **פעם אחת** (singleton promise) של `/models/v4_2.onnx`. שם הקלט מ-`session.inputNames[0]` (ב-v4_2 הוא `input_x`).
- **מבנה הפלטים שנבדק בפועל על הקבצים:**
  - v1–v3: קלט `input` ← `output [B,1]`
  - v4: קלט `input_x` ← `regression_scores [B,1]`, `classification_logits [B,5]`
  - v4_2, v4_3, v4_4, v4_7, v4_66: קלט `input_x` ← `regression_scores [B,1]`, `classification_logits [B,5]`, `attention_weights [B,T]`
- קוד: קרא פלטים **לפי שם** אם קיים (`regression_scores`), אחרת `outputNames[0]`. כתוב את `model.js` כך שאפשר להחליף גרסה בשורה אחת (`MODEL_VERSION` בקובץ config), עם תמיכה בפלטים חסרים.
- כל **2 שניות**, אם החלון מלא (100) ו-`!noFace`: tensor `[1,100,478,3]` (סדר כרונולוגי מה-ring buffer) ← run ←
  - `score = clamp(regression[0], 0, 1)`
  - `level = argmax(softmax(logits))` (0 = לא במצלמה ... 4 = מרוכז מאוד)
  - `attention_peak = argmax(attention_weights) / 99`
- הציון הראשון אחרי כ-10 שניות (100 פריימים). תעד את זה ב-PROJECT_INFO (`seconds_until_first_score`: כ-10–12).

### 8.4 החלקה והתערבות (`smoothing.js`: פונקציות טהורות עם בדיקות יחידה)
- `ema(prev, x, alpha=0.5)`. התצוגה הראשית מראה את **הציון הגולמי האחרון** (זה מה שהמטלה מתארת), והמוחלק משמש להתראה ולחישוב החוב. רשום את זה בפאנל: "ציון מוחלק: 0.71".
- היסטרזיס: נכנסים ל-`low` כשמוחלק < 0.40, יוצאים כשמוחלק > 0.50. cooldown של 45 שניות בין התראות.
- בדיקות יחידה (Vitest) ל-ema, להיסטרזיס, ל-cooldown ולחישוב נקודת החזרה.

### 8.5 שליחה לשרת
`POST /readings` עם `{position, score, smoothed, level, attention_peak}`. כישלון רשת ← retry אחד ואז ממשיכים (לא תוקעים את ה-UI). 409 (סשן נסגר) ← עוצרים מדידה.

### 8.6 התאמה למצלמה הווירטואלית של הבודק
- רוחב/גובה מבוקשים: `{ideal: 640} x {ideal: 480}`, `frameRate: {ideal: 15}`. בלי `exact` (מצלמה וירטואלית עלולה לא לתמוך).
- בדוק עם Chrome: `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream --use-file-for-fake-video-capture=face.y4m` (ראו סעיף 11).
- חיתוך פנים לפני MediaPipe: **לא** בגרסה הראשונה. ההוראות אומרות "לבדוק בניסוי". רשום ב-DECISIONS שהשתמשנו בפריים המלא כי MediaPipe עצמו מאתר את הפנים.

---

## 9. Docker

### backend/Dockerfile
`python:3.12-slim`, `pip install --no-cache-dir -r requirements.txt`, משתמש לא-root, `EXPOSE 8000`, `CMD uvicorn app.main:app --host 0.0.0.0 --port 8000`. HEALTHCHECK עם python urllib ל-`/health`.

### frontend/Dockerfile (multi-stage)
1. `node:20-alpine`: `npm ci` ← העתקת wasm של mediapipe ושל ort ל-public ← הורדת `face_landmarker.task` ← `npm run build`.
2. `nginx:1.27-alpine`: `dist` אל `/usr/share/nginx/html`, `default.conf.template` אל `/etc/nginx/templates/`. `ENV BACKEND_URL=http://backend:8000`. SPA fallback (`try_files $uri /index.html`). MIME ל-`.wasm` (`application/wasm`) ול-`.onnx` (`application/octet-stream`). cache ארוך לנכסים. `client_max_body_size 1m`.
- **את קובץ ה-ONNX** העתק לפני ה-build מ-`materials/focusflow-models/v4_2.onnx` אל `frontend/public/models/` (סקריפט `scripts/prepare_assets.sh`). רק v4_2 נכנס לתמונה (15.7MB), לא כל התשעה. **הקובץ בתוך התמונה ולא יורד בזמן ריצה** (דרישה).

### docker-compose.yml (ההגשה)
```yaml
name: rewind
services:
  mongo:
    image: mongo:7
    restart: unless-stopped
    volumes: [mongo_data:/data/db]
    healthcheck:
      test: ["CMD", "mongosh", "--quiet", "--eval", "db.adminCommand('ping').ok"]
      interval: 5s
      timeout: 5s
      retries: 20
  backend:
    image: ${DOCKERHUB_USER:-TODO_USER}/rewind-backend:1.0.0
    restart: unless-stopped
    env_file: .env
    depends_on: { mongo: { condition: service_healthy } }
    ports: ["8000:8000"]
  frontend:
    image: ${DOCKERHUB_USER:-TODO_USER}/rewind-frontend:1.0.0
    restart: unless-stopped
    environment: { BACKEND_URL: http://backend:8000 }
    depends_on: [backend]
    ports: ["3000:80"]
volumes:
  mongo_data:
```
- **בקובץ ההגשה הסופי שם המשתמש ב-Docker Hub כתוב מפורשות** (לא משתנה). עד שהמשתמשת מספקת אותו, השאר `TODO_USER` ורשום ב-USER_TODO.
- **לא חושפים את 27017 החוצה** (מונגו פנימי בלבד, וזו נקודת אבטחה).
- `docker-compose.dev.yml`: אותו דבר עם `build:` ל-backend ו-frontend, ו-tag `:dev`.
- התמונות חייבות להיות **ציבוריות** ו-**linux/amd64**. `scripts/build_and_push.sh`:
  ```bash
  docker buildx build --platform linux/amd64 -t $USER/rewind-backend:1.0.0 --push ./backend
  docker buildx build --platform linux/amd64 -t $USER/rewind-frontend:1.0.0 --push ./frontend
  ```

### .env (מוגש)
```
MONGODB_URI=mongodb://mongo:27017
DB_NAME=rewind
JWT_SECRET=<מחרוזת אקראית של 64 תווים hex שתיווצר עם secrets.token_hex(32)>
JWT_EXPIRE_MINUTES=60
ALLOWED_ORIGINS=http://localhost:3000
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
```
(`GEMINI_MODEL` נקבע במשתנה כי שמות מודלים משתנים. בדוק את השם העדכני אם יש לך גישה לרשת, ותעד.)

---

## 10. Gemini (בונוס, רשות): "שאלת בדיקה"
- רק לתוכן text/web: כשהקשב יורד, כפתור "שאלת בדיקה קצרה" שולח לשרת את `content_id` ו-`paragraph_index`. השרת לוקח את הפסקה ואת 1–2 הפסקאות שלפניה (**השרת שולף מהמסד, לא מקבל טקסט מהלקוח**), ומבקש מ-Gemini שאלה אמריקאית אחת בעברית ב-JSON (`response_mime_type: application/json`). ולידציה של המבנה. כשל ← 502 עם הודעה מנומסת.
- **בלי מפתח:** `GET /api/ai/status` מחזיר `enabled:false`, והכפתור לא מוצג. במקומו טקסט קטן "שאלות AI לא זמינות בהתקנה הזו". שום דבר לא נשבר.
- timeout של 15 שניות. בלי לוג של תוכן.

---

## 11. בדיקות (חובה לפני שמכריזים "סיימתי")

1. **Backend: pytest** (`httpx.AsyncClient` + מונגו אמיתי מ-docker, או `mongomock-motor`/`AsyncMongoMockClient` אם אין docker). כיסוי מינימלי:
   register (201, 409 גם באותיות גדולות, 422 לסיסמה קצרה), login (200, 401, 429 אחרי 5), logout (הטוקן הישן מחזיר 401), me, הפרדה (משתמש B מקבל 404 על פריט ועל סשן של A, ומזהה לא תקין מחזיר 404), content (חילוץ youtube id, 422 לסוג לא נתמך), readings (201, 409 אחרי end, 422 לציון 1.5), end (ממוצע נכון, אידמפוטנטי), **segments: יחידה ל-compute_missed_segments (רצף נמוך, מיזוג קטעים קרובים, גבול 0, פסקאות) ול-close_segments, ואינטגרציה: watch עם מדידות נמוכות ← end מחזיר חוב ← review עם מדידות גבוהות בטווח ← החוב המקורי יורד; review_of של משתמש אחר מחזיר 404**, delete account (מחיקה מדורגת), password change (טוקן ישן מחזיר 401), SSRF (`http://localhost`, `http://mongo:27017`, `http://169.254.169.254` נחסמים), health.
2. **Frontend: Vitest** ל-`smoothing.js` ולמחלץ ה-YouTube id.
3. **בדיקת מודל:** סקריפט Node (`scripts/check_model.mjs`) שטוען את v4_2 עם `onnxruntime-node` על אפסים `[1,100,478,3]` ומוודא 3 פלטים.
4. **E2E: Playwright (Chromium)** עם מצלמה מזויפת:
   - הכן קובץ `e2e/fixtures/face.y4m`. אם יש רשת: הורד סרטון קצר וחופשי של פנים (Pexels או Mixkit) והמר עם `ffmpeg -i in.mp4 -vf scale=640:480 -r 15 -pix_fmt yuv420p face.y4m`. אחרת, דלג על בדיקת "ציון מופיע" ותעד.
   - `launchOptions.args`: `--use-fake-device-for-media-stream`, `--use-fake-ui-for-media-stream`, `--use-file-for-fake-video-capture=...`
   - תרחיש **שמשחזר בדיוק את טבלת הניקוד**: הרשמה (+ אימייל קיים + סיסמה קצרה) ← התחברות (+ סיסמה שגויה) ← שם תצוגה מוצג ← הוספת YouTube ← פתיחה ← התחלת סשן ← הפעלת מצלמה ← המתנה עד ~20 שניות לציון בין 0 ל-1 ← סיום ← מופיע בהיסטוריה עם ממוצע ← משתמש שני: ספרייה ריקה ← URL של פריט של הראשון מציג "לא נמצא" ← התנתקות מחזירה ל-login. בלי מצלמה (ה-fake device ברירת המחדל של Chrome הוא דפוס בלי פנים): מופיע "לא זוהו פנים".
   - תרחיש **מעבר שני**: צור דרך ה-API סשן watch עם מדידות נמוכות (0.2) על YouTube ← end ← בממשק: עמוד הסשן מציג חוב וקטעים ← "מעבר שני" נפתח עם "קטע 1 מתוך N" ← הנגן קופץ לתחילת הקטע. את הסגירה עצמה בודקים ב-pytest (אין דרך לייצר ציון גבוה מובטח עם מצלמה מזויפת).
5. **Docker:** אם docker זמין, `docker compose -f docker-compose.dev.yml up --build -d` ← `curl localhost:8000/health` ← `curl localhost:3000` ← `curl localhost:3000/api/...` דרך ה-proxy ← E2E מול 3000. **רענן את הדף אחרי התחברות**, ובדוק שהמשתמשת נשארת מחוברת.
6. **ביקורת עצמית:** עבור על טבלת הניקוד (10 שורות, 100 נקודות) ועל טבלת הבונוסים, וסמן ✅/⚠️/❌ לכל שורה ב-`docs/TEST_REPORT.md`.
7. אם משהו לא ניתן לבדיקה בסביבה שלך (אין docker, אין רשת), **אל תמציא תוצאה.** כתוב בדיוק מה לא נבדק ב-TEST_REPORT וב-USER_TODO.

---

## 12. קבצי ההגשה

### PROJECT_INFO.docx
- אם יש `materials/PROJECT_INFO.docx`: **מלא את התבנית המקורית** עם `python-docx` (את העמודה האחרונה בלבד, בלי לשנות שמות שדות ובלי למחוק שורות).
- אם יש רק PDF: שחזר את המבנה המדויק (כותרות, 7 טבלאות, 3 עמודות: שדה / הסבר / התשובה שלכם, כל השדות בסדר המקורי) ב-`scripts/make_project_info.py`, ורשום את זה ב-USER_TODO ("אם יש לכן את ה-docx המקורי, הריצו שוב את הסקריפט עליו").
- **תשובות מוצעות** (עדכן לפי מה שבאמת נבנה):
  - project_name: `Rewind – לא מפספסים אף רגע`
  - authors: `TODO_USER` (אימיילי grunitech מופרדים בפסיק, בלי רווחים)
  - one_sentence_description: "אתר לימוד שמודד ריכוז דרך המצלמה בזמן צפייה בסרטון או קריאת טקסט, מסמן את הקטעים שהוחמצו כ'חוב קשב', ומאפשר לצפות שוב רק בהם במעבר שני עד שהחוב נסגר."
  - main_content_type: `video` (YouTube)
  - what_is_a_content_item: סרטון YouTube (קישור + כותרת). נתמכים גם: טקסט ארוך שמודבק, ודף אינטרנט (קישור, השרת שולף את הטקסט ומציג אותו בתצוגת קריאה).
  - sample_content_type: `video`
  - sample_content_for_testing: קישור YouTube קצר שמאפשר הטמעה (**בחר סרטון חינוכי קצר ומוכר, בדוק שההטמעה עובדת** אם אפשר, ורשום ב-USER_TODO "לוודא שהסרטון נפתח בנגן באתר").
  - interface_language: `hebrew`
  - backend_framework: FastAPI (Python 3.12) · frontend_framework: React 18 + Vite (JavaScript) מוגש ב-nginx · database: MongoDB 7, קונטיינר ב-Compose עם volume
  - what_is_measured: קשב (attention), 0–1. מעל 0.7 מרוכז, 0.4–0.7 ביניים, מתחת ל-0.4 קשב נמוך עם התראה. מוצגת גם רמה מילולית מתוך 5.
  - models_used: v4_2 (GRU + Attention) בדפדפן עם onnxruntime-web. MediaPipe FaceLandmarker בדפדפן. כלום בשרת.
  - model_highlights: החלקת EMA, סף עם היסטרזיס ו-cooldown, שימוש בסיווג ל-5 רמות ובמשקלי Attention, "חזרה לרגע שהחמצת", סרט קשב, חוב קשב ומעבר שני שבו השרת מחשב אילו קטעים נסגרו, מפת חום לפסקאות, אנליטיקה.
  - changes_to_recommended_api: נוספו readings שדות אופציונליים (smoothed, level, attention_peak), ונתיבי /api/analytics/overview, /api/ai/*. סשן קיבל mode/review_of (מעבר שני), end מחזיר גם missed_segments וחוב, ונוספו GET /api/content/{id}/debt, PATCH /api/content/{id}, POST /api/sessions/{id}/segments/{idx}/watched. login יכול להחזיר 429. אחרת זהה.
  - how_to_register / how_to_start_a_session: צעדים מדויקים עם שמות הכפתורים כפי שהם באתר.
  - what_is_a_session: `same`
  - camera_notes: נבחרת המצלמה הראשונה כברירת מחדל, ויש רשימה לבחירת מצלמה אחרת (כולל וירטואלית/OBS). המצלמה נדלקת רק אחרי "הפעלת מצלמה" ואישור הדפדפן. בסירוב ממשיכים בלי מדידה.
  - where_the_score_appears: במסך הצפייה, בפאנל משמאל: מספר גדול 0.00–1.00 תחת "ציון הריכוז שלך", עם רמה מילולית, פס צבע ו"חוב קשב" מתחת.
  - seconds_until_first_score: ~10–12
  - low_focus_reaction: ציון מוחלק מתחת ל-0.40 מציג באנר "הקשב שלך ירד" עם כפתור חזרה לנקודה שבה הקשב התחיל לרדת והצעה להפסקה.
  - run_command: `docker compose up` · setup_notes: הלקוח ב-http://localhost:3000, השרת ב-http://localhost:8000/health. המצלמה עובדת ב-localhost.
  - סעיף האבטחה: מתוך סעיף 6, קונקרטי (שמות ספריות, ערכים).
  - plugin: `none` · extra_features / what_makes_it_yours: מתוך סעיף 1.
  - works_fully / partially_works_or_missing / known_issues: **בכנות, לפי TEST_REPORT.**

### assignment3.zip
`scripts/package_submission.sh` בונה `submission/assignment3.zip` עם **שלושה קבצים בשורש** (לא בתוך תיקייה): `docker-compose.yml`, `.env`, `PROJECT_INFO.docx`. בדוק עם `unzip -l`. אחר כך ודא ש-`.env` שבזיפ: `GEMINI_API_KEY` ריק, ואין שם `TODO_USER` (אם יש, הזהר ב-USER_TODO).

### דיאגרמות (`docs/diagrams/`, ב-Mermaid)
Use Case, ארכיטקטורה (3 קונטיינרים), Sequence של סשן צפייה (מצלמה ← MediaPipe ← מודל ← readings ← התראה), ERD של האוספים, מכונת מצבים של פאנל הריכוז. אם `@mermaid-js/mermaid-cli` עובד, ייצא גם PNG.

---

## 13. שלושת מסמכי הסיום (בעברית)

### `docs/DECISIONS.md`: כל ההחלטות ולמה
לכל החלטה:
```
### D-012 · ריצת המודל בדפדפן ולא בשרת
- **מה בחרנו:** ...
- **אפשרויות שנשקלו:** א) ... ב) ...
- **למה זה המומלץ:** (פרטיות / פשטות / ניקוד / ביצועים)
- **מה המחיר:** ...
- **איך להסביר את זה בהגנה (משפט אחד):** ...
```
כולל את כל ההחלטות בקובץ הזה (טכנולוגיות, v4_2, ספים, אבטחה, מבנה DB, proxy) ואת כל מה שהחלטת בעצמך תוך כדי. בסוף: טבלת סיכום קצרה.

### `docs/PROJECT_GUIDE.md`: מדריך לימוד (הכי חשוב למשתמשת)
כתוב כאילו את מלמד סטודנטית חכמה שלא כתבה את הקוד, כדי שתוכל להגן על הפרויקט ולהסביר כל חלק. מבנה:
1. **הפרויקט ב-2 דקות:** מה זה, למה זה מעניין, תרשים.
2. **מילון מושגים:** API, REST, JWT, hash, argon2, salt, Docker, image, container, compose, volume, reverse proxy, MediaPipe, landmarks, ONNX, WASM, GRU, Attention, EMA, היסטרזיס, CORS, SSRF, XSS, RTL. לכל אחד שניים-שלושה משפטים ודוגמה מהפרויקט.
3. **מסע של בקשה:** מה קורה צעד אחר צעד מהלחיצה על "הרשמה" ועד שהמשתמש במסד, ואותו דבר ל"התחברות" ולמדידה אחת (מהפריים במצלמה ועד שורה ב-readings).
4. **סיור בקבצים:** כל קובץ חשוב: מה הוא עושה, הפונקציות המרכזיות, וקטע קוד קצר מוסבר.
5. **המודל לעומק:** קלט ופלט, למה 100 פריימים, מה v4_2 מחזיר, איך מפרשים, מגבלות ואיך המערכת מתמודדת.
6. **אבטחה:** כל הגנה, איך היא עובדת ואיפה בקוד.
7. **Docker:** מה כל שירות עושה, למה `mongo` ולא `localhost`, איך בונים ומעלים.
8. **איך להריץ, לבדוק ולשנות דברים:** "רוצה לשנות את הסף? קובץ X שורה Y".
9. **שאלות הגנה צפויות + תשובות:** לפחות 25 (למשל "למה המודל בדפדפן?", "מה קורה אם גונבים טוקן?", "למה argon2?", "איך מונעים ממשתמש לראות סשן של אחר?", "מה המודל מפספס?", "למה החלקה?", "איך מחושב חוב הקשב ולמה מורידים 10 שניות מתחילת הקטע?", "למה הסגירה של קטעים בשרת ולא בלקוח?", "מה זה היסטרזיס ולמה צריך?").
10. **רעיונות להמשך הפרויקט הסופי:** אימון מודל משלכן, תוסף Chrome, Atlas.

### `docs/USER_TODO.md`: מה נשאר לך לעשות
רשימה ממוספרת וקצרה, כל שלב עם פקודה מדויקת:
1. למלא את האימיילים ב-PROJECT_INFO (`authors`).
2. `docker login` ← `DOCKERHUB_USER=xxx ./scripts/build_and_push.sh` ← לעדכן את שם המשתמש ב-docker-compose.yml ← לוודא שהתמונות **Public** ב-Docker Hub.
3. לבדוק בתיקייה ריקה: לשים בה רק את 3 הקבצים ← `docker compose up` ← לעבור על האתר כמו משתמשת חדשה, עם מצלמה אמיתית ועם OBS אם אפשר.
4. `./scripts/package_submission.sh` ← להגיש את `submission/assignment3.zip`.
5. כל דבר שלא נבדק בסביבה שלך.

---

## 14. סדר העבודה (צור task list ועבוד לפיו)

1. קרא את `materials/` (PDF המטלה במלואו). צור ריפו, `.gitignore`, ו-`git init` עם commits קטנים בכל שלב.
2. Backend: config, db, security, auth ← users ← content (כולל webpage + SSRF) ← sessions/readings ← analytics ← ai. **pytest ירוק.**
3. Frontend: שלד, routing, AuthContext, api client, theme ← Register/Login ← Library ← ContentView בלי מצלמה (נגן, טקסט, מיקום) ← מנוע הריכוז (camera, landmarker, model, hook) ← ScoreCard/Alert/NoFace ← DebtMeter/FocusTape/Heatmap ← SecondPassPlayer ← History/Archive/SessionDetail ← Profile ← About ← מובייל.
4. Docker: Dockerfiles, nginx template, compose dev, `prepare_assets.sh`. הרמה ובדיקה.
5. E2E עם Playwright ותיקונים.
6. ליטוש בהירות: עבור על כל מסך כאילו את סוכן AI שלא מכיר את האתר. האם ברור מה ללחוץ? האם יש הודעה לכל מצב?
7. מסמכים: DECISIONS (כבר התמלא תוך כדי), PROJECT_GUIDE, diagrams, PROJECT_INFO.docx, TEST_REPORT, USER_TODO.
8. אריזה: `assignment3.zip` ובדיקה סופית מול טבלת הניקוד.

**Definition of Done:** כל 10 שורות הניקוד עובדות (או מתועדות בכנות למה לא נבדקו), pytest ו-vitest ירוקים, `submission/assignment3.zip` קיים במבנה הנכון, ו-`docs/` מכיל DECISIONS, PROJECT_GUIDE, USER_TODO, TEST_REPORT ודיאגרמות.

---

## 15. מה **לא** לעשות
- לא לבנות תוסף דפדפן (30 הנקודות מחייבות התייעצות מראש עם צוות הקורס). להזכיר רק כרעיון להמשך.
- לא לממש אישור הרשמה באימייל (מסכן את זרימת ההרשמה של הבודק). לתעד כהחלטה.
- לא להריץ את המודל בשרת ולא WebSocket.
- לא לשמור וידאו, תמונות או landmarks בשרת.
- לא `dangerouslySetInnerHTML`, לא סודות בקוד, לא `localhost` כ-host של מונגו בתוך docker.
- לא להחליף את הציון המספרי, את רשימת ההיסטוריה או את כפתורי הטקסט בגרסה "יצירתית" בלבד.
- לא לשאול את המשתמשת שאלות. להחליט, לתעד, להמשיך.
