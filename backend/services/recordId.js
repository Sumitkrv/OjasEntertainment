const isSafeRecordId = (value, testMode = false) => {
	if (typeof value !== "string" || value.length === 0 || value.length > 100 || value.startsWith("$") || value.includes(".")) return false;
	return testMode || /^[a-f\d]{24}$/i.test(value);
};

module.exports = { isSafeRecordId };
