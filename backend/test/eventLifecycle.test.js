const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "pro-manage-event-test-"));
process.env.TEST_MODE = "true";
process.env.TEST_DATA_FILE = path.join(testDirectory, "test-data.json");

const store = require("../config/testStore");
store.initializeTestStore();
const eventRouter = require("../controllers/events");
const finance = require("../controllers/finance");
const financial = require("../controllers/financial");
const operations = require("../controllers/operations");
const { buildAnalyticsSnapshot } = require("../controllers/analytics");
const { summary: dashboardSummary } = require("../controllers/dashboard");

const user = { _id: "event-lifecycle-test-user" };
const invoke = async (handler, req) => {
	const res = {
		code: 200,
		body: null,
		status(code) { this.code = code; return this; },
		json(body) { this.body = body; return this; },
		sendFile(file) { this.file = file; return this; },
	};
	await handler({ user, body: {}, params: {}, query: {}, ...req }, res);
	return res;
};

test("Event lifecycle keeps all related records through History and a store restart", async (t) => {
	t.after(() => fs.rmSync(testDirectory, { recursive: true, force: true }));

	const eventResponse = await invoke(eventRouter.handlers.create, { body: { eventName: "Event A", clientName: "Client A", company: "Company A", eventType: "Corporate", eventDate: "2027-05-20", city: "Delhi", status: "UPCOMING" } });
	assert.equal(eventResponse.code, 201);
	const event = eventResponse.body.data;
	assert.ok(event._id);
	assert.equal(event.status, "UPCOMING");
	const overpostedPI = await invoke(finance.handlers("proforma").create, { body: { company: "Company A", partyName: "Client A", piNumber: "PI-FORGED", piDate: "2027-05-01", taxableValue: 100000, cgst: 9000, sgst: 9000, igst: 0, tdsRate: 1, createdBy: "other-user" } });
	assert.equal(overpostedPI.code, 400);

	const piResponse = await invoke(finance.handlers("proforma").create, { body: { eventId: event._id, company: "Company A", partyName: "Client A", piNumber: "PI-A", piDate: "2027-05-01", taxableValue: 100000, cgst: 9000, sgst: 9000, igst: 0, tdsRate: 1 } });
	assert.equal(piResponse.code, 201);
	const pi = piResponse.body.data;

	const convertResponse = await invoke(financial.convert, { params: { id: pi._id }, body: { invoiceNumber: "TI-A", invoiceDate: "2027-05-10" } });
	assert.equal(convertResponse.code, 201, JSON.stringify(convertResponse.body));
	const taxInvoice = convertResponse.body.data;
	assert.equal(taxInvoice.proformaInvoiceId, pi._id);
	assert.equal(taxInvoice.eventId, event._id);

	const paymentResponse = await invoke(financial.paymentCreate, { body: { amount: 30000, paymentDate: "2027-05-15", paymentMode: "BANK_TRANSFER", proformaInvoiceId: pi._id, taxInvoiceId: taxInvoice._id, eventId: event._id } });
	assert.equal(paymentResponse.code, 201);

	const payoutResponse = await invoke(finance.handlers("payouts").create, { body: { eventId: event._id, company: "Company A", date: "2027-05-15", vendorName: "Vendor A", amount: 10000, purpose: "Production", paymentMode: "BANK_TRANSFER", status: "PAID" } });
	assert.equal(payoutResponse.code, 201);
	assert.equal(payoutResponse.body.data.status, "PENDING", "client cannot create an already-paid payout");
	const workResponse = await invoke(finance.handlers("work").create, { body: { eventId: event._id, date: "2027-05-15", company: "Company A", workCategory: "Sales Invoice", workDescription: "Created sales invoice", priority: "HIGH", status: "Completed" } });
	assert.equal(workResponse.code, 201);

	const analytics = await buildAnalyticsSnapshot(user._id, { range: "custom", from: "2027-05-01", to: "2027-05-31" });
	assert.equal(analytics.kpis.totalEvents, 1);
	assert.equal(analytics.kpis.upcomingEvents, 1);
	assert.equal(analytics.kpis.invoiceValue, 118000);
	assert.equal(analytics.kpis.received, 30000);
	assert.equal(analytics.kpis.outstanding, 87000);
	assert.equal(analytics.kpis.payouts, 10000);
	assert.equal(analytics.work.totalEntries, 1);
	const dashboardResponse = await invoke(dashboardSummary, {});
	assert.equal(dashboardResponse.body.data.kpis.upcomingEvents, 1);
	assert.equal(dashboardResponse.body.data.kpis.totalReceived, 30000);
	assert.equal(dashboardResponse.body.data.kpis.totalOutstanding, 87000);

	const filePath = path.join(testDirectory, "event-document.pdf");
	fs.writeFileSync(filePath, "%PDF-1.7\nfixture");
	const documentResponse = await invoke(operations.documentCreate, { body: { eventId: event._id, relatedEntityType: "EVENT", relatedEntityId: event._id, documentType: "CONTRACT" }, file: { path: filePath, originalname: "contract.pdf", mimetype: "application/pdf", size: 7 } });
	assert.equal(documentResponse.code, 201);

	const ongoingResponse = await invoke(eventRouter.handlers.changeStatus, { params: { id: event._id }, body: { status: "ONGOING" } });
	assert.equal(ongoingResponse.body.data.status, "ONGOING");
	assert.ok(ongoingResponse.body.data.startedAt);
	const [completedResponse, concurrentCompletion] = await Promise.all([
		invoke(eventRouter.handlers.changeStatus, { params: { id: event._id }, body: { status: "COMPLETED" } }),
		invoke(eventRouter.handlers.changeStatus, { params: { id: event._id }, body: { status: "COMPLETED" } }),
	]);
	assert.equal(completedResponse.body.data.status, "COMPLETED");
	assert.ok(completedResponse.body.data.completedAt);
	assert.ok(completedResponse.body.data.completionWarnings.length);
	assert.equal(concurrentCompletion.code, 409);
	const invalidReopen = await invoke(eventRouter.handlers.changeStatus, { params: { id: event._id }, body: { status: "UPCOMING" } });
	assert.equal(invalidReopen.code, 409);
	const archivedResponse = await invoke(eventRouter.handlers.changeStatus, { params: { id: event._id }, body: { status: "ARCHIVED" } });
	assert.equal(archivedResponse.body.data.status, "ARCHIVED");
	assert.ok(archivedResponse.body.data.archivedAt);
	const deleteResponse = await invoke(finance.handlers("events").remove, { params: { id: event._id } });
	assert.equal(deleteResponse.code, 409);

	const detailResponse = await invoke(eventRouter.handlers.detail, { params: { id: event._id } });
	assert.equal(detailResponse.code, 200);
	assert.equal((await invoke(eventRouter.handlers.detail, { user: { _id: "another-user" }, params: { id: event._id } })).code, 404);
	assert.equal((await invoke(finance.handlers("proforma").get, { user: { _id: "another-user" }, params: { id: pi._id } })).code, 404);
	assert.equal((await invoke(require("../controllers/financial").paymentGet, { user: { _id: "another-user" }, params: { id: paymentResponse.body.data._id } })).code, 404);
	assert.equal((await invoke(require("../controllers/financial").taxInvoiceGet, { user: { _id: "another-user" }, params: { id: taxInvoice._id } })).code, 404);
	assert.equal((await invoke(finance.handlers("payouts").get, { user: { _id: "another-user" }, params: { id: payoutResponse.body.data._id } })).code, 404);
	assert.equal((await invoke(finance.handlers("work").get, { user: { _id: "another-user" }, params: { id: workResponse.body.data._id } })).code, 404);
	assert.equal((await invoke(operations.documentGet, { user: { _id: "another-user" }, params: { id: documentResponse.body.data._id } })).code, 404);
	const summaryResponse = await invoke(eventRouter.handlers.financialSummary, { params: { id: event._id } });
	assert.equal(summaryResponse.body.data.totalTaxInvoiceValue, 118000);
	assert.equal(summaryResponse.body.data.totalReceived, 30000);
	assert.equal(summaryResponse.body.data.totalOutstanding, 87000);
	assert.equal(summaryResponse.body.data.totalPayout, 10000);
	const historyResponse = await invoke(eventRouter.handlers.list, { query: { status: "ARCHIVED" } });
	assert.ok(historyResponse.body.data.some((item) => item._id === event._id));
	assert.equal(historyResponse.body.data.find((item) => item._id === event._id).createdAt, event.createdAt);
	for (const key of ["proformaInvoices", "taxInvoices", "payments", "payouts", "workLogs", "documents", "activities"]) assert.ok(detailResponse.body.data[key].length, `${key} should remain linked`);
	assert.equal(detailResponse.body.data.proformaInvoices[0].eventId, event._id);
	assert.equal(detailResponse.body.data.taxInvoices[0].proformaInvoiceId, pi._id);

	const restart = spawnSync(process.execPath, ["-e", "const s=require('./config/testStore'); console.log(JSON.stringify({events:s.findRecords('events').length,pis:s.findRecords('proforma').length,taxInvoices:s.findRecords('taxInvoices').length,payments:s.findRecords('payments').length,payouts:s.findRecords('payouts').length,work:s.findRecords('work').length,documents:s.findRecords('documents').length,activities:s.findRecords('activities').length,event:s.findRecordById('events',process.argv[1]).data.status}));", event._id], { cwd: path.join(__dirname, ".."), env: { ...process.env }, encoding: "utf8" });
	assert.equal(restart.status, 0, restart.stderr);
	const persisted = JSON.parse(restart.stdout.trim());
	assert.deepEqual(persisted, { events: 1, pis: 1, taxInvoices: 1, payments: 1, payouts: 1, work: 1, documents: 1, activities: 10, event: "ARCHIVED" });
});
