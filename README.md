# ClearAI Backend — Deployment Guide

## 📁 Project Structure
```
clearai-backend/
├── server.js          ← Main backend (Node.js + Express)
├── index.html         ← Frontend (connected to backend)
├── package.json       ← Dependencies
├── .env.example       ← Environment variables template
└── README.md          ← This file
```

## 🚀 Deploy Backend FREE on Render.com (Recommended)

### Step 1 — Push to GitHub
1. Create a new GitHub repo (e.g. `clearai-backend`)
2. Upload ALL files: `server.js`, `package.json`, `.env.example`, `README.md`
3. Do NOT upload `index.html` to this repo (it goes to your frontend repo)

### Step 2 — Deploy on Render
1. Go to https://render.com → Sign up free
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repo `clearai-backend`
4. Fill in:
   - **Name:** `clearai-backend`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
5. Click **"Create Web Service"**
6. Wait ~2 minutes → You'll get a URL like:
   `https://clearai-backend.onrender.com`

### Step 3 — Add Environment Variables on Render
In your Render dashboard → Environment tab, add:
```
PORT=3000
NODE_ENV=production
FRONTEND_URL=https://nandha0142.github.io
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-gmail@gmail.com
SMTP_PASS=your-gmail-app-password
ADMIN_EMAIL=your-gmail@gmail.com
```

### Step 4 — Update Frontend
In `index.html`, find this line near the bottom:
```javascript
const API_BASE = 'https://your-backend.onrender.com';
```
Change it to your actual Render URL:
```javascript
const API_BASE = 'https://clearai-backend.onrender.com';
```
Then re-upload `index.html` to your GitHub Pages repo.

---

## 📧 Gmail App Password Setup (for emails to work)
1. Go to https://myaccount.google.com/security
2. Enable **2-Step Verification**
3. Search "App passwords" → Create one for "Mail"
4. Use the 16-character password as `SMTP_PASS`

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Health check |
| POST | `/api/demo-request` | Book a demo (sends email) |
| POST | `/api/contact` | Contact form |
| POST | `/api/classify` | Classify HS codes (JSON) |
| POST | `/api/upload` | Upload & auto-classify document |
| GET | `/api/compliance/:country` | Check destination compliance |

### Example: Classify Items
```bash
curl -X POST https://your-backend.onrender.com/api/classify \
  -H "Content-Type: application/json" \
  -d '{"items": ["servo motor 3-phase 7.5kW", "lithium battery 48V"]}'
```

### Example: Compliance Check
```bash
curl https://your-backend.onrender.com/api/compliance/IR
```

---

## 🏃 Run Locally
```bash
npm install
cp .env.example .env   # Fill in your values
node server.js
# → Running at http://localhost:3000
```
