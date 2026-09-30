const test = require("node:test");
const assert = require("node:assert/strict");

process.env.TEST_MODE = "true";

const { calculateInvoice, sumPayments } = require("../services/financial");
const { initializeTestStore } = require("../config/testStore");
const { checkFinancialIntegrity } = require("../services/financialIntegrity");
const { buildAnalyticsSnapshot } = require("../controllers/analytics");
const { summary: dashboardSummary } = require("../controllers/dashboard");
const { convert } = require("../controllers/financial");
const { findRecords } = require("../config/testStore");
const eventRouter = require("../controllers/events");

initializeTestStore();

const invoice = {
	taxableValue: 100000,
	cgst: 9000,
	sgst: 9000,
	igst: 0,
	tdsRate: 1,
};

test("calculates GST, TDS, and valid payment states consistently", () => {
	assert.equal(calculateInvoice(invoice, { received: 0 }).gstAmount, 18000);
	assert.equal(calculateInvoice(invoice, { received: 0 }).grossInvoiceValue, 118000);
	assert.deepEqual(
		[0, 40000, 100000, 120000].map((received) => {
			const result = calculateInvoice(invoice, { received });
			return [result.outstandingAmount, result.overpaymentAmount, result.status];
		}),
		[
			[117000, 0, "UNPAID"],
			[77000, 0, "PARTIALLY_PAID"],
			[17000, 0, "PARTIALLY_PAID"],
			[0, 3000, "OVERPAID"],
		]
	);
});

test("flat ₹100,000 payable reconciles unpaid, partial, paid, and overpaid states", () => {
	const payable = { taxableValue: 100000, tdsRate: 0 };
	assert.deepEqual([0, 40000, 100000, 120000].map((received) => {
		const values = calculateInvoice(payable, { received });
		return [values.outstandingAmount, values.overpaymentAmount];
	}), [[100000, 0], [60000, 0], [0, 0], [0, 20000]]);
});

test("rejects inconsistent and invalid monetary input", () => {
	assert.throws(() => calculateInvoice({ ...invoice, piAmount: 8 }), /piAmount must equal/);
	assert.throws(() => calculateInvoice({ ...invoice, grossInvoiceValue: 8 }), /grossInvoiceValue must equal/);
	assert.throws(() => calculateInvoice({ ...invoice, taxableValue: -1 }), /taxableValue must be non-negative/);
	assert.throws(() => calculateInvoice({ ...invoice, cgst: "abc" }), /cgst must be a valid number/);
	assert.throws(() => calculateInvoice({ ...invoice, sgst: Infinity }), /sgst must be a valid number/);
	assert.throws(() => calculateInvoice({ ...invoice, tdsAmount: 10 }), /tdsAmount must equal/);
});

test("payment aggregation ignores cancelled records and avoids client totals", () => {
	const payments = [
		{ _id: "p1", proformaInvoiceId: "pi1", amount: 30000 },
		{ _id: "p2", data: { proformaInvoiceId: "pi1", amount: 40000, status: "CANCELLED" } },
		{ _id: "p3", data: { proformaInvoiceId: "pi1", amount: 40000 } },
	];
	assert.equal(sumPayments(payments, "pi1"), 70000);
	const result = calculateInvoice(invoice, { received: sumPayments(payments, "pi1") });
	assert.equal(result.amountReceived, 70000);
	assert.equal(result.outstandingAmount, 47000);
});

test("integrity checker reports the existing invalid seeded PI without changing it", async () => {
	const report = await checkFinancialIntegrity("test-user-6f5f5fb7-7f32-4444-99fc-50d8f3c126b5");
	assert.equal(report.valid, false);
	assert.ok(report.issues.some((issue) => issue.field === "financialData"));
});

test("conversion rejects an already converted PI without creating a duplicate invoice", async () => {
	const before = findRecords("taxInvoices").length;
	let responseStatus = 200;
	let responseBody;
	const res = { status(code) { responseStatus = code; return this; }, json(body) { responseBody = body; return this; } };
	await convert({ user: { _id: "test-user-default" }, params: { id: "test-proforma-e1ecde0e-0c55-4751-8af9-e056339d08b1" }, body: {} }, res);
	assert.equal(responseStatus, 409);
	assert.match(responseBody.message, /already been converted/i);
	assert.equal(findRecords("taxInvoices").length, before);
});

test("conversion returns not found for an unknown PI", async () => {
	let responseStatus = 200;
	const res = { status(code) { responseStatus = code; return this; }, json() { return this; } };
	await convert({ user: { _id: "test-user-default" }, params: { id: "missing-pi" }, body: {} }, res);
	assert.equal(responseStatus, 404);
});

test("Event lifecycle rejects skipped transitions and makes same-status requests idempotent", async () => {
	const eventId = "evt-624458ae-bdd9-415e-8272-54fff64173cc";
	const activityCount = findRecords("activities").length;
	const makeResponse = () => { let status = 200; let body; return { status(code) { status = code; return this; }, json(value) { body = value; return this; }, result: () => ({ status, body }) }; };
	const invalidResponse = makeResponse();
	await eventRouter.handlers.changeStatus({ user: { _id: "test-user-default" }, params: { id: eventId }, body: { status: "COMPLETED" } }, invalidResponse);
	assert.equal(invalidResponse.result().status, 409);
	const sameResponse = makeResponse();
	await eventRouter.handlers.changeStatus({ user: { _id: "test-user-default" }, params: { id: eventId }, body: { status: "DRAFT" } }, sameResponse);
	assert.equal(sameResponse.result().status, 200);
	assert.equal(findRecords("activities").length, activityCount);
});

test("dashboard and analytics reconcile received and outstanding totals", async () => {
	const user = { _id: "test-user-default", email: "test@example.com" };
	const analytics = await buildAnalyticsSnapshot(user._id, { range: "this-year" });
	let dashboard;
	await dashboardSummary({ user }, { json(payload) { dashboard = payload.data; return this; }, status() { return this; } });
	assert.equal(analytics.kpis.received, dashboard.kpis.totalReceived);
	assert.equal(analytics.kpis.outstanding, dashboard.kpis.totalOutstanding);
	assert.equal(analytics.kpis.received, 117000);
	assert.equal(analytics.kpis.outstanding, 0);
});
