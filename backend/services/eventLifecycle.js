const EVENT_STATUS = Object.freeze({
	DRAFT: "DRAFT",
	UPCOMING: "UPCOMING",
	ONGOING: "ONGOING",
	COMPLETED: "COMPLETED",
	ARCHIVED: "ARCHIVED",
});

const EVENT_STATUSES = Object.freeze(Object.values(EVENT_STATUS));
const EVENT_TRANSITIONS = Object.freeze({
	[EVENT_STATUS.DRAFT]: new Set([EVENT_STATUS.UPCOMING]),
	[EVENT_STATUS.UPCOMING]: new Set([EVENT_STATUS.ONGOING]),
	[EVENT_STATUS.ONGOING]: new Set([EVENT_STATUS.COMPLETED]),
	[EVENT_STATUS.COMPLETED]: new Set([EVENT_STATUS.ARCHIVED]),
	[EVENT_STATUS.ARCHIVED]: new Set(),
});

// Historical totals include every lifecycle state; operational counts remain status-specific.
const summarizeEvents = (events = []) => ({
	total: events.length,
	upcoming: events.filter((event) => event.status === EVENT_STATUS.UPCOMING).length,
	active: events.filter((event) => event.status === EVENT_STATUS.ONGOING).length,
	completed: events.filter((event) => event.status === EVENT_STATUS.COMPLETED).length,
	archived: events.filter((event) => event.status === EVENT_STATUS.ARCHIVED).length,
	draft: events.filter((event) => event.status === EVENT_STATUS.DRAFT).length,
});

module.exports = { EVENT_STATUS, EVENT_STATUSES, EVENT_TRANSITIONS, summarizeEvents };
