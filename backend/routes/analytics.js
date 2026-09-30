const express = require("express");
const router = express.Router();
const { getAnalytics, exportAnalyticsCsv } = require("../controllers/analytics");
const wrapAsync = require("../middlewares/wrapAsync");
const { authorization } = require("../middlewares/authorization");

router.get("/", authorization, wrapAsync(getAnalytics));
router.get("/overview", authorization, wrapAsync(getAnalytics));
router.get("/events", authorization, wrapAsync(async (req, res) => {
	const { buildAnalyticsSnapshot } = require("../controllers/analytics");
	const snapshot = await buildAnalyticsSnapshot(req.user._id, req.query);
	res.json({ message: "success", data: snapshot.events });
}));
router.get("/finance", authorization, wrapAsync(async (req, res) => {
	const { buildAnalyticsSnapshot } = require("../controllers/analytics");
	const snapshot = await buildAnalyticsSnapshot(req.user._id, req.query);
	res.json({ message: "success", data: snapshot.finance });
}));
router.get("/payments", authorization, wrapAsync(async (req, res) => {
	const { buildAnalyticsSnapshot } = require("../controllers/analytics");
	const snapshot = await buildAnalyticsSnapshot(req.user._id, req.query);
	res.json({ message: "success", data: snapshot.payments });
}));
router.get("/payouts", authorization, wrapAsync(async (req, res) => {
	const { buildAnalyticsSnapshot } = require("../controllers/analytics");
	const snapshot = await buildAnalyticsSnapshot(req.user._id, req.query);
	res.json({ message: "success", data: snapshot.payouts });
}));
router.get("/work", authorization, wrapAsync(async (req, res) => {
	const { buildAnalyticsSnapshot } = require("../controllers/analytics");
	const snapshot = await buildAnalyticsSnapshot(req.user._id, req.query);
	res.json({ message: "success", data: snapshot.work });
}));
router.get("/companies", authorization, wrapAsync(async (req, res) => {
	const { buildAnalyticsSnapshot } = require("../controllers/analytics");
	const snapshot = await buildAnalyticsSnapshot(req.user._id, req.query);
	res.json({ message: "success", data: snapshot.companies });
}));
router.get("/export", authorization, wrapAsync(exportAnalyticsCsv));

module.exports = router;
