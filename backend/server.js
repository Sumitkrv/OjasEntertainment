const dotenv = require("dotenv");
dotenv.config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const mongoose = require("mongoose");
const { randomUUID } = require("crypto");
const { initializeTestStore } = require("./config/testStore");
const { authLimiter, analyticsLimiter } = require("./middlewares/rateLimiters");

const app = express();
const isTestMode = process.env.TEST_MODE === "true";
const allowedOrigins = String(process.env.FRONTEND_URL || "")
	.split(",")
	.map((origin) => origin.trim())
	.filter(Boolean);

const validateEnvironment = () => {
	const missing = [];
	if (!allowedOrigins.length) missing.push("FRONTEND_URL");
	if (!isTestMode && !process.env.JWT_SECRET) missing.push("JWT_SECRET");
	if (!isTestMode && !process.env.MONGODB_URI) missing.push("MONGODB_URI");
	for (const origin of allowedOrigins) {
		try { const parsed = new URL(origin); if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== origin) throw new Error(); }
		catch { throw new Error("FRONTEND_URL must contain comma-separated origins without paths"); }
	}
	if (process.env.NODE_ENV === "production" && process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) throw new Error("JWT_SECRET must be at least 32 characters in production");
	if (process.env.NODE_ENV === "production" && isTestMode) {
		throw new Error("TEST_MODE must be false in production");
	}
	if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
};
validateEnvironment();

const corsOptions = {
	origin: (origin, callback) => {
		if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
		const error = new Error("CORS origin is not allowed");
		error.status = 403;
		return callback(error);
	},
	methods: ["GET", "POST", "DELETE", "PUT", "PATCH", "OPTIONS"],
	allowedHeaders: ["Content-Type", "Authorization"],
	credentials: true,
};

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors(corsOptions));
app.use((req, res, next) => {
	const requestId = randomUUID();
	const startedAt = process.hrtime.bigint();
	req.requestId = requestId;
	res.setHeader("X-Request-ID", requestId);
	res.on("finish", () => {
		const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
		console.info(JSON.stringify({ requestId, method: req.method, route: req.route?.path || req.path, status: res.statusCode, durationMs: Math.round(durationMs * 100) / 100 }));
	});
	next();
});
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
const PORT = process.env.PORT || 3000;
const ensureDatabaseConnection = async () => {
	if (isTestMode || mongoose.connection.readyState === 1) return;
	if (mongoose.connection.readyState === 2) return mongoose.connection.asPromise();
	return mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
};

// All routers
const authRouter = require("./routes/auth");
const userRouter = require("./routes/user");
const taskRoute = require("./routes/task");
const analyticsRoute = require("./routes/analytics");
const financeRoute = require("./routes/finance");
const eventsRoute = require("./routes/events");
const operationsRoute = require("./routes/operations");
const dashboardRoute = require("./routes/dashboard");

async function main() {
	validateEnvironment();
	if (isTestMode) {
		initializeTestStore();
	} else {
		await ensureDatabaseConnection();
	}
}

// Root route
app.get("/", (req, res) => {
	res.json({ message: "Task Management API" });
});

app.get("/api/health/live", (_req, res) => res.json({ status: "ok" }));
const readyCheck = async (_req, res) => {
	try {
		await ensureDatabaseConnection();
		return res.json({ status: "ok", database: "connected" });
	} catch {
		return res.status(503).json({ status: "unavailable", database: "disconnected" });
	}
};
app.get("/api/health/ready", readyCheck);
app.get("/api/health", readyCheck);

// The serverless adapter imports this module without running the local listen() path.
// A lazy connection keeps cold starts on MongoDB and never falls back to the test store.
app.use("/api", async (_req, _res, next) => {
	try { await ensureDatabaseConnection(); next(); }
	catch { next(Object.assign(new Error("Database unavailable"), { status: 503 })); }
});

// All routes
app.use("/api/auth", authLimiter, authRouter);
app.use("/api/user", userRouter);
app.use("/api/task", taskRoute);
app.use("/api/analytics", analyticsLimiter, analyticsRoute);
app.use("/api/events", eventsRoute);
app.use("/api", operationsRoute);
app.use("/api/dashboard", dashboardRoute);
app.use("/api", financeRoute);

// Invalid routes
app.all("*", (req, res) => {
	res.status(404).json({ success: false, message: "Route not found", code: "NOT_FOUND" });
});

// Error handling middleware
app.use((err, req, res, next) => {
	if (res.headersSent) return next(err);
	const status = err.code === 11000 ? 409 : err.statusCode || err.status || (err.name === "MulterError" ? 400 : 500);
	const safeStatus = Number.isInteger(status) && status >= 400 && status < 600 ? status : 500;
	console.error(JSON.stringify({ requestId: req.requestId, error: err.name || "Error" }));
	const code = safeStatus === 429 ? "RATE_LIMITED" : safeStatus === 400 ? "INVALID_REQUEST" : safeStatus === 401 ? "UNAUTHENTICATED" : safeStatus === 403 ? "FORBIDDEN" : safeStatus === 404 ? "NOT_FOUND" : "INTERNAL_ERROR";
	const message = safeStatus >= 500 ? "Unable to process request" : safeStatus === 409 && err.code === 11000 ? "A record with this value already exists" : (safeStatus === 400 && err.name === "MulterError" ? "Invalid upload" : err.message || "Invalid request");
	return res.status(safeStatus).json({ success: false, message, code });
});

const startServer = async () => {
	try {
		await main();
		const server = app.listen(PORT, () => {
			console.log(`Server listening on ${PORT} (${isTestMode ? "TEST_MODE" : "production"})`);
		});
		server.on("error", () => {
			console.error("HTTP server failed to start; verify port availability and deployment configuration.");
			process.exit(1);
		});
		console.log("Database connection established");
	} catch (error) {
		console.error("Server startup failed; verify required environment and database availability.");
		process.exit(1);
	}
};

module.exports = app;
if (require.main === module) startServer();
