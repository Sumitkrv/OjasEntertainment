const BUSINESS_TIME_ZONE = process.env.BUSINESS_TIME_ZONE || "Asia/Kolkata";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const dateKeyFromParts = ({ year, month, day }) => `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
const partsInZone = (date, timeZone = BUSINESS_TIME_ZONE) => {
	const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
	return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
};
const todayKey = (now = new Date(), timeZone = BUSINESS_TIME_ZONE) => dateKeyFromParts(partsInZone(now, timeZone));
const parseDateKey = (value, name = "date") => {
	if (typeof value !== "string" || !DATE_PATTERN.test(value)) throw Object.assign(new Error(`${name} must use YYYY-MM-DD format`), { status: 400 });
	const [year, month, day] = value.split("-").map(Number);
	const date = new Date(Date.UTC(year, month - 1, day));
	if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw Object.assign(new Error(`${name} is not a valid calendar date`), { status: 400 });
	return value;
};
const isValidDateValue = (value) => {
	if (typeof value !== "string") return false;
	if (DATE_PATTERN.test(value)) {
		try { parseDateKey(value); return true; } catch { return false; }
	}
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) return false;
	try { parseDateKey(value.slice(0, 10)); } catch { return false; }
	return !Number.isNaN(Date.parse(value));
};
const addDays = (key, amount) => {
	const [year, month, day] = key.split("-").map(Number);
	const date = new Date(Date.UTC(year, month - 1, day + amount));
	return dateKeyFromParts({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() });
};
const dateParts = (key) => {
	const [year, month, day] = key.split("-").map(Number);
	return { year, month, day };
};

const getDateRange = (query = {}, now = new Date(), timeZone = BUSINESS_TIME_ZONE) => {
	const today = todayKey(now, timeZone);
	const { year, month, day } = dateParts(today);
	const range = String(query.range || (query.from || query.to ? "custom" : "this-month")).toLowerCase();
	let startDate;
	let endDate;
	if (range === "custom") {
		if (!query.from || !query.to) throw Object.assign(new Error("Custom range requires both from and to dates"), { status: 400 });
		startDate = parseDateKey(query.from, "from");
		endDate = parseDateKey(query.to, "to");
		if (startDate > endDate) throw Object.assign(new Error("from must be on or before to"), { status: 400 });
	} else if (query.from || query.to) {
		throw Object.assign(new Error("from and to can only be used with range=custom"), { status: 400 });
	} else if (range === "today") {
		startDate = today;
		endDate = today;
	} else if (range === "this-week") {
		const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
		const mondayOffset = weekday === 0 ? 6 : weekday - 1;
		startDate = addDays(today, -mondayOffset);
		endDate = addDays(startDate, 6);
	} else if (range === "this-month") {
		startDate = dateKeyFromParts({ year, month, day: 1 });
		endDate = dateKeyFromParts({ year, month: month + 1, day: 0 });
	} else if (range === "last-month") {
		const lastDayPreviousMonth = new Date(Date.UTC(year, month - 1, 0)).getUTCDate();
		const previousMonth = month === 1 ? 12 : month - 1;
		const previousYear = month === 1 ? year - 1 : year;
		startDate = dateKeyFromParts({ year: previousYear, month: previousMonth, day: 1 });
		endDate = dateKeyFromParts({ year: previousYear, month: previousMonth, day: lastDayPreviousMonth });
	} else if (range === "this-quarter") {
		const firstMonth = Math.floor((month - 1) / 3) * 3 + 1;
		startDate = dateKeyFromParts({ year, month: firstMonth, day: 1 });
		endDate = dateKeyFromParts({ year, month: firstMonth + 3, day: 0 });
	} else if (range === "this-year") {
		startDate = `${year}-01-01`;
		endDate = `${year}-12-31`;
	} else if (range === "year-to-date") {
		startDate = `${year}-01-01`;
		endDate = today;
	} else {
		throw Object.assign(new Error("Unsupported date range"), { status: 400 });
	}
	return { range, startDate, endDate, timeZone };
};

const toBusinessDateKey = (value, timeZone = BUSINESS_TIME_ZONE) => {
	if (typeof value === "string" && DATE_PATTERN.test(value)) {
		try { return parseDateKey(value); } catch { return null; }
	}
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return dateKeyFromParts(partsInZone(date, timeZone));
};
const isDateInRange = (value, bounds, timeZone = BUSINESS_TIME_ZONE) => {
	const key = toBusinessDateKey(value, timeZone);
	return Boolean(key && key >= bounds.startDate && key <= bounds.endDate);
};
const getMonthKey = (value, timeZone = BUSINESS_TIME_ZONE) => toBusinessDateKey(value, timeZone)?.slice(0, 7) || null;
const enumerateMonths = (bounds) => {
	const start = dateParts(bounds.startDate);
	const end = dateParts(bounds.endDate);
	const keys = [];
	for (let year = start.year, month = start.month; year < end.year || (year === end.year && month <= end.month);) {
		keys.push(`${year}-${String(month).padStart(2, "0")}`);
		month += 1;
		if (month === 13) { month = 1; year += 1; }
	}
	return keys;
};

module.exports = { BUSINESS_TIME_ZONE, getDateRange, parseDateKey, isValidDateValue, addDays, todayKey, toBusinessDateKey, isDateInRange, getMonthKey, enumerateMonths };
