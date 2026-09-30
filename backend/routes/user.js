const express = require("express");
const router = express.Router();
const userControllers = require("../controllers/user");
const wrapAsync = require("../middlewares/wrapAsync");
const { authorization } = require("../middlewares/authorization");
const { accountLimiter } = require("../middlewares/rateLimiters");

router.get("/profile", authorization, wrapAsync(userControllers.getAuthUser));
router.put("/update", authorization, accountLimiter, wrapAsync(userControllers.updateUser));
router.get("/users", authorization, wrapAsync(userControllers.getAllUsers));
router.post("/board", authorization, wrapAsync(userControllers.updateBoard));

module.exports = router;
