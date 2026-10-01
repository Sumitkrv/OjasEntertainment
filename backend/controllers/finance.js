const fs = require("fs");
const path = require("path");
const FinanceRecord = require("../models/financeRecord");
const {
	addRecord,
	findRecords,
	findRecordById,
	updateRecord,
	deleteRecord,
	createId,
} = require("../config/testStore");
const { calculateInvoice, calculatePayout, sumPayments, toMoney } = require("../services/financial");
const { isAllowedUpload } = require("../services/uploadValidation");
const { isValidDateValue } = require("../services/dateRange");
const { isSafeRecordId } = require("../services/recordId");
const { saveUpload, removeUpload, sendUpload } = require("../services/fileStorage");

const isTestMode = process.env.TEST_MODE === "true";
const TYPES = new Set(["events", "proforma", "payouts", "work"]);
const TDS_RATES = new Set([1, 2, 10]);
const INPUT_FIELDS = {
	events: new Set(["city", "eventName", "proformaInvoiceNumber", "taxInvoiceNumber", "taxableValue", "cgst", "sgst", "igst", "tdsRate", "paymentMade", "paymentDate", "remarks", "eventId"]),
	proforma: new Set(["company", "partyName", "piNumber", "piDate", "piAmount", "taxableValue", "gst", "cgst", "sgst", "igst", "tdsRate", "amountReceived", "remarks", "eventId"]),
	payouts: new Set(["company", "date", "vendorName", "amount", "purpose", "paymentMode", "chequeNumber", "chequeDate", "status", "remarks", "eventId"]),
	work: new Set(["date", "company", "workCategory", "workDescription", "priority", "status", "startTime", "endTime", "remarks", "eventId", "hours", "duration", "workHours"]),
};
const STRING_FIELDS = new Set(["company", "partyName", "piNumber", "piDate", "remarks", "eventId", "city", "eventName", "proformaInvoiceNumber", "taxInvoiceNumber", "paymentDate", "vendorName", "date", "purpose", "paymentMode", "chequeNumber", "chequeDate", "workCategory", "workDescription", "priority", "status", "startTime", "endTime"]);
const validateInputShape = (type, body) => {
	if (!body || typeof body !== "object" || Array.isArray(body)) return "Request body must be an object";
	const unknown = Object.keys(body).find((field) => !INPUT_FIELDS[type]?.has(field));
	if (unknown) return `Unexpected field: ${unknown}`;
	for (const [field, value] of Object.entries(body)) {
		if (value === undefined || value === null) continue;
		if (STRING_FIELDS.has(field)) {
			const max = ["remarks", "workDescription"].includes(field) ? 5000 : 200;
			if (typeof value !== "string" || value.length > max) return `Invalid ${field}`;
		} else if (["amount", "taxableValue", "cgst", "sgst", "igst", "gst", "tdsRate", "paymentMade", "piAmount", "amountReceived", "hours", "duration", "workHours"].includes(field)) {
			if ((typeof value !== "number" && typeof value !== "string") || (typeof value === "string" && value.length > 30) || !Number.isFinite(Number(value))) return `Invalid ${field}`;
		}
	}
	return null;
};
const uploadDir = path.join(__dirname, "..", "uploads", "cheques");
if (isTestMode) fs.mkdirSync(uploadDir, { recursive: true });
const isStoredCheque = (filePath) => {
	if (!filePath) return false;
	const relative = path.relative(uploadDir, path.resolve(filePath));
	return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

const bad = (res, message, code = 400) => res.status(code).json({ message });
const controllerFailure = (res, error, message) => {
	if (error.status >= 400 && error.status < 500) return res.status(error.status).json({ message: error.message });
	if (error.code === 11000) return res.status(409).json({ message: "Duplicate record" });
	if (error.name === "Error" && !error.code) return bad(res, error.message);
	return res.status(500).json({ message });
};

const calculate = (type, input, received = 0) => {
	const data = { ...input };
	const required = {
		events: ["city", "eventName", "proformaInvoiceNumber", "taxableValue"],
		proforma: ["company", "partyName", "piNumber", "piDate", "taxableValue"],
		payouts: ["company", "date", "vendorName", "amount", "purpose"],
		work: ["date", "company", "workCategory", "workDescription", "priority", "status"],
	}[type];
	if (required.some((key) => data[key] === undefined || data[key] === "")) throw new Error("Required fields are missing");
	if (type === "events") {
		const requiredAmount = ["taxableValue", "cgst", "sgst", "igst", "paymentMade"].map((key) => toMoney(data[key], key));
		["taxableValue", "cgst", "sgst", "igst", "paymentMade"].forEach((key, index) => { data[key] = requiredAmount[index]; });
		data.totalInvoiceValue = data.taxableValue + data.cgst + data.sgst + data.igst;
		data.tdsRate = Number(data.tdsRate || 0);
		if (!TDS_RATES.has(data.tdsRate)) throw new Error("TDS rate must be 0, 1, 2, or 10");
		data.tdsAmount = Math.round((data.taxableValue * data.tdsRate / 100 + Number.EPSILON) * 100) / 100;
		data.netAmountPayable = data.totalInvoiceValue - data.tdsAmount;
		data.balancePayable = Math.max(data.netAmountPayable - data.paymentMade, 0);
		data.excessAmount = Math.max(data.paymentMade - data.netAmountPayable, 0);
		data.status = data.excessAmount > 0 ? "OVERPAID" : data.balancePayable === 0 ? "PAID" : data.paymentMade > 0 ? "PARTIALLY_PAID" : "ISSUED";
	}
	if (type === "proforma") {
		return calculateInvoice(data, { received });
	}
	if (type === "payouts") {
		if (data.status && !["PENDING", "PROCESSING", "PAID", "CANCELLED"].includes(String(data.status).toUpperCase())) throw new Error("Invalid payout status");
		return calculatePayout(data);
	}
	if (type === "work") {
		if (!data.date) throw new Error("Date is required");
		if (!["HIGH", "MEDIUM", "LOW"].includes(String(data.priority).trim().toUpperCase())) throw new Error("Invalid work priority");
		if (!["COMPLETED", "DONE", "IN_PROGRESS", "PENDING", "BLOCKED"].includes(String(data.status).trim().replace(/\s+/g, "_").toUpperCase())) throw new Error("Invalid work status");
	}
	return data;
};

const validDate = (value) => !value || isValidDateValue(value);
const owns = (record, userId) => record && record.userId === userId;
const serialize = (record) => {
	if (!record?.data) return record;
	let data = record.data;
	if (record.data.recordKind !== "event" && record.data.taxableValue !== undefined && record.data.piNumber) {
			try { data = calculateInvoice(record.data); } catch { data = { ...record.data, financialDataError: true, outstandingAmount: 0, overpaymentAmount: 0, excessAmount: 0, balanceAmount: 0, balancePayable: 0, status: "DATA_REVIEW_REQUIRED" }; }
	}
	return { _id: record._id, ...data, chequePhoto: data.chequePhoto ? { url: `/api/payouts/${record._id}/cheque`, name: data.chequePhoto.name } : null };
};
const relatedRecordExists = async (type, id, userId) => {
	if (!id) return true;
	if (!isSafeRecordId(id, isTestMode)) return false;
	if (isTestMode) return owns(findRecordById(type, id), userId);
	return Boolean(await FinanceRecord.findOne({ _id: id, type, userId }));
};
const relatedRecord = async (type, id, userId) => {
	if (!id) return null;
	if (!isSafeRecordId(id, isTestMode)) return null;
	return isTestMode ? (owns(findRecordById(type, id), userId) ? findRecordById(type, id) : null) : FinanceRecord.findOne({ _id: id, type, userId });
};
const relatedRecords = async (type, userId) => isTestMode ? findRecords(type).filter((record) => owns(record, userId)) : FinanceRecord.find({ type, userId });
const addActivity = async (eventId, userId, action, description, entityType = "FINANCE", entityId = null) => {
	const record = { _id: createId("activity"), userId, data: { eventId, action, description, entityType, entityId, performedBy: userId, createdAt: new Date().toISOString() } };
	if (isTestMode) addRecord("activities", record);
	else await new FinanceRecord({ type: "activities", userId, data: record.data }).save();
};
const addDocument = async (payout, userId, file, storedFile) => {
	const document = { _id: createId("document"), userId, data: { eventId: payout.data.eventId, relatedEntityType: "PAYOUT", relatedEntityId: payout._id, documentType: "CHEQUE", fileName: path.basename(file.originalname), originalFileName: file.originalname, mimeType: file.mimetype, fileSize: file.size, ...storedFile, uploadedBy: userId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } };
	if (isTestMode) addRecord("documents", document);
	else { const saved = await new FinanceRecord({ type: "documents", userId, data: document.data }).save(); document._id = saved._id.toString(); }
	return document;
};

const list = (type) => async (req, res) => {
	const source = isTestMode ? findRecords(type).filter((item) => owns(item, req.user._id) && (type !== "events" || item.data?.recordKind !== "event")) : await FinanceRecord.find({ type, userId: req.user._id, ...(type === "events" ? { "data.recordKind": { $ne: "event" } } : {}) });
		const payments = type === "proforma" ? (isTestMode ? findRecords("payments").filter((item) => owns(item, req.user._id)) : await FinanceRecord.find({ type: "payments", userId: req.user._id })) : [];
		const records = source.map((item) => {
			const normalized = isTestMode ? item : { _id: item._id.toString(), data: item.data };
			if (type !== "proforma") return serialize(normalized);
			return normalized;
		});
	if (type !== "proforma") return res.json({ message: "success", data: records });
	const invoices = await relatedRecords("taxInvoices", req.user._id);
	const synchronized = records.map((item) => {
		const linked = invoices.find((invoice) => String(invoice._id) === String(item._id) || String(invoice.data.proformaInvoiceId) === String(item._id) || String(invoice._id) === String(item.data.taxInvoiceId));
		const broken = Boolean(item.data.convertedToTaxInvoice || item.data.taxInvoiceId) && !linked;
		let data = { ...item.data, conversionStatus: linked ? "CONVERTED" : broken ? "INTEGRITY_ERROR" : "PENDING_CONVERSION", convertedToTaxInvoice: Boolean(linked), taxInvoiceId: linked?._id || null, hasTaxInvoice: Boolean(linked), conversionIntegrityError: broken };
		try { data = { ...data, ...calculateInvoice(data, { received: sumPayments(payments, item._id) }) }; } catch { data = { ...data, financialDataError: true }; }
		return { _id: item._id, ...data };
	});
	res.json({ message: "success", data: synchronized });
};

const getOne = (type) => async (req, res) => {
	if (!isSafeRecordId(req.params.id, isTestMode)) return res.status(404).json({ message: "Record not found" });
	const record = isTestMode ? findRecordById(type, req.params.id) : await FinanceRecord.findOne({ _id: req.params.id, type, userId: req.user._id });
	if (!record || (isTestMode && !owns(record, req.user._id))) return res.status(404).json({ message: "Record not found" });
	if (type !== "proforma") return res.json({ message: "success", data: serialize(isTestMode ? record : { _id: record._id.toString(), data: record.data }) });
	const piId = String(record._id);
	const invoices = await relatedRecords("taxInvoices", req.user._id);
	const linked = invoices.find((invoice) => String(invoice.data.proformaInvoiceId) === piId || String(invoice._id) === String(record.data.taxInvoiceId));
	const payments = await relatedRecords("payments", req.user._id);
	const broken = Boolean(record.data.convertedToTaxInvoice || record.data.taxInvoiceId) && !linked;
	const data = { ...record.data, conversionStatus: linked ? "CONVERTED" : broken ? "INTEGRITY_ERROR" : "PENDING_CONVERSION", convertedToTaxInvoice: Boolean(linked), taxInvoiceId: linked?._id || null, hasTaxInvoice: Boolean(linked), conversionIntegrityError: broken };
	try { Object.assign(data, calculateInvoice(data, { received: sumPayments(payments, piId) })); } catch { data.financialDataError = true; }
	return res.json({ message: "success", data: { _id: piId, ...data } });
};

const create = (type) => async (req, res) => {
	try {
		const inputError = validateInputShape(type, req.body);
		if (inputError) return bad(res, inputError);
		if (!validDate(req.body.date || req.body.piDate || req.body.paymentDate || req.body.conversionDate)) return bad(res, "Invalid date");
		if (req.body.chequeDate && !validDate(req.body.chequeDate)) return bad(res, "Invalid chequeDate");
		if (!(await relatedRecordExists("events", req.body.eventId, req.user._id))) return bad(res, "Invalid eventId");
		if (!(await relatedRecordExists("proforma", req.body.proformaInvoiceId, req.user._id))) return bad(res, "Invalid proformaInvoiceId");
		if (!(await relatedRecordExists("taxInvoices", req.body.taxInvoiceId, req.user._id))) return bad(res, "Invalid taxInvoiceId");
		const pi = await relatedRecord("proforma", req.body.proformaInvoiceId, req.user._id);
		const taxInvoice = await relatedRecord("taxInvoices", req.body.taxInvoiceId, req.user._id);
		const requestedEventId = req.body.eventId || pi?.data.eventId || taxInvoice?.data.eventId;
		if (requestedEventId && !(await relatedRecordExists("events", requestedEventId, req.user._id))) return bad(res, "Invalid eventId");
		if (pi?.data.eventId && requestedEventId && String(pi.data.eventId) !== String(requestedEventId)) return bad(res, "Proforma Invoice belongs to a different Event", 409);
		if (taxInvoice?.data.eventId && requestedEventId && String(taxInvoice.data.eventId) !== String(requestedEventId)) return bad(res, "Tax Invoice belongs to a different Event", 409);
		if (pi && taxInvoice && String(taxInvoice.data.proformaInvoiceId) !== String(pi._id)) return bad(res, "Tax Invoice does not belong to the selected Proforma Invoice", 409);
			const payments = type === "proforma" ? await relatedRecords("payments", req.user._id) : [];
			const input = { ...req.body, eventId: requestedEventId, ...(type === "proforma" ? { convertedToTaxInvoice: false, conversionStatus: "PENDING_CONVERSION", taxInvoiceId: null, taxInvoiceNumber: "", conversionDate: "" } : {}), ...(type === "payouts" ? { status: "PENDING" } : {}) };
			const data = calculate(type, input, sumPayments(payments, req.body.proformaInvoiceId));
		data.createdBy = req.user._id;
		data.createdAt = new Date().toISOString();
		data.updatedAt = data.createdAt;
		if (type === "proforma" && (await relatedRecords("proforma", req.user._id)).some((record) => record.data.piNumber === data.piNumber)) return res.status(409).json({ message: "Duplicate PI number" });
		const record = { _id: createId(`test-${type}`), userId: req.user._id, data };
		if (isTestMode) addRecord(type, record);
		else { const saved = await new FinanceRecord({ type, userId: req.user._id, data }).save(); record._id = saved._id.toString(); }
		if (["proforma", "payouts", "work"].includes(type)) await addActivity(data.eventId, req.user._id, `${type.toUpperCase()}_CREATED`, `${type === "proforma" ? "Proforma Invoice" : type === "payouts" ? "Payout" : "Daily work"} created`, type.toUpperCase(), record._id);
		res.status(201).json({ message: "success", data: serialize(record) });
	} catch (error) { return controllerFailure(res, error, "Unable to save finance record"); }
};

const update = (type) => async (req, res) => {
	try {
		if (!isSafeRecordId(req.params.id, isTestMode)) return res.status(404).json({ message: "Record not found" });
		const inputError = validateInputShape(type, req.body);
		if (inputError) return bad(res, inputError);
		const existing = isTestMode ? findRecordById(type, req.params.id) : await FinanceRecord.findOne({ _id: req.params.id, type, userId: req.user._id });
		if (!existing || (isTestMode && !owns(existing, req.user._id))) return res.status(404).json({ message: "Record not found" });
		if (type === "events" && existing.data.recordKind === "event") return res.status(409).json({ message: "Operational Events must be updated through the Event workspace" });
		if (type === "proforma" && (existing.data.taxInvoiceId || existing.data.convertedToTaxInvoice) && req.body.eventId !== undefined && req.body.eventId !== existing.data.eventId) return res.status(409).json({ message: "Event cannot be changed after conversion" });
		if (type === "proforma" && existing.data.eventId && req.body.eventId !== undefined && String(req.body.eventId || "") !== String(existing.data.eventId)) return res.status(409).json({ message: "Event cannot be changed after a PI has been linked" });
		if (req.body.date && !validDate(req.body.date) || req.body.piDate && !validDate(req.body.piDate) || req.body.paymentDate && !validDate(req.body.paymentDate) || req.body.chequeDate && !validDate(req.body.chequeDate)) return bad(res, "Invalid date");
		if (type === "proforma" && req.body.eventId !== undefined && String(req.body.eventId || "") !== String(existing.data.eventId || "")) {
			const [invoices, payments] = await Promise.all([relatedRecords("taxInvoices", req.user._id), relatedRecords("payments", req.user._id)]);
			if (invoices.some((item) => String(item.data.proformaInvoiceId) === String(req.params.id)) || payments.some((item) => String(item.data.proformaInvoiceId) === String(req.params.id))) return res.status(409).json({ message: "Event cannot be changed while related Tax Invoices or Payments exist" });
		}
		if (!(await relatedRecordExists("events", req.body.eventId, req.user._id))) return bad(res, "Invalid eventId");
		if (!(await relatedRecordExists("proforma", req.body.proformaInvoiceId, req.user._id))) return bad(res, "Invalid proformaInvoiceId");
		if (!(await relatedRecordExists("taxInvoices", req.body.taxInvoiceId, req.user._id))) return bad(res, "Invalid taxInvoiceId");
		if (["payouts", "work"].includes(type) && req.body.eventId !== undefined && String(req.body.eventId || "") !== String(existing.data.eventId || "")) {
			const documents = await relatedRecords("documents", req.user._id);
			if (documents.some((document) => String(document.data.relatedEntityId) === String(req.params.id))) return res.status(409).json({ message: "Event cannot be changed while related documents exist" });
		}
		const piRef = await relatedRecord("proforma", req.body.proformaInvoiceId, req.user._id);
		const taxRef = await relatedRecord("taxInvoices", req.body.taxInvoiceId, req.user._id);
		const nextEventId = req.body.eventId || piRef?.data.eventId || taxRef?.data.eventId;
		if (nextEventId && !(await relatedRecordExists("events", nextEventId, req.user._id))) return bad(res, "Invalid eventId");
		if (piRef?.data.eventId && nextEventId && String(piRef.data.eventId) !== String(nextEventId)) return bad(res, "Proforma Invoice belongs to a different Event", 409);
		if (taxRef?.data.eventId && nextEventId && String(taxRef.data.eventId) !== String(nextEventId)) return bad(res, "Tax Invoice belongs to a different Event", 409);
		if (piRef && taxRef && String(taxRef.data.proformaInvoiceId) !== String(piRef._id)) return bad(res, "Tax Invoice does not belong to the selected Proforma Invoice", 409);
		let received = 0;
		if (type === "proforma") {
			const payments = await relatedRecords("payments", req.user._id);
			received = payments.filter((payment) => payment.data.proformaInvoiceId === req.params.id && payment.data.status !== "CANCELLED").reduce((sum, payment) => sum + Number(payment.data.amount || 0), 0);
		}
		const input = type === "proforma" ? { ...existing.data, ...req.body, createdAt: existing.data.createdAt, createdBy: existing.data.createdBy, convertedToTaxInvoice: existing.data.convertedToTaxInvoice, conversionStatus: existing.data.conversionStatus, taxInvoiceId: existing.data.taxInvoiceId, taxInvoiceNumber: existing.data.taxInvoiceNumber, taxInvoiceDate: existing.data.taxInvoiceDate } : { ...existing.data, ...req.body, createdAt: existing.data.createdAt, createdBy: existing.data.createdBy, eventId: req.body.eventId ?? existing.data.eventId ?? nextEventId };
		const data = calculate(type, input, received);
		data.updatedAt = new Date().toISOString();
		if (type === "proforma" && (await relatedRecords("proforma", req.user._id)).some((record) => record._id !== req.params.id && record.data.piNumber === data.piNumber)) return res.status(409).json({ message: "Duplicate PI number" });
		const updated = isTestMode ? updateRecord(type, req.params.id, { data }) : await FinanceRecord.findOneAndUpdate({ _id: req.params.id, type, userId: req.user._id }, { data }, { new: true });
		if (!updated) return res.status(404).json({ message: "Record not found" });
		if (["proforma", "payouts", "work"].includes(type)) await addActivity(data.eventId || existing.data.eventId, req.user._id, `${type.toUpperCase()}_UPDATED`, `${type === "proforma" ? "Proforma Invoice" : type === "payouts" ? "Payout" : "Daily work"} updated`, type.toUpperCase(), req.params.id);
		res.json({ message: "success", data: serialize(isTestMode ? updated : { _id: updated._id.toString(), data: updated.data }) });
	} catch (error) { return controllerFailure(res, error, "Unable to update finance record"); }
};

const remove = (type) => async (req, res) => {
		if (!isSafeRecordId(req.params.id, isTestMode)) return res.status(404).json({ message: "Record not found" });
		const existing = isTestMode ? findRecordById(type, req.params.id) : await FinanceRecord.findOne({ _id: req.params.id, type, userId: req.user._id });
		if (!existing || (isTestMode && !owns(existing, req.user._id))) return res.status(404).json({ message: "Record not found" });
		if (type === "events" && existing.data.recordKind === "event") return res.status(409).json({ message: "Operational Events cannot be deleted. Archive the Event to retain its history and related records." });
		if (type === "events") {
			const dependents = await Promise.all(["proforma", "taxInvoices", "payments", "payouts", "work", "documents", "activities"].map((relatedType) => relatedRecords(relatedType, req.user._id)));
			if (dependents.some((items) => items.some((item) => String(item.data.eventId) === String(req.params.id)))) return res.status(409).json({ message: "Cannot delete an Event with related records" });
		}
		if (type === "proforma") {
			const linkedPayments = await relatedRecords("payments", req.user._id);
			const linkedTaxInvoices = await relatedRecords("taxInvoices", req.user._id);
			const linkedDocuments = await relatedRecords("documents", req.user._id);
			if (linkedPayments.some((record) => String(record.data.proformaInvoiceId) === String(req.params.id)) || linkedTaxInvoices.some((record) => String(record.data.proformaInvoiceId) === String(req.params.id)) || linkedDocuments.some((record) => String(record.data.relatedEntityId) === String(req.params.id))) return res.status(409).json({ message: "Cannot delete an invoice with related financial records or documents" });
		}
		if (["payouts", "work"].includes(type)) {
			const linkedDocuments = await relatedRecords("documents", req.user._id);
			if (linkedDocuments.some((record) => String(record.data.relatedEntityId) === String(req.params.id))) return res.status(409).json({ message: "Cannot delete a record with related documents" });
		}
		if (isTestMode) deleteRecord(type, req.params.id); else await FinanceRecord.findOneAndDelete({ _id: req.params.id, type, userId: req.user._id });
		res.json({ message: "success" });
};

const uploadCheque = async (req, res) => {
	if (!isSafeRecordId(req.params.id, isTestMode)) return res.status(404).json({ message: "Payout not found" });
	const existing = isTestMode ? findRecordById("payouts", req.params.id) : await FinanceRecord.findOne({ _id: req.params.id, type: "payouts", userId: req.user._id });
	if (!existing || (isTestMode && !owns(existing, req.user._id))) return res.status(404).json({ message: "Payout not found" });
	if (!req.file) return bad(res, "Cheque image is required");
	const fileBuffer = req.file.buffer || fs.readFileSync(req.file.path);
	if (!isAllowedUpload({ mimetype: req.file.mimetype, originalname: req.file.originalname, buffer: fileBuffer }) || req.file.mimetype === "application/pdf") { if (req.file.path) fs.rm(req.file.path, () => {}); return bad(res, "Unsupported or invalid cheque image"); }
	let storedFile;
	try {
	if (existing.data.chequeDocumentId) {
		const oldDocument = !isSafeRecordId(existing.data.chequeDocumentId, isTestMode)
			? null
			: isTestMode
				? findRecordById("documents", existing.data.chequeDocumentId)
				: await FinanceRecord.findOne({ _id: existing.data.chequeDocumentId, type: "documents", userId: req.user._id });
		if (oldDocument?.data.storageId) await removeUpload(oldDocument.data);
		else if (isStoredCheque(oldDocument?.data.storagePath)) await removeUpload(oldDocument.data);
		if (oldDocument && isTestMode) deleteRecord("documents", existing.data.chequeDocumentId);
		if (oldDocument && !isTestMode) await FinanceRecord.findOneAndDelete({ _id: existing.data.chequeDocumentId, type: "documents", userId: req.user._id });
	}
	storedFile = await saveUpload(req.file);
	const data = { ...existing.data, chequePhoto: { name: req.file.originalname, ...storedFile } };
	const document = await addDocument({ ...existing, data }, req.user._id, req.file, storedFile);
	data.chequeDocumentId = document._id;
	if (isTestMode) updateRecord("payouts", req.params.id, { data }); else await FinanceRecord.findOneAndUpdate({ _id: req.params.id, type: "payouts", userId: req.user._id }, { data });
	await addActivity(data.eventId, req.user._id, "DOCUMENT_REPLACED", "Cheque document uploaded or replaced", "DOCUMENT", document._id);
	res.json({ message: "success", data: serialize({ _id: req.params.id, data }) });
	} catch (error) {
		if (storedFile) await removeUpload(storedFile);
		if (req.file?.path) fs.rm(req.file.path, () => {});
		throw error;
	}
};

const getCheque = async (req, res) => {
	if (!isSafeRecordId(req.params.id, isTestMode)) return res.status(404).json({ message: "Payout not found" });
	const existing = isTestMode ? findRecordById("payouts", req.params.id) : await FinanceRecord.findOne({ _id: req.params.id, type: "payouts", userId: req.user._id });
	if (!existing || (isTestMode && !owns(existing, req.user._id))) return res.status(404).json({ message: "Cheque image not found" });
	const document = existing.data.chequeDocumentId && isSafeRecordId(existing.data.chequeDocumentId, isTestMode)
		? (isTestMode ? findRecordById("documents", existing.data.chequeDocumentId) : await FinanceRecord.findOne({ _id: existing.data.chequeDocumentId, type: "documents", userId: req.user._id }))
		: null;
	if (document?.data.storageId) return sendUpload(res, document.data);
	if (!isStoredCheque(existing.data.chequePhoto?.path) || !fs.existsSync(existing.data.chequePhoto.path)) return res.status(404).json({ message: "Cheque image not found" });
	return sendUpload(res, { mimeType: "image/jpeg" }, path.resolve(existing.data.chequePhoto.path));
};

const deleteCheque = async (req, res) => {
	if (!isSafeRecordId(req.params.id, isTestMode)) return res.status(404).json({ message: "Payout not found" });
	const existing = isTestMode ? findRecordById("payouts", req.params.id) : await FinanceRecord.findOne({ _id: req.params.id, type: "payouts", userId: req.user._id });
	if (!existing || (isTestMode && !owns(existing, req.user._id))) return res.status(404).json({ message: "Payout not found" });
	if (existing.data.chequeDocumentId) {
		const document = isSafeRecordId(existing.data.chequeDocumentId, isTestMode)
			? (isTestMode ? findRecordById("documents", existing.data.chequeDocumentId) : await FinanceRecord.findOne({ _id: existing.data.chequeDocumentId, type: "documents", userId: req.user._id }))
			: null;
		if (document?.data.storageId) await removeUpload(document.data);
		else if (isStoredCheque(document?.data.storagePath || existing.data.chequePhoto?.path)) await removeUpload({ storagePath: document?.data.storagePath || existing.data.chequePhoto.path });
		if (isTestMode) deleteRecord("documents", existing.data.chequeDocumentId);
		else await FinanceRecord.findOneAndDelete({ _id: existing.data.chequeDocumentId, type: "documents", userId: req.user._id });
	}
	const data = { ...existing.data, chequePhoto: null };
	if (isTestMode) updateRecord("payouts", req.params.id, { data }); else await FinanceRecord.findOneAndUpdate({ _id: req.params.id, type: "payouts", userId: req.user._id }, { data });
	await addActivity(data.eventId, req.user._id, "DOCUMENT_DELETED", "Cheque document deleted", "PAYOUT", req.params.id);
	res.json({ message: "success" });
};

const handlers = (type) => ({ list: list(type), get: getOne(type), create: create(type), update: update(type), remove: remove(type) });
module.exports = { TYPES, handlers, uploadCheque, getCheque, deleteCheque, uploadDir };
