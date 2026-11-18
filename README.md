# ⏪ Rewind — Real-Time Attention Tracking & Cognitive Re-engagement Platform

> **Stay present. Reclaim your focus.**  
> Rewind is a privacy-first, AI-powered learning and reading companion that detects attention drift in real time using client-side computer vision and dynamically intervenes to restore comprehension.

🌐 **Live Demo:** [https://rewind.ddns.net](https://rewind.ddns.net)

---

## 🌟 Overview

In an era of constant digital distraction, passive reading and video consumption often lead to "zoning out"—where eyes move across a screen without true cognitive engagement. **Rewind** bridges this gap by combining local, browser-based eye-tracking and facial landmark detection with generative AI comprehension checks.

When Rewind detects sustained attention drift or cognitive fatigue ("Focus Debt"), it gently intervenes—pausing content, prompting a break, or generating contextual AI questions via **Google Gemini** to bring the user back on track.

---

## ✨ Key Capabilities & Features

### 👁️ Real-Time Client-Side Focus Engine
* **Zero-Latency Gaze & Landmark Tracking:** Powered by **MediaPipe** (`faceDetector.js`, `landmarker.js`, `gaze.js`), running entirely in the browser via WebAssembly/WebGL.
* **Privacy by Design:** Raw webcam frames never leave the user's device. Explicit user consent (`ConsentPanel.jsx`) and transparent calibration flows ensure full user control.
* **Signal Smoothing & Noise Reduction:** Custom mathematical smoothing algorithms (`smoothing.js`, `modelMath.js`) prevent false positives from natural blinking or brief glances away.
* **Live "Focus Debt" Modeling:** Tracks cumulative attention loss in real time (`liveDebt.js`, `DebtMeter.jsx`) and visualizes engagement over time on an interactive **Focus Tape** (`FocusTape.jsx`).

### 🧠 Intelligent Cognitive Interventions
* **Adaptive Re-engagement:** Dynamically triggers tailored interventions based on focus state thresholds:
  * **Smart Alerts (`AlertBanner.jsx`):** Subtle nudges when attention begins to slip.
  * **Restorative Breaks (`BreakDialog.jsx`):** Guided pause prompts when fatigue accumulates.
  * **AI Comprehension Checkpoints (`QuestionDialog.jsx`):** Uses **Google Gemini** (`gemini.py`) to generate on-the-fly questions based on the exact content segment where focus dropped.

### 📚 Multi-Modal Content Consumption
* **Distraction-Free Web Reader (`Reader.jsx`):** Extracts, cleans, and segments articles from any URL (`webpage.py`, `segments.py`).
* **Synchronized YouTube Learning (`YouTubePlayer.jsx`):** Tracks focus alongside video timestamps, mapping attention dips directly to specific video moments.
* **Personal Content Library (`Library.jsx`):** Save, organize, and revisit articles and videos.

### 📊 Deep Analytics & Session Review
* **Post-Session Scorecards (`ScoreCard.jsx`, `SessionDetail.jsx`):** Comprehensive breakdown of focus score, attention timeline, and intervention recovery rates.
* **Historical Progress (`History.jsx`, `analytics.py`):** Long-term trends helping users understand their peak focus hours and cognitive stamina.
* **Developer Telemetry (`DebugPanel.jsx`):** Real-time diagnostic overlay displaying raw gaze vectors, confidence scores, and state machine transitions.

---

## 🏗️ System Architecture

Rewind is engineered as a modern, containerized microservices application designed for high availability and cloud scalability:

```text
┌─────────────────────────────────────────────────────────────────┐
│                        Client (Browser)                         │
│  React + Vite │ MediaPipe Vision (WASM) │ Focus State Machine   │
└───────────────────────────────┬─────────────────────────────────┘
                                │ HTTPS / REST API
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Reverse Proxy (Nginx)                       │
│         Static Asset Serving │ Security Headers │ Routing       │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Backend API (FastAPI)                        │
│  JWT Auth │ Rate Limiting │ Content Segmentation │ Analytics    │
└───────────────┬───────────────────────────────┬─────────────────┘
                │                               │
                ▼                               ▼
┌───────────────────────────────┐ ┌───────────────────────────────┐
│     Relational Database       │ │       Google Gemini API       │
│  Users, Content & Telemetry   │ │  Contextual Question Gen AI   │
└───────────────────────────────┘ └───────────────────────────────┘
```

### Architecture Diagrams
Detailed system diagrams are available in `/docs/diagrams/`:
* [System Architecture](docs/diagrams/architecture.png)
* [Entity-Relationship Diagram (ERD)](docs/diagrams/erd.png)
* [Focus Engine State Machine](docs/diagrams/state-machine.png)
* [Sequence Flows](docs/diagrams/sequence.png)
* [Use Case Overview](docs/diagrams/use-case.png)

---

## 🛠️ Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React, Vite, Custom CSS Design System (`theme.css`), MediaPipe Vision Tasks |
| **Backend** | Python 3, FastAPI, Pydantic, SQLAlchemy / Database ORM, Custom Rate Limiter |
| **AI & ML** | Google Gemini API (Generative Comprehension), MediaPipe Face Landmarker (Client-side CV) |
| **Infrastructure** | Docker, Docker Compose, Nginx, PowerShell & Bash Cloud Deployment Automation |
| **Testing & QA** | Pytest (Backend Unit & API), Vitest/Jest (Focus Math & State), Playwright (E2E, Perf, Soak & Stress) |

---

## 📂 Project Structure

```text
Rewind/
├── backend/                  # FastAPI application, routers, AI & segmentation services
│   ├── app/
│   │   ├── routers/          # REST endpoints (ai, analytics, auth, content, sessions, users)
│   │   └── services/         # Business logic (Gemini integration, webpage parser, segmenter)
│   └── tests/               # Pytest suite for API, cloud config, and segmentation
├── frontend/                 # React SPA & Client-Side Computer Vision Engine
│   ├── nginx/                # Production Nginx templates & strict security headers
│   └── src/
│       ├── components/       # UI components (FocusTape, DebtMeter, Reader, YouTubePlayer)
│       ├── focus/            # Core gaze tracking, smoothing, live debt & focus engine hooks
│       └── pages/            # Application views (ContentView, Library, History, SessionDetail)
├── e2e/                      # Playwright end-to-end, performance, soak, and stress test suites
├── deploy/                   # Cloud provisioning, verification, alerting, and teardown scripts
├── docs/                     # Comprehensive architecture guides, ADRs, and test reports
└── scripts/                  # Model benchmarking, asset preparation, and packaging utilities
```

---

## 🚀 Getting Started

### Prerequisites
* **Docker** & **Docker Compose**
* A **Google Gemini API Key** (for AI comprehension generation)

### Quick Start (Local Development)

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd Rewind
   ```

2. **Configure environment variables:**
   Copy the example environment file and insert your credentials (such as your Gemini API key and JWT secret):
   ```bash
   cp .env.example .env
   ```

3. **Launch with Docker Compose:**
   For production-like local deployment:
   ```bash
   docker-compose up --build
   ```
   Or for hot-reloading development mode:
   ```bash
   docker-compose -f docker-compose.dev.yml up --build
   ```

4. **Access the application:**
   Open your browser and navigate to `http://localhost` (or the configured frontend port).

---

## 🧪 Testing & Quality Assurance

Rewind features a multi-layered automated testing suite covering unit logic, API contracts, browser computer vision simulation, and system endurance:

* **Backend Tests (Pytest):**
  ```bash
  docker build -f backend/Dockerfile.test -t rewind-backend-test ./backend
  docker run --rm rewind-backend-test
  ```
* **End-to-End, Stress & Soak Tests (Playwright):**
  Located in `/e2e/tests/`, validating calibration (`calibration.spec.js`), low-focus triggers (`lowfocus.spec.js`), missing-face handling (`noface.spec.js`), performance benchmarks (`perf.spec.js`), and long-running stability (`soak.spec.js`, `stress.spec.js`).
  ```bash
  cd e2e && npm install && npx playwright test
  ```

---

## ☁️ Cloud Deployment & Operations

The `/deploy` directory contains a complete Infrastructure-as-Code / automation suite (`deploy.ps1`, `verify.ps1`, `status.ps1`, `alert.ps1`, `teardown.ps1`) supporting:
* Automated container builds and registry pushes (`build-images.ps1`, `build_and_push.sh`)
* URL mapping & HTTP-to-HTTPS routing rules (`urlmap.yaml`, `urlmap-redirect.yaml`)
* Post-deployment health verification and zero-downtime redeploys (`redeploy.ps1`)

For full deployment instructions, refer to [docs/CLOUD_GUIDE.md](docs/CLOUD_GUIDE.md).

---

## 🔒 Privacy & Security

* **Local Biometric Processing:** Webcam video streams are processed exclusively in browser memory. No video or facial images are transmitted to or stored on backend servers.
* **Hardened Web Serving:** Configured with strict HTTP security headers (`frontend/nginx/security-headers.conf`), API reverse-proxying, and backend rate limiting (`rate_limit.py`).