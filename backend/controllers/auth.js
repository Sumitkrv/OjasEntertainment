const User = require("../models/user");
const bcrypt = require("bcryptjs");
const { generateToken } = require("../config/jwtProvider");
const { addUser, findUserByEmail, createId } = require("../config/testStore");

const isTestMode = process.env.TEST_MODE === "true";

const normalizeEmail = (email) => typeof email === "string" ? email.trim().toLowerCase() : email;

const validateCredentials = (name, email, password, includeName = false) => {
	if ((includeName && (typeof name !== "string" || !name.trim())) || typeof email !== "string" || typeof password !== "string" || !email || !password) {
		return "Name, email, and password are required";
	}
	if (includeName && name.trim().length > 100) return "Name is too long";
	if (!/^\S+@\S+\.\S+$/.test(email)) return "Invalid email";
	if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72) return "Password must be between 8 characters and 72 UTF-8 bytes";
	return null;
};

const registerUser = async (req, res, next) => {
	let { name, email, password } = req.body;
	email = normalizeEmail(email);
	const validationError = validateCredentials(name, email, password, true);
	if (validationError) return res.status(400).json({ message: validationError });
	if (isTestMode) {
		if (findUserByEmail(email)) {
			return res.status(409).json({ message: "User already exists" });
		}
		const user = addUser({
			_id: createId("test-user"),
			name: name.trim(),
			email,
			password: await bcrypt.hash(password, 12),
			board: [],
		});
		return res.status(200).json({
			message: "Registration Successfully",
			token: generateToken(user._id),
		});
	}
	const existingUser = await User.findOne({ email: email });
	if (existingUser) {
		return res.status(409).json({ message: "User already exists" });
	}
	password = bcrypt.hashSync(password, 8);
	const userData = new User({
		name: name.trim(),
		email,
		password: await bcrypt.hash(password, 12),
	});
	const user = await userData.save();
	const jwt = generateToken(user._id);
	res.status(200).json({
		message: "Registration Successfully",
		token: jwt,
	});
};

const loginUser = async (req, res) => {
	let { email, password } = req.body;
	email = normalizeEmail(email);
	const validationError = validateCredentials(null, email, password);
	if (validationError) return res.status(400).json({ message: validationError });
	if (isTestMode) {
		const user = findUserByEmail(email);
		if (!user || !(await bcrypt.compare(password, user.password))) {
			return res.status(401).json({ message: "Invalid email or password" });
		}
		const userData = { ...user, password: null };
		return res.status(200).json({
			message: "Login Successfully",
			data: userData,
			token: generateToken(user._id),
		});
	}
	let user = await User.findOne({ email: email });
	if (!user) {
		return res.status(401).json({ message: "Invalid email or password" });
	}
	const isPasswordValid = await bcrypt.compare(password, user.password);
	if (!isPasswordValid) {
		return res.status(401).json({ message: "Invalid email or password" });
	}
	const jwt = generateToken(user._id);
	user.password = null;
	res.status(200).json({
		message: "Login Successfully",
		data: user,
		token: jwt,
	});
};

module.exports = { registerUser, loginUser };
