const fs = require("fs");
const path = require("path");
const { calculateInvoice, sumPayments } = require("../services/financial");
const { EVENT_STATUSES } = require("../services/eventLifecycle");

const file = process.env.TEST_DATA_FILE || path.join(__dirname, "..", "data", "test-data.json");
const db = JSON.parse(fs.readFileSync(file, "utf8"));
const records = (type) => db[type] || [];
const users = new Set((db.users || []).map((user) => String(user._id)));
const owned = new Map();
for (const type of ["events", "proforma", "taxInvoices", "payments", "payouts", "work", "documents", "activities"]) {
	for (const record of records(type)) owned.set(`${type}:${record._id}`, record);
}
const events = new Map(records("events").filter((row) => row.data?.recordKind === "event").map((row) => [String(row._id), row]));
const proformas = new Map(records("proforma").map((row) => [String(row._id), row]));
const taxInvoices = new Map(records("taxInvoices").map((row) => [String(row._id), row]));
const payments = records("payments");
const problems = [];
const add = (type, record, problem) => problems.push({ type, id: String(record._id), problem });
const duplicateCheck = (type, field) => {
	const seen = new Map();
	for (const record of records(type)) {
		const value = String(record.data?.[field] || "").trim().toLowerCase();
		if (!value) continue;
		const key = `${record.userId}:${value}`;
		if (seen.has(key)) add(type, record, `duplicate ${field}`);
		else seen.set(key, record._id);
	}
};

for (const [key, record] of owned) {
	if (!users.has(String(record.userId))) add(key.split(":")[0], record, "owner user is missing");
}
duplicateCheck("proforma", "piNumber");
duplicateCheck("taxInvoices", "invoiceNumber");

for (const event of events.values()) {
	if (!EVENT_STATUSES.includes(event.data?.status)) add("events", event, "invalid event status");
}
for (const pi of proformas.values()) {
	const data = pi.data || {};
	if (data.eventId && !events.has(String(data.eventId))) add("proforma", pi, "references missing Event");
	if (data.taxInvoiceId && !taxInvoices.has(String(data.taxInvoiceId))) add("proforma", pi, "taxInvoiceId references missing Tax Invoice");
	const related = records("taxInvoices").find((row) => String(row.data?.proformaInvoiceId || "") === String(pi._id));
	if ((data.convertedToTaxInvoice || data.taxInvoiceNumber) && !related && !data.taxInvoiceId) add("proforma", pi, "claims conversion without matching Tax Invoice");
	try {
		const received = sumPayments(payments.filter((row) => String(row.userId) === String(pi.userId)), String(pi._id), [data.taxInvoiceId]);
		const calculated = calculateInvoice(data, { received });
		if (calculated.outstandingAmount < 0 || calculated.overpaymentAmount < 0) add("proforma", pi, "negative outstanding or overpayment");
	} catch {
		add("proforma", pi, "invalid financial values");
	}
}
for (const invoice of taxInvoices.values()) {
	const data = invoice.data || {};
	const pi = proformas.get(String(data.proformaInvoiceId || ""));
	if (data.proformaInvoiceId && !pi) add("taxInvoices", invoice, "references missing PI");
	if (data.eventId && !events.has(String(data.eventId))) add("taxInvoices", invoice, "references missing Event");
	if (pi && String(pi.data.eventId || "") !== String(data.eventId || "")) add("taxInvoices", invoice, "Event differs from linked PI");
}
for (const payment of payments) {
	const data = payment.data || {};
	const pi = data.proformaInvoiceId ? proformas.get(String(data.proformaInvoiceId)) : null;
	const invoice = data.taxInvoiceId ? taxInvoices.get(String(data.taxInvoiceId)) : null;
	if (!pi && !invoice) add("payments", payment, "has no valid PI or Tax Invoice reference");
	if (pi && String(pi.userId) !== String(payment.userId) || invoice && String(invoice.userId) !== String(payment.userId)) add("payments", payment, "invoice belongs to another user");
	if (data.eventId && !events.has(String(data.eventId))) add("payments", payment, "references missing Event");
	if (data.amount !== undefined && (!Number.isFinite(Number(data.amount)) || Number(data.amount) <= 0)) add("payments", payment, "invalid amount");
}
for (const type of ["payouts", "work", "documents", "activities"]) {
	for (const record of records(type)) {
		const data = record.data || {};
		if (data.eventId && !events.has(String(data.eventId))) add(type, record, "references missing Event");
		if (type === "documents" && data.storagePath && !fs.existsSync(data.storagePath)) add(type, record, "stored file is missing");
	}
}

console.log(JSON.stringify({ source: path.basename(file), recordsChecked: owned.size, problems }, null, 2));
