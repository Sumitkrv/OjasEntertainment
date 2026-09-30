const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const multer = require("multer");
const FinanceRecord = require("../models/financeRecord");
const { addRecord, findRecords, findRecordById, updateRecord, deleteRecord, createId } = require("../config/testStore");
const { isAllowedUpload } = require("../services/uploadValidation");
const { isSafeRecordId } = require("../services/recordId");
const { saveUpload, removeUpload, sendUpload } = require("../services/fileStorage");

const isTestMode = process.env.TEST_MODE === "true";
const uploadDir = path.join(__dirname, "..", "uploads", "documents");
if (isTestMode) fs.mkdirSync(uploadDir, { recursive: true });
const storage = isTestMode ? multer.diskStorage({
	destination: (_req, _file, callback) => callback(null, uploadDir),
	filename: (_req, file, callback) => callback(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
}) : multer.memoryStorage();
const upload = multer({
	storage,
	limits: { fileSize: isTestMode ? 10 * 1024 * 1024 : 4 * 1024 * 1024 },
	fileFilter: (_req, file, callback) => {
		const extension = path.extname(file.originalname).toLowerCase();
		const allowed = (file.mimetype === "application/pdf" && extension === ".pdf") || (file.mimetype === "image/jpeg" && [".jpg", ".jpeg"].includes(extension)) || (file.mimetype === "image/png" && extension === ".png") || (file.mimetype === "image/webp" && extension === ".webp");
		return callback(null, allowed);
	},
});
const owns = (record, userId) => record?.userId === userId;
const isStoredFile = (filePath) => {
	if (!filePath) return false;
	const resolved = path.resolve(filePath);
	const relative = path.relative(uploadDir, resolved);
	return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
};
const serialize = (record) => record?.data ? { _id: record._id, ...record.data, url: `/api/documents/${record._id}/file` } : record;
const get = async (type, id, userId) => {
	if (!isSafeRecordId(id, isTestMode)) return null;
	return isTestMode ? (owns(findRecordById(type, id), userId) ? findRecordById(type, id) : null) : FinanceRecord.findOne({ _id: id, type, userId });
};
const list = async (type, userId) => isTestMode ? findRecords(type).filter((record) => owns(record, userId)) : FinanceRecord.find({ type, userId });
const save = async (type, record) => {
	if (isTestMode) return addRecord(type, record);
	const saved = await new FinanceRecord({ type, userId: record.userId, data: record.data }).save();
	return { _id: saved._id.toString(), userId: record.userId, data: saved.data };
};
const activity = async (eventId, userId, action, description, entityType, entityId) => save("activities", { _id: createId("activity"), userId, data: { eventId, action, description, entityType, entityId, performedBy: userId, createdAt: new Date().toISOString() } });
const eventExists = async (id, userId) => Boolean(await get("events", id, userId));
const relatedExists = async (type, id, userId) => Boolean(await get(type, id, userId));
const bad = (res, message, code = 400) => res.status(code).json({ message });

const documents = async (req, res) => {
	const records = await list("documents", req.user._id);
	const filtered = req.query.eventId ? records.filter((record) => record.data.eventId === req.query.eventId) : records;
	res.json({ message: "success", data: filtered.map(serialize) });
};
const eventDocuments = async (req, res) => {
	if (!(await eventExists(req.params.id, req.user._id))) return bad(res, "Event not found", 404);
	const records = (await list("documents", req.user._id)).filter((record) => record.data.eventId === req.params.id && (!req.params.type || record.data.documentType === req.params.type));
	res.json({ message: "success", data: records.map(serialize) });
};
const documentGet = async (req, res) => {
	const record = await get("documents", req.params.id, req.user._id);
	if (!record) return bad(res, "Document not found", 404);
	res.json({ message: "success", data: serialize(record) });
};
const documentFile = async (req, res) => {
	const record = await get("documents", req.params.id, req.user._id);
	if (!record) return bad(res, "Document not found", 404);
	if (record.data.storageId) return sendUpload(res, record.data);
	if (!isStoredFile(record.data.storagePath) || !fs.existsSync(record.data.storagePath)) return bad(res, "Document not found", 404);
	return sendUpload(res, record.data, path.resolve(record.data.storagePath));
};
const documentCreate = async (req, res) => {
	let storedFile;
	try {
		const { eventId, relatedEntityType, relatedEntityId, documentType } = req.body;
		if (!eventId || !(await eventExists(eventId, req.user._id))) { if (req.file?.path) fs.rm(req.file.path, () => {}); return bad(res, "Invalid eventId"); }
		if (!req.file) return bad(res, "File is required");
		const fileBuffer = req.file.buffer || fs.readFileSync(req.file.path);
		if (!isAllowedUpload({ mimetype: req.file.mimetype, originalname: req.file.originalname, buffer: fileBuffer })) { if (req.file.path) fs.rm(req.file.path, () => {}); return bad(res, "Unsupported or invalid document file"); }
		if (!documentType || typeof documentType !== "string" || documentType.length > 50) { if (req.file.path) fs.rm(req.file.path, () => {}); return bad(res, "Invalid documentType"); }
		if (relatedEntityId) {
			const types = { EVENT: "events", PROFORMA: "proforma", TAX_INVOICE: "taxInvoices", PAYMENT: "payments", PAYOUT: "payouts", WORK: "work" };
			const parent = types[relatedEntityType] ? await get(types[relatedEntityType], relatedEntityId, req.user._id) : null;
			if (!parent) { if (req.file.path) fs.rm(req.file.path, () => {}); return bad(res, "Invalid related entity"); }
			if (relatedEntityType === "EVENT" && String(parent._id) !== String(eventId)) { if (req.file.path) fs.rm(req.file.path, () => {}); return bad(res, "Document Event does not match its related Event", 409); }
			if (relatedEntityType !== "EVENT" && (!parent.data?.eventId || String(parent.data.eventId) !== String(eventId))) { if (req.file.path) fs.rm(req.file.path, () => {}); return bad(res, "Document and related record must belong to the same Event", 409); }
		}
		storedFile = await saveUpload(req.file);
		const now = new Date().toISOString();
		const record = await save("documents", { _id: createId("document"), userId: req.user._id, data: { eventId, relatedEntityType: relatedEntityType || "EVENT", relatedEntityId: relatedEntityId || null, documentType, fileName: path.basename(req.file.originalname), originalFileName: req.file.originalname, mimeType: req.file.mimetype, fileSize: req.file.size, ...storedFile, uploadedBy: req.user._id, createdAt: now, updatedAt: now } });
		await activity(eventId, req.user._id, "DOCUMENT_UPLOADED", `${documentType} uploaded`, "DOCUMENT", record._id);
		res.status(201).json({ message: "success", data: serialize(record) });
	} catch (error) { if (storedFile) await removeUpload(storedFile); if (req.file?.path) fs.rm(req.file.path, () => {}); throw error; }
};
const documentDelete = async (req, res) => {
	const record = await get("documents", req.params.id, req.user._id);
	if (!record) return bad(res, "Document not found", 404);
	if (record.data.storageId) await removeUpload(record.data);
	else if (isStoredFile(record.data.storagePath)) await removeUpload(record.data);
	if (isTestMode) deleteRecord("documents", req.params.id); else await FinanceRecord.findByIdAndDelete(req.params.id);
	await activity(record.data.eventId, req.user._id, "DOCUMENT_DELETED", `${record.data.documentType} deleted`, "DOCUMENT", req.params.id);
	res.json({ message: "success" });
};
const activities = async (req, res) => {
	if (!(await eventExists(req.params.id, req.user._id))) return bad(res, "Event not found", 404);
	const records = (await list("activities", req.user._id)).filter((record) => record.data.eventId === req.params.id).sort((a, b) => new Date(b.data.createdAt) - new Date(a.data.createdAt));
	const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 200);
	res.json({ message: "success", data: records.slice(0, limit).map((record) => ({ _id: record._id, ...record.data })) });
};
module.exports = { upload, documents, eventDocuments, documentGet, documentFile, documentCreate, documentDelete, activities };
