import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { FiCalendar, FiChevronDown, FiChevronUp } from "react-icons/fi";
import { LuGripVertical } from "react-icons/lu";
import { TbDots } from "react-icons/tb";
import { TaskMenu } from "./PopUp";
import { useDispatch } from "react-redux";
import { setCategoryName, setTaskMId, setUpdateCategoryM } from "../redux/slices/stateSlice";
import CheckBoxUnselect from "../assets/checkbox_unselect.png";
import CheckBoxSelect from "../assets/checkbox_select.png";

const prettyDate = (value) => value ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "No due date";

const TaskBox = ({ backlogCollapse, todoCollapse, progressCollapse, doneCollapse, task }) => {
	const [collapse, setCollapse] = useState(true);
	const [taskMenuP, setTaskMenuP] = useState(false);
	const dispatch = useDispatch();
	const doneItems = task?.checklist?.filter((item) => item.isDone).length || 0;
	const checklist = task?.checklist || [];
	const handleUpdateCategory = (category) => {
		dispatch(setUpdateCategoryM(true));
		dispatch(setCategoryName({ newCategory: category, oldCategory: task?.category }));
		dispatch(setTaskMId(task?._id));
	};
	useEffect(() => {
		const handleClickOutside = (event) => { if (taskMenuP && !event?.target.closest(".popup-box") && !event?.target.closest(".task-menu-trigger")) setTaskMenuP(false); };
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [taskMenuP]);
	useEffect(() => { setCollapse(true); }, [backlogCollapse, todoCollapse, progressCollapse, doneCollapse]);
	const initials = task?.userName?.name?.split(" ").map((part) => part[0]).join("").slice(0, 1).toUpperCase() || "S";
	const priority = (task?.priority || "Task").toLowerCase().replace(/\s+/g, "-");
	return <article className="task-box">
		<div className="task-card-top"><LuGripVertical className="task-drag-handle" aria-hidden="true" /><h3 title={task?.title}>{task?.title}</h3><div className="task-menu-wrap"><button className="task-menu-trigger" aria-label={`Actions for ${task?.title}`} onClick={() => { setTaskMenuP((open) => !open); dispatch(setTaskMId(task?._id)); }}><TbDots /></button>{taskMenuP && <TaskMenu setTaskMenuP={setTaskMenuP} id={task?._id} task={task} />}</div></div>
		<span className={`task-category-tag tag-${priority}`}>{task?.priority || "Task"}</span>
		<div className="task-card-footer"><span className="task-date"><FiCalendar />{prettyDate(task?.dueDate)}</span><span className="task-assignee" title={task?.userName?.name || "Assigned user"}>{initials}</span></div>
		{checklist.length > 0 && <><button className="task-checklist-toggle" onClick={() => setCollapse(!collapse)}>{`Checklist ${doneItems}/${checklist.length}`} {collapse ? <FiChevronDown /> : <FiChevronUp />}</button><div className={`task-checklist-details ${collapse ? "task-checklist-details-collapse" : ""}`}>{checklist.map((item, index) => <label key={`${task?._id}-${index}`} className="checklist-details-box"> <img src={item.isDone ? CheckBoxSelect : CheckBoxUnselect} alt="" /><span>{item.name}</span></label>)}</div></>}
		<div className="task-move-actions" aria-label="Move task to another column">{[["backlog", "Backlog"], ["to-do", "To Do"], ["in-progress", "In Progress"], ["done", "Done"]].filter(([category]) => task?.category !== category).map(([category, label]) => <button key={category} onClick={() => handleUpdateCategory(category)}>{label}</button>)}</div>
	</article>;
};

TaskBox.propTypes = {
	backlogCollapse: PropTypes.bool,
	todoCollapse: PropTypes.bool,
	progressCollapse: PropTypes.bool,
	doneCollapse: PropTypes.bool,
	task: PropTypes.object.isRequired,
};

export default TaskBox;
