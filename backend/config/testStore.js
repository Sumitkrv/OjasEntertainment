const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

const dataDirectory = path.join(__dirname, "..", "data");
const dataFile = process.env.TEST_DATA_FILE || path.join(dataDirectory, "test-data.json");
const emptyData = () => ({
	users: [],
	tasks: [],
	events: [],
	proforma: [],
	payouts: [],
	work: [],
	activities: [],
	documents: [],
	taxInvoices: [],
	payments: [],
});

const loadData = () => {
	try {
		return { ...emptyData(), ...JSON.parse(fs.readFileSync(dataFile, "utf8")) };
	} catch (error) {
		if (error.code !== "ENOENT") console.error("Could not load local test data; verify TEST_DATA_FILE contents.");
		return emptyData();
	}
};

const data = loadData();
const users = new Map(data.users.map((user) => [user._id, user]));
const tasks = new Map(data.tasks.map((task) => [task._id, task]));
const records = {
	events: new Map(data.events.map((record) => [record._id, record])),
	proforma: new Map(data.proforma.map((record) => [record._id, record])),
	payouts: new Map(data.payouts.map((record) => [record._id, record])),
	work: new Map(data.work.map((record) => [record._id, record])),
	activities: new Map(data.activities.map((record) => [record._id, record])),
	documents: new Map(data.documents.map((record) => [record._id, record])),
	taxInvoices: new Map(data.taxInvoices.map((record) => [record._id, record])),
	payments: new Map(data.payments.map((record) => [record._id, record])),
};

const saveData = () => {
	fs.mkdirSync(path.dirname(dataFile), { recursive: true });
	const temporaryFile = `${dataFile}.tmp`;
	fs.writeFileSync(temporaryFile, JSON.stringify({
		users: [...users.values()],
		tasks: [...tasks.values()],
		events: [...records.events.values()],
		proforma: [...records.proforma.values()],
		payouts: [...records.payouts.values()],
		work: [...records.work.values()],
		activities: [...records.activities.values()],
		documents: [...records.documents.values()],
		taxInvoices: [...records.taxInvoices.values()],
		payments: [...records.payments.values()],
	}, null, 2));
	fs.renameSync(temporaryFile, dataFile);
};

const initializeTestStore = () => {
	fs.mkdirSync(path.dirname(dataFile), { recursive: true });
	if (!fs.existsSync(dataFile)) saveData();
};

const addUser = (user) => {
	users.set(user._id, user);
	saveData();
	return user;
};

const findUserByEmail = (email) => {
	return [...users.values()].find((user) => user.email === email);
};

const findUserById = (id) => users.get(id);

const findUsers = () => [...users.values()];

const updateUser = (id, changes) => {
	const user = users.get(id);
	if (!user) return null;
	Object.assign(user, changes);
	saveData();
	return user;
};

const addBoardMember = (id, email) => {
	const user = users.get(id);
	if (!user) return null;
	if (!user.board.includes(email)) user.board.push(email);
	saveData();
	return user;
};

const addTask = (task) => {
	tasks.set(task._id, task);
	saveData();
	return task;
};

const findTaskById = (id) => tasks.get(id);

const findTasks = () => [...tasks.values()];

const updateTask = (id, changes) => {
	const task = tasks.get(id);
	if (!task) return null;
	Object.assign(task, changes);
	saveData();
	return task;
};

const deleteTask = (id) => {
	const task = tasks.get(id);
	tasks.delete(id);
	saveData();
	return task;
};

const addRecord = (type, record) => {
	records[type].set(record._id, record);
	saveData();
	return record;
};

const findRecords = (type) => [...records[type].values()];
const findRecordById = (type, id) => records[type].get(id);
const updateRecord = (type, id, changes) => {
	const record = records[type].get(id);
	if (!record) return null;
	Object.assign(record, changes);
	saveData();
	return record;
};
const deleteRecord = (type, id) => {
	const record = records[type].get(id);
	records[type].delete(id);
	saveData();
	return record;
};

// Apply related changes with one durable file replacement. Restore memory if persistence fails.
const commitRecordChanges = (changes) => {
	const snapshots = new Map();
	for (const change of changes) {	
		if (!snapshots.has(change.type)) snapshots.set(change.type, new Map(records[change.type]));
		if (change.remove) records[change.type].delete(change.id);
		else records[change.type].set(change.record._id, change.record);
	}
	try { saveData(); }
	catch (error) { for (const [type, snapshot] of snapshots) records[type] = snapshot; throw error; }
	return changes.map((change) => change.record);
};

const createId = (prefix) => `${prefix}-${randomUUID()}`;

module.exports = {
	initializeTestStore,
	addUser,
	findUserByEmail,
	findUserById,
	findUsers,
	updateUser,
	addBoardMember,
	addTask,
	findTaskById,
	findTasks,
	updateTask,
	deleteTask,
	addRecord,
	findRecords,
	findRecordById,
	updateRecord,
	deleteRecord,
	commitRecordChanges,
	createId,
};
