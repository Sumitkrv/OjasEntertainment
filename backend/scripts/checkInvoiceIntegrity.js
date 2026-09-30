const fs = require("fs");
const path = require("path");

const file = process.env.TEST_DATA_FILE || path.join(__dirname, "..", "data", "test-data.json");
const db = JSON.parse(fs.readFileSync(file, "utf8"));
const invoices = db.taxInvoices || [];
const events = new Map((db.events || []).map((row) => [String(row._id), row]));
const problems = [];

for (const pi of db.proforma || []) {
	const data = pi.data || {};
	const linked = invoices.find((invoice) => String(invoice._id) === String(data.taxInvoiceId) || String(invoice.data?.proformaInvoiceId) === String(pi._id));
	if ((data.convertedToTaxInvoice || data.taxInvoiceId || data.taxInvoiceNumber) && !linked) {
		problems.push({ piId: pi._id, piNumber: data.piNumber || null, taxInvoiceId: data.taxInvoiceId || null, taxInvoiceNumber: data.taxInvoiceNumber || null, problem: "PI claims conversion but no corresponding Tax Invoice exists" });
	}
	if (linked && String(linked.data?.proformaInvoiceId) !== String(pi._id)) problems.push({ piId: pi._id, piNumber: data.piNumber || null, taxInvoiceId: linked._id, taxInvoiceNumber: linked.data?.invoiceNumber || null, problem: "Tax Invoice proformaInvoiceId does not match PI" });
	if (linked && String(data.eventId || "") !== String(linked.data?.eventId || "")) problems.push({ piId: pi._id, piNumber: data.piNumber || null, taxInvoiceId: linked._id, taxInvoiceNumber: linked.data?.invoiceNumber || null, problem: "PI and Tax Invoice event IDs differ" });
	if (data.eventId && !events.has(String(data.eventId))) problems.push({ piId: pi._id, piNumber: data.piNumber || null, taxInvoiceId: data.taxInvoiceId || null, taxInvoiceNumber: data.taxInvoiceNumber || null, problem: "PI references a missing Event" });
}

console.log(JSON.stringify({ checked: (db.proforma || []).length, problems }, null, 2));
