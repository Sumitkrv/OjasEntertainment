const { calculateInvoice, sumPayments } = require("./financial");

const unwrap = (record) => {
	const data = record?.data || record || {};
	return { ...data, _id: String(data._id || record?._id || "") };
};

const buildInvoiceRows = ({ proformas = [], taxInvoices = [], payments = [] } = {}) => {
	const piRows = new Map();
	for (const record of proformas) {
		const pi = unwrap(record);
		if (pi._id) piRows.set(pi._id, pi);
	}
	const taxRows = taxInvoices.map(unwrap);
	const usedTaxInvoiceIds = new Set();
	const rows = [];
	for (const pi of piRows.values()) {
		const linked = taxRows.find((tax) => String(tax._id) === String(pi.taxInvoiceId) || String(tax.proformaInvoiceId) === String(pi._id));
		if (linked) usedTaxInvoiceIds.add(linked._id);
		const ids = [pi._id, linked?._id || pi.taxInvoiceId].filter(Boolean);
		let calculated;
		try { calculated = calculateInvoice(pi, { received: sumPayments(payments, pi._id, ids) }); }
		catch { calculated = { ...pi, financialDataError: true, grossInvoiceValue: 0, outstandingAmount: 0, overpaymentAmount: 0, tdsAmount: 0, amountReceived: 0 }; }
		rows.push({
			...calculated,
			_id: pi._id,
			proformaInvoiceId: pi._id,
			taxInvoiceId: linked?._id || null,
			invoiceNumber: linked?.invoiceNumber || pi.piNumber,
			invoiceDate: linked?.invoiceDate || pi.taxInvoiceDate || pi.piDate || null,
			isTaxInvoice: Boolean(linked),
			company: pi.company || linked?.company || null,
			eventId: pi.eventId || linked?.eventId || null,
		});
	}
	for (const tax of taxRows) {
		if (usedTaxInvoiceIds.has(tax._id) || (tax.proformaInvoiceId && piRows.has(String(tax.proformaInvoiceId)))) continue;
		let calculated;
		try { calculated = calculateInvoice(tax, { received: sumPayments(payments, tax._id, [tax.proformaInvoiceId]) }); }
		catch { calculated = { ...tax, financialDataError: true, grossInvoiceValue: 0, outstandingAmount: 0, overpaymentAmount: 0, tdsAmount: 0, amountReceived: 0 }; }
		rows.push({ ...calculated, _id: tax._id, invoiceNumber: tax.invoiceNumber || tax.taxInvoiceNumber, invoiceDate: tax.invoiceDate || null, isTaxInvoice: true, company: tax.company || null, clientName: tax.clientName || null, eventId: tax.eventId || null });
	}
	return rows;
};

const aggregateInvoiceTotals = (invoiceRows, payments = [], payouts = []) => ({
	invoiceValue: invoiceRows.reduce((sum, row) => sum + Number(row.grossInvoiceValue || 0), 0),
	received: payments.filter((row) => String(row.data?.status || row.status || "").toUpperCase() !== "CANCELLED").reduce((sum, row) => sum + Number(row.data?.amount ?? row.amount ?? 0), 0),
	outstanding: invoiceRows.reduce((sum, row) => sum + Math.max(Number(row.outstandingAmount || 0), 0), 0),
	overpayment: invoiceRows.reduce((sum, row) => sum + Math.max(Number(row.overpaymentAmount || row.excessAmount || 0), 0), 0),
	tds: invoiceRows.reduce((sum, row) => sum + Number(row.tdsAmount || 0), 0),
	payouts: payouts.filter((row) => String(row.data?.status || row.status || "").toUpperCase() !== "CANCELLED").reduce((sum, row) => sum + Number(row.data?.amount ?? row.amount ?? 0), 0),
});

module.exports = { buildInvoiceRows, aggregateInvoiceTotals, unwrap };
