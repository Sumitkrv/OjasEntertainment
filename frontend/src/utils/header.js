const getHeader = (body) => {
	const token = localStorage.getItem("token");
	const headers = { Authorization: `Bearer ${token}` };
	if (!(body instanceof FormData)) headers["Content-Type"] = "application/json";
	return headers;
};

export default getHeader;
