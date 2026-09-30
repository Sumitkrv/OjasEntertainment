const FinanceRecord = require("../models/financeRecord");
const { findRecords } = require("../config/testStore");
const { EVENT_STATUS, EVENT_STATUSES, summarizeEvents } = require("../services/eventLifecycle");
const { getDateRange, isDateInRange, getMonthKey, enumerateMonths, addDays, todayKey, BUSINESS_TIME_ZONE, toBusinessDateKey } = require("../services/dateRange");
const { buildInvoiceRows, aggregateInvoiceTotals } = require("../services/invoiceAggregation");

const isTestMode = process.env.TEST_MODE === "true";

const toNumber = (value, fallback = 0) => {
	const numeric = Number(value ?? 0);
	return Number.isFinite(numeric) ? numeric : fallback;
};

const toMonthKey = (value) => getMonthKey(value, BUSINESS_TIME_ZONE);

const formatMonthLabel = (monthKeyValue) => {
	if (!monthKeyValue || !/\d{4}-\d{2}/.test(monthKeyValue)) return monthKeyValue || "N/A";
	const [year, month] = monthKeyValue.split("-").map(Number);
	return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-IN", {
		month: "short",
		year: "numeric",
		timeZone: "UTC",
	});
};

const normalizeRecord = (record) => {
	if (!record) return {};
	const source = record.data ?? record;
	return {
		...source,
		_id: String(source._id ?? record._id ?? ""),
		userId: source.userId ?? record.userId ?? null,
	};
};

const matchesDate = (value, bounds) => {
	return Boolean(value && bounds && isDateInRange(value, bounds, BUSINESS_TIME_ZONE));
};

const matchesCompany = (value, filterValue) => {
	if (!filterValue) return true;
	if (!value) return false;
	return String(value).trim().toLowerCase() === String(filterValue).trim().toLowerCase();
};

const matchesStatus = (value, filterValue) => {
	if (!filterValue) return true;
	if (!value) return false;
	return String(value).toUpperCase() === String(filterValue).toUpperCase();
};

const getRecords = async (userId, type, bounds, dateFields = []) => {
	if (isTestMode) return findRecords(type).filter((record) => record.userId === userId);
	const filter = { type, userId };
	if (type === "events") filter["data.recordKind"] = "event";
	if (dateFields.length && bounds) {
		const endExclusive = addDays(bounds.endDate, 1);
		filter.$or = dateFields.map((field) => ({ [`data.${field}`]: { $gte: bounds.startDate, $lt: endExclusive } }));
	}
	const docs = await FinanceRecord.find(filter);
	return docs.map((record) => ({ ...record.toObject(), data: record.data }));
};

const getRecordsByIds = async (userId, type, ids) => {
	const uniqueIds = [...new Set(ids.filter(Boolean).map(String))];
	if (!uniqueIds.length) return [];
	if (isTestMode) {
		const idSet = new Set(uniqueIds);
		return findRecords(type).filter((record) => record.userId === userId && idSet.has(String(record._id)));
	}
	const docs = await FinanceRecord.find({ type, userId, _id: { $in: uniqueIds } });
	return docs.map((record) => ({ ...record.toObject(), data: record.data }));
};

const getPaymentsForInvoices = async (userId, proformaIds, taxInvoiceIds) => {
	const piIds = [...new Set(proformaIds.filter(Boolean).map(String))];
	const taxIds = [...new Set(taxInvoiceIds.filter(Boolean).map(String))];
	if (!piIds.length && !taxIds.length) return [];
	if (isTestMode) return findRecords("payments").filter((record) => record.userId === userId && (piIds.includes(String(record.data.proformaInvoiceId)) || taxIds.includes(String(record.data.taxInvoiceId))));
	const clauses = [];
	if (piIds.length) clauses.push({ "data.proformaInvoiceId": { $in: piIds } });
	if (taxIds.length) clauses.push({ "data.taxInvoiceId": { $in: taxIds } });
	const docs = await FinanceRecord.find({ type: "payments", userId, $or: clauses });
	return docs.map((record) => ({ ...record.toObject(), data: record.data }));
};

const rawData = async (userId, bounds) => {
	const [events, proforma, taxInvoices, payments, payouts, work] = await Promise.all([
		getRecords(userId, "events", bounds, ["eventDate"]),
		getRecords(userId, "proforma", bounds, ["piDate", "taxInvoiceDate"]),
		getRecords(userId, "taxInvoices", bounds, ["invoiceDate"]),
		getRecords(userId, "payments", bounds, ["paymentDate"]),
		getRecords(userId, "payouts", bounds, ["date", "paymentDate"]),
		getRecords(userId, "work", bounds, ["date"]),
	]);
	const taxParentIds = taxInvoices.map((item) => item.data?.proformaInvoiceId);
	const paymentPiIds = payments.map((item) => item.data?.proformaInvoiceId);
	const paymentTaxIds = payments.map((item) => item.data?.taxInvoiceId);
	const [relatedProforma, paymentTaxInvoices, proformaTaxInvoices] = await Promise.all([
		getRecordsByIds(userId, "proforma", [...taxParentIds, ...paymentPiIds]),
		getRecordsByIds(userId, "taxInvoices", paymentTaxIds),
		getRecordsByIds(userId, "taxInvoices", proforma.map((item) => item.data?.taxInvoiceId)),
	]);
	const allProforma = [...new Map([...proforma, ...relatedProforma].map((item) => [String(item._id), item])).values()];
	const allTaxInvoices = [...new Map([...taxInvoices, ...paymentTaxInvoices, ...proformaTaxInvoices].map((item) => [String(item._id), item])).values()];
	const invoicePayments = await getPaymentsForInvoices(userId, allProforma.map((item) => item._id), allTaxInvoices.map((item) => item._id));
	return { events, proforma, relatedProforma, taxInvoices: allTaxInvoices, payments, invoicePayments, payouts, work };
};

const makeSeries = (rows, { labelField, valueField = "value", sortBy = "value" } = {}) => {
	const map = new Map();
	for (const row of rows) {
		const label = row[labelField];
		if (!label) continue;
		map.set(label, (map.get(label) || 0) + Number(row[valueField] || 0));
	}
	const values = [...map.entries()].map(([label, value]) => ({ label, value }));
	values.sort((left, right) => {
		if (sortBy === "label") return left.label.localeCompare(right.label);
		return right.value - left.value || left.label.localeCompare(right.label);
	});
	return values;
};

const makeMonthlySeries = (rows, valueSelector, bounds) => {
	const map = new Map(enumerateMonths(bounds).map((month) => [month, 0]));
	for (const row of rows) {
		const month = toMonthKey(valueSelector(row));
		if (month && map.has(month)) map.set(month, map.get(month) + Number(row.value || 0));
	}
	return [...map.entries()].map(([month, value]) => ({ label: formatMonthLabel(month), value }));
};

const buildAnalyticsSnapshot = async (userId, query = {}) => {
	const bounds = getDateRange(query);
	const companyFilter = query.company || "";
	const statusFilter = String(query.status || "").toUpperCase();
	if (statusFilter && !EVENT_STATUSES.includes(statusFilter)) throw Object.assign(new Error("Unsupported event status"), { status: 400 });
	const raw = await rawData(userId, bounds);
	const eventRows = raw.events
		.map(normalizeRecord)
		.filter((event) => String(event.recordKind || "").toLowerCase() === "event")
		.filter((event) => matchesDate(event.eventDate, bounds))
		.filter((event) => matchesCompany(event.company, companyFilter))
		.filter((event) => matchesStatus(event.status, statusFilter));
	const eventIds = new Set(eventRows.map((event) => event._id));
	const eventCounts = summarizeEvents(eventRows);
	const invoiceSource = buildInvoiceRows({ proformas: [...raw.proforma, ...(raw.relatedProforma || [])], taxInvoices: raw.taxInvoices, payments: raw.invoicePayments })
		.filter((invoice) => matchesDate(invoice.invoiceDate, bounds))
		.filter((invoice) => matchesCompany(invoice.company, companyFilter))
		.filter((invoice) => !statusFilter || eventIds.has(String(invoice.eventId)));
	const invoiceRelations = new Map();
	for (const invoice of buildInvoiceRows({ proformas: [...raw.proforma, ...(raw.relatedProforma || [])], taxInvoices: raw.taxInvoices, payments: raw.invoicePayments })) {
		const relation = { company: invoice.company, eventId: invoice.eventId, clientName: invoice.clientName };
		for (const id of [invoice._id, invoice.proformaInvoiceId, invoice.taxInvoiceId].filter(Boolean)) invoiceRelations.set(String(id), relation);
	}
	const paymentRows = raw.payments
		.map(normalizeRecord)
		.map((payment) => {
			const relation = invoiceRelations.get(String(payment.proformaInvoiceId || "")) || invoiceRelations.get(String(payment.taxInvoiceId || ""));
			return { ...payment, company: payment.company || relation?.company, eventId: payment.eventId || relation?.eventId, clientName: payment.clientName || relation?.clientName };
		})
		.filter((payment) => String(payment.status || "").toUpperCase() !== "CANCELLED")
		.filter((payment) => matchesDate(payment.paymentDate, bounds))
		.filter((payment) => matchesCompany(payment.company, companyFilter))
		.filter((payment) => !statusFilter || eventIds.has(String(payment.eventId)));
	const payoutRows = raw.payouts
		.map(normalizeRecord)
		.filter((payout) => String(payout.status || "").toUpperCase() !== "CANCELLED")
		.filter((payout) => matchesDate(payout.date || payout.paymentDate, bounds))
		.filter((payout) => matchesCompany(payout.company, companyFilter))
		.filter((payout) => !statusFilter || eventIds.has(String(payout.eventId)));
	const workRows = raw.work
		.map(normalizeRecord)
		.filter((entry) => matchesDate(entry.date, bounds))
		.filter((entry) => matchesCompany(entry.company, companyFilter))
		.filter((entry) => !statusFilter || eventIds.has(String(entry.eventId)));
	const invoiceRowsWithFinancials = invoiceSource;
	const totals = aggregateInvoiceTotals(invoiceRowsWithFinancials, paymentRows, payoutRows);
	const invoiceValue = totals.invoiceValue;
	const taxInvoiceValue = invoiceRowsWithFinancials.filter((record) => record.isTaxInvoice).reduce((total, record) => total + toNumber(record.grossInvoiceValue), 0);
	const received = totals.received;
	const outstanding = totals.outstanding;
	const tds = totals.tds;
	const payouts = totals.payouts;
	const workHours = workRows.reduce((total, row) => {
		const value = Number(row.hours ?? row.duration ?? row.workHours ?? 0);
		return Number.isFinite(value) ? total + value : total;
	}, 0);
	const completedWork = workRows.filter((row) => ["COMPLETED", "DONE", "PAID"].includes(String(row.status || "").toUpperCase())).length;
	const eventTotals = [
		{ label: "UPCOMING", value: eventRows.filter((event) => event.status === EVENT_STATUS.UPCOMING).length },
		{ label: "ONGOING", value: eventRows.filter((event) => event.status === EVENT_STATUS.ONGOING).length },
		{ label: "COMPLETED", value: eventRows.filter((event) => event.status === EVENT_STATUS.COMPLETED).length },
		{ label: "ARCHIVED", value: eventRows.filter((event) => event.status === EVENT_STATUS.ARCHIVED).length },
		{ label: "DRAFT", value: eventRows.filter((event) => event.status === EVENT_STATUS.DRAFT).length },
	].filter((item) => item.value > 0);
	const eventByMonth = makeMonthlySeries(eventRows.map((event) => ({ eventDate: event.eventDate, value: 1 })), (row) => row.eventDate, bounds);
	const byCompany = makeSeries(
		eventRows.map((event) => ({ label: event.company || "Unspecified", value: 1 })),
		{ labelField: "label", valueField: "value" }
	);
	const byCity = makeSeries(
		eventRows.map((event) => ({ label: event.city || "Unspecified", value: 1 })),
		{ labelField: "label", valueField: "value" }
	);
	const byEventType = makeSeries(
		eventRows.map((event) => ({ label: event.eventType || "Unspecified", value: 1 })),
		{ labelField: "label", valueField: "value" }
	);
	const outstandingRows = invoiceRowsWithFinancials
		.filter((invoice) => Math.max(toNumber(invoice.outstandingAmount ?? invoice.balanceAmount ?? 0), 0) > 0)
		.map((invoice) => {
			const event = eventRows.find((item) => item._id === invoice.eventId) || {};
			return {
				eventId: invoice.eventId || event._id || null,
				eventName: event.eventName || "Unlinked event",
				client: invoice.clientName || event.clientName || invoice.partyName || "Unspecified",
				invoiceNumber: invoice.invoiceNumber || invoice.taxInvoiceNumber || invoice.piNumber || "N/A",
				invoiceValue: toNumber(invoice.grossInvoiceValue ?? invoice.totalInvoiceValue ?? invoice.piAmount ?? invoice.amountDue ?? 0),
				received: toNumber(invoice.amountReceived ?? 0),
				outstanding: Math.max(toNumber(invoice.outstandingAmount ?? invoice.balanceAmount ?? 0), 0),
				ageDays: (() => {
					const key = toBusinessDateKey(invoice.invoiceDate || invoice.piDate, BUSINESS_TIME_ZONE);
					if (!key) return 0;
					const [year, month, day] = key.split("-").map(Number);
					const [todayYear, todayMonth, todayDay] = todayKey().split("-").map(Number);
					return Math.max((Date.UTC(todayYear, todayMonth - 1, todayDay) - Date.UTC(year, month - 1, day)) / 86400000, 0);
				})(),
				status: invoice.status || "ISSUED",
			};
		})
		.sort((left, right) => right.outstanding - left.outstanding || right.ageDays - left.ageDays);
	const paymentSeries = makeMonthlySeries(paymentRows.map((payment) => ({ date: payment.paymentDate, value: toNumber(payment.amount) })), (row) => row.date, bounds);
	const payoutSeries = makeMonthlySeries(payoutRows.map((payout) => ({ date: payout.date || payout.paymentDate, value: toNumber(payout.amount) })), (row) => row.date, bounds);
	const companyBreakdown = makeSeries(
		invoiceSource.map((row) => ({ label: row.company || row.partyName || "Unspecified", value: toNumber(row.grossInvoiceValue ?? row.totalInvoiceValue ?? row.piAmount ?? row.amountDue ?? 0) })),
		{ labelField: "label", valueField: "value" }
	);
	const paymentModes = makeSeries(
		paymentRows.map((row) => ({ label: row.paymentMode || "OTHER", value: toNumber(row.amount) })),
		{ labelField: "label", valueField: "value" }
	);
	const payoutModes = makeSeries(
		payoutRows.map((row) => ({ label: row.paymentMode || "OTHER", value: toNumber(row.amount) })),
		{ labelField: "label", valueField: "value" }
	);
	const workCategories = makeSeries(
		workRows.map((row) => ({ label: row.workCategory || "General", value: 1 })),
		{ labelField: "label", valueField: "value" }
	);
	const workByCompany = makeSeries(
		workRows.map((row) => ({ label: row.company || "Unspecified", value: 1 })),
		{ labelField: "label", valueField: "value" }
	);
	const workByEvent = makeSeries(
		workRows.map((row) => ({ label: row.eventName || row.eventId || "Unspecified", value: 1 })),
		{ labelField: "label", valueField: "value" }
	);
	const companyMetrics = [...new Map(
		[...eventRows.map((event) => ({ key: event.company || "Unspecified", type: "event" })), ...invoiceSource.map((invoice) => ({ key: invoice.company || "Unspecified", type: "invoice" }))]
		.map((entry) => [entry.key, entry])
	)].map(([companyName]) => {
		const companyEvents = eventRows.filter((event) => (event.company || "Unspecified") === companyName);
		const companyInvoices = invoiceRowsWithFinancials.filter((invoice) => (invoice.company || "Unspecified") === companyName);
		const companyPayouts = payoutRows.filter((payout) => (payout.company || "Unspecified") === companyName);
		const companyWork = workRows.filter((work) => work.company === companyName);
		const companyInvoiceValue = companyInvoices.reduce((total, invoice) => total + toNumber(invoice.grossInvoiceValue), 0);
		const companyReceived = paymentRows.filter((payment) => (payment.company || "Unspecified") === companyName).reduce((total, payment) => total + toNumber(payment.amount), 0);
		const companyOutstanding = companyInvoices.reduce((total, invoice) => total + Math.max(toNumber(invoice.outstandingAmount), 0), 0);
		return {
			company: companyName,
			events: companyEvents.length,
			invoiceValue: companyInvoiceValue,
			received: companyReceived,
			outstanding: companyOutstanding,
			payouts: companyPayouts.reduce((total, payout) => total + toNumber(payout.amount), 0),
			workEntries: companyWork.length,
		};
	});
	const clientMetrics = [...new Map(
		eventRows.map((event) => [event.clientName || "Unspecified", event])
	)].map(([clientName]) => {
		const events = eventRows.filter((event) => (event.clientName || "Unspecified") === clientName);
		const invoices = invoiceRowsWithFinancials.filter((invoice) => invoice.clientName === clientName);
		const companyInvoiceValue = invoices.reduce((total, invoice) => total + toNumber(invoice.grossInvoiceValue), 0);
		const clientReceived = paymentRows.filter((payment) => (payment.clientName || "Unspecified") === clientName).reduce((total, payment) => total + toNumber(payment.amount), 0);
		const clientOutstanding = invoices.reduce((total, invoice) => total + Math.max(toNumber(invoice.outstandingAmount), 0), 0);
		return {
			client: clientName,
			events: events.length,
			invoiceValue: companyInvoiceValue,
			received: clientReceived,
			outstanding: clientOutstanding,
		};
	});
	const financeTrend = enumerateMonths(bounds).map((monthKeyValue) => {
			const monthInvoices = invoiceRowsWithFinancials.filter((invoice) => toMonthKey(invoice.invoiceDate) === monthKeyValue);
			const monthPayments = paymentRows.filter((payment) => toMonthKey(payment.paymentDate) === monthKeyValue);
			return {
				label: formatMonthLabel(monthKeyValue),
				invoiceValue: monthInvoices.reduce((total, invoice) => total + toNumber(invoice.grossInvoiceValue), 0),
				received: monthPayments.reduce((total, payment) => total + toNumber(payment.amount), 0),
				outstanding: monthInvoices.reduce((total, invoice) => total + Math.max(toNumber(invoice.outstandingAmount), 0), 0),
				tds: monthInvoices.reduce((total, invoice) => total + toNumber(invoice.tdsAmount ?? 0), 0),
			};
		});
	const summary = {
		filters: { range: query.range || "this-year", from: query.from || null, to: query.to || null, company: companyFilter || null, status: statusFilter || null },
		kpis: {
		totalEvents: eventCounts.total,
		upcomingEvents: eventCounts.upcoming,
		activeEvents: eventCounts.active,
		completedEvents: eventCounts.completed,
			invoiceValue,
			taxInvoiceValue,
			received,
			outstanding,
			tds,
			payouts,
			workLogged: workHours,
			completedWork,
		},
		events: {
			byStatus: eventTotals,
			byMonth: eventByMonth,
			byCompany: byCompany,
			byCity: byCity,
			byEventType: byEventType,
			trend: eventByMonth,
			rows: eventRows,
		},
		finance: {
			invoiceValue,
			received,
			outstanding,
			tds,
			payouts,
			netPosition: invoiceValue - payouts,
			monthly: financeTrend,
			invoiceVsReceived: financeTrend,
			rows: invoiceRowsWithFinancials,
		},
		payments: {
			totalReceived: received,
			count: paymentRows.length,
			averagePayment: paymentRows.length ? received / paymentRows.length : 0,
			byMonth: paymentSeries,
			byMode: paymentModes,
			rows: paymentRows,
		},
		payouts: {
			totalPayout: payouts,
			pending: payoutRows.filter((row) => !["PAID", "CANCELLED"].includes(String(row.status || "").toUpperCase())).length,
			paid: payoutRows.filter((row) => String(row.status || "").toUpperCase() === "PAID").length,
			cancelled: payoutRows.filter((row) => String(row.status || "").toUpperCase() === "CANCELLED").length,
			byMonth: payoutSeries,
			byCompany: makeSeries(payoutRows.map((row) => ({ label: row.company || row.vendorName || "Unspecified", value: toNumber(row.amount) })), { labelField: "label", valueField: "value" }),
			byMode: payoutModes,
			rows: payoutRows,
		},
		work: {
			totalEntries: workRows.length,
			completed: workRows.filter((row) => ["COMPLETED", "DONE"].includes(String(row.status || "").toUpperCase())).length,
			pending: workRows.filter((row) => !["COMPLETED", "DONE", "IN_PROGRESS", "BLOCKED"].includes(String(row.status || "").toUpperCase())).length,
			inProgress: workRows.filter((row) => String(row.status || "").toUpperCase() === "IN_PROGRESS").length,
			blocked: workRows.filter((row) => String(row.status || "").toUpperCase() === "BLOCKED").length,
			hoursLogged: workHours,
			byCategory: workCategories,
			byCompany: workByCompany,
			byEvent: workByEvent,
			rows: workRows,
		},
		companies: companyMetrics,
		clients: clientMetrics,
		outstandingTable: outstandingRows,
	};
	return summary;
};

const csvEscape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

const exportAnalyticsCsv = async (req, res) => {
	const type = String(req.query.type || "events").toLowerCase();
	if (!["events", "invoices", "payments", "payouts", "work", "outstanding"].includes(type)) throw Object.assign(new Error("Unsupported export type"), { status: 400 });
	const snapshot = await buildAnalyticsSnapshot(req.user._id, req.query);
	let rows = [];
	if (type === "events") {
		rows = snapshot.events.rows.map((event) => ({
			eventName: event.eventName,
			client: event.clientName || event.company,
			company: event.company,
			city: event.city,
			eventType: event.eventType,
			status: event.status,
			eventDate: event.eventDate,
		}));
	} else if (type === "invoices") {
		rows = snapshot.finance.rows.map((invoice) => ({
			invoiceNumber: invoice.invoiceNumber || invoice.taxInvoiceNumber || invoice.piNumber,
			company: invoice.company || invoice.partyName,
			eventId: invoice.eventId,
			invoiceValue: invoice.grossInvoiceValue ?? invoice.totalInvoiceValue ?? invoice.piAmount ?? invoice.amountDue ?? 0,
			received: invoice.amountReceived ?? 0,
			outstanding: invoice.outstandingAmount ?? invoice.balanceAmount ?? 0,
			tds: invoice.tdsAmount ?? 0,
			status: invoice.status,
		}));
	} else if (type === "payments") {
		rows = snapshot.payments.rows.map((payment) => ({
			referenceNumber: payment.referenceNumber,
			amount: payment.amount,
			paymentDate: payment.paymentDate,
			paymentMode: payment.paymentMode,
			eventId: payment.eventId,
		}));
	} else if (type === "payouts") {
		rows = snapshot.payouts.rows.map((payout) => ({
			vendor: payout.vendorName || payout.company,
			company: payout.company,
			amount: payout.amount,
			status: payout.status,
			date: payout.date || payout.paymentDate,
			paymentMode: payout.paymentMode,
		}));
	} else if (type === "work") {
		rows = snapshot.work.rows.map((entry) => ({
			company: entry.company,
			workCategory: entry.workCategory,
			status: entry.status,
			date: entry.date,
			hours: entry.hours ?? entry.duration ?? entry.workHours ?? 0,
			description: entry.workDescription,
		}));
	} else if (type === "outstanding") {
		rows = snapshot.outstandingTable.map((entry) => ({
			eventName: entry.eventName,
			client: entry.client,
			invoice: entry.invoiceNumber,
			invoiceValue: entry.invoiceValue,
			received: entry.received,
			outstanding: entry.outstanding,
			status: entry.status,
			ageDays: entry.ageDays,
		}));
	}
	const headers = rows.length ? Object.keys(rows[0]) : ["empty"];
	const csv = [headers.join(",")]
		.concat(rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")))
		.join("\n");
	res.setHeader("Content-Type", "text/csv; charset=utf-8");
	res.setHeader("Content-Disposition", `attachment; filename=${type}-report.csv`);
	return res.send(csv);
};

const getAnalytics = async (req, res) => {
	const snapshot = await buildAnalyticsSnapshot(req.user._id, req.query);
	return res.json({ message: "success", data: snapshot });
};

module.exports = { getAnalytics, buildAnalyticsSnapshot, exportAnalyticsCsv };
