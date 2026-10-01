const { getUserIdFromToken } = require("../config/jwtProvider");
const mongoose = require("mongoose");
const User = require("../models/user");
const wrapAsync = require("./wrapAsync");
const { findUserById } = require("../config/testStore");

const isTestMode = process.env.TEST_MODE === "true";

const authorization = wrapAsync(async (req, res, next) => {
	const authorizationHeader = req.headers.authorization;
	const token = authorizationHeader?.startsWith("Bearer ")
		? authorizationHeader.slice(7)
		: null;
	if (!token) {
		return res.status(401).json({ message: "Authentication required" });
	}
	let userId;
	try {
		userId = getUserIdFromToken(token);
	} catch (error) {
		return res.status(401).json({ message: "Invalid or expired token" });
	}
	if (!userId || (!isTestMode && !mongoose.Types.ObjectId.isValid(userId))) {
		return res.status(401).json({ message: "Invalid or expired token" });
	}
	if (userId) {
		if (isTestMode) {
			const user = findUserById(userId);
			if (!user) {
				return res.status(401).json({ message: "Invalid or expired token" });
			}
			req.user = { ...user, password: undefined };
		} else {
			req.user = await User.findById(userId).select("-password");
			if (!req.user) {
				return res.status(401).json({ message: "Invalid or expired token" });
			}
		}
		next();
	} else {
		return res.status(401).json({ message: "Invalid or expired token" });
	}
});

module.exports = { authorization };
