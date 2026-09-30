const express = require("express");
const { authorization } = require("../middlewares/authorization");
const { upload, documents, eventDocuments, documentGet, documentFile, documentCreate, documentDelete, activities } = require("../controllers/operations");
const wrapAsync = require("../middlewares/wrapAsync");
const { uploadLimiter } = require("../middlewares/rateLimiters");

const router = express.Router();
router.get("/documents", authorization, wrapAsync(documents));
router.get("/documents/:id/file", authorization, wrapAsync(documentFile));
router.get("/documents/:id", authorization, wrapAsync(documentGet));
router.post("/documents", authorization, uploadLimiter, upload.single("file"), wrapAsync(documentCreate));
router.delete("/documents/:id", authorization, wrapAsync(documentDelete));
router.get("/events/:id/documents", authorization, wrapAsync(eventDocuments));
router.get("/events/:id/documents/:type", authorization, wrapAsync(eventDocuments));
router.get("/events/:id/activities", authorization, wrapAsync(activities));
module.exports = router;
