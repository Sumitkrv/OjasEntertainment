const TDS_RATES = new Set([0, 1, 2, 10]);
const MONEY_SCALE = 100;

const toMoney = (value, field = "amount", { required = false, allowZero = true } = {}) => {
	if (value === undefined || value === null || value === "") {
		if (required) throw new Error(`${field} is required`);
		return 0;
	}
	const parsed = typeof value === "string" ? Number(value.trim()) : Number(value);
	if (!Number.isFinite(parsed)) throw new Error(`${field} must be a valid number`);
	const rounded = Math.round((parsed + Number.EPSILON) * MONEY_SCALE) / MONEY_SCALE;
	if (rounded < 0 || (!allowZero && rounded === 0)) throw new Error(`${field} must be ${allowZero ? "non-negative" : "greater than zero"}`);
	return rounded;
};

const round = (value) => Math.round((value + Number.EPSILON) * MONEY_SCALE) / MONEY_SCALE;

const assertConsistent = (data, field, expected) => {
	if (data[field] === undefined || data[field] === null || data[field] === "") return;
	const actual = toMoney(data[field], field);
	if (actual !== expected) throw new Error(`${field} must equal ${expected.toFixed(2)}`);
};

const calculateInvoice = (input, { received = input.amountReceived, validateDerived = true } = {}) => {
	const data = { ...input };
	const taxableValue = toMoney(data.taxableValue, "taxableValue", { required: true });
	const hasTaxComponents = data.cgst !== undefined || data.sgst !== undefined || data.igst !== undefined;
	const legacyGst = !hasTaxComponents && data.gst !== undefined ? toMoney(data.gst, "gst") : 0;
	const cgst = toMoney(data.cgst, "cgst");
	const sgst = toMoney(data.sgst, "sgst");
	const igst = toMoney(data.igst, "igst");
	const gstAmount = round(hasTaxComponents ? cgst + sgst + igst : legacyGst);
	const grossInvoiceValue = round(taxableValue + gstAmount);
	const tdsRate = data.tdsRate === undefined || data.tdsRate === "" ? 0 : Number(data.tdsRate);
	if (!Number.isFinite(tdsRate)) throw new Error("tdsRate must be a valid number");
	if (!TDS_RATES.has(tdsRate)) throw new Error("tdsRate must be 0, 1, 2, or 10");
	const calculatedTds = round(taxableValue * tdsRate / 100);
	if (validateDerived) {
		assertConsistent(data, "gstAmount", gstAmount);
		if (!hasTaxComponents) assertConsistent(data, "gst", gstAmount);
		assertConsistent(data, "grossInvoiceValue", grossInvoiceValue);
		assertConsistent(data, "totalInvoiceValue", grossInvoiceValue);
		assertConsistent(data, "piAmount", grossInvoiceValue);
		assertConsistent(data, "tdsAmount", calculatedTds);
	}
	const tdsAmount = calculatedTds;
	const amountDue = round(grossInvoiceValue - tdsAmount);
	const amountReceived = toMoney(received, "amountReceived");
	const outstandingAmount = round(Math.max(amountDue - amountReceived, 0));
	const excessAmount = round(Math.max(amountReceived - amountDue, 0));
	const status = excessAmount > 0 ? "OVERPAID" : amountReceived === 0 ? "UNPAID" : outstandingAmount > 0 ? "PARTIALLY_PAID" : "PAID";
	return { ...data, taxableValue, cgst, sgst, igst, gstAmount, gst: gstAmount, grossInvoiceValue, totalInvoiceValue: grossInvoiceValue, piAmount: grossInvoiceValue, tdsRate, tdsAmount, amountDue, netPayable: amountDue, netAmountPayable: amountDue, amountReceived, outstandingAmount, balanceAmount: outstandingAmount, overpaymentAmount: excessAmount, excessAmount, balancePayable: outstandingAmount, status };
};

const sumPayments = (payments = [], invoiceId, relatedIds = []) => {
	const ids = new Set([invoiceId, ...relatedIds].filter(Boolean));
	return payments
	.filter((payment) => String(payment?.status ?? payment?.data?.status ?? "").toUpperCase() !== "CANCELLED")
	.filter((payment) => ids.has(payment?.proformaInvoiceId) || ids.has(payment?.data?.proformaInvoiceId) || ids.has(payment?.taxInvoiceId) || ids.has(payment?.data?.taxInvoiceId))
	.reduce((total, payment) => total + toMoney(payment?.amount ?? payment?.data?.amount, "payment amount"), 0);
};

const reconcileInvoice = (invoice, payments = [], options = {}) => calculateInvoice(invoice, { ...options, received: sumPayments(payments, invoice._id) });

const calculatePayout = (input) => {
	const data = { ...input };
	const amount = toMoney(data.amount, "amount", { required: true, allowZero: false });
	const paymentMode = String(data.paymentMode || "").toUpperCase();
	if (!["BANK_TRANSFER", "UPI", "CASH", "CHEQUE", "OTHER", "BANK TRANSFER"].includes(paymentMode)) throw new Error("Invalid payment mode");
	if (paymentMode === "CHEQUE" && (!data.chequeNumber || !data.chequeDate)) throw new Error("chequeNumber and chequeDate are required for cheque payments");
	return { ...data, amount, paymentMode, status: ["PENDING", "PROCESSING", "PAID", "CANCELLED"].includes(data.status) ? data.status : "PENDING" };
};

const calculatePayment = (input) => ({ ...input, amount: toMoney(input.amount, "amount", { required: true, allowZero: false }) });

module.exports = { TDS_RATES, toMoney, round, calculateInvoice, reconcileInvoice, sumPayments, calculatePayout, calculatePayment };
