const fs = require("fs");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");
const mongoose = require("mongoose");

const isTestMode = process.env.TEST_MODE === "true";
const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "privateUploads" });

const saveUpload = async (file) => {
	if (isTestMode) return { storagePath: file.path };
	const id = new mongoose.Types.ObjectId();
	const uploadStream = bucket().openUploadStreamWithId(id, file.originalname, {
		contentType: file.mimetype,
		metadata: { uploadedAt: new Date() },
	});
	await pipeline(Readable.from([file.buffer]), uploadStream);
	return { storageId: id.toString() };
};

const removeUpload = async (record) => {
	if (record?.storageId && mongoose.Types.ObjectId.isValid(record.storageId)) {
		try { await bucket().delete(new mongoose.Types.ObjectId(record.storageId)); } catch (error) { if (error.code !== 26) throw error; }
	} else if (record?.storagePath) {
		await fs.promises.rm(record.storagePath, { force: true }).catch(() => {});
	}
};

const sendUpload = (res, record, fallbackPath) => {
	if (record?.storageId && mongoose.Types.ObjectId.isValid(record.storageId)) {
		res.setHeader("Content-Type", record.mimeType || "application/octet-stream");
		res.setHeader("Content-Disposition", "inline");
		const stream = bucket().openDownloadStream(new mongoose.Types.ObjectId(record.storageId));
		stream.on("error", (error) => {
			if (!res.headersSent) res.status(error.codeName === "FileNotFound" ? 404 : 500).end();
		});
		return stream.pipe(res);
	}
	if (fallbackPath && fs.existsSync(fallbackPath)) return res.sendFile(fallbackPath, { dotfiles: "deny" });
	return res.status(404).json({ message: "File not found" });
};

module.exports = { saveUpload, removeUpload, sendUpload };
