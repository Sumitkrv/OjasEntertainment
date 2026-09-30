const User = require("../models/user");
const bcrypt = require("bcryptjs");
const {
	findUserByEmail,
	findUserById,
	findUsers,
	updateUser: updateTestUser,
	addBoardMember,
} = require("../config/testStore");

const isTestMode = process.env.TEST_MODE === "true";
const normalizeEmail = (email) => typeof email === "string" ? email.trim().toLowerCase() : email;
const publicUser = (user) => ({ ...user, password: null });

const getAuthUser = async (req, res) => {
	if (!req.user) {
		return res.status(404).json({ message: `User Not Found` });
	}
	res.status(200).json({
		data: req.user,
	});
};

const updateUser = async (req, res) => {
	let { name, email, oldPassword, newPassword } = req.body;
	email = normalizeEmail(email);
	if (typeof name !== "string" || !name.trim() || typeof email !== "string" || typeof oldPassword !== "string" || typeof newPassword !== "string" || !oldPassword || !newPassword) {
		return res.status(400).json({ message: "All fields are required" });
	}
	name = name.trim();
	if (name.length > 100) return res.status(400).json({ message: "Name is too long" });
	if (!/^\S+@\S+\.\S+$/.test(email)) {
		return res.status(400).json({ message: "Invalid email" });
	}
	if (newPassword.length < 8 || Buffer.byteLength(newPassword, "utf8") > 72) {
		return res.status(400).json({ message: "Password must be at least 8 characters and at most 72 UTF-8 bytes" });
	}
	if (isTestMode) {
		const user = findUserById(req.user._id);
		if (!user) return res.status(404).json({ message: "User Not Found" });
		if (user.email !== email && findUserByEmail(email)) {
			return res.status(400).json({ message: `Email Already Used` });
		}
		if (!(await bcrypt.compare(oldPassword, user.password))) {
			return res.status(400).json({ message: "Password is incorrect" });
		}
		const userData = updateTestUser(user._id, {
			name,
			email,
			password: await bcrypt.hash(newPassword, 12),
		});
		return res.status(200).json({
			message: "success",
			data: publicUser(userData),
		});
	}
	if (req.user.email != email) {
		const existingUser = await User.findOne({ email: email });
		if (existingUser) {
			return res.status(400).json({ message: `Email Already Used` });
		}
	}
	const user = await User.findById(req.user.id);
	if (!user) return res.status(404).json({ message: "User Not Found" });
	const passwordEqual = await bcrypt.compare(oldPassword, user.password);
	if (passwordEqual) {
		newPassword = await bcrypt.hash(newPassword, 12);
		const userData = await User.findByIdAndUpdate(
			req.user.id,
			{
				name: name,
				email: email,
				password: newPassword,
			},
			{ new: true }
		);
		userData.password = null;
		res.status(200).json({
			message: "success",
			data: userData,
		});
	} else {
		return res.status(400).json({ message: "Password is incorrect" });
	}
};

const getAllUsers = async (req, res) => {
	if (isTestMode) {
		const allUsers = findUsers()
			.filter((user) => user._id !== req.user._id)
			.map(publicUser);
		return res.status(200).send({ data: allUsers });
	}
	const allUsers = await User.find({ _id: { $ne: req.user._id } })
		.select("-password")
		.sort({ _id: -1 });
	res.status(200).send({ data: allUsers });
};
const updateBoard = async (req, res) => {
	let { email } = req.body;
	email = normalizeEmail(email);
	if (!email) return res.status(400).json({ message: "Email is required" });
	if (isTestMode) {
		const targetUser = findUserByEmail(email);
		if (!targetUser) return res.status(404).json({ message: "User Not Found" });
		if (targetUser._id === req.user._id) {
			return res.status(400).json({ message: "You cannot add yourself" });
		}
		const userData = addBoardMember(req.user._id, email);
		return res.status(200).json({
			message: "success",
			data: publicUser(userData),
			email,
		});
	}
	const userData = await User.findByIdAndUpdate(
		req.user._id,
		{ $push: { board: email } },
		{ new: true }
	);
	userData.password = null;
	res.status(200).json({
		message: "success",
		data: userData,
		email: email,
	});
};

module.exports = { getAuthUser, updateUser, getAllUsers, updateBoard };
