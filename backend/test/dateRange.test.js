const test = require("node:test");
const assert = require("node:assert/strict");
const { getDateRange, isDateInRange, getMonthKey, enumerateMonths } = require("../services/dateRange");
const { buildInvoiceRows } = require("../services/invoiceAggregation");

test("This Year includes the full calendar year while Year to Date ends today", () => {
	const now = new Date("2026-09-30T12:00:00.000Z");
	const year = getDateRange({ range: "this-year" }, now);
	const ytd = getDateRange({ range: "year-to-date" }, now);
	assert.deepEqual([year.startDate, year.endDate], ["2026-01-01", "2026-12-31"]);
	assert.deepEqual([ytd.startDate, ytd.endDate], ["2026-01-01", "2026-09-30"]);
	assert.equal(isDateInRange("2026-10-07", year), true);
	assert.equal(isDateInRange("2026-10-07", ytd), false);
	assert.equal(enumerateMonths(year).length, 12);
});

test("business timestamp boundaries group in India local dates", () => {
	assert.equal(getMonthKey("2026-09-30T18:29:59.999Z"), "2026-09");
	assert.equal(getMonthKey("2026-09-30T18:30:00.000Z"), "2026-10");
	assert.equal(isDateInRange("2026-09-30", getDateRange({ range: "custom", from: "2026-09-01", to: "2026-09-30" })), true);
	assert.equal(isDateInRange("2026-10-01", getDateRange({ range: "custom", from: "2026-10-01", to: "2026-10-31" })), true);
});

test("custom ranges reject missing, malformed, impossible, and reversed dates", () => {
	assert.throws(() => getDateRange({ range: "custom", from: "2026-09-01" }), /both from and to/);
	assert.throws(() => getDateRange({ range: "custom", from: "2026-02-30", to: "2026-03-01" }), /valid calendar date/);
	assert.throws(() => getDateRange({ range: "custom", from: "2026-10-01", to: "2026-09-30" }), /on or before/);
});

test("a converted PI and Tax Invoice remain one invoice using the Tax Invoice date", () => {
	const rows = buildInvoiceRows({
		proformas: [{ _id: "pi-1", data: { taxableValue: 100000, cgst: 9000, sgst: 9000, igst: 0, tdsRate: 1, piDate: "2026-09-25", taxInvoiceId: "ti-1", company: "Company A" } }],
		taxInvoices: [{ _id: "ti-1", data: { proformaInvoiceId: "pi-1", invoiceDate: "2026-10-01", invoiceNumber: "TI-1" } }],
		payments: [{ _id: "pay-1", data: { proformaInvoiceId: "pi-1", taxInvoiceId: "ti-1", paymentDate: "2026-10-02", amount: 40000 } }],
	});
	assert.equal(rows.length, 1);
	assert.equal(rows[0].invoiceDate, "2026-10-01");
	assert.equal(rows[0].grossInvoiceValue, 118000);
	assert.equal(rows[0].amountReceived, 40000);
	assert.equal(rows[0].outstandingAmount, 77000);
});
