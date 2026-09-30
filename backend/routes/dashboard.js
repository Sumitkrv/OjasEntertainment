const express = require("express");
const { authorization } = require("../middlewares/authorization");
const { summary, search } = require("../controllers/dashboard");
const router = express.Router();
router.get("/summary", authorization, summary);
router.get("/search", authorization, search);
module.exports = router;
