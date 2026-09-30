if (process.env.TEST_MODE !== "true" || process.env.NODE_ENV === "production") {
	console.error("Refusing to repair data: this command requires TEST_MODE=true outside production.");
	process.exit(1);
}

const { findRecords, updateRecord } = require("../config/testStore");
const { calculateInvoice, sumPayments } = require("../services/financial");

const pIs = findRecords("proforma");
const payments = findRecords("payments");
const invoices = findRecords("taxInvoices");
const changed = [];
for (const pi of pIs) {
	let source = { ...pi.data };
	const relatedIds = invoices.filter((invoice) => String(invoice.data?.proformaInvoiceId) === String(pi._id)).map((invoice) => invoice._id);
	const received = sumPayments(payments.filter((payment) => String(payment.userId) === String(pi.userId)), pi._id, relatedIds);
	const derivedFields = ["gstAmount", "grossInvoiceValue", "totalInvoiceValue", "piAmount", "tdsAmount", "amountDue", "netPayable", "netAmountPayable", "outstandingAmount", "balanceAmount", "overpaymentAmount", "excessAmount", "balancePayable", "status"];
	for (const field of derivedFields) delete source[field];
	// Older records used a single GST field while zero-valued component fields were defaults.
	if (Number(source.gst) > 0 && ["cgst", "sgst", "igst"].every((field) => Number(source[field] || 0) === 0)) {
		delete source.cgst;
		delete source.sgst;
		delete source.igst;
	}
	const reconciled = calculateInvoice(source, { received });
	let existing;
	try { existing = calculateInvoice(pi.data, { received }); } catch { existing = null; }
	if (existing && ["gstAmount", "grossInvoiceValue", "tdsAmount", "netPayable", "amountReceived", "outstandingAmount", "overpaymentAmount", "status"].every((field) => existing[field] === reconciled[field])) continue;
	updateRecord("proforma", pi._id, { data: reconciled });
	changed.push({ piNumber: pi.data.piNumber, amountReceived: reconciled.amountReceived, grossInvoiceValue: reconciled.grossInvoiceValue, netPayable: reconciled.netPayable, outstandingAmount: reconciled.outstandingAmount, overpaymentAmount: reconciled.overpaymentAmount, status: reconciled.status });
}
console.log(JSON.stringify({ repaired: changed.length, records: changed }, null, 2));
