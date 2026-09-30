const backendUrl = (import.meta.env.VITE_BACKEND_URL || "").replace(/\/+$/, "");
export const apiUrl = (path) => `${backendUrl}${path}`;

const parseResponse = async (response) => {
	const text = await response.text();
	const contentType = response.headers.get("content-type") || "";
	if (response.ok && text && !/(?:application|text)\/(?:[a-z.+-]*\+)?json\b/i.test(contentType)) {
		const message = backendUrl
			? "The API returned an unexpected response. Check VITE_BACKEND_URL."
			: "No backend is available at this deployment's /api path.";
		const error = new Error(message);
		error.status = 503;
		throw error;
	}
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
		const noBackendMessage = !backendUrl && [404, 405].includes(response.status)
			? "No backend is connected to this deployment. Run the local backend for local testing, or configure VITE_BACKEND_URL after deploying an API."
			: null;
		const error = new Error(noBackendMessage || messages[response.status] || (response.status >= 500 ? "The server could not process the request" : "Request failed"));
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
