const test = require("node:test");
const assert = require("node:assert/strict");
const { isAllowedUpload } = require("../services/uploadValidation");
const { isSafeRecordId } = require("../services/recordId");

test("upload validation requires an allowed extension, MIME type, and matching file signature", () => {
	assert.equal(isAllowedUpload({ mimetype: "application/pdf", originalname: "safe.pdf", buffer: Buffer.from("%PDF-1.7") }), true);
	assert.equal(isAllowedUpload({ mimetype: "image/png", originalname: "safe.png", buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) }), true);
	assert.equal(isAllowedUpload({ mimetype: "application/pdf", originalname: "safe.pdf", buffer: Buffer.from("<script>") }), false);
	assert.equal(isAllowedUpload({ mimetype: "application/pdf", originalname: "../safe.exe", buffer: Buffer.from("%PDF-1.7") }), false);
	assert.equal(isAllowedUpload({ mimetype: "image/jpeg", originalname: "photo.jpg", buffer: Buffer.from("%PDF-1.7") }), false);
});

test("record identifiers reject operator-shaped values before database lookup", () => {
	assert.equal(isSafeRecordId("65f1a06d3cb95f6fb2b0a123"), true);
	assert.equal(isSafeRecordId("$ne", true), false);
	assert.equal(isSafeRecordId({ $ne: null }, true), false);
	assert.equal(isSafeRecordId("test-event-123", true), true);
});
