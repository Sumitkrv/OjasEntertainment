const express = require("express");
const FinanceRecord = require("../models/financeRecord");
const { authorization } = require("../middlewares/authorization");
const wrapAsync = require("../middlewares/wrapAsync");
const { findRecords, findRecordById, createId, commitRecordChanges } = require("../config/testStore");
const { handlers } = require("./finance");
const { calculateInvoice, sumPayments } = require("../services/financial");
const { EVENT_STATUS, EVENT_STATUSES, EVENT_TRANSITIONS } = require("../services/eventLifecycle");
const { buildInvoiceRows } = require("../services/invoiceAggregation");
const { isValidDateValue } = require("../services/dateRange");
const { isSafeRecordId } = require("../services/recordId");

const isTestMode = process.env.TEST_MODE === "true";
const STATUSES = EVENT_STATUSES;
const PRIORITIES = ["HIGH", "MEDIUM", "LOW"];
const EVENT_FIELDS = new Set(["eventName", "clientName", "company", "eventDate", "city", "venue", "eventType", "description", "priority", "status"]);
const invalid = (message) => Object.assign(new Error(message), { status: 400 });
const eventData = (record) => ({ _id: record._id, ...record.data });
const ownsEvent = (record, userId) => record?.userId === userId && record.data?.recordKind === "event";
const findEvent = async (id, userId) => {
	if (!isSafeRecordId(id, isTestMode)) return null;
	if (isTestMode) {
		const record = findRecordById("events", id);
		return ownsEvent(record, userId) ? record : null;
	}
	return FinanceRecord.findOne({ _id: id, type: "events", userId, "data.recordKind": "event" });
};
const recordsFor = async (type, userId, eventId) => {
	if (isTestMode) return findRecords(type).filter((record) => record.userId === userId && record.data?.eventId === eventId);
	return FinanceRecord.find({ type, userId, "data.eventId": eventId });
};
const normalize = (body, existing = {}, creating = false) => {
	if (!body || typeof body !== "object" || Array.isArray(body)) throw invalid("Request body must be an object");
	const unknown = Object.keys(body).find((key) => !EVENT_FIELDS.has(key));
	if (unknown) throw invalid(`Unexpected field: ${unknown}`);
	const safeBody = { ...body };
	delete safeBody.status;
	const data = { ...existing, ...safeBody, recordKind: "event" };
	for (const field of ["eventName", "clientName", "company", "eventType", "city", "venue", "description"]) {
		if (data[field] !== undefined && (typeof data[field] !== "string" || data[field].length > (field === "description" ? 5000 : 200))) throw invalid(`Invalid ${field}`);
	}
	if (!String(data.eventName || "").trim()) throw invalid("eventName is required");
	if (!String(data.clientName || "").trim()) throw invalid("clientName is required");
	if (!data.eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(data.eventDate) || Number.isNaN(new Date(`${data.eventDate}T00:00:00Z`).getTime()) || new Date(`${data.eventDate}T00:00:00Z`).toISOString().slice(0, 10) !== data.eventDate) throw invalid("A valid eventDate is required");
	if (!String(data.city || "").trim()) throw invalid("city is required");
	if (creating && body.status && ![EVENT_STATUS.DRAFT, EVENT_STATUS.UPCOMING].includes(body.status)) throw invalid("New Events must start as DRAFT or UPCOMING");
	if (data.priority && !PRIORITIES.includes(String(data.priority).toUpperCase())) throw invalid("Invalid priority");
	data.status = existing.status || body.status || "DRAFT";
	data.priority = String(data.priority || existing.priority || "MEDIUM").toUpperCase();
	return data;
};

const list = async (req, res) => {
	if (req.query.legacy === "true") return handlers("events").list(req, res);
	if (req.query.status && !STATUSES.includes(req.query.status)) return res.status(400).json({ message: "Invalid Event status" });
	if (req.query.dateFrom && !isValidDateValue(req.query.dateFrom)) return res.status(400).json({ message: "Invalid dateFrom" });
	if (req.query.dateTo && !isValidDateValue(req.query.dateTo)) return res.status(400).json({ message: "Invalid dateTo" });
	if (req.query.dateFrom && req.query.dateTo && req.query.dateFrom > req.query.dateTo) return res.status(400).json({ message: "dateFrom must be on or before dateTo" });
	if (String(req.query.search || "").length > 100) return res.status(400).json({ message: "Search is too long" });
	const source = isTestMode ? findRecords("events").filter((record) => ownsEvent(record, req.user._id)) : await FinanceRecord.find({ type: "events", userId: req.user._id, "data.recordKind": "event" });
	const search = String(req.query.search || "").toLowerCase();
	const eventIds = source.map((record) => String(record._id));
	let referenceMatches = new Set();
	if (search && eventIds.length) {
		const related = isTestMode
			? ["proforma", "taxInvoices"].flatMap((type) => findRecords(type).filter((item) => item.userId === req.user._id && eventIds.includes(String(item.data?.eventId))))
			: await FinanceRecord.find({ type: { $in: ["proforma", "taxInvoices"] }, userId: req.user._id, "data.eventId": { $in: eventIds } });
		referenceMatches = new Set(related.filter((item) => [item.data?.piNumber, item.data?.invoiceNumber, item.data?.taxInvoiceNumber].some((value) => String(value || "").toLowerCase().includes(search))).map((item) => String(item.data.eventId)));
	}
	const filtered = source.map(eventData).filter((event) => {
		const haystack = [event.eventName, event.clientName, event.company, event.city, event.eventType, event.eventCode].join(" ").toLowerCase();
		return (!search || haystack.includes(search) || referenceMatches.has(String(event._id))) && (!req.query.status || event.status === req.query.status) && (!req.query.client || event.clientName === req.query.client) && (!req.query.company || event.company === req.query.company) && (!req.query.city || event.city === req.query.city) && (!req.query.eventType || event.eventType === req.query.eventType) && (!req.query.priority || event.priority === req.query.priority.toUpperCase()) && (!req.query.dateFrom || String(event.eventDate || "") >= String(req.query.dateFrom)) && (!req.query.dateTo || String(event.eventDate || "") <= String(req.query.dateTo));
	});
	const sort = req.query.sort || "eventDate";
	filtered.sort((left, right) => String(left[sort] || "").localeCompare(String(right[sort] || "")) * (req.query.order === "asc" ? 1 : -1));
	const page = Math.max(Number(req.query.page) || 1, 1);
	const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
	res.json({ message: "success", data: filtered.slice((page - 1) * limit, page * limit), meta: { page, limit, total: filtered.length } });
};
const create = async (req, res) => {
	try {
		const data = normalize(req.body, {}, true);
		const now = new Date().toISOString();
		let record;
		const eventDataValue = { ...data, eventCode: createId("event"), createdBy: req.user._id, createdAt: now, updatedAt: now };
		if (isTestMode) {
			record = { _id: createId("evt"), userId: req.user._id, data: eventDataValue };
			const audit = { _id: createId("activity"), userId: req.user._id, data: { eventId: record._id, action: "EVENT_CREATED", description: "Event created", entityType: "EVENT", entityId: record._id, performedBy: req.user._id, createdAt: now } };
			commitRecordChanges([{ type: "events", record }, { type: "activities", record: audit }]);
		} else {
			const session = await FinanceRecord.startSession();
			try { await session.withTransaction(async () => {
				const saved = await new FinanceRecord({ type: "events", userId: req.user._id, data: eventDataValue }).save({ session });
				record = { _id: saved._id.toString(), userId: req.user._id, data: saved.data };
				await new FinanceRecord({ type: "activities", userId: req.user._id, data: { eventId: record._id, action: "EVENT_CREATED", description: "Event created", entityType: "EVENT", entityId: record._id, performedBy: req.user._id, createdAt: now } }).save({ session });
			}); } finally { await session.endSession(); }
		}
		res.status(201).json({ message: "success", data: eventData(record) });
	} catch (error) { const status = error.status || 500; res.status(status).json({ message: status >= 500 ? "Unable to create Event" : error.message }); }
};
const detail = async (req, res) => {
	const record = await findEvent(req.params.id, req.user._id);
	if (!record) return res.status(404).json({ message: "Event not found" });
	const types = ["proforma", "taxInvoices", "payments", "payouts", "work", "documents", "activities"];
	const related = await Promise.all(types.map((type) => recordsFor(type, req.user._id, req.params.id)));
	const serialized = (items, type) => items.map((item) => type === "documents" ? { ...eventData(item), url: `/api/documents/${item._id}/file` } : eventData(item));
	related[6].sort((left, right) => new Date(right.data.createdAt) - new Date(left.data.createdAt));
	res.json({ message: "success", data: { event: eventData(record), proformaInvoices: serialized(related[0]), taxInvoices: serialized(related[1]), payments: serialized(related[2]), payouts: serialized(related[3]), workLogs: serialized(related[4]), documents: serialized(related[5], "documents"), activities: serialized(related[6]) } });
};
const financialSummary = async (req, res) => {
	const record = await findEvent(req.params.id, req.user._id);
	if (!record) return res.status(404).json({ message: "Event not found" });
	const [proformas, taxInvoices, payments, payouts] = await Promise.all(["proforma", "taxInvoices", "payments", "payouts"].map((type) => recordsFor(type, req.user._id, req.params.id)));
	const invoiceRows = buildInvoiceRows({ proformas, taxInvoices, payments });
	const sum = (items, field) => items.reduce((total, item) => total + Number(item.data?.[field] ?? item[field] ?? 0), 0);
	const totalPIValue = invoiceRows.reduce((total, item) => total + item.grossInvoiceValue, 0);
	const totalDue = invoiceRows.reduce((total, item) => total + item.netPayable, 0);
	const totalReceived = invoiceRows.reduce((total, item) => total + Number(item.amountReceived || 0), 0);
	const totalOutstanding = invoiceRows.reduce((total, item) => total + item.outstandingAmount, 0);
	const totalOverpaid = invoiceRows.reduce((total, item) => total + item.overpaymentAmount, 0);
	const totalPayout = sum(payouts, "amount");
	const totalTDS = invoiceRows.reduce((total, item) => total + item.tdsAmount, 0);
	res.json({ message: "success", data: { eventId: req.params.id, totalPIValue, totalTaxInvoiceValue: sum(taxInvoices, "grossInvoiceValue"), totalTDS, totalDue, totalReceived, totalOutstanding, totalOverpaid, totalPayout, netPosition: totalReceived - totalPayout } });
};
const update = async (req, res) => {
	const record = await findEvent(req.params.id, req.user._id);
	if (!record) return res.status(404).json({ message: "Event not found" });
	try {
		const data = normalize(req.body, record.data);
		const now = new Date().toISOString();
		data.updatedAt = now;
		const audit = { _id: createId("activity"), userId: req.user._id, data: { eventId: req.params.id, action: "EVENT_UPDATED", description: "Event updated", entityType: "EVENT", entityId: req.params.id, performedBy: req.user._id, createdAt: now } };
		let updated;
		if (isTestMode) {
			updated = { ...record, data };
			commitRecordChanges([{ type: "events", record: updated }, { type: "activities", record: audit }]);
		} else {
			const session = await FinanceRecord.startSession();
			try { await session.withTransaction(async () => {
				const current = await FinanceRecord.findOneAndUpdate({ _id: req.params.id, type: "events", userId: req.user._id, "data.status": record.data.status, "data.updatedAt": record.data.updatedAt }, { data }, { new: true, session });
				if (!current) { const conflict = new Error("Event changed during update; reload and try again"); conflict.status = 409; throw conflict; }
				updated = { _id: current._id.toString(), data: current.data };
				await new FinanceRecord({ type: "activities", userId: req.user._id, data: audit.data }).save({ session });
			}); } finally { await session.endSession(); }
		}
		res.json({ message: "success", data: eventData(isTestMode ? updated : { _id: updated._id.toString(), data: updated.data }) });
	} catch (error) { const status = error.status || 500; res.status(status).json({ message: status >= 500 ? "Unable to update Event" : error.message }); }
};
const changeStatusUnlocked = async (req, res) => {
	const record = await findEvent(req.params.id, req.user._id);
	if (!record) return res.status(404).json({ message: "Event not found" });
	const status = req.body.status;
	if (status === record.data.status) return res.json({ message: "success", data: eventData(record) });
	if (!STATUSES.includes(status) || !EVENT_TRANSITIONS[record.data.status]?.has(status)) return res.status(409).json({ message: "Invalid event status transition" });
	const now = new Date().toISOString();
	const data = { ...record.data, status, updatedAt: now };
	if (status === "ONGOING" && !data.startedAt) data.startedAt = now;
	if (status === "COMPLETED" && !data.completedAt) data.completedAt = now;
	if (status === "ARCHIVED" && !data.archivedAt) data.archivedAt = now;
	const completionWarnings = [];
	if (status === "COMPLETED") {
		const [proformas, taxInvoices, payments, payouts, work] = await Promise.all(["proforma", "taxInvoices", "payments", "payouts", "work"].map((type) => recordsFor(type, req.user._id, req.params.id)));
		for (const pi of proformas) {
			const taxInvoice = taxInvoices.find((item) => String(item.data.proformaInvoiceId) === String(pi._id) || String(pi.data.taxInvoiceId) === String(item._id));
			if (!taxInvoice) completionWarnings.push(`Proforma ${pi.data.piNumber || pi._id} has not been converted`);
			try {
				const values = calculateInvoice(pi.data, { received: sumPayments(payments, pi._id, taxInvoice ? [taxInvoice._id] : []) });
				if (values.outstandingAmount > 0) completionWarnings.push(`Proforma ${pi.data.piNumber || pi._id} has an outstanding balance`);
			} catch { completionWarnings.push(`Proforma ${pi.data.piNumber || pi._id} needs financial review`); }
		}
		if (payouts.some((item) => !["PAID", "CANCELLED"].includes(String(item.data.status || "").toUpperCase()))) completionWarnings.push("One or more payouts are pending");
		if (work.some((item) => !["COMPLETED", "DONE"].includes(String(item.data.status || "").toUpperCase()))) completionWarnings.push("One or more work items are incomplete");
	}
	const action = status === "ONGOING" ? "EVENT_STARTED" : status === "COMPLETED" ? "EVENT_COMPLETED" : "EVENT_ARCHIVED";
	const description = status === "COMPLETED" && completionWarnings.length ? `Event marked as completed with ${completionWarnings.length} unresolved item(s)` : `Event marked as ${status.toLowerCase()}`;
	const audit = { _id: createId("activity"), userId: req.user._id, data: { eventId: req.params.id, action, description, entityType: "EVENT", entityId: req.params.id, performedBy: req.user._id, createdAt: now } };
	let updated;
	if (isTestMode) {
		updated = { ...record, data };
		try { commitRecordChanges([{ type: "events", record: updated }, { type: "activities", record: audit }]); }
		catch { return res.status(500).json({ message: "Unable to update Event status" }); }
	} else {
		const session = await FinanceRecord.startSession();
		try { await session.withTransaction(async () => {
			const current = await FinanceRecord.findOneAndUpdate({ _id: req.params.id, type: "events", userId: req.user._id, "data.status": record.data.status }, { data }, { new: true, session });
			if (!current) { const conflict = new Error("Event changed during status update"); conflict.status = 409; throw conflict; }
			updated = { _id: current._id.toString(), data: current.data };
			await new FinanceRecord({ type: "activities", userId: req.user._id, data: audit.data }).save({ session });
		}); } catch (error) { return res.status(error.status || 500).json({ message: error.status ? error.message : "Unable to update Event status" }); } finally { await session.endSession(); }
	}
	res.json({ message: "success", data: { ...eventData(isTestMode ? updated : { _id: updated._id.toString(), data: updated.data }), ...(status === "COMPLETED" ? { completionWarnings } : {}) } });
};

const transitionLocks = new Set();
const changeStatus = async (req, res) => {
	const key = `${req.user._id}:${req.params.id}`;
	if (transitionLocks.has(key)) return res.status(409).json({ message: "Event status is already being changed" });
	transitionLocks.add(key);
	try { return await changeStatusUnlocked(req, res); }
	finally { transitionLocks.delete(key); }
};

const router = express.Router();
router.get("/", authorization, wrapAsync(list));
router.post("/", authorization, wrapAsync((req, res, next) => req.query.legacy === "true" ? handlers("events").create(req, res, next) : create(req, res)));
router.get("/:id/financial-summary", authorization, wrapAsync(financialSummary));
router.get("/:id", authorization, wrapAsync(detail));
router.put("/:id", authorization, wrapAsync((req, res, next) => req.query.legacy === "true" ? handlers("events").update(req, res, next) : update(req, res)));
router.patch("/:id", authorization, wrapAsync(update));
router.patch("/:id/status", authorization, wrapAsync(changeStatus));
router.patch("/:id/archive", authorization, wrapAsync((req, res) => { req.body.status = "ARCHIVED"; return changeStatus(req, res); }));
router.delete("/:id", authorization, wrapAsync(async (req, res) => {
	const record = await findEvent(req.params.id, req.user._id);
	if (!record) return res.status(404).json({ message: "Event not found" });
	return res.status(409).json({ message: "Events cannot be deleted. Archive the Event to retain its history and related records." });
}));
module.exports = router;
module.exports.handlers = { create, update, detail, list, changeStatus, financialSummary };
