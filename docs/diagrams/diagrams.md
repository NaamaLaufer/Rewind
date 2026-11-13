# דיאגרמות Rewind

כל הדיאגרמות כתובות ב-Mermaid (GitHub ו-VS Code מציגים אותן ישירות). קובצי PNG נוצרו מהן עם `e2e/render_diagrams.mjs`.

## 1. Use Case
![Use case](use-case.png)

```mermaid
flowchart LR
  U(["👩‍🎓 משתמשת"])
  G(["👤 אורחת"])
  subgraph Rewind
    R[הרשמה] ; L[התחברות] ; O[התנתקות]
    A[הוספת פריט: YouTube / טקסט / דף]
    D[מחיקת פריט]
    S[סשן צפייה עם מדידת ריכוז]
    C[הפעלת מצלמה בהסכמה]
    AL[קבלת התראה + חזרה לרגע שהוחמץ]
    SP[מעבר שני: רק הקטעים שהוחמצו]
    H[היסטוריה ואנליטיקה]
    P[פרופיל: שם, סיסמה, מחיקת חשבון]
    Q[שאלת בדיקה - Gemini, רשות]
  end
  G --> R & L
  U --> O & A & D & S & H & P
  S -. כולל .-> C
  S -. מרחיב .-> AL
  S -. מרחיב .-> SP
  AL -. מרחיב .-> Q
```

## 2. ארכיטקטורה: 3 קונטיינרים
![Architecture](architecture.png)

```mermaid
flowchart TB
  subgraph Browser["דפדפן (localhost:3000)"]
    UI["React UI"]
    CAM["מצלמה"] --> MP["MediaPipe FaceLandmarker<br/>478 נקודות · 10fps · CPU"]
    MP --> BUF["חלון נע<br/>100 פריימים"]
    BUF --> ORT["onnxruntime-web<br/>v4_7 · כל 2 שניות"]
    ORT --> UI
  end
  subgraph Docker["docker compose"]
    subgraph FE["frontend · nginx:1.27 · :3000→80"]
      ST["קבצים סטטיים<br/>+ v4_7.onnx + wasm"]
      PX["reverse proxy /api/*"]
    end
    subgraph BE["backend · FastAPI · :8000"]
      API["/api/* + /health"]
    end
    subgraph DB["mongo:7 · פנימי בלבד"]
      M[("volume<br/>mongo_data")]
    end
  end
  UI -- "HTTP /api (JSON, Bearer JWT)" --> PX
  Browser -. "טעינת האתר" .-> ST
  PX -- "BACKEND_URL=http://backend:8000" --> API
  API -- "mongodb://mongo:27017" --> M
  YT["YouTube IFrame API"] -. iframe .-> UI
```

## 3. Sequence: סשן צפייה ומדידה אחת
![Sequence](sequence.png)

```mermaid
sequenceDiagram
  autonumber
  actor U as משתמשת
  participant UI as React (ContentView)
  participant ENG as useFocusEngine
  participant API as FastAPI
  participant DB as MongoDB
  U->>UI: "התחלת סשן"
  UI->>API: POST /api/sessions {content_id}
  API->>DB: insert sessions (owner_id מהטוקן)
  API-->>UI: 201 {id, started_at}
  U->>UI: "הפעלת מצלמה" + אישור דפדפן
  UI->>ENG: enabled=true (stream)
  loop כל 100ms
    ENG->>ENG: MediaPipe detectForVideo → 478×3 → ring buffer
    alt אין פנים ב-7 מתוך 10 טיקים
      ENG-->>UI: noFace → "לא זוהו פנים" (המודל לא רץ)
    end
  end
  loop כל 2 שניות, כשהחלון מלא
    ENG->>ENG: v4_7([1,100,478,3]) → score, level, attention
    ENG-->>UI: score + EMA
    UI->>API: POST /sessions/{id}/readings {position, score, smoothed, level, attention_peak}
    API->>DB: insert readings + $inc reading_count/score_sum
    alt smoothed < 0.40 (ואין התראה ב-45 שנ' האחרונות)
      UI-->>U: "⚠️ הקשב שלך ירד" + "חזרה ל-mm:ss"
    end
  end
  U->>UI: "סיום סשן"
  UI->>API: POST /sessions/{id}/end
  API->>DB: readings → compute_missed_segments → missed_segments, debt
  API-->>UI: average_score, missed_segments, debt_seconds
  UI-->>U: "הסשן נשמר ✓" + "מעבר שני"
```

## 4. ERD: אוספי MongoDB
![ERD](erd.png)

```mermaid
erDiagram
  USERS ||--o{ CONTENT : owns
  USERS ||--o{ SESSIONS : owns
  CONTENT ||--o{ SESSIONS : "watched in"
  SESSIONS ||--o{ READINGS : has
  SESSIONS ||--o| SESSIONS : "review_of (מעבר שני)"
  USERS {
    ObjectId _id
    string email "unique, lowercase"
    string password_hash "argon2id"
    string display_name
    datetime created_at
    int token_version
  }
  CONTENT {
    ObjectId _id
    ObjectId owner_id
    string title
    string type "youtube|text|web"
    string source
    string youtube_id
    array body_paragraphs
    string site_name
    float duration_seconds
    datetime created_at
  }
  SESSIONS {
    ObjectId _id
    ObjectId owner_id
    ObjectId content_id
    string content_title "עותק"
    string mode "watch|review"
    ObjectId review_of
    datetime started_at
    datetime ended_at
    int reading_count
    float score_sum
    array missed_segments "start,end,closed,closed_by"
    float debt_seconds
    string debt_unit "seconds|paragraphs"
  }
  READINGS {
    ObjectId _id
    ObjectId session_id
    ObjectId owner_id
    float position
    float score
    float smoothed
    int level
    float attention_peak
    datetime created_at
  }
  REVOKED_TOKENS {
    string jti
    datetime expires_at "TTL"
  }
  LOGIN_ATTEMPTS {
    string key "email|ip"
    datetime created_at "TTL 15m"
  }
```

## 5. מכונת המצבים של פאנל הריכוז
![State machine](state-machine.png)

```mermaid
stateDiagram-v2
  [*] --> Idle: פתיחת פריט
  Idle --> Consent: "התחלת סשן" (POST /sessions)
  Idle --> Consent: "השלמת חוב (מעבר שני)"
  Consent --> Measuring: "הפעלת מצלמה" + אישור
  Consent --> Consent: סירוב → הודעה + "ניסיון חוזר"
  Consent --> NoCamera: "המשך בלי מצלמה"
  NoCamera --> Consent: "הפעלת מצלמה"
  state Measuring {
    [*] --> Filling: איסוף 100 פריימים
    Filling --> Scoring: חלון מלא
    Scoring --> NoFace: אין פנים ≥70%
    NoFace --> Scoring: הפנים חזרו (החלון לא מתאפס)
    Scoring --> LowFocus: מוחלק < 0.40
    LowFocus --> Scoring: מוחלק > 0.50 (היסטרזיס)
  }
  Measuring --> Summary: "סיום סשן" (POST /end)
  NoCamera --> Summary: "סיום סשן"
  Summary --> Consent: "מעבר שני" (mode=review)
  Summary --> Idle: "סשן חדש על אותו תוכן"
  Summary --> [*]: להיסטוריה / לספרייה
```
