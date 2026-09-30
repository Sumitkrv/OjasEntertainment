import { useEffect } from "react";
import { toast } from "react-toastify";
import getHeader from "../utils/header";
import apiRequest from "../utils/api";

const useGetAnalytics = (setAnalytics, filters = {}) => {
	const query = new URLSearchParams();
	if (filters.range) query.set("range", filters.range);
	if (filters.from) query.set("from", filters.from);
	if (filters.to) query.set("to", filters.to);
	if (filters.company) query.set("company", filters.company);
	if (filters.status) query.set("status", filters.status);

	const getAnalytics = () => {
		const suffix = query.toString() ? `?${query.toString()}` : "";
		apiRequest(`/api/analytics${suffix}`, {
			method: "GET",
			headers: getHeader(),
		})
			.then((json) => {
				if (json?.message === "success") {
					setAnalytics(json.data);
				} else {
					toast.error("Something went wrong");
				}
			})
			.catch((error) => {
				console.error("Error:", error);
				toast.error("Something went wrong");
			});
	};

	useEffect(() => {
		getAnalytics();
	}, [filters.range, filters.from, filters.to, filters.company, filters.status]);
};

export default useGetAnalytics;
