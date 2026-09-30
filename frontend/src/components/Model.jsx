import { useState } from "react";
import "../css/Model.css";
import { useDispatch, useSelector } from "react-redux";
import {
	setAddedPeopleM,
	setAddPeopleM,
	setLogoutM,
	setTaskDeleteM,
	setTaskCardM,
	setTaskM,
	setBoardEmail,
	setCategoryName,
	setUpdateCategoryM,
} from "../redux/slices/stateSlice";
import { AiFillDelete, AiOutlinePlus } from "react-icons/ai";
import { FiCalendar, FiChevronDown, FiX } from "react-icons/fi";
import brandLogo from "../assets/ojas-entertainment-logo.png";
import { Link, useNavigate, useParams } from "react-router-dom";
import { removeAuth } from "../redux/slices/authSlice";
import addTask from "../hooks/useAddTask";
import { toast } from "react-toastify";
import deleteTask from "../hooks/useDeleteTask";
import useGetTask from "../hooks/useGetTask";
import Loading from "./Loading";
import { getMonthDate, simpleDate } from "../utils/generateDate";
import updateTask from "../hooks/useUpdateTask";
import CheckBoxUnselect from "../assets/checkbox_unselect.png";
import CheckBoxSelect from "../assets/checkbox_select.png";
import addToBoard from "../hooks/useAddToBoard";
import { checkValidEmail } from "../utils/validate";
import updateCategory from "../hooks/useUpdateCategory";

export const AddPeople = () => {
	const dispatch = useDispatch();
	const [email, setEmail] = useState("");
	const [load, setLoad] = useState("");
	const handleAddToBoard = (e) => {
		const validError = checkValidEmail(email);
		if (validError) {
			toast.error(validError);
			return;
		}
		addToBoard(e, setLoad, dispatch, email);
	};
	return (
		<div className="model-container">
			<div className="model-box">
				<h3>Add people to the board</h3>
				<input
					type="email"
					name="email"
					placeholder="Enter the email"
					className="model-input"
					onChange={(e) => setEmail(e.target.value)}
				/>
				<div className="model-btns">
					<button
						className="model-cancel"
						onClick={() => dispatch(setAddPeopleM(false))}
					>
						Cancel
					</button>
					<button
						className="model-submit"
						onClick={(e) => handleAddToBoard(e)}
					>
						{load ? "Loading..." : "Add Email"}
					</button>
				</div>
			</div>
		</div>
	);
};
export const AddedPeople = () => {
	const dispatch = useDispatch();
	const email = useSelector((store) => store.state.boardEmail);
	return (
		<div className="model-container">
			<div className="model-box">
				<h3 className="model-center">{email} added to board</h3>
				<div className="model-btns">
					<button
						className="model-submit"
						onClick={() => {
							dispatch(setAddedPeopleM(false));
							dispatch(setBoardEmail(""));
						}}
					>
						Okey, got it!
					</button>
				</div>
			</div>
		</div>
	);
};

export const UpdateCategory = () => {
	const dispatch = useDispatch();
	const [load, setLoad] = useState("");
	const { oldCategory, newCategory } = useSelector(
		(store) => store.state.categoryName
	);
	const taskId = useSelector((store) => store.state.taskMId);
	const handleUpdateCategory = (e) => {
		updateCategory(
			e,
			setLoad,
			dispatch,
			taskId,
			newCategory,
			oldCategory
		);
	};
	return (
		<div className="model-container">
			<div className="model-box model-box-s">
				<h3 className="model-center">
					Change the status of task (
					{newCategory.charAt(0).toUpperCase() + newCategory.slice(1)}
					)
				</h3>
				<div className="model-btns">
					<button
						className="model-submit"
						onClick={(e) => handleUpdateCategory(e)}
					>
						{load ? "Loading..." : "Update status"}
					</button>
					<button
						className="model-cancel"
						onClick={() => {
							dispatch(setUpdateCategoryM(false));
							dispatch(setCategoryName(""));
						}}
					>
						Cancel
					</button>
				</div>
			</div>
		</div>
	);
};

export const Logout = () => {
	const dispatch = useDispatch();
	const navigate = useNavigate();
	const handleLogout = () => {
		localStorage.removeItem("token");
		dispatch(removeAuth());
		dispatch(setLogoutM(false));
		navigate("/login");
	};
	return (
		<div className="model-container">
			<div className="model-box model-box-s">
				<h3 className="model-center">
					Are you sure you want to Logout?
				</h3>
				<div className="model-btns">
					<button className="model-submit" onClick={handleLogout}>
						Yes, Logout
					</button>
					<button
						className="model-cancel"
						onClick={() => dispatch(setLogoutM(false))}
					>
						Cancel
					</button>
				</div>
			</div>
		</div>
	);
};
export const TaskDelete = () => {
	const dispatch = useDispatch();
	const id = useSelector((store) => store.state.taskMId);
	const [load, setLoad] = useState("");
	const handleTaskDelete = (e) => {
		deleteTask(e, setLoad, dispatch, id);
	};

	return (
		<div className="model-container">
			<div className="model-box model-box-s">
				<h3 className="model-center">
					Are you sure you want to Delete?
				</h3>
				<div className="model-btns">
					<button
						className="model-submit"
						onClick={(e) => handleTaskDelete(e)}
					>
						{load ? "Loading..." : "Yes, Delete"}
					</button>
					<button
						className="model-cancel"
						onClick={() => dispatch(setTaskDeleteM(false))}
					>
						Cancel
					</button>
				</div>
			</div>
		</div>
	);
};
export const TaskCard = () => {
	const task = useSelector((store) => store.state.taskM);
	const auth = useSelector((store) => store.auth);

	const dispatch = useDispatch();
	const [dueDate, setDueDate] = useState(task?.dueDate || "");
	const [title, setTitle] = useState(task?.title || "");
	const [priority, setPriority] = useState(task?.priority || "");
	const [checklist, setChecklist] = useState(task?.checklist || []);
	const [listBox, setListBox] = useState(task?.checklist?.length || 0);
	const [load, setLoad] = useState("");
	const [assignBox, setAssignBox] = useState(false);
	const [assign, setAssign] = useState(task?.assign || "");

	const handleAddTask = (e) => {
		if (title && priority && checklist.length > 0) {
			const listName = checklist.filter((list) => {
				return list.name == "";
			});
			if (listName.length == 0) {
				if (task == "") {
					addTask(
						e,
						setLoad,
						title,
						priority,
						checklist,
						assign,
						dueDate,
						dispatch
					);
				} else {
					updateTask(
						e,
						setLoad,
						title,
						priority,
						checklist,
						assign,
						dueDate,
						dispatch,
						task._id
					);
				}
			} else {
				toast.error("Checklist is required");
			}
		} else {
			toast.error("All fields are required");
		}
	};

	const handleAddChecklist = () => {
		let list = checklist;
		list = [...list, { name: "", isDone: false }];
		setChecklist(list);
		setListBox(list.length);
	};
	const handleDeleteChecklist = (idx) => {
		if (listBox > 0) {
			let list = checklist;
			list = list.filter((item, i) => i != idx);
			setChecklist(list);
			setListBox(list.length);
		}
	};

	const handleTitle = (name) => {
		name = name.charAt(0).toUpperCase() + name.slice(1);
		setTitle(name);
	};
	return (
		<div className="model-container model-task-modal-overlay">
			<form className="model-box model-card model-task-dialog" onSubmit={(e) => { e.preventDefault(); handleAddTask(e); }}>
				<header className="task-dialog-header">
					<h2>{task == "" ? "Add Task" : "Edit Task"}</h2>
					<button type="button" className="task-modal-close" aria-label="Close task dialog" onClick={() => { dispatch(setTaskCardM(false)); dispatch(setTaskM("")); }}><FiX /></button>
				</header>
				<div className="task-dialog-body">
					<div className="task-form-field">
						<label htmlFor="task-title-input">Title <span className="require">*</span></label>
						<input id="task-title-input" type="text" name="title" value={title} placeholder="Enter task title..." className="task-modal-input" onChange={(e) => handleTitle(e.target.value)} />
					</div>
					<fieldset className="task-priority-field">
						<legend>Priority <span className="require">*</span></legend>
						<div className="task-priority-options">
							{[["High Priority", "high", "#ef4444"], ["Moderate Priority", "moderate", "#2563eb"], ["Low Priority", "low", "#22a06b"]].map(([label, id, color]) => <label key={id} htmlFor={`task-priority-${id}`} className={`task-priority-option ${priority === label ? "is-selected" : ""}`}>
								<input type="radio" name="priority" id={`task-priority-${id}`} value={label} checked={priority === label} onChange={() => setPriority(label)} />
								<span className="task-priority-dot" style={{ "--priority-color": color }} />
								<span>{label}</span>
							</label>)}
						</div>
					</fieldset>
					{auth?.board?.length != 0 && (
						<div className="model-assign task-assign-field">
							<label className="task-form-label">Assign to</label>
							<div className="assign-model-box">
								<button type="button" className="model-input model-assign-input" onClick={() => setAssignBox(!assignBox)}>{assign || <span className="assign-unselect-color">Add an assignee</span>}<FiChevronDown /></button>
								<div className={`assign-selection-box ${assignBox ? "assign-selection-box-exist" : ""}`}>
									<div><div>Don&apos;t assign to any email</div><button type="button" onClick={() => { setAssign(""); setAssignBox(false); }}>Clear</button></div>
									{assign && <div><div>Keep current assignee</div><button type="button" onClick={() => setAssignBox(false)}>Back</button></div>}
									{auth?.board?.map((item, idx) => <div key={idx + "assign-box"}><div title={item}><span className="assign-circel">{item.split("")[0].toUpperCase()}</span>{item}</div><button type="button" onClick={() => { setAssign(item); setAssignBox(false); }}>Assign</button></div>)}
								</div>
							</div>
						</div>
					)}
					<section className="task-checklist-field">
						<h3>Checklist ({checklist.filter((item) => item.isDone === true).length}/{listBox}) <span className="require">*</span></h3>
						<div className="checklist-box task-modal-checklist">
							{checklist.map((el, idx) => <div className="checklist-input-box task-modal-checklist-row" key={idx + "checklist-box"}>
								<label className="task-check-control" aria-label={el.isDone ? "Mark checklist item incomplete" : "Mark checklist item complete"}><input type="checkbox" checked={el.isDone} onChange={() => setChecklist(checklist.map((item, i) => i === idx ? { ...item, isDone: !el.isDone } : item))} /><span>{el.isDone ? <img src={CheckBoxSelect} alt="" className="model-checkbox" /> : <img src={CheckBoxUnselect} alt="" className="model-checkbox" />}</span></label>
								<input className="model-input model-input-btn task-checklist-input" type="text" name={`item-${idx + 1}`} placeholder="Enter checklist item..." value={el.name} onChange={(e) => setChecklist(checklist.map((item, i) => i === idx ? { ...item, name: e.target.value } : item))} />
								<button className="task-checklist-delete" type="button" aria-label={`Remove checklist item ${idx + 1}`} onClick={() => handleDeleteChecklist(idx)}><AiFillDelete /></button>
							</div>)}
						</div>
					<button type="button" className="checklist-add task-checklist-add" onClick={handleAddChecklist}><AiOutlinePlus /><span>Add New</span></button>
					</section>
					<div className="task-form-field task-due-field">
						<label>Due Date</label>
						<div className="task-date-picker-wrap">
							<button type="button" className="task-date-picker-trigger" aria-label={dueDate ? `Due date ${simpleDate(dueDate)}` : "Select due date"} onClick={() => { const input = document.getElementById("model-card-date"); if (input?.showPicker) input.showPicker(); else input?.click(); }}><FiCalendar /><span className={dueDate ? "" : "is-placeholder"}>{dueDate ? simpleDate(dueDate) : "Select due date"}</span><FiChevronDown /></button>
							<input type="date" name="due-date" id="model-card-date" value={dueDate.split("T")[0]} onChange={(e) => setDueDate(e.target?.value)} />
						</div>
					</div>
				</div>
				<footer className="model-btns task-dialog-footer">
					<button type="button" className="model-cancel" onClick={() => { dispatch(setTaskCardM(false)); dispatch(setTaskM("")); }}>Cancel</button>
					<button className="model-submit" type="submit">{load == "" ? "Save" : load}</button>
				</footer>
			</form>
		</div>
	);
};
export const TaskCardPublic = () => {
	const { id } = useParams();
	const [task, setTask] = useState([]);
	useGetTask(id, setTask);

	return task?.length == 0 ? (
		<Loading />
	) : (
		<div className="model-container model-public">
			<Link to={"/"} className="nav-logo nav-logo-public">
				<img src={brandLogo} alt="Ojas Entertainment" />
			</Link>

			{task == null ? (
				<div className="model-box model-task-null">
					<h3>Task Not Found</h3>
					<p>
						The task you are looking for does not exist or has been
						deleted. Please check the URL and try again.
					</p>
					<Link to={"/"} className="model-btn">
						Back to Home
					</Link>
				</div>
			) : (
				<div className="model-box model-card">
					<div className="model-card-details">
						<div className="priority-box priority-public">
							<span
								className="priority-circel"
								style={{ background: "red" }}
							></span>
							<span>{task?.priority}</span>
						</div>
						<h3>{task?.title}</h3>
						<div className="checklist-head checklist-public">
							Checklist (
							{
								task?.checklist?.filter(
									(list) => list.isDone == true
								).length
							}
							/{task?.checklist?.length})
						</div>
						<div className="checklist-box checklist-box-public">
							{task?.checklist?.map((list, idx) => {
								return (
									<div
										className="checklist-input-box"
										key={idx + "checklist-box-public"}
									>
										<span className="checklist-btn checklist-btn-l">
											{!list.isDone ? (
												<img
													src={CheckBoxUnselect}
													alt="⬜"
												/>
											) : (
												<img
													src={CheckBoxSelect}
													alt="✅"
												/>
											)}
										</span>
										<p className="model-input model-input-btn">
											{list.name}
										</p>
									</div>
								);
							})}
						</div>
					</div>
					<div className="model-due">
						{task?.dueDate && (
							<>
								<span>Due Date</span>
								<div>{getMonthDate(task?.dueDate)}</div>
							</>
						)}
					</div>
				</div>
			)}
		</div>
	);
};
