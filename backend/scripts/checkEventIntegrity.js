const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "data", "test-data.json");
const db = JSON.parse(fs.readFileSync(file, "utf8"));
const keyed = (type) => new Map((db[type] || []).map((record) => [String(record._id), record]));
const events = keyed("events");
const users = new Map((db.users || []).map((user) => [String(user._id), user]));
const collections = ["proforma", "taxInvoices", "payments", "payouts", "work", "documents", "activities"];
const problems = [];
const report = (record, issue) => problems.push({ recordType: record.type, recordId: record._id, eventId: record.data?.eventId || null, issue });

for (const type of collections) {
	for (const item of db[type] || []) {
		const eventId = item.data?.eventId;
		if (!eventId) continue;
		const event = events.get(String(eventId));
		if (!event || String(event.userId) !== String(item.userId)) report({ ...item, type }, "References a missing or inaccessible Event");
	}
}

for (const type of ["proforma", "taxInvoices", "payments", "payouts", "documents"]) {
	for (const item of db[type] || []) {
		const d = item.data || {};
		for (const [field, targetType] of [["proformaInvoiceId", "proforma"], ["taxInvoiceId", "taxInvoices"], ["relatedEntityId", ({ PROFORMA: "proforma", TAX_INVOICE: "taxInvoices", PAYMENT: "payments", PAYOUT: "payouts", WORK: "work" })[d.relatedEntityType]]]) {
			if (!d[field]) continue;
			const target = keyed(targetType || "").get(String(d[field]));
			if (!target || String(target.userId) !== String(item.userId)) report({ ...item, type }, `References a missing ${targetType || "related record"}`);
			else if ((d.eventId || target.data?.eventId) && String(d.eventId || "") !== String(target.data?.eventId || "")) report({ ...item, type }, `${field} belongs to a different Event`);
		}
	}
}

const proformas = keyed("proforma");
const taxInvoices = keyed("taxInvoices");
for (const pi of db.proforma || []) {
	const id = pi.data?.taxInvoiceId;
	if (!id) continue;
	const invoice = taxInvoices.get(String(id));
	if (!invoice || String(invoice.userId) !== String(pi.userId)) report({ ...pi, type: "proforma" }, "taxInvoiceId points to a missing Tax Invoice");
	else if (String(invoice.data?.proformaInvoiceId || "") !== String(pi._id)) report({ ...pi, type: "proforma" }, "Tax Invoice does not point back to this PI");
}
for (const invoice of db.taxInvoices || []) {
	const piId = invoice.data?.proformaInvoiceId;
	if (!piId) continue;
	const pi = proformas.get(String(piId));
	if (!pi || String(pi.userId) !== String(invoice.userId)) report({ ...invoice, type: "taxInvoices" }, "proformaInvoiceId points to a missing PI");
	else if (String(pi.data?.eventId || "") !== String(invoice.data?.eventId || "")) report({ ...invoice, type: "taxInvoices" }, "Tax Invoice and PI belong to different Events");
}

console.log(JSON.stringify({ eventsChecked: events.size, recordsChecked: collections.reduce((sum, type) => sum + (db[type] || []).length, 0), usersChecked: users.size, problems }, null, 2));
