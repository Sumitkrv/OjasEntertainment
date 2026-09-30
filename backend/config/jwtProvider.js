const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET || (
	process.env.TEST_MODE === "true" ? "local-test-only-jwt-secret" : null
);

if (!JWT_SECRET) throw new Error("JWT_SECRET is required when TEST_MODE is false");

const generateToken = (userId) => {
	const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: "24h", algorithm: "HS256" });
	return token;
};
const getUserIdFromToken = (token) => {
	const decodedToken = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
	return decodedToken.userId;
};

module.exports = {
	generateToken,
	getUserIdFromToken,
};
