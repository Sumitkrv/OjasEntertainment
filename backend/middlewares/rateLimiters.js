const rateLimit = require("express-rate-limit");

const authLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 30,
	standardHeaders: "draft-7",
	legacyHeaders: false,
	message: { success: false, message: "Too many authentication attempts", code: "RATE_LIMITED" },
});

const analyticsLimiter = rateLimit({
	windowMs: 60 * 1000,
	limit: 60,
	standardHeaders: "draft-7",
	legacyHeaders: false,
	message: { success: false, message: "Too many analytics requests", code: "RATE_LIMITED" },
});

const uploadLimiter = rateLimit({
	windowMs: 10 * 60 * 1000,
	limit: 20,
	standardHeaders: "draft-7",
	legacyHeaders: false,
	message: { success: false, message: "Too many uploads. Please try again later", code: "RATE_LIMITED" },
});

const accountLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 10,
	standardHeaders: "draft-7",
	legacyHeaders: false,
	message: { success: false, message: "Too many account changes. Please try again later", code: "RATE_LIMITED" },
});

module.exports = { authLimiter, analyticsLimiter, uploadLimiter, accountLimiter };
