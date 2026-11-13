# מה נשאר לך לעשות

כל השאר כבר בנוי ונבדק (ראו `docs/TEST_REPORT.md`). נשארו רק דברים שצריכים את הפרטים או את החשבונות שלכן.
הפקודות כתובות ל-**Git Bash** (ב-Windows) או לטרמינל ב-Mac/Linux, מתוך תיקיית הפרויקט `rewind/`.

## 1. להעלות את התמונות ל-Docker Hub (חובה, בלי זה הבודק לא יכול להריץ)
```bash
docker login                                   # עם המשתמש של Docker Hub
DOCKERHUB_USER=<שם-המשתמש-שלך> ./scripts/build_and_push.sh
```
הסקריפט מעתיק את המודל לתוך תיקיית הלקוח, בונה את שתי התמונות ל-`linux/amd64`, דוחף אותן, **ומחליף את `TODO_USER` בשם שלך בתוך `docker-compose.yml`**.
אחר כך יש להיכנס ל-https://hub.docker.com, לפתוח את `rewind-backend` ואת `rewind-frontend` ולוודא שהן **Public** (Settings ← Visibility).

## 2. לבנות את קובץ ההגשה, עם האימיילים שלכן
```bash
./scripts/package_submission.sh --authors name1@grunitech.com,name2@grunitech.com
```
- האימיילים מופרדים בפסיק, **בלי רווחים**.
- התוצאה: `submission/assignment3.zip` עם שלושה קבצים בשורש: `docker-compose.yml`, `.env` ו-`PROJECT_INFO.docx`.
- הסקריפט מזהיר אם נשאר `TODO_USER` או אם `GEMINI_API_KEY` לא ריק.
- **אם יש לכן את קובץ ה-docx המקורי של התבנית** (יש לנו רק את ה-PDF, ולכן שיחזרנו את המבנה): שמרו אותו כ-`materials/PROJECT_INFO.docx` והריצו
  `docker run --rm -v "$PWD:/w" -w /w python:3.12-slim sh -c "pip install -q python-docx==1.2.0 && python scripts/make_project_info.py --template materials/PROJECT_INFO.docx --authors ..."`
  ואז שוב את `package_submission.sh`. התשובות ייכנסו לעמודה האחרונה של התבנית המקורית.

## 3. בדיקה אחרונה, כמו הבודק
1. ליצור תיקייה ריקה (למשל על שולחן העבודה) ולחלץ אליה **רק** את `assignment3.zip`.
2. לעצור את הגרסה של הפיתוח, אם היא רצה: `docker compose -f docker-compose.dev.yml down`.
3. בתיקייה החדשה: `docker compose up`. התמונות צריכות להימשך מ-Docker Hub (זה מוכיח שהן ציבוריות).
4. לפתוח http://localhost:3000 ולעבור על האתר כמו משתמשת חדשה: הרשמה, התחברות, הוספת הסרטון מתוך PROJECT_INFO, "התחלת סשן", "הפעלת מצלמה", לחכות לציון, "סיום סשן", היסטוריה, משתמשת שנייה, "לא נמצא", התנתקות.
5. **עם מצלמה אמיתית**, ואם אפשר גם עם **OBS Virtual Camera**: בוחרים אותה ב"בחירת מצלמה". שבו מול **מרכז** המצלמה (המודל נותן ציון נמוך יותר לפנים בצד הפריים).
6. לוודא שהסרטון לדוגמה (https://www.youtube.com/watch?v=aircAruvnKk) נפתח בנגן באתר. אם לא, להחליף אותו ב-`scripts/make_project_info.py` (השדה `YT`) ולבנות שוב את ההגשה.

## 4. להגיש
את `submission/assignment3.zip`.

## 5. מה לא נבדק אצלנו (כדאי לבדוק בעצמכן אם יש זמן)
- מצלמה אמיתית ו-OBS (נבדק רק עם המצלמה המזויפת של Chrome).
- Firefox, Safari וטלפון אמיתי (נבדק Chromium, כולל רוחב 375px).
- Gemini עם מפתח אמיתי (רשות: שמים מפתח ב-`.env` **המקומי** בלבד ומפעילים מחדש. **בהגשה המפתח נשאר ריק!**).

## 6. להגנה על הפרויקט
לקרוא את `docs/PROJECT_GUIDE.md`, ובמיוחד את פרק 9 (שאלות צפויות), ואת `docs/DECISIONS.md`, ובמיוחד את D-029 (למה v4_7) ואת D-030 (למה CPU).
