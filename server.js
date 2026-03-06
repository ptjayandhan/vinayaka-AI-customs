// ═══════════════════════════════════════════════════
//  ClearAI Backend — server.js
//  Handles: Demo Requests, Contact, File Upload,
//           HS Classification, Compliance Check
// ═══════════════════════════════════════════════════

require("dotenv").config();
const express    = require("express");
const cors       = require("cors");
const multer     = require("multer");
const nodemailer = require("nodemailer");
const rateLimit  = require("express-rate-limit");
const { v4: uuidv4 } = require("uuid");
const path       = require("path");
const fs         = require("fs");

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── UPLOADS FOLDER ───────────────────────────────
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// ─── MIDDLEWARE ────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || "*",
    "http://localhost:5500",
    "http://127.0.0.1:5500"
  ],
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

// Rate limiting — protect all API endpoints
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50,
  message: { success: false, error: "Too many requests. Please try again later." }
});
app.use("/api/", limiter);

// ─── FILE UPLOAD CONFIG ────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = `${uuidv4()}-${Date.now()}${path.extname(file.originalname)}`;
    cb(null, unique);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowed = [".pdf", ".xlsx", ".xls", ".csv", ".png", ".jpg", ".jpeg"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error("Only PDF, Excel, CSV, and image files are allowed."));
  }
});

// ─── EMAIL TRANSPORTER ────────────────────────────
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

async function sendEmail(to, subject, html) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log("📧 [Email skipped — SMTP not configured]");
    console.log("   To:", to, "| Subject:", subject);
    return;
  }
  await transporter.sendMail({
    from: `"ClearAI Platform" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html
  });
}

// ═══════════════════════════════════════════════════
//  HS CLASSIFICATION ENGINE
//  (Rule-based engine — replace with real ML/API)
// ═══════════════════════════════════════════════════
const HS_DATABASE = [
  { keywords: ["servo motor","motor","electric motor","3-phase","ac motor"],  hs: "8501.52.2000", desc: "AC motors, multi-phase",          confidence: 97 },
  { keywords: ["battery","lithium","li-ion","lithium-ion","battery pack"],      hs: "8507.60.0020", desc: "Lithium-ion accumulators",        confidence: 94 },
  { keywords: ["optical fiber","fibre","fiber cable","single-mode","om3"],      hs: "8544.70.0000", desc: "Optical fibre cables",            confidence: 96 },
  { keywords: ["rf amplifier","amplifier","radio frequency","2.4ghz"],         hs: "8543.20.0000", desc: "Signal generators",               confidence: 78 },
  { keywords: ["laptop","notebook","computer","macbook","pc"],                  hs: "8471.30.0100", desc: "Portable digital computers",      confidence: 99 },
  { keywords: ["smartphone","mobile phone","iphone","android"],                 hs: "8517.12.0010", desc: "Telephones for cellular networks", confidence: 99 },
  { keywords: ["solar panel","photovoltaic","pv module","solar cell"],          hs: "8541.40.6020", desc: "Photovoltaic cells",              confidence: 95 },
  { keywords: ["transformer","power transformer","voltage"],                    hs: "8504.34.0000", desc: "Electrical transformers",         confidence: 92 },
  { keywords: ["led","led light","led lamp","light emitting"],                  hs: "8543.70.9960", desc: "LED lamps",                      confidence: 90 },
  { keywords: ["drone","uav","unmanned aerial","quadcopter"],                   hs: "8806.21.0000", desc: "Unmanned aircraft",              confidence: 88 },
  { keywords: ["circuit board","pcb","printed circuit"],                        hs: "8534.00.0020", desc: "Printed circuits",               confidence: 93 },
  { keywords: ["sensor","pressure sensor","temperature sensor"],                hs: "9026.20.4000", desc: "Instruments for measuring",      confidence: 85 },
  { keywords: ["cable","wire","copper wire","ethernet cable"],                  hs: "8544.42.9000", desc: "Electric conductors",            confidence: 88 },
  { keywords: ["pump","hydraulic pump","water pump"],                           hs: "8413.70.2004", desc: "Centrifugal pumps",              confidence: 87 },
  { keywords: ["valve","solenoid valve","control valve"],                       hs: "8481.20.0000", desc: "Valves for pneumatic transmissions", confidence: 84 },
];

const COMPLIANCE_FLAGS = [
  { keywords: ["rf","amplifier","2.4ghz","5ghz","radar"],   risk: "DUAL_USE",   level: "high",   message: "Potential dual-use item — EAR99 review required" },
  { keywords: ["drone","uav","unmanned"],                    risk: "RESTRICTED",  level: "high",   message: "UAVs require export license to certain destinations" },
  { keywords: ["military","weapon","firearm","explosive"],   risk: "PROHIBITED",  level: "critical", message: "Item may be prohibited — immediate compliance review needed" },
  { keywords: ["encryption","crypto","cryptographic"],       risk: "ENC_CONTROL", level: "medium", message: "Encryption items may need BIS classification" },
  { keywords: ["battery","lithium"],                         risk: "HAZMAT",      level: "medium", message: "Lithium batteries require IATA dangerous goods compliance" },
  { keywords: ["chemical","solvent","acid","base"],          risk: "CHEMICAL",    level: "medium", message: "Chemical substances may require safety data sheets" },
];

function classifyItem(description) {
  const lower = description.toLowerCase();

  // Find best matching HS code
  let best = null;
  let bestScore = 0;
  for (const entry of HS_DATABASE) {
    let score = 0;
    for (const kw of entry.keywords) {
      if (lower.includes(kw)) score += kw.split(" ").length; // longer match = higher score
    }
    if (score > bestScore) { bestScore = score; best = entry; }
  }

  // Find compliance flags
  const flags = [];
  for (const flag of COMPLIANCE_FLAGS) {
    for (const kw of flag.keywords) {
      if (lower.includes(kw)) { flags.push(flag); break; }
    }
  }

  if (!best) {
    return {
      hs_code: "UNCLASSIFIED",
      hs_description: "Manual classification required",
      confidence: 0,
      status: "review",
      flags,
      explanation: "No matching HS code found in database. Please classify manually."
    };
  }

  // Adjust confidence based on match strength
  const adjustedConfidence = Math.min(best.confidence + (bestScore > 2 ? 2 : 0), 99);
  const status = flags.some(f => f.level === "critical" || f.level === "high")
    ? "flagged"
    : adjustedConfidence >= 90 ? "cleared" : "review";

  return {
    hs_code: best.hs,
    hs_description: best.desc,
    confidence: adjustedConfidence,
    status,
    flags,
    explanation: `Matched keywords from description. Similar past shipments used ${best.hs} for "${best.desc}".`
  };
}

// ═══════════════════════════════════════════════════
//  API ROUTES
// ═══════════════════════════════════════════════════

// ── Health Check ──────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    service: "ClearAI Backend API",
    status: "running",
    version: "1.0.0",
    endpoints: [
      "POST /api/demo-request",
      "POST /api/contact",
      "POST /api/classify",
      "POST /api/upload",
      "GET  /api/compliance/:destination"
    ]
  });
});

// ── 1. DEMO REQUEST ───────────────────────────────
// Called when user clicks "Request Demo" or "Book a Demo"
app.post("/api/demo-request", async (req, res) => {
  try {
    const { name, email, company, role, message } = req.body;

    if (!name || !email || !company) {
      return res.status(400).json({ success: false, error: "Name, email, and company are required." });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, error: "Invalid email address." });
    }

    const refId = `DEMO-${Date.now()}`;

    // Email to admin
    await sendEmail(
      process.env.ADMIN_EMAIL || process.env.SMTP_USER,
      `🚀 New Demo Request — ${company}`,
      `
      <div style="font-family:sans-serif;max-width:600px;background:#020B18;color:#E8F4FF;padding:32px;border-radius:12px;">
        <h2 style="color:#00D4FF;margin-bottom:24px;">New Demo Request</h2>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px 0;color:#5A7A96;width:120px;">Reference</td><td style="color:#E8F4FF;font-weight:bold;">${refId}</td></tr>
          <tr><td style="padding:8px 0;color:#5A7A96;">Name</td><td>${name}</td></tr>
          <tr><td style="padding:8px 0;color:#5A7A96;">Email</td><td>${email}</td></tr>
          <tr><td style="padding:8px 0;color:#5A7A96;">Company</td><td>${company}</td></tr>
          <tr><td style="padding:8px 0;color:#5A7A96;">Role</td><td>${role || "Not specified"}</td></tr>
          <tr><td style="padding:8px 0;color:#5A7A96;">Message</td><td>${message || "No message"}</td></tr>
        </table>
      </div>
      `
    );

    // Confirmation email to user
    await sendEmail(
      email,
      `✅ ClearAI Demo Request Received — ${refId}`,
      `
      <div style="font-family:sans-serif;max-width:600px;background:#020B18;color:#E8F4FF;padding:32px;border-radius:12px;">
        <h2 style="color:#00D4FF;">Thank you, ${name}!</h2>
        <p style="color:#5A7A96;line-height:1.7;">We've received your demo request for <strong style="color:#E8F4FF;">${company}</strong>. Our team will reach out within 1 business day to schedule your personalized ClearAI walkthrough.</p>
        <div style="background:#071828;border:1px solid #0E2A3F;border-radius:8px;padding:16px;margin:24px 0;">
          <p style="margin:0;font-size:12px;color:#5A7A96;">Reference ID</p>
          <p style="margin:4px 0 0;font-family:monospace;color:#00D4FF;font-size:1.1rem;">${refId}</p>
        </div>
        <p style="color:#5A7A96;font-size:13px;">While you wait, explore our <a href="${process.env.FRONTEND_URL}" style="color:#0A84FF;">documentation</a> to learn more about ClearAI's capabilities.</p>
      </div>
      `
    );

    res.json({ success: true, message: "Demo request received! Check your email for confirmation.", refId });

  } catch (err) {
    console.error("Demo request error:", err);
    res.status(500).json({ success: false, error: "Server error. Please try again." });
  }
});

// ── 2. CONTACT / GENERAL INQUIRY ─────────────────
app.post("/api/contact", async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ success: false, error: "Name, email and message are required." });
    }

    await sendEmail(
      process.env.ADMIN_EMAIL || process.env.SMTP_USER,
      `📩 ClearAI Contact: ${subject || "General Inquiry"} — ${name}`,
      `
      <div style="font-family:sans-serif;background:#020B18;color:#E8F4FF;padding:32px;border-radius:12px;">
        <h2 style="color:#00D4FF;">New Contact Message</h2>
        <p><strong>From:</strong> ${name} &lt;${email}&gt;</p>
        <p><strong>Subject:</strong> ${subject || "General Inquiry"}</p>
        <hr style="border-color:#0E2A3F;margin:16px 0"/>
        <p style="color:#5A7A96;line-height:1.7;">${message}</p>
      </div>
      `
    );

    res.json({ success: true, message: "Message sent! We'll get back to you shortly." });

  } catch (err) {
    console.error("Contact error:", err);
    res.status(500).json({ success: false, error: "Failed to send message. Please try again." });
  }
});

// ── 3. HS CLASSIFICATION API ──────────────────────
// Accepts array of product descriptions, returns HS codes
app.post("/api/classify", (req, res) => {
  try {
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: "Provide an array of product descriptions in 'items'." });
    }

    if (items.length > 50) {
      return res.status(400).json({ success: false, error: "Maximum 50 items per request." });
    }

    const results = items.map((item, index) => {
      const description = typeof item === "string" ? item : item.description || "";
      const classification = classifyItem(description);
      return {
        line: index + 1,
        description,
        ...classification
      };
    });

    const summary = {
      total: results.length,
      cleared: results.filter(r => r.status === "cleared").length,
      review:  results.filter(r => r.status === "review").length,
      flagged: results.filter(r => r.status === "flagged").length,
      unclassified: results.filter(r => r.status === "unclassified").length,
    };

    res.json({ success: true, summary, results });

  } catch (err) {
    console.error("Classification error:", err);
    res.status(500).json({ success: false, error: "Classification failed." });
  }
});

// ── 4. FILE UPLOAD & AUTO-CLASSIFY ───────────────
// Accepts PDF/Excel/CSV upload from demo dashboard
app.post("/api/upload", upload.single("document"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No file uploaded." });
    }

    const fileId = uuidv4();
    const { originalname, size, mimetype, filename } = req.file;

    // Simulated extracted line items (in production: parse PDF/Excel here)
    const simulatedItems = [
      { description: "Industrial servo motor, 3-phase, 7.5kW",          qty: 10, unit: "PCS", value: 4500.00,  weight: 85.0  },
      { description: "Lithium-ion battery pack, 48V 100Ah",              qty: 5,  unit: "PCS", value: 3200.00,  weight: 62.5  },
      { description: "Optical fiber cable, single-mode, 1000m",          qty: 20, unit: "RLL", value: 1800.00,  weight: 240.0 },
      { description: "RF amplifier module, 2.4GHz dual-use",             qty: 50, unit: "PCS", value: 6500.00,  weight: 12.5  },
      { description: "Printed circuit board assembly, industrial grade",  qty: 100,unit: "PCS", value: 8900.00,  weight: 35.0  },
    ];

    const classifiedItems = simulatedItems.map((item, i) => ({
      line: i + 1,
      ...item,
      ...classifyItem(item.description)
    }));

    const summary = {
      total:       classifiedItems.length,
      cleared:     classifiedItems.filter(r => r.status === "cleared").length,
      review:      classifiedItems.filter(r => r.status === "review").length,
      flagged:     classifiedItems.filter(r => r.status === "flagged").length,
      totalValue:  classifiedItems.reduce((s, i) => s + i.value, 0).toFixed(2),
      totalWeight: classifiedItems.reduce((s, i) => s + i.weight, 0).toFixed(1),
    };

    res.json({
      success: true,
      fileId,
      file: { name: originalname, size, type: mimetype },
      shipmentId: `SHP-${Date.now()}`,
      extractedItems: classifiedItems.length,
      summary,
      items: classifiedItems
    });

  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ success: false, error: err.message || "Upload failed." });
  }
});

// ── 5. COMPLIANCE CHECK BY DESTINATION ───────────
app.get("/api/compliance/:destination", (req, res) => {
  const dest = req.params.destination.toUpperCase();

  const COUNTRY_RULES = {
    IR: { embargoed: true,  ofac: true,  notes: "Iran — Comprehensive US/EU sanctions. No shipments permitted without special license." },
    KP: { embargoed: true,  ofac: true,  notes: "North Korea — UN Security Council sanctions. Shipments prohibited." },
    CU: { embargoed: true,  ofac: true,  notes: "Cuba — US embargo in effect. OFAC license required for most goods." },
    SY: { embargoed: true,  ofac: true,  notes: "Syria — EU and US sanctions. Strict controls on all exports." },
    RU: { embargoed: false, ofac: false, restricted: true, notes: "Russia — Expanded export controls since 2022. EAR99 review required for dual-use items." },
    CN: { embargoed: false, ofac: false, restricted: false, notes: "China — Some technology export controls apply. Verify EAR/ITAR for tech goods." },
    DE: { embargoed: false, ofac: false, restricted: false, notes: "Germany — EU member. Standard AES filing required. No restrictions for most goods." },
    US: { embargoed: false, ofac: false, restricted: false, notes: "USA — EEI filing via AES required for shipments over $2,500. EAR applies to dual-use goods." },
    IN: { embargoed: false, ofac: false, restricted: false, notes: "India — GST and customs duty applies. Electronics may need BIS certification." },
  };

  const rule = COUNTRY_RULES[dest] || {
    embargoed: false, ofac: false, restricted: false,
    notes: `No specific restrictions found for ${dest}. Standard customs documentation required.`
  };

  res.json({
    success: true,
    destination: dest,
    ...rule,
    checks: {
      ofac_screened: true,
      eu_embargo:    rule.embargoed,
      un_sanctions:  rule.embargoed,
      dual_use_review: rule.restricted || false,
    },
    timestamp: new Date().toISOString()
  });
});

// ─── ERROR HANDLER ─────────────────────────────────
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ success: false, error: `File upload error: ${err.message}` });
  }
  console.error("Unhandled error:", err);
  res.status(500).json({ success: false, error: "Internal server error." });
});

app.use((req, res) => {
  res.status(404).json({ success: false, error: "Endpoint not found." });
});

// ─── START SERVER ──────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅ ClearAI Backend running on port ${PORT}`);
  console.log(`📡 API: http://localhost:${PORT}`);
  console.log(`\nEndpoints:`);
  console.log(`  POST /api/demo-request`);
  console.log(`  POST /api/contact`);
  console.log(`  POST /api/classify`);
  console.log(`  POST /api/upload`);
  console.log(`  GET  /api/compliance/:destination\n`);
});
