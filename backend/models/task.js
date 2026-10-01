const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
	{
		title: {
			type: String,
			required: true,
			unique: true,
			trim: true,
		},
		priority: {
			type: String,
			required: true,
		},
		category: {
			type: String,
			required: true,
			default: "to-do",
		},
		status: {
			type: String,
			enum: ["backlog", "todo", "in_progress", "done"],
			default: "todo",
		},
		checklist: [
			{
				name: {
					type: String,
					trim: true,
					required: true,
				},
				isDone: {
					type: Boolean,
					default: false,
					required: true,
				},
			},
		],
		userName: {
			type: mongoose.Schema.ObjectId,
			ref: "User",
			required: true,
		},
		assign: String,

		dueDate: Date,
		startedAt: Date,
		completedAt: Date,
	},
	{
		timestamps: true,
	}
);

const Task = mongoose.model("Task", taskSchema);
module.exports = Task;
