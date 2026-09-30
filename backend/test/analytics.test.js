const test = require('node:test');
const assert = require('node:assert/strict');

process.env.TEST_MODE = 'true';
const { initializeTestStore } = require('../config/testStore');
const { getAnalytics, buildAnalyticsSnapshot, exportAnalyticsCsv } = require('../controllers/analytics');

initializeTestStore();

test('analytics aggregates the real event and finance data for the signed-in user', async () => {
  const req = {
    user: { _id: 'test-user-default', email: 'test@example.com' },
    query: { range: 'this-year' },
  };

  let responsePayload;
  const res = {
    status(code) {
      this.code = code;
      return this;
    },
    json(payload) {
      responsePayload = payload;
      return this;
    },
    send(payload) {
      responsePayload = payload;
      return this;
    },
  };

  await getAnalytics(req, res);

  assert.ok(responsePayload && responsePayload.data, 'analytics response should contain data');
  assert.equal(responsePayload.data.kpis.totalEvents, 3, 'three seeded events should be counted');
  assert.equal(responsePayload.data.kpis.invoiceValue, 118000, 'invoice total should match the real finance data');
  assert.equal(responsePayload.data.kpis.received, 117000, 'received total should match real payments');
  assert.equal(responsePayload.data.kpis.outstanding, 0, 'outstanding should reflect the real invoice state');
  assert.equal(responsePayload.data.kpis.tds, 1000, 'TDS should come from the actual invoice data');
  assert.equal(responsePayload.data.kpis.payouts, 0, 'payout total should stay at zero when none exist');
});

test('analytics validates event status and safely returns empty data for an unknown company', async () => {
  await assert.rejects(() => buildAnalyticsSnapshot('test-user-default', { range: 'this-year', status: 'IN_PROGRESS' }), /Unsupported event status/);
  const snapshot = await buildAnalyticsSnapshot('test-user-default', { range: 'this-year', company: 'missing-company' });
  assert.equal(snapshot.kpis.totalEvents, 0);
  assert.equal(snapshot.kpis.invoiceValue, 0);
});

test('CSV export applies the same range and row set as the analytics snapshot', async () => {
  const query = { range: 'this-year' };
  const snapshot = await buildAnalyticsSnapshot('test-user-default', query);
  let csv;
  const res = { setHeader() {}, send(value) { csv = value; return this; } };
  await exportAnalyticsCsv({ user: { _id: 'test-user-default' }, query: { ...query, type: 'events' } }, res);
  assert.equal(csv.trim().split('\n').length - 1, snapshot.events.rows.length);
});
