require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const app = express();

// Trust reverse proxy (Nginx) for accurate client IP identification and rate limiting
app.set("trust proxy", 1);

const bodyParser = require("body-parser");
const path = require("path");
const { connectDB } = require("./src/lib/db");
const router = require("./src/router");
const { startAgentStatsCron } = require("./src/jobs/agentStatsCron");

// Security Headers with safe cross-origin policies for mobile app & media assets
app.use(
    helmet({
        crossOriginResourcePolicy: { policy: "cross-origin" },
        crossOriginEmbedderPolicy: false,
        contentSecurityPolicy: false, // Don't interfere with static WebView / HTML embeds
    })
);

const envOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) : [];
const allowedOrigins = [
    "http://localhost:6001",
    "http://localhost:5001",
    "http://localhost:3000",
    "http://localhost:8081",
    "http://187.77.112.128",
    "http://187.77.112.128:5000",
    "http://187.77.112.128:5001",
    "http://keyoh.app",
    "https://keyoh.app",
    "https://admin.keyoh.app",
    ...envOrigins,
].filter(Boolean);

app.use(
    cors({
        origin: function (origin, callback) {
            // Allow native mobile apps, Postman, curl, and server-to-server calls (no origin header)
            if (!origin) return callback(null, true);

            // Allow matching configured origins or local/private development networks
            if (
                allowedOrigins.includes(origin) ||
                origin.startsWith("http://localhost") ||
                origin.startsWith("http://127.0.0.1") ||
                origin.startsWith("http://192.168.") ||
                origin.startsWith("http://10.") ||
                origin.startsWith("http://172.") ||
                origin.startsWith("exp://") ||
                origin.startsWith("keyoh://")
            ) {
                return callback(null, true);
            }

            return callback(new Error(`CORS blocked: Origin ${origin} is not allowed.`));
        },
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
        allowedHeaders: [
            "Content-Type",
            "Authorization",
            "X-Requested-With",
            "Accept",
        ],
    })
);

// Standard payload size limit (multipart file uploads use multer streams directly)
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "10mb" }));
app.use("/public", express.static(path.join(__dirname, "public")));

// Standard HTTP Request Logger Middleware
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const ms = Date.now() - start;
        const timeStr = new Date().toLocaleTimeString('en-GB', { hour12: false });
        let extraInfo = '';
        if (req.body?.email) extraInfo += ` (email: ${req.body.email})`;
        if (req.body?.tier) extraInfo += ` (tier: ${req.body.tier})`;
        if (req.body?.role) extraInfo += ` (role: ${req.body.role})`;

        console.log(`[${timeStr}] ${req.method.padEnd(6)} | ${res.statusCode} | ${req.path.padEnd(30)} | ${ms.toString().padStart(4)}ms${extraInfo}`);
    });
    next();
});

// Static legal pages for App Store / Play Store / in-app WebView
app.get(["/privacy-policy", "/privacy-policy.html"], (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "privacy-policy.html"));
});

app.get(["/terms-and-conditions", "/terms-and-conditions.html", "/terms"], (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "terms-and-conditions.html"));
});

app.get(["/support", "/support.html"], (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "support.html"));
});

app.get(["/delete-account", "/delete-account.html"], (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "delete-account.html"));
});

app.get("/health", (_req, res) => {
    res.status(200).json({ success: true, message: "Keyoh API is running" });
});

const PORT = process.env.PORT || 5001;
const HOST = process.env.HOST || "0.0.0.0";

app.use('/api', router);
app.use(router);

// Centralized error handler to prevent leaking database stack traces in 500 responses
app.use((err, req, res, next) => {
    console.error(`[Unhandled Error] ${req.method} ${req.path}:`, err.stack || err.message);
    if (res.headersSent) {
        return next(err);
    }
    const isCorsError = err.message && err.message.includes('CORS blocked');
    if (isCorsError) {
        return res.status(403).json({ success: false, message: err.message });
    }
    return res.status(500).json({
        success: false,
        message: 'An unexpected internal error occurred. Please try again later.',
    });
});

connectDB();

const { startCleanupCron } = require("./src/services/cleanupCron");
const { startSoldPropertiesCleanupCron } = require("./src/jobs/soldPropertiesCleanupCron");
const { startModerationDigestCron } = require("./src/jobs/moderationDigestCron");

app.listen(PORT, HOST, () => {
    console.log(`[server] Server listening on http://${HOST}:${PORT}`);
    console.log(`[server] Configured CORS origins:`, allowedOrigins);
    startAgentStatsCron();
    startCleanupCron();
    startSoldPropertiesCleanupCron();
    startModerationDigestCron();
});

