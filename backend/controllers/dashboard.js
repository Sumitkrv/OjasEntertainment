const FinanceRecord = require("../models/financeRecord");
const Task = require("../models/task");
const { findRecords, findTasks } = require("../config/testStore");
const { EVENT_STATUS, summarizeEvents } = require("../services/eventLifecycle");
const { todayKey } = require("../services/dateRange");
const { buildInvoiceRows } = require("../services/invoiceAggregation");

const isTestMode = process.env.TEST_MODE === "true";
const source = async (type, userId) => isTestMode ? findRecords(type).filter((record) => record.userId === userId) : FinanceRecord.find({ type, userId });
const taskSource = async (userId) => isTestMode ? findTasks().filter((task) => task.userName === userId || task.userId === userId) : Task.find({ userName: userId });
const data = (record) => ({ _id: record._id, ...record.data });
const today = () => todayKey();
const money = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const summary = async (req, res) => {
	try {
		const [events, proforma, taxInvoices, payments, payouts, work, activities, tasks] = await Promise.all([...['events', 'proforma', 'taxInvoices', 'payments', 'payouts', 'work', 'activities'].map((type) => source(type, req.user._id)), taskSource(req.user._id)]);
		const eventRows = events.filter((record) => record.data?.recordKind === "event").map(data);
		const eventCounts = summarizeEvents(eventRows);
		const piRows = proforma.map((record) => data(record));
		const paymentRows = payments.filter((record) => String(record.data?.status || "").toUpperCase() !== "CANCELLED").map(data);
		const payoutRows = payouts.map(data);
		const workRows = work.map(data);
		const eventMap = new Map(eventRows.map((event) => [event._id, event]));
		const invoiceRows = buildInvoiceRows({ proformas: proforma, taxInvoices, payments });
		const outstandingInvoices = invoiceRows.filter((invoice) => Number(invoice.outstandingAmount ?? invoice.balanceAmount ?? 0) > 0).map((invoice) => ({ ...invoice, event: eventMap.get(invoice.eventId) || null }));
		const upcomingEvents = eventRows.filter((event) => event.status === EVENT_STATUS.UPCOMING).sort((a, b) => String(a.eventDate || "").localeCompare(String(b.eventDate || ""))).slice(0, 5);
		const activeEvents = eventRows.filter((event) => event.status === EVENT_STATUS.ONGOING).slice(0, 5);
		const recentActivity = activities.map(data).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 8).map((item) => ({ ...item, event: eventMap.get(item.eventId) || null }));
		const todaysWork = workRows.filter((item) => item.date === today()).slice(0, 8).map((item) => ({ ...item, event: eventMap.get(item.eventId) || null }));
		const month = today().slice(0, 7);
		const totalReceived = paymentRows.reduce((sum, item) => sum + Number(item.amount || 0), 0);
		const totalOutstanding = invoiceRows.reduce((sum, item) => sum + Math.max(Number(item.outstandingAmount ?? item.balanceAmount ?? 0), 0), 0);
		const currentMonthInvoiceValue = invoiceRows.filter((item) => String(item.invoiceDate || "").startsWith(month)).reduce((sum, item) => sum + Number(item.grossInvoiceValue ?? item.piAmount ?? 0), 0);
		res.json({ message: "success", data: { kpis: { totalEvents: eventCounts.total, activeEvents: eventCounts.active, upcomingEvents: eventCounts.upcoming, completedEvents: eventCounts.completed, archivedEvents: eventCounts.archived, pendingTasks: Array.isArray(tasks) ? tasks.filter((task) => task.status !== "done").length : 0, todaysWork: workRows.filter((item) => item.date === today()).length, totalOutstanding: money(totalOutstanding), totalReceived: money(totalReceived), pendingPayouts: payoutRows.filter((item) => !["PAID", "CANCELLED"].includes(item.status)).length, currentMonthInvoiceValue: money(currentMonthInvoiceValue) }, upcomingEvents, activeEvents, outstandingInvoices: outstandingInvoices.slice(0, 8), recentActivity, todaysWork } });
	} catch (error) { res.status(500).json({ message: "Unable to load dashboard summary" }); }
};
const search = async (req, res) => {
	const query = String(req.query.q || "").trim().toLowerCase();
	if (query.length < 2) return res.json({ message: "success", data: { events: [], proforma: [], invoices: [], payments: [], payouts: [], work: [] } });
	const [events, proforma, taxInvoices, payments, payouts, work] = await Promise.all(["events", "proforma", "taxInvoices", "payments", "payouts", "work"].map((type) => source(type, req.user._id)));
	const match = (record, fields) => fields.some((field) => String(record.data?.[field] || "").toLowerCase().includes(query));
	const eventRows = events.filter((record) => record.data?.recordKind === "event");
	const eventById = new Map(eventRows.map((record) => [record._id, record.data]));
	const related = (record) => ({ eventId: record.data?.eventId, eventName: eventById.get(record.data?.eventId)?.eventName || null });
	const result = {
		events: eventRows.filter((record) => match(record, ["eventName", "clientName", "company", "city", "eventCode"])).slice(0, 8).map(data),
		proforma: proforma.filter((record) => match(record, ["piNumber", "partyName", "company"])).slice(0, 8).map((record) => ({ ...data(record), ...related(record) })),
		invoices: taxInvoices.filter((record) => match(record, ["invoiceNumber", "eventId"])).slice(0, 8).map((record) => ({ ...data(record), ...related(record) })),
		payments: payments.filter((record) => match(record, ["referenceNumber", "paymentMode"])).slice(0, 8).map((record) => ({ ...data(record), ...related(record) })),
		payouts: payouts.filter((record) => match(record, ["vendorName", "purpose", "company"])).slice(0, 8).map((record) => ({ ...data(record), ...related(record) })),
		work: work.filter((record) => match(record, ["workDescription", "company", "workCategory"])).slice(0, 8).map((record) => ({ ...data(record), ...related(record) })),
	};
	res.json({ message: "success", data: result });
};
module.exports = { summary, search };
