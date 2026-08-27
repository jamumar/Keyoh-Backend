require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();
const bodyParser = require("body-parser");
const path = require("path");
const { connectDB } = require("./src/lib/db");
const router = require("./src/router");
const { startAgentStatsCron } = require("./src/jobs/agentStatsCron");

const envOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) : [];
const allowedOrigins = [
    "http://localhost:6001",
    "http://localhost:5001",
    "http://187.77.112.128",
    "http://187.77.112.128:5000",
    "http://keyoh.app",
    "https://keyoh.app",
    ...envOrigins,
].filter(Boolean);

app.use(
    cors({
        origin: function (origin, callback) {
            if (!origin) return callback(null, true);
            if (
                allowedOrigins.includes(origin) ||
                origin.startsWith("http://localhost") ||
                origin.startsWith("http://127.0.0.1") ||
                origin.startsWith("http://192.168.") ||
                origin.startsWith("http://10.") ||
                origin.startsWith("exp://") ||
                origin.startsWith("keyoh://")
            ) {
                return callback(null, true);
            }
            return callback(null, true);
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

app.use(bodyParser.json({ limit: "200mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "200mb" }));
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

app.use(router);

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
