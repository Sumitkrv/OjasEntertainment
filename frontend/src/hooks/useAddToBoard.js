import getHeader from "../utils/header";
import { toast } from "react-toastify";
import {
	setAddedPeopleM,
	setAddPeopleM,
	setBoardEmail,
} from "../redux/slices/stateSlice";
import { addAuth } from "../redux/slices/authSlice";
import apiRequest from "../utils/api";
const useAddToBoard = (e, setLoad, dispatch, email) => {
	setLoad("Loading...");
	e.target.disabled = true;
	apiRequest("/api/user/board", {
		method: "POST",
		headers: getHeader(),
		body: JSON.stringify({
			email: email,
		}),
	})
		.then((json) => {
			setLoad("");
			e.target.disabled = false;
			if (json?.message === "success") {
				toast.success("Added Email to the Board");
				dispatch(addAuth(json.data));
				dispatch(setAddPeopleM(false));
				dispatch(setAddedPeopleM(true));
				dispatch(setBoardEmail(json.email));
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

export default useAddToBoard;
