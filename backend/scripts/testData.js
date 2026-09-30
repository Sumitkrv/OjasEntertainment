const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

if (process.env.TEST_MODE !== "true" || process.env.NODE_ENV === "production") {
	console.error("Refusing test data operation: run this command only with TEST_MODE=true outside production.");
	process.exit(1);
}

const dataFile = path.join(__dirname, "..", "data", "demo-test-data.json");
const uploadRoot = path.resolve(__dirname, "..", "uploads", "documents");

const removeDemoData = () => {
	if (!fs.existsSync(dataFile)) return;
	const previous = JSON.parse(fs.readFileSync(dataFile, "utf8"));
	for (const record of previous.documents || []) {
		const stored = record.data?.storagePath;
		if (!stored) continue;
		const relative = path.relative(uploadRoot, path.resolve(stored));
		if (relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) {
			fs.rmSync(path.resolve(stored), { force: true });
		}
	}
	fs.rmSync(dataFile, { force: true });
};

if (process.argv[2] === "reset") {
	removeDemoData();
	console.log("Dedicated TEST_MODE demo data reset complete.");
	process.exit(0);
}
if (process.argv[2] !== "seed") {
	console.error("Usage: node scripts/testData.js <seed|reset>");
	process.exit(2);
}

if (fs.existsSync(dataFile)) {
	const existing = JSON.parse(fs.readFileSync(dataFile, "utf8"));
	if (existing.users?.some((user) => user.email === "demo@example.com")) {
		const counts = Object.fromEntries(["users", "events", "proforma", "taxInvoices", "payments", "payouts", "work", "documents", "activities"].map((type) => [type, (existing[type] || []).length]));
		console.log(JSON.stringify({ source: path.basename(dataFile), alreadySeeded: true, counts, message: "Existing demo data preserved. Run reset:test explicitly before rebuilding it." }, null, 2));
		process.exit(0);
	}
	throw new Error("An unrecognized file exists at the dedicated demo data path; inspect it or run reset:test explicitly.");
}

process.env.TEST_DATA_FILE = dataFile;
process.env.FRONTEND_URL ||= "http://localhost:5173";
process.env.JWT_SECRET ||= "local-test-only-secret-not-for-production";

const store = require("../config/testStore");
store.initializeTestStore();
const invoke = async (handler, req = {}) => {
	const res = {
		statusCode: 200,
		body: null,
		status(code) { this.statusCode = code; return this; },
		json(body) { this.body = body; return this; },
	};
	await handler({ user, body: {}, params: {}, query: {}, ...req }, res);
	if (res.statusCode >= 400) throw new Error(`Seed operation failed (${res.statusCode}): ${res.body?.message || "unknown error"}`);
	return res.body?.data;
};

const today = new Date().toISOString().slice(0, 10);
const shiftDate = (days) => {
	const date = new Date(`${today}T12:00:00Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
};

let user;
const run = async () => {
	const auth = require("../controllers/auth");
	await invoke(auth.registerUser, { body: { name: "Demo User", email: "demo@example.com", password: "Demo@12345" } });
	user = store.findUserByEmail("demo@example.com");
	const eventsController = require("../controllers/events");
	const finance = require("../controllers/finance");
	const financial = require("../controllers/financial");
	const operations = require("../controllers/operations");
	const events = [];
	const eventFixtures = [
		["Delhi Corporate Event", "Delhi", shiftDate(45), "UPCOMING"],
		["Gurgaon Brand Launch", "Gurgaon", today, "ONGOING"],
		["Mumbai Music Event", "Mumbai", shiftDate(-20), "COMPLETED"],
		["Jaipur Corporate Show", "Jaipur", shiftDate(-90), "ARCHIVED"],
		["Noida Private Event", "Noida", shiftDate(12), "DRAFT"],
	];
	for (const [eventName, city, eventDate, targetStatus] of eventFixtures) {
		const created = await invoke(eventsController.handlers.create, { body: { eventName, clientName: `${city} Demo Client`, company: "Ojas Entertainment Services", eventDate, city, venue: `${city} Convention Centre`, eventType: "Corporate", priority: "MEDIUM", status: targetStatus === "UPCOMING" ? "UPCOMING" : "DRAFT" } });
		let event = created;
		const transitions = { DRAFT: ["UPCOMING"], UPCOMING: ["ONGOING"], ONGOING: ["COMPLETED"], COMPLETED: ["ARCHIVED"] };
		while (event.status !== targetStatus) {
			const next = transitions[event.status]?.[0];
			if (!next) throw new Error(`Cannot transition demo Event from ${event.status} to ${targetStatus}`);
			event = await invoke(eventsController.handlers.changeStatus, { params: { id: event._id }, body: { status: next } });
		}
		events.push(event);
	}

	const piInputs = [
		{ eventId: events[0]._id, company: "Ojas Entertainment Services", partyName: "Delhi Demo Client", piNumber: "DEMO-PI-001", piDate: today, taxableValue: 100000, cgst: 9000, sgst: 9000, igst: 0, tdsRate: 1 },
		{ eventId: events[1]._id, company: "OES Entertainment Private Limited", partyName: "Gurgaon Demo Client", piNumber: "DEMO-PI-002", piDate: today, taxableValue: 200000, cgst: 18000, sgst: 18000, igst: 0, tdsRate: 1 },
		{ eventId: events[2]._id, company: "Ojas Entertainment Services", partyName: "Mumbai Demo Client", piNumber: "DEMO-PI-003", piDate: today, taxableValue: 150000, cgst: 13500, sgst: 13500, igst: 0, tdsRate: 2 },
		{ eventId: events[3]._id, company: "OES Entertainment Private Limited", partyName: "Jaipur Demo Client", piNumber: "DEMO-PI-004", piDate: today, taxableValue: 75000, cgst: 6750, sgst: 6750, igst: 0, tdsRate: 1 },
		{ eventId: events[4]._id, company: "Ojas Entertainment Services", partyName: "Noida Demo Client", piNumber: "DEMO-PI-005", piDate: shiftDate(-35), taxableValue: 50000, cgst: 4500, sgst: 4500, igst: 0, tdsRate: 1 },
	];
	const pis = [];
	for (const input of piInputs) pis.push(await invoke(finance.handlers("proforma").create, { body: input }));

	const paymentController = financial.paymentCreate;
	const payment = (pi, amount, referenceNumber) => invoke(paymentController, { body: { proformaInvoiceId: pi._id, amount, paymentDate: today, paymentMode: "BANK_TRANSFER", referenceNumber } });
	await payment(pis[1], 20000, "DEMO-PAY-002-A");
	await payment(pis[1], 30000, "DEMO-PAY-002-B");
	await payment(pis[2], 174000, "DEMO-PAY-003-FULL");
	await payment(pis[3], 90000, "DEMO-PAY-004-OVER");

	const converted = [];
	for (const index of [1, 2]) converted.push(await invoke(financial.convert, { params: { id: pis[index]._id }, body: { invoiceNumber: `DEMO-TI-00${index + 1}`, invoiceDate: today } }));

	const payoutFixtures = [
		{ eventId: events[1]._id, company: "OES Entertainment Private Limited", date: today, vendorName: "Demo Soundworks", amount: 25000, purpose: "Audio equipment rental", paymentMode: "BANK_TRANSFER", status: "PENDING" },
		{ eventId: events[2]._id, company: "Ojas Entertainment Services", date: shiftDate(-10), vendorName: "Demo Venue Services", amount: 18000, purpose: "Venue deposit", paymentMode: "UPI", status: "PAID" },
		{ eventId: events[3]._id, company: "Ojas Entertainment Services", date: shiftDate(-80), vendorName: "Demo Print House", amount: 8500, purpose: "Event signage", paymentMode: "CHEQUE", chequeNumber: "DEMO-CHQ-1001", chequeDate: today, status: "PENDING" },
	];
	const payouts = [];
	for (const payout of payoutFixtures) payouts.push(await invoke(finance.handlers("payouts").create, { body: payout }));
	await invoke(finance.handlers("payouts").update, { params: { id: payouts[1]._id }, body: { status: "PAID" } });

	const workFixtures = [
		{ eventId: events[0]._id, date: today, company: "OES Entertainment Private Limited", workCategory: "Sales Invoice", workDescription: "Prepare client sales invoice", priority: "HIGH", status: "PENDING", startTime: "09:00", endTime: "10:15", remarks: "Demo follow-up" },
		{ eventId: events[1]._id, date: today, company: "Ojas Entertainment Services", workCategory: "Payout", workDescription: "Confirm vendor transfer", priority: "MEDIUM", status: "IN_PROGRESS", startTime: "11:00", endTime: "11:30", remarks: "Demo vendor" },
		{ eventId: events[2]._id, date: shiftDate(-20), company: "Ojas Entertainment Services", workCategory: "GST", workDescription: "Review event GST documentation", priority: "LOW", status: "COMPLETED", startTime: "14:00", endTime: "15:00", remarks: "Completed demo task" },
		{ eventId: events[3]._id, date: shiftDate(-75), company: "OES Entertainment Private Limited", workCategory: "Payment Follow-up", workDescription: "Reconcile archived event payment", priority: "HIGH", status: "BLOCKED", remarks: "Awaiting demo remittance" },
		{ eventId: events[4]._id, date: shiftDate(1), company: "Ojas Entertainment Services", workCategory: "Client Coordination", workDescription: "Confirm Noida event schedule", priority: "MEDIUM", status: "PENDING", remarks: "Future demo work" },
	];
	for (const work of workFixtures) await invoke(finance.handlers("work").create, { body: work });

	// Create one harmless PDF through the same document controller validation and storage path.
	const documentDirectory = uploadRoot;
	fs.mkdirSync(documentDirectory, { recursive: true });
	const documentPath = path.join(documentDirectory, `demo-event-document-${randomUUID()}.pdf`);
	const pdf = Buffer.from("%PDF-1.4\n% TEST DATA ONLY\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
	fs.writeFileSync(documentPath, pdf);
	await invoke(operations.documentCreate, { body: { eventId: events[1]._id, relatedEntityType: "EVENT", relatedEntityId: events[1]._id, documentType: "EVENT_DOCUMENT" }, file: { path: documentPath, originalname: "demo-event-document.pdf", mimetype: "application/pdf", size: pdf.length } });

	const counts = Object.fromEntries(["users", "events", "proforma", "taxInvoices", "payments", "payouts", "work", "documents", "activities"].map((type) => [type, type === "users" ? store.findUsers().length : store.findRecords(type).length]));
	console.log(JSON.stringify({ source: path.basename(dataFile), login: { email: "demo@example.com", password: "Demo@12345" }, counts }, null, 2));
};

run().catch((error) => {
	removeDemoData();
	console.error(`Test data seed failed: ${error.message}`);
	process.exitCode = 1;
});
