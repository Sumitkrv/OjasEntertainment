const mongoose = require("mongoose");

const financeRecordSchema = new mongoose.Schema(
	{
		type: { type: String, required: true, enum: ["events", "proforma", "payouts", "work", "activities", "documents", "taxInvoices", "payments"] },
		userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
		data: { type: mongoose.Schema.Types.Mixed, required: true },
	},
	{ timestamps: true }
);

financeRecordSchema.index({ type: 1, userId: 1 });
financeRecordSchema.index({ userId: 1, "data.invoiceNumber": 1 }, { unique: true, partialFilterExpression: { type: "taxInvoices", "data.invoiceNumber": { $type: "string" } } });
module.exports = mongoose.models.FinanceRecord || mongoose.model("FinanceRecord", financeRecordSchema);
