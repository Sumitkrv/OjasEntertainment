const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "pro-manage-security-test-"));
process.env.TEST_MODE = "true";
process.env.TEST_DATA_FILE = path.join(testDirectory, "store.json");
const store = require("../config/testStore");
store.initializeTestStore();
const auth = require("../controllers/auth");
const userController = require("../controllers/user");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { authorization } = require("../middlewares/authorization");

const invoke = async (handler, req) => {
	const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
	await handler({ body: {}, headers: {}, ...req }, res);
	return res;
};

test("registration, login, password changes, and bearer token validation are hardened", async (t) => {
	t.after(() => fs.rmSync(testDirectory, { recursive: true, force: true }));
	const registered = await invoke(auth.registerUser, { body: { name: "Security User", email: "SECURITY@example.com", password: "secure-password" } });
	assert.equal(registered.statusCode, 200);
	const user = store.findUserByEmail("security@example.com");
	assert.notEqual(user.password, "secure-password");
	assert.equal(await bcrypt.compare("secure-password", user.password), true);
	const invalidLogin = await invoke(auth.loginUser, { body: { email: user.email, password: "wrong-password" } });
	assert.equal(invalidLogin.statusCode, 401);
	const changedShort = await invoke(userController.updateUser, { user: { _id: user._id }, body: { name: user.name, email: user.email, oldPassword: "secure-password", newPassword: "short" } });
	assert.equal(changedShort.statusCode, 400);
	const changed = await invoke(userController.updateUser, { user: { _id: user._id }, body: { name: user.name, email: user.email, oldPassword: "secure-password", newPassword: "new-secure-password" } });
	assert.equal(changed.statusCode, 200);
	assert.equal(await bcrypt.compare("new-secure-password", store.findUserById(user._id).password), true);

	const checkToken = async (token) => {
		let nextCalled = false;
		const response = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
		await authorization({ headers: token === null ? {} : { authorization: `Bearer ${token}` } }, response, () => { nextCalled = true; });
		return { response, nextCalled };
	};
	assert.equal((await checkToken(null)).response.statusCode, 401);
	assert.equal((await checkToken("malformed")).response.statusCode, 401);
	const expired = jwt.sign({ userId: user._id }, "local-test-only-jwt-secret", { expiresIn: "-1s", algorithm: "HS256" });
	assert.equal((await checkToken(expired)).response.statusCode, 401);
	const invalidSignature = jwt.sign({ userId: user._id }, "wrong-secret", { expiresIn: "1h", algorithm: "HS256" });
	assert.equal((await checkToken(invalidSignature)).response.statusCode, 401);
	const validToken = registered.body.token;
	assert.equal((await checkToken(validToken)).nextCalled, true);
});
