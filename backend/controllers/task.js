const Task = require("../models/task");
const {
	addTask: addTestTask,
	findTaskById: findTestTaskById,
	findTasks: findTestTasks,
	updateTask: updateTestTask,
	deleteTask: deleteTestTask,
	createId,
} = require("../config/testStore");
const { findUserById, findUserByEmail } = require("../config/testStore");
const User = require("../models/user");
const { isValidDateValue } = require("../services/dateRange");

const isTestMode = process.env.TEST_MODE === "true";

const formatTestTask = (task) => {
	if (!task) return null;
	const user = findUserById(task.userName);
	return {
		...task,
		userName: user ? { _id: user._id, name: user.name } : task.userName,
	};
};

const canManageTask = (task, user) => task && (task.userName === user._id || task.assign === user.email);
const CATEGORIES = new Set(["backlog", "to-do", "in-progress", "done"]);
const STATUSES = new Set(["backlog", "todo", "in_progress", "done"]);
const statusToCategory = { backlog: "backlog", todo: "to-do", in_progress: "in-progress", done: "done" };
const categoryToStatus = { backlog: "backlog", "to-do": "todo", "in-progress": "in_progress", done: "done" };
const PRIORITIES = new Set(["High Priority", "Moderate Priority", "Low Priority"]);
const validateTaskInput = (body, { creating = false } = {}) => {
	if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Request body must be an object" };
	const allowed = new Set(["title", "priority", "checklist", "dueDate", "assign", "status"]);
	const unknown = Object.keys(body).find((key) => !allowed.has(key));
	if (unknown) return { error: `Unexpected field: ${unknown}` };
	const data = {};
	if (creating || Object.hasOwn(body, "title")) {
		if (typeof body.title !== "string" || !body.title.trim() || body.title.trim().length > 200) return { error: "Title is required and must be at most 200 characters" };
		data.title = body.title.trim();
	}
	if (creating || Object.hasOwn(body, "priority")) {
		if (!PRIORITIES.has(body.priority)) return { error: "Invalid task priority" };
		data.priority = body.priority;
	}
	if (creating || Object.hasOwn(body, "checklist")) {
		if (!Array.isArray(body.checklist) || body.checklist.length > 100 || body.checklist.some((item) => !item || typeof item !== "object" || Array.isArray(item) || typeof item.name !== "string" || !item.name.trim() || item.name.length > 200 || (item.isDone !== undefined && typeof item.isDone !== "boolean"))) return { error: "Invalid checklist" };
		data.checklist = body.checklist.map((item) => ({ name: item.name.trim(), isDone: Boolean(item.isDone) }));
	}
	if (Object.hasOwn(body, "dueDate")) {
		if (body.dueDate && !isValidDateValue(body.dueDate)) return { error: "Invalid dueDate" };
		data.dueDate = body.dueDate || null;
	}
	if (Object.hasOwn(body, "assign")) {
		if (body.assign !== "" && (typeof body.assign !== "string" || !/^\S+@\S+\.\S+$/.test(body.assign) || body.assign.length > 254)) return { error: "Invalid assignee email" };
		data.assign = body.assign ? body.assign.trim().toLowerCase() : "";
	}
	if (Object.hasOwn(body, "status")) {
		if (!STATUSES.has(body.status)) return { error: "Invalid task status" };
		data.status = body.status;
	}
	return { data };
};
const assignmentExists = async (email) => {
	if (!email) return true;
	return isTestMode ? Boolean(findUserByEmail(email)) : Boolean(await User.findOne({ email: email.trim().toLowerCase() }).select("_id"));
};

const getTask = async (req, res) => {
	const { id } = req.params;
	if (isTestMode) {
		const task = findTestTaskById(id);
		if (!task) return res.status(404).send({ message: "Task Not Found" });
		if (task.userName !== req.user._id && task.assign !== req.user.email) return res.status(403).send({ message: "You cannot view this task" });
		return res.status(200).send({
			message: "success",
			data: formatTestTask(task),
		});
	}
	let task = await Task.findById(id);
	if (!task) return res.status(404).send({ message: "Task Not Found" });
	if (task.userName.toString() !== req.user._id.toString() && task.assign !== req.user.email) return res.status(403).send({ message: "You cannot view this task" });
	res.status(200).send({ message: "success", data: task });
};

const getAllTask = async (req, res) => {
	const days = req.query.days === undefined ? 365 : Number(req.query.days);
	if (!Number.isInteger(days) || days < 1 || days > 3650) return res.status(400).send({ message: "days must be an integer from 1 to 3650" });
	if (isTestMode) {
		const cutoff = new Date(Date.now() - days * 24 * 3600000);
		const userTasks = findTestTasks().filter(
			(task) =>
				(task.userName === req.user._id || task.assign === req.user.email) &&
				new Date(task.createdAt) >= cutoff
		);
		const groupedTasks = (category) =>
			userTasks
				.filter((task) => task.category === category)
				.map(formatTestTask);
		return res.status(200).send({
			message: "success",
			data: {
				backlog: groupedTasks("backlog"),
				todo: groupedTasks("to-do"),
				inProgress: groupedTasks("in-progress"),
				done: groupedTasks("done"),
			},
		});
	}
	const daysAgo = (period) => new Date(new Date() - period * 24 * 3600000);
	let backlog = await Task.find({
		$or: [
			{
				$and: [
					{ userName: req.user._id },
					{ category: "backlog" },
					{ createdAt: { $gte: daysAgo(days) } },
				],
			},
			{
				$and: [
					{ assign: req.user.email },
					{ category: "backlog" },
					{ createdAt: { $gte: daysAgo(days) } },
				],
			},
		],
	}).populate({
		path: "userName",
		select: "name",
	});
	let todo = await Task.find({
		$or: [
			{
				$and: [
					{ userName: req.user._id },
					{ category: "to-do" },
					{ createdAt: { $gte: daysAgo(days) } },
				],
			},
			{
				$and: [
					{ assign: req.user.email },
					{ category: "to-do" },
					{ createdAt: { $gte: daysAgo(days) } },
				],
			},
		],
	}).populate({
		path: "userName",
		select: "name",
	});
	let inProgress = await Task.find({
		$or: [
			{
				$and: [
					{ userName: req.user._id },
					{ category: "in-progress" },
					{ createdAt: { $gte: daysAgo(days) } },
				],
			},
			{
				$and: [
					{ assign: req.user.email },
					{ category: "in-progress" },
					{ createdAt: { $gte: daysAgo(days) } },
				],
			},
		],
	}).populate({
		path: "userName",
		select: "name",
	});
	let done = await Task.find({
		$or: [
			{
				$and: [
					{ userName: req.user._id },
					{ category: "done" },
					{ createdAt: { $gte: daysAgo(req.query.days || 365) } },
				],
			},
			{
				$and: [
					{ assign: req.user.email },
					{ category: "done" },
					{ createdAt: { $gte: daysAgo(req.query.days || 365) } },
				],
			},
		],
	}).populate({
		path: "userName",
		select: "name",
	});
	res.status(200).send({
		message: "success",
		data: { backlog, todo, inProgress, done },
	});
};

const addTask = async (req, res) => {
	const validated = validateTaskInput(req.body, { creating: true });
	if (validated.error) return res.status(400).send({ message: validated.error });
	const { title, priority, checklist, dueDate, assign, status = "todo" } = validated.data;
	const userName = req.user._id;
	if (!(await assignmentExists(assign))) return res.status(404).send({ message: "Assigned User Not Found" });
	if (isTestMode) {
		const task = addTestTask({
			_id: createId("test-task"),
			title,
			priority,
			category: statusToCategory[status],
			status,
			checklist,
			userName,
			assign,
			dueDate,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		});
		return res.status(200).send({
			message: "success",
			data: formatTestTask(task),
		});
	}
	let newTask = new Task({
		title,
		priority,
		checklist,
		dueDate,
		userName,
		assign,
		status,
		category: statusToCategory[status],
	});
	let createTask = await newTask.save();
	let task = await Task.findById(createTask._id).populate({
		path: "userName",
		select: "name",
	});
	res.status(200).send({ message: "success", data: task });
};

const updateTask = async (req, res) => {
	const validated = validateTaskInput(req.body);
	if (validated.error) return res.status(400).send({ message: validated.error });
	const changes = validated.data;
	const { id } = req.params;
	if (isTestMode) {
		const oldTask = findTestTaskById(id);
		if (!oldTask) {
			return res.status(404).send({ message: "Task Not Found" });
		}
		if (!canManageTask(oldTask, req.user)) {
			return res.status(403).send({ message: "You cannot modify this task" });
		}
		if (Object.hasOwn(changes, "assign") && !(await assignmentExists(changes.assign))) return res.status(404).send({ message: "Assigned User Not Found" });
		const wasAssigned = oldTask.assign === req.user.email;
		const updatedTask = updateTestTask(id, { ...changes, updatedAt: new Date().toISOString() });
		if (wasAssigned && Object.hasOwn(changes, "assign") && changes.assign !== req.user.email) return res.status(200).send({ message: "success", data: formatTestTask(updatedTask), removeAssignCategory: oldTask.category });
		return res.status(200).send({ message: "success", data: formatTestTask(updatedTask) });
	}
	let oldTask = await Task.findById(id);
	if (!oldTask) return res.status(404).send({ message: "Task Not Found" });
	if (oldTask.userName.toString() !== req.user._id.toString() && oldTask.assign !== req.user.email) {
		return res.status(403).send({ message: "You cannot modify this task" });
	}
	if (Object.hasOwn(changes, "assign") && !(await assignmentExists(changes.assign))) return res.status(404).send({ message: "Assigned User Not Found" });
	const wasAssigned = oldTask.assign === req.user.email;
	let updatedTask = await Task.findByIdAndUpdate(
		id,
		changes,
		{ new: true, runValidators: true }
	).populate({
		path: "userName",
		select: "name",
	});
	if (
		(wasAssigned && Object.hasOwn(changes, "assign") && changes.assign !== req.user.email) ||
		(Object.hasOwn(changes, "assign") && changes.assign !== req.user.email &&
			updatedTask.userName._id.toString() != req.user._id.toString())
	) {
		res.status(200).send({
			message: "success",
			data: updatedTask,
			removeAssignCategory: oldTask.category,
		});
	} else {
		res.status(200).send({ message: "success", data: updatedTask });
	}
};
const deleteTask = async (req, res) => {
	const { id } = req.params;
	if (isTestMode) {
		const task = findTestTaskById(id);
		if (!task) return res.status(404).send({ message: "Task Not Found" });
		if (!canManageTask(task, req.user)) {
			return res.status(403).send({ message: "You cannot delete this task" });
		}
		return res.status(200).send({
			message: "success",
			data: deleteTestTask(id),
		});
	}
	const task = await Task.findById(id);
	if (!task) return res.status(404).send({ message: "Task Not Found" });
	if (
		task.userName.toString() !== req.user._id.toString() &&
		task.assign !== req.user.email
	) {
		return res.status(403).send({ message: "You cannot delete this task" });
	}
	const deleteTask = await Task.findByIdAndDelete(id);
	res.status(200).send({ message: "success", data: deleteTask });
};

const updateCategory = async (req, res) => {
	const { id } = req.params;
	const { category } = req.body;
	if (Object.keys(req.body || {}).some((key) => key !== "category") || !CATEGORIES.has(category)) return res.status(400).send({ message: "Invalid task category" });
	if (isTestMode) {
		const existingTask = findTestTaskById(id);
		if (!existingTask) return res.status(404).send({ message: "Task Not Found" });
		if (!canManageTask(existingTask, req.user)) {
			return res.status(403).send({ message: "You cannot modify this task" });
		}
		const status = categoryToStatus[category];
		const now = new Date();
		const changes = { category, status, updatedAt: now.toISOString() };
		if (status === "in_progress" && !existingTask.startedAt) changes.startedAt = now.toISOString();
		if (status === "done") changes.completedAt = now.toISOString();
		if (status !== "done" && existingTask.completedAt) changes.completedAt = null;
		const task = updateTestTask(id, changes);
		return res.status(200).send({
			message: "success",
			data: task ? formatTestTask(task) : null,
		});
	}
	const existingTask = await Task.findById(id);
	if (!existingTask) return res.status(404).send({ message: "Task Not Found" });
	if (
		existingTask.userName.toString() !== req.user._id.toString() &&
		existingTask.assign !== req.user.email
	) {
		return res.status(403).send({ message: "You cannot modify this task" });
	}
	let task = await Task.findByIdAndUpdate(
		id,
		{ category: category, status: categoryToStatus[category], updatedAt: new Date() },
		{ new: true }
	).populate({
		path: "userName",
		select: "name",
	});

	res.status(200).send({
		message: "success",
		data: task,
	});
};

const updateStatus = async (req, res) => {
	const { id } = req.params;
	const { status } = req.body || {};
	if (Object.keys(req.body || {}).some((key) => key !== "status") || !STATUSES.has(status)) return res.status(400).send({ message: "Invalid task status" });
	const now = new Date();
	const existingTask = isTestMode ? findTestTaskById(id) : await Task.findById(id);
	if (!existingTask) return res.status(404).send({ message: "Task Not Found" });
	const ownerId = isTestMode ? existingTask.userName : existingTask.userName.toString();
	if (ownerId !== req.user._id.toString() && existingTask.assign !== req.user.email) return res.status(403).send({ message: "You cannot modify this task" });
	const changes = { status, category: statusToCategory[status], updatedAt: now };
	if (status === "in_progress" && !existingTask.startedAt) changes.startedAt = now;
	if (status === "done") changes.completedAt = now;
	if (status !== "done" && existingTask.completedAt) changes.completedAt = null;
	if (isTestMode) {
		const task = updateTestTask(id, { ...changes, updatedAt: now.toISOString(), startedAt: changes.startedAt?.toISOString(), completedAt: changes.completedAt === null ? null : changes.completedAt?.toISOString() });
		return res.status(200).send({ message: "success", data: formatTestTask(task) });
	}
	const task = await Task.findByIdAndUpdate(id, changes, { new: true, runValidators: true }).populate({ path: "userName", select: "name" });
	return res.status(200).send({ message: "success", data: task });
};

module.exports = {
	getTask,
	getAllTask,
	addTask,
	updateTask,
	deleteTask,
	updateCategory,
	updateStatus,
};
