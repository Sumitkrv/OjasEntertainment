import { useCallback, useEffect } from "react";
import { useDispatch } from "react-redux";
import getHeader from "../utils/header";
import {
	setBacklog,
	setTodo,
	setInProgress,
	setDone,
} from "../redux/slices/taskSlice";
import { setLoading } from "../redux/slices/stateSlice";
import { toast } from "react-toastify";
import apiRequest from "../utils/api";

const useAllTask = () => {
	const dispatch = useDispatch();
	const fetchData = useCallback(() => {
		dispatch(setLoading(true));
		apiRequest("/api/task/all", {
			method: "GET",
			headers: getHeader(),
		})
			.then((json) => {
				if (json?.message === "success") {
					dispatch(setBacklog(json.data.backlog));
					dispatch(setTodo(json.data.todo));
					dispatch(setInProgress(json.data.inProgress));
					dispatch(setDone(json.data.done));
				}
				dispatch(setLoading(false));
			})
			.catch((error) => {
				console.error("Error:", error);
				toast.error("Something went wrong");
				dispatch(setLoading(false));
			});
	}, [dispatch]);

	useEffect(() => {
		fetchData();
	}, [fetchData]);
};

export default useAllTask;
