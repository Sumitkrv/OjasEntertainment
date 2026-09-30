const path = require("path");

const SIGNATURES = {
	pdf: (buffer) => buffer.subarray(0, 5).toString("ascii") === "%PDF-",
	jpeg: (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
	png: (buffer) => buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
	webp: (buffer) => buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP",
};

const ALLOWED = {
	"application/pdf": { extensions: [".pdf"], signature: SIGNATURES.pdf },
	"image/jpeg": { extensions: [".jpg", ".jpeg"], signature: SIGNATURES.jpeg },
	"image/png": { extensions: [".png"], signature: SIGNATURES.png },
	"image/webp": { extensions: [".webp"], signature: SIGNATURES.webp },
};

const isAllowedUpload = ({ mimetype, originalname, buffer }) => {
	const rule = ALLOWED[mimetype];
	return Boolean(rule && rule.extensions.includes(path.extname(String(originalname || "")).toLowerCase()) && Buffer.isBuffer(buffer) && rule.signature(buffer));
};

module.exports = { isAllowedUpload };
