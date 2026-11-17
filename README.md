# Rewind ⏪ · לא מפספסים אף רגע

אתר לימוד שמודד ריכוז דרך המצלמה בזמן צפייה בסרטון YouTube או קריאת טקסט, מסמן את הקטעים שהוחמצו כ**חוב קשב**,
ומאפשר לצפות שוב רק בהם ב**מעבר שני**, עד שהחוב נסגר. (מטלה 3, Power Tech 2026)

- **לקוח:** React 18 + Vite, מוגש ב-nginx (http://localhost:3000). MediaPipe ומודל הקשב **v4_7** רצים בדפדפן.
- **שרת:** FastAPI, Python 3.12 (http://localhost:8000, `/health`, `/docs`).
- **מסד:** MongoDB 7 עם volume.

## הרצה (כמו הבודק)
```bash
docker compose up        # docker-compose.yml + .env, מושך תמונות מוכנות
```

## פיתוח
```bash
bash scripts/prepare_assets.sh                          # מעתיק את v4_7.onnx לתוך frontend/public/models
cp .env.example .env                                    # ולמלא JWT_SECRET
docker compose -f docker-compose.dev.yml up -d --build  # בונה מקומית
```
בלי Docker ללקוח: `cd frontend && npm install && npm run fetch-assets && npm run dev` (פרוקסי ל-localhost:8000).

## בדיקות
```bash
./scripts/run_tests.sh          # pytest (מול Mongo אמיתי), vitest, בדיקת מודל
./scripts/run_tests.sh --e2e    # + Playwright עם מצלמה מזויפת
```

## מסמכים
| קובץ | מה יש בו |
|---|---|
| [docs/PROJECT_GUIDE.md](docs/PROJECT_GUIDE.md) | מדריך לימוד מלא: מושגים, מסע של בקשה, סיור בקבצים, המודל, אבטחה, שאלות הגנה |
| [docs/DECISIONS.md](docs/DECISIONS.md) | כל ההחלטות ולמה, כולל ניסוי 9 המודלים |
| [docs/TEST_REPORT.md](docs/TEST_REPORT.md) | מה נבדק, איך, ומה לא |
| [docs/USER_TODO.md](docs/USER_TODO.md) | מה נשאר לעשות לפני ההגשה |
| [docs/diagrams/diagrams.md](docs/diagrams/diagrams.md) | Use Case, ארכיטקטורה, Sequence, ERD, מכונת מצבים |

## בענן (מטלה 4)
אותן תמונות רצות ב-Google Cloud Run מאחורי Load Balancer עם HTTPS. איך מפעילים: ראשית `docs/USER_TODO.md`. איך זה עובד: `docs/CLOUD_GUIDE.md`. הסקריפטים ב-`deploy/` (PowerShell). סיכום: `docs/A4_SUMMARY.md`.
