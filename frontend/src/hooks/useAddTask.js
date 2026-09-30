import getHeader from "../utils/header";
import { toast } from "react-toastify";
import { setTaskCardM, setTaskM } from "../redux/slices/stateSlice";
import { addTodoTask } from "../redux/slices/taskSlice";
import apiRequest from "../utils/api";
const useAddTask = (
	e,
	setLoad,
	title,
	priority,
	checklist,
	assign,
	dueDate,
	dispatch
) => {
	setLoad("Loading...");
	e.target.disabled = true;
	apiRequest("/api/task/add", {
		method: "POST",
		headers: getHeader(),
		body: JSON.stringify({
			title: title,
			priority: priority,
			checklist: checklist,
			assign: assign,
			dueDate: dueDate,
		}),
	})
		.then((json) => {
			setLoad("");
			e.target.disabled = false;
			if (json?.message === "success") {
				toast.success("Task Added Successfully");
				dispatch(addTodoTask(json.data));
				dispatch(setTaskCardM(false));
				dispatch(setTaskM(""));
			} else {
				toast.error(json?.message);
			}
		})
		.catch((error) => {
			console.error("Error:", error);
			setLoad("");
			toast.error("Something went wrong");
			e.target.disabled = false;
		});
};

export default useAddTask;
