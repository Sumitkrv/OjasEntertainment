import { useCallback, useEffect } from "react";
import { toast } from "react-toastify";
import apiRequest from "../utils/api";
const useGetTask = (id, setTask) => {
	const getTask = useCallback(() => {
		apiRequest(`/api/task/${id}`, {
			method: "GET",
			headers: { "Content-Type": "application/json" },
		})
			.then((json) => {
				if (json?.message === "success") {
					setTask(json.data);
				} else {
					toast.error("Something went wrong");
					setTask(null);
				}
			})
			.catch((error) => {
				console.error("Error:", error);
				toast.error("Something went wrong");
			});
	}, [id, setTask]);
	useEffect(() => {
		getTask();
	}, [getTask]);
};

export default useGetTask;
