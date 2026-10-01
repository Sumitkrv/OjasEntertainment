const FinanceRecord = require("../models/financeRecord");
const { addRecord, findRecords, findRecordById, updateRecord, createId, commitRecordChanges } = require("../config/testStore");
const { calculateInvoice, calculatePayment, sumPayments } = require("../services/financial");
const { isValidDateValue } = require("../services/dateRange");
const { isSafeRecordId } = require("../services/recordId");

const isTestMode = process.env.TEST_MODE === "true";
const owns = (record, userId) => record?.userId === userId;
const serialize = (record) => record?.data ? { _id: record._id, ...record.data } : record;
const get = async (type, id, userId) => {
	if (!isSafeRecordId(id, isTestMode)) return null;
	return isTestMode ? (owns(findRecordById(type, id), userId) ? findRecordById(type, id) : null) : FinanceRecord.findOne({ _id: id, type, userId });
};
const list = async (type, userId) => isTestMode ? findRecords(type).filter((record) => owns(record, userId)) : FinanceRecord.find({ type, userId });
const getParentPi = async (paymentData, userId) => {
	if (paymentData.proformaInvoiceId) return get("proforma", paymentData.proformaInvoiceId, userId);
	if (paymentData.taxInvoiceId) {
		const taxInvoice = await get("taxInvoices", paymentData.taxInvoiceId, userId);
		return taxInvoice?.data?.proformaInvoiceId ? get("proforma", taxInvoice.data.proformaInvoiceId, userId) : null;
	}
	return null;
};
const save = async (type, record) => {
	if (isTestMode) return addRecord(type, record);
	const saved = await new FinanceRecord({ type, userId: record.userId, data: record.data }).save();
	return { _id: saved._id.toString(), userId: record.userId, data: saved.data };
};
const activity = async (eventId, userId, action, description, entityType = "FINANCE", entityId = null) => save("activities", { _id: createId("activity"), userId, data: { eventId, action, description, entityType, entityId, performedBy: userId, createdAt: new Date().toISOString() } });
const validDate = (value) => isValidDateValue(value);
const bad = (res, message, code = 400) => res.status(code).json({ message });
const controllerFailure = (res, error, message) => {
	if (error.status >= 400 && error.status < 500) return bad(res, error.message, error.status);
	if (error.code === 11000) return bad(res, "Duplicate record", 409);
	if (error.name === "Error" && !error.code) return bad(res, error.message);
	return bad(res, message, 500);
};

const paymentList = async (req, res) => res.json({ message: "success", data: (await list("payments", req.user._id)).map(serialize) });
const taxInvoiceList = async (req, res) => res.json({ message: "success", data: (await list("taxInvoices", req.user._id)).map(serialize) });
const taxInvoiceGet = async (req, res) => {
	const invoice = await get("taxInvoices", req.params.id, req.user._id);
	if (!invoice) return bad(res, "Tax Invoice not found", 404);
	const pi = invoice.data.proformaInvoiceId ? await get("proforma", invoice.data.proformaInvoiceId, req.user._id) : null;
	const event = invoice.data.eventId ? await get("events", invoice.data.eventId, req.user._id) : null;
	res.json({ message: "success", data: { ...serialize(invoice), relatedProformaInvoice: pi ? { _id: pi._id, piNumber: pi.data.piNumber } : null, relatedEvent: event ? { _id: event._id, eventName: event.data.eventName } : null } });
};
const paymentGet = async (req, res) => {
	const payment = await get("payments", req.params.id, req.user._id);
	if (!payment) return bad(res, "Payment not found", 404);
	res.json({ message: "success", data: serialize(payment) });
};
const paymentCreate = async (req, res) => {
	try {
		if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) return bad(res, "Request body must be an object");
		if (req.body.referenceNumber !== undefined && (typeof req.body.referenceNumber !== "string" || req.body.referenceNumber.length > 200)) return bad(res, "Invalid referenceNumber");
		const data = calculatePayment({
			amount: req.body.amount,
			paymentDate: req.body.paymentDate,
			paymentMode: req.body.paymentMode,
			referenceNumber: req.body.referenceNumber,
			proformaInvoiceId: req.body.proformaInvoiceId,
			taxInvoiceId: req.body.taxInvoiceId,
			eventId: req.body.eventId,
			status: req.body.status,
		});
		if (!validDate(req.body.paymentDate)) return bad(res, "Invalid paymentDate");
		if (!data.paymentMode || !["BANK_TRANSFER", "UPI", "CASH", "CHEQUE", "OTHER", "BANK TRANSFER"].includes(String(data.paymentMode).toUpperCase())) return bad(res, "Invalid paymentMode");
		if (data.status && !["RECORDED", "CANCELLED"].includes(String(data.status).toUpperCase())) return bad(res, "Invalid payment status");
		data.status = "RECORDED";
		const pi = req.body.proformaInvoiceId ? await get("proforma", req.body.proformaInvoiceId, req.user._id) : null;
		const taxInvoice = req.body.taxInvoiceId ? await get("taxInvoices", req.body.taxInvoiceId, req.user._id) : null;
		if (req.body.proformaInvoiceId && !pi) return bad(res, "Proforma Invoice not found", 404);
		if (req.body.taxInvoiceId && !taxInvoice) return bad(res, "Tax Invoice not found", 404);
		if (!pi && !taxInvoice) return bad(res, "proformaInvoiceId or taxInvoiceId is required");
		const eventId = req.body.eventId || pi?.data.eventId || taxInvoice?.data.eventId;
		if (eventId && !(await get("events", eventId, req.user._id))) return bad(res, "Invalid eventId", 404);
		if (pi?.data.eventId && eventId && String(pi.data.eventId) !== String(eventId)) return bad(res, "Payment event does not match invoice", 409);
		if (taxInvoice?.data.eventId && eventId && String(taxInvoice.data.eventId) !== String(eventId)) return bad(res, "Payment event does not match invoice", 409);
		if (pi && taxInvoice && String(taxInvoice.data.proformaInvoiceId) !== String(pi._id)) return bad(res, "Tax Invoice does not belong to the selected Proforma Invoice", 409);
		if (pi && taxInvoice && String(pi.data.eventId || "") !== String(taxInvoice.data.eventId || "")) return bad(res, "PI and Tax Invoice must belong to the same Event", 409);
		if (data.referenceNumber && (await list("payments", req.user._id)).some((record) => record.data.referenceNumber === data.referenceNumber)) return bad(res, "Duplicate payment reference", 409);
		const parentPi = pi || await getParentPi(data, req.user._id);
		if (parentPi) {
			const payments = await list("payments", req.user._id);
			const received = sumPayments(payments, parentPi._id) + data.amount;
			calculateInvoice(parentPi.data, { received });
		}
		const record = await save("payments", { _id: createId("payment"), userId: req.user._id, data: { ...data, eventId, createdBy: req.user._id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } });
		if (parentPi) await updateInvoiceTotals(parentPi, req.user._id);
		await activity(eventId, req.user._id, "PAYMENT_RECORDED", "Payment recorded", "PAYMENT", record._id);
		res.status(201).json({ message: "success", data: serialize(record) });
	} catch (error) { return controllerFailure(res, error, "Unable to create payment"); }
};
const updateInvoiceTotals = async (pi, userId) => {
	const payments = await list("payments", userId);
	const received = sumPayments(payments, pi._id);
	const data = calculateInvoice(pi.data, { received });
	if (isTestMode) updateRecord("proforma", pi._id, { data });
	else await FinanceRecord.findByIdAndUpdate(pi._id, { data });
	return data;
};

const paymentUpdate = async (req, res) => {
	try {
		if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) return bad(res, "Request body must be an object");
		if (req.body.referenceNumber !== undefined && (typeof req.body.referenceNumber !== "string" || req.body.referenceNumber.length > 200)) return bad(res, "Invalid referenceNumber");
		const existing = await get("payments", req.params.id, req.user._id);
		if (!existing) return bad(res, "Payment not found", 404);
		const input = { ...existing.data, ...req.body };
		const data = calculatePayment({ amount: input.amount, paymentDate: input.paymentDate, paymentMode: input.paymentMode, referenceNumber: input.referenceNumber, proformaInvoiceId: input.proformaInvoiceId, taxInvoiceId: input.taxInvoiceId, eventId: input.eventId, status: input.status });
		if (!validDate(data.paymentDate)) return bad(res, "Invalid paymentDate");
		if (!data.paymentMode || !["BANK_TRANSFER", "UPI", "CASH", "CHEQUE", "OTHER", "BANK TRANSFER"].includes(String(data.paymentMode).toUpperCase())) return bad(res, "Invalid paymentMode");
		const pi = data.proformaInvoiceId ? await get("proforma", data.proformaInvoiceId, req.user._id) : null;
		const taxInvoice = data.taxInvoiceId ? await get("taxInvoices", data.taxInvoiceId, req.user._id) : null;
		if (data.proformaInvoiceId && !pi) return bad(res, "Proforma Invoice not found", 404);
		if (data.taxInvoiceId && !taxInvoice) return bad(res, "Tax Invoice not found", 404);
		if (!data.proformaInvoiceId && !data.taxInvoiceId) return bad(res, "proformaInvoiceId or taxInvoiceId is required");
		const parentPi = pi || await getParentPi(data, req.user._id);
		if (!parentPi) return bad(res, "proformaInvoiceId or taxInvoiceId is required");
		if (data.status && !["RECORDED", "CANCELLED"].includes(String(data.status).toUpperCase())) return bad(res, "Invalid payment status");
		const eventId = data.eventId || pi?.data.eventId || taxInvoice?.data.eventId;
		if (eventId && !(await get("events", eventId, req.user._id))) return bad(res, "Invalid eventId");
		if (eventId && parentPi.data.eventId && String(eventId) !== String(parentPi.data.eventId)) return bad(res, "Payment event does not match invoice", 409);
		if (eventId && taxInvoice?.data.eventId && String(eventId) !== String(taxInvoice.data.eventId)) return bad(res, "Payment event does not match invoice", 409);
		if (pi && taxInvoice && String(taxInvoice.data.proformaInvoiceId) !== String(pi._id)) return bad(res, "Tax Invoice does not belong to the selected Proforma Invoice", 409);
		if (pi && taxInvoice && String(pi.data.eventId || "") !== String(taxInvoice.data.eventId || "")) return bad(res, "PI and Tax Invoice must belong to the same Event", 409);
		const duplicate = (await list("payments", req.user._id)).find((record) => record._id !== req.params.id && data.referenceNumber && record.data.referenceNumber === data.referenceNumber);
		if (duplicate) return bad(res, "Duplicate payment reference", 409);
		const duplicateReference = (await list("payments", req.user._id)).some((record) => record._id !== req.params.id && data.referenceNumber && record.data.referenceNumber === data.referenceNumber);
		if (duplicateReference) return bad(res, "Duplicate payment reference", 409);
		const updatedData = { ...data, status: String(data.status || "RECORDED").toUpperCase(), eventId, updatedAt: new Date().toISOString() };
		if (isTestMode) updateRecord("payments", req.params.id, { data: updatedData });
		else await FinanceRecord.findOneAndUpdate({ _id: req.params.id, type: "payments", userId: req.user._id }, { data: updatedData }, { new: true });
		const previousPi = await getParentPi(existing.data, req.user._id);
		if (previousPi) await updateInvoiceTotals(previousPi, req.user._id);
		if (parentPi._id !== previousPi?._id) await updateInvoiceTotals(parentPi, req.user._id);
		await activity(eventId, req.user._id, "PAYMENT_UPDATED", "Payment updated", "PAYMENT", req.params.id);
		res.json({ message: "success", data: serialize({ _id: req.params.id, data: updatedData }) });
	} catch (error) { return controllerFailure(res, error, "Unable to update payment"); }
};
const paymentDelete = async (req, res) => {
	const payment = await get("payments", req.params.id, req.user._id);
	if (!payment) return bad(res, "Payment not found", 404);
	if (isTestMode) updateRecord("payments", req.params.id, { data: { ...payment.data, status: "CANCELLED", cancelledAt: new Date().toISOString() } });
	else await FinanceRecord.findOneAndUpdate({ _id: req.params.id, type: "payments", userId: req.user._id }, { "data.status": "CANCELLED", "data.cancelledAt": new Date().toISOString() });
	const pi = await getParentPi(payment.data, req.user._id);
	if (pi) await updateInvoiceTotals(pi, req.user._id);
	await activity(payment.data.eventId, req.user._id, "PAYMENT_CANCELLED", "Payment cancelled", "PAYMENT", payment._id);
	res.json({ message: "success" });
};

const conversionLocks = new Set();
const convert = async (req, res) => {
	const lockKey = `${req.user._id}:${req.params.id}`;
	if (conversionLocks.has(lockKey)) return bad(res, "Proforma Invoice has already been converted to Tax Invoice.", 409);
	conversionLocks.add(lockKey);
	let session;
	try {
	if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) return bad(res, "Request body must be an object");
	if (req.body.invoiceNumber !== undefined && (typeof req.body.invoiceNumber !== "string" || req.body.invoiceNumber.length > 100)) return bad(res, "Invalid invoiceNumber");
	if (req.body.invoiceDate !== undefined && !validDate(req.body.invoiceDate)) return bad(res, "Invalid invoiceDate");
	const pi = await get("proforma", req.params.id, req.user._id);
	if (!pi) return bad(res, "Proforma Invoice not found", 404);
	const linked = pi.data.taxInvoiceId ? await get("taxInvoices", pi.data.taxInvoiceId, req.user._id) : (await list("taxInvoices", req.user._id)).find((row) => String(row.data.proformaInvoiceId) === String(pi._id));
	if (linked || pi.data.convertedToTaxInvoice) return bad(res, "Proforma Invoice has already been converted to Tax Invoice.", 409);
	if (pi.data.eventId && !(await get("events", pi.data.eventId, req.user._id))) return bad(res, "Related Event not found", 404);
	if ([pi.data.piNumber, pi.data.partyName, pi.data.company, pi.data.taxableValue].some((value) => value === undefined || value === null || value === "")) return bad(res, "Proforma Invoice is missing required invoice data");
		const payments = await list("payments", req.user._id);
		let invoice;
		try { invoice = calculateInvoice(pi.data, { received: sumPayments(payments, pi._id) }); }
		catch (error) { return bad(res, `Invalid Proforma Invoice financial data: ${error.message}`, 400); }
		const invoiceNumber = String(req.body.invoiceNumber || pi.data.taxInvoiceNumber || `TI-${Date.now()}`).trim();
		if (!invoiceNumber) return bad(res, "Tax Invoice number is required");
		const duplicate = (await list("taxInvoices", req.user._id)).find((record) => record.data.invoiceNumber === invoiceNumber);
		if (duplicate) return bad(res, "Duplicate invoice number", 409);
		const now = new Date().toISOString();
		const invoiceDate = req.body.invoiceDate || now.slice(0, 10);
		if (!validDate(invoiceDate)) return bad(res, "Invalid invoiceDate");
		const taxData = { eventId: pi.data.eventId, proformaInvoiceId: String(pi._id), invoiceNumber, invoiceDate, partyName: pi.data.partyName, company: pi.data.company, taxableValue: invoice.taxableValue, cgst: invoice.cgst, sgst: invoice.sgst, igst: invoice.igst, gstAmount: invoice.gstAmount, gst: invoice.gstAmount, grossInvoiceValue: invoice.grossInvoiceValue, tdsRate: invoice.tdsRate, tdsAmount: invoice.tdsAmount, netPayable: invoice.netPayable, status: "ISSUED", createdAt: now, updatedAt: now };
		let taxInvoice;
		if (isTestMode) {
			taxInvoice = { _id: createId("tax-invoice"), userId: req.user._id, data: taxData };
			const updatedData = { ...pi.data, ...invoice, conversionStatus: "CONVERTED", convertedToTaxInvoice: true, taxInvoiceId: taxInvoice._id, taxInvoiceNumber: invoiceNumber, taxInvoiceDate: invoiceDate };
			const updatedPi = { ...pi, data: updatedData };
			const audit = { _id: createId("activity"), userId: req.user._id, data: { eventId: pi.data.eventId, action: "PI_CONVERTED", description: `Proforma ${pi.data.piNumber} converted to Tax Invoice ${invoiceNumber}`, entityType: "FINANCE", proformaInvoiceId: pi._id, taxInvoiceId: taxInvoice._id, performedBy: req.user._id, createdAt: now } };
			commitRecordChanges([{ type: "taxInvoices", record: taxInvoice }, { type: "proforma", record: updatedPi }, { type: "activities", record: audit }]);
		} else {
			session = await FinanceRecord.startSession();
			await session.withTransaction(async () => {
				const current = await FinanceRecord.findOne({ _id: req.params.id, type: "proforma", userId: req.user._id }).session(session);
				if (!current || current.data.convertedToTaxInvoice || current.data.taxInvoiceId) { const conflict = new Error(current ? "Proforma Invoice has already been converted to Tax Invoice." : "Proforma Invoice not found"); conflict.status = current ? 409 : 404; throw conflict; }
				const duplicateNow = await FinanceRecord.findOne({ type: "taxInvoices", userId: req.user._id, "data.invoiceNumber": invoiceNumber }).session(session);
				if (duplicateNow) { const conflict = new Error("Duplicate invoice number"); conflict.status = 409; throw conflict; }
				const created = await new FinanceRecord({ type: "taxInvoices", userId: req.user._id, data: taxData }).save({ session });
				taxData.proformaInvoiceId = current._id.toString();
				const updatedData = { ...current.data, ...invoice, conversionStatus: "CONVERTED", convertedToTaxInvoice: true, taxInvoiceId: created._id.toString(), taxInvoiceNumber: invoiceNumber, taxInvoiceDate: invoiceDate };
				current.data = updatedData;
				await current.save({ session });
				await new FinanceRecord({ type: "activities", userId: req.user._id, data: { eventId: current.data.eventId, action: "PI_CONVERTED", description: `Proforma ${current.data.piNumber} converted to Tax Invoice ${invoiceNumber}`, proformaInvoiceId: current._id.toString(), taxInvoiceId: created._id.toString(), performedBy: req.user._id, createdAt: now } }).save({ session });
				taxInvoice = { _id: created._id.toString(), userId: req.user._id, data: taxData };
			});
		}
		res.status(201).json({ message: "success", data: serialize(taxInvoice) });
	} catch (error) { const status = error.status || (error.code === 11000 ? 409 : 500); return bad(res, status < 500 ? error.message : "Unable to convert Proforma Invoice", status); }
	finally { if (session) await session.endSession(); conversionLocks.delete(lockKey); }
};

module.exports = { paymentList, paymentGet, paymentCreate, paymentUpdate, paymentDelete, taxInvoiceList, taxInvoiceGet, convert, updateInvoiceTotals };
