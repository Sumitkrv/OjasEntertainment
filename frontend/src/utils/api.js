const backendUrl = (import.meta.env.VITE_BACKEND_URL || "").replace(/\/+$/, "");
export const apiUrl = (path) => `${backendUrl}${path}`;

const parseResponse = async (response) => {
	const text = await response.text();
	let data = {};
	if (text) {
		try {
			data = JSON.parse(text);
		} catch {
			data = { message: text };
		}
	}
	if (!response.ok) {
		const messages = {
			400: "The request could not be processed",
			401: "Your session has expired. Please sign in again",
			403: "You do not have permission to perform this action",
			404: "The requested resource was not found",
			409: "This record conflicts with existing data",
			422: "Please check the submitted values",
			429: "Too many requests. Please try again shortly",
		};
		const error = new Error(messages[response.status] || (response.status >= 500 ? "The server could not process the request" : "Request failed"));
		error.status = response.status;
		throw error;
	}
	return data;
};

const apiRequest = async (path, options = {}) => {
	const response = await fetch(apiUrl(path), options);
	if (response.status === 401 && !path.startsWith("/api/auth/")) {
		const hadToken = Boolean(localStorage.getItem("token"));
		localStorage.removeItem("token");
		if (hadToken) window.dispatchEvent(new Event("app:session-expired"));
	}
	return parseResponse(response);
};

export default apiRequest;
