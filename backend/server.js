require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const OpenAI = require("openai");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs/promises");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const app = express();
const execFileAsync = promisify(execFile);
const PORT = Number(process.env.PORT || 10000);
const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 180;
const FRAME_COUNT = 7;
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 120000, maxRetries: 1 })
  : null;

const allowedOrigins = (process.env.FRONTEND_ORIGIN || "*")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("This website origin is not allowed by the API."));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));
app.use(express.json({ limit: "150kb" }));

const coachLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many coaching requests. Please try again in 15 minutes." }
});
const clipLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 4,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Clip analysis limit reached. Please try again in an hour." }
});

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: MAX_VIDEO_BYTES, files: 1 },
  fileFilter(_req, file, callback) {
    const extension = path.extname(file.originalname || "").toLowerCase();
    const allowedExtensions = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"]);
    if (!allowedExtensions.has(extension)) {
      return callback(new Error("Upload an MP4, MOV, M4V, WEBM, MKV, or AVI video."));
    }
    callback(null, true);
  }
});

function requireOpenAI(_req, res, next) {
  if (!openai) {
    return res.status(503).json({
      error: "The AI backend is not configured yet. Add OPENAI_API_KEY in the server environment."
    });
  }
  next();
}

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function apiError(res, error, fallback) {
  console.error(fallback + ":", error && error.message ? error.message : error);
  if (error && (error.code === "rate_limit_exceeded" || error.status === 429)) {
    return res.status(429).json({ error: "The AI provider is rate-limiting requests. Try again shortly." });
  }
  if (error && error.status === 401) {
    return res.status(503).json({ error: "The server's AI API key was rejected. Check OPENAI_API_KEY." });
  }
  return res.status(502).json({ error: fallback + " Please try again." });
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "drop-coach-api",
    aiConfigured: Boolean(openai),
    model: MODEL,
    videoAnalysis: true
  });
});

app.post("/api/coach", coachLimit, requireOpenAI, async (req, res) => {
  const question = cleanText(req.body && req.body.question, 2000);
  const context = cleanText(req.body && req.body.context, 12000);
  if (!question) {
    return res.status(400).json({ error: "Add a coaching question first." });
  }

  const prompt = [
    "You are Drop Coach, a direct, evidence-led competitive Fortnite coach.",
    "Give practical advice for improving in ranked, scrims, and tournaments.",
    "Use the player's supplied notes as evidence. Separate observed facts from hypotheses.",
    "Do not invent mechanics, clip events, stats, or details that are not supplied.",
    "Identify the earliest controllable mistake, explain the better decision, and give 2-3 drills with measurable success criteria.",
    "Keep the tone calm, concise, and specific. Do not give generic motivation.",
    "",
    "PLAYER TRACKER AND REVIEW CONTEXT:",
    context || "No tracker context supplied.",
    "",
    "PLAYER QUESTION:",
    question
  ].join("\n");

  try {
    const response = await openai.responses.create({
      model: MODEL,
      instructions: "You are a high-level Fortnite VOD coach. Be accurate, specific, and constructive.",
      input: prompt,
      max_output_tokens: 900
    });
    res.json({ ok: true, answer: response.output_text || "The model returned no text. Please try again." });
  } catch (error) {
    apiError(res, error, "The coaching request failed.");
  }
});

async function getVideoDuration(filePath) {
  const result = await execFileAsync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    filePath
  ], { timeout: 15000, maxBuffer: 1024 * 1024 });
  const duration = Number(String(result.stdout).trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Could not read the video's duration.");
  }
  return duration;
}

async function extractFrames(filePath, outputDirectory, duration) {
  const frames = [];
  for (let index = 0; index < FRAME_COUNT; index += 1) {
    const fraction = FRAME_COUNT === 1 ? 0.5 : index / (FRAME_COUNT - 1);
    const timestamp = Math.max(0, Math.min(duration - 0.05, duration * fraction));
    const outputPath = path.join(outputDirectory, "frame-" + index + ".jpg");
    await execFileAsync("ffmpeg", [
      "-hide_banner", "-loglevel", "error",
      "-ss", timestamp.toFixed(2),
      "-i", filePath,
      "-frames:v", "1",
      "-vf", "scale=1280:720:force_original_aspect_ratio=decrease",
      "-q:v", "5",
      "-y", outputPath
    ], { timeout: 20000, maxBuffer: 2 * 1024 * 1024 });
    const buffer = await fs.readFile(outputPath);
    frames.push({
      timestamp: timestamp.toFixed(1),
      dataUrl: "data:image/jpeg;base64," + buffer.toString("base64")
    });
  }
  return frames;
}

app.post("/api/analyze-clip", clipLimit, requireOpenAI, upload.single("video"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Choose a video file to analyze." });
  }

  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "drop-coach-"));
  try {
    const duration = await getVideoDuration(req.file.path);
    if (duration > MAX_VIDEO_SECONDS) {
      return res.status(413).json({ error: "Keep clips to 3 minutes or less for this version." });
    }

    const frames = await extractFrames(req.file.path, tempDirectory, duration);
    const notes = cleanText(req.body && req.body.notes, 4000);
    const context = cleanText(req.body && req.body.context, 9000);
    const content = [{
      type: "input_text",
      text: [
        "Analyze this Fortnite gameplay clip as a competitive VOD coach.",
        "The attached images are sampled frames in chronological order from a video lasting " + duration.toFixed(1) + " seconds.",
        "Important: you only see these snapshots, not continuous motion, audio, the full HUD, or every event between frames. Do not claim certainty about unseen actions. State when the evidence is insufficient.",
        "Look for positioning, cover, crosshair placement, build/edit choices, piece-control opportunities, health and resource decisions when visible, fight timing, and whether the player takes avoidable risks.",
        "Return these headings: 1) What is visibly happening, 2) Main mistake or opportunity, 3) Better decision, 4) Three practice drills, 5) Confidence and what cannot be determined.",
        "Do not guess the player's identity, rank, inventory, or game outcome if not clearly visible.",
        "",
        "USER NOTES: " + (notes || "None supplied."),
        "",
        "PLAYER'S TRACKER CONTEXT: " + (context || "None supplied.")
      ].join("\n")
    }];

    for (const frame of frames) {
      content.push({
        type: "input_text",
        text: "Frame at approximately " + frame.timestamp + " seconds:"
      });
      content.push({
        type: "input_image",
        image_url: frame.dataUrl,
        detail: "high"
      });
    }

    const response = await openai.responses.create({
      model: MODEL,
      instructions: "You are Drop Coach, an expert Fortnite competitive VOD analyst. Analyze only what the sampled images support.",
      input: [{ role: "user", content }],
      max_output_tokens: 1400
    });

    res.json({
      ok: true,
      durationSeconds: Number(duration.toFixed(1)),
      framesAnalyzed: frames.length,
      analysis: response.output_text || "The model returned no text. Please try again."
    });
  } catch (error) {
    if (String(error && error.message).includes("ffmpeg") || String(error && error.message).includes("ffprobe")) {
      return res.status(422).json({ error: "The video could not be decoded. Try exporting it as MP4 (H.264)." });
    }
    apiError(res, error, "Clip analysis failed.");
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true }).catch(() => {});
    await fs.unlink(req.file.path).catch(() => {});
  }
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    const message = error.code === "LIMIT_FILE_SIZE"
      ? "Video is too large. The upload limit is 80 MB."
      : "The video upload could not be processed.";
    return res.status(413).json({ error: message });
  }
  if (error) {
    console.error("Request error:", error.message || error);
    return res.status(400).json({ error: error.message || "Invalid request." });
  }
  res.status(500).json({ error: "Unexpected server error." });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("Drop Coach API listening on port " + PORT);
});