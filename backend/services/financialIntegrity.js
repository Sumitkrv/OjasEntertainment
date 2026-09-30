const FinanceRecord = require("../models/financeRecord");
const { findRecords } = require("../config/testStore");
const { calculateInvoice, sumPayments, toMoney } = require("./financial");

const isTestMode = process.env.TEST_MODE === "true";

const recordsFor = async (type, userId) => {
	if (isTestMode) return findRecords(type).filter((record) => record.userId === userId);
	return FinanceRecord.find({ type, userId });
};

const addIssue = (issues, piId, field, problem) => issues.push({ piId, field, problem });

const checkFinancialIntegrity = async (userId) => {
	const [proformas, payments] = await Promise.all([recordsFor("proforma", userId), recordsFor("payments", userId)]);
	const issues = [];
	for (const record of proformas) {
		const data = record.data || {};
		const piId = String(record._id);
		let calculated;
		try {
			const received = sumPayments(payments, record._id);
			calculated = calculateInvoice(data, { received });
		} catch (error) {
			addIssue(issues, piId, "financialData", error.message);
			continue;
		}
		for (const [field, expected] of [
			["grossInvoiceValue", calculated.grossInvoiceValue],
			["totalInvoiceValue", calculated.totalInvoiceValue],
			["piAmount", calculated.piAmount],
			["gstAmount", calculated.gstAmount],
			["tdsAmount", calculated.tdsAmount],
			["netPayable", calculated.netPayable],
			["amountReceived", calculated.amountReceived],
			["outstandingAmount", calculated.outstandingAmount],
			["overpaymentAmount", calculated.overpaymentAmount],
			["status", calculated.status],
		]) {
			if (data[field] !== undefined) {
				if (field === "status") {
					if (String(data[field]).toUpperCase() === "ISSUED" && expected === "UNPAID") continue;
					if (String(data[field]) !== String(expected)) addIssue(issues, piId, field, `expected ${expected}, found ${data[field]}`);
				} else {
					try {
						if (toMoney(data[field], field) !== expected) addIssue(issues, piId, field, `expected ${expected.toFixed(2)}, found ${data[field]}`);
					} catch (error) {
						addIssue(issues, piId, field, error.message);
					}
				}
			}
		}
	}
	return { valid: issues.length === 0, issues };
};

module.exports = { checkFinancialIntegrity };
