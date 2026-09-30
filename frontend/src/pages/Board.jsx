import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { FiBell, FiCalendar, FiChevronDown, FiClipboard, FiPlus, FiSearch, FiUsers, FiCheck } from "react-icons/fi";
import { LuCircleDashed } from "react-icons/lu";
import { VscCollapseAll } from "react-icons/vsc";
import { setAddPeopleM, setTaskCardM, setTaskFilterP } from "../redux/slices/stateSlice";
import { TaskFilter } from "../components/PopUp";
import useAllTask from "../hooks/useAllTask";
import Backlog from "./Backlog";
import ToDo from "./ToDo";
import InProgress from "./InProgress";
import Done from "./Done";
import "../css/Task.css";

const Board = () => {
	const [backlogCollapse, setBacklogCollapse] = useState(false);
	const [todoCollapse, setTodoCollapse] = useState(false);
	const [progressCollapse, setProgressCollapse] = useState(false);
	const [doneCollapse, setDoneCollapse] = useState(false);
	const [query, setQuery] = useState("");
	const auth = useSelector((store) => store.auth);
	const taskState = useSelector((store) => store.task);
	const taskFilter = useSelector((store) => store.state.taskFilterP);
	const taskFilterName = useSelector((store) => store.state.taskFilterName);
	const dispatch = useDispatch();
	const firstName = auth?.name?.split(" ")[0] || "Sumit";
	const avatar = firstName.slice(0, 1).toUpperCase();
	const columns = [
		{ key: "backlog", title: "Backlog", items: taskState.backlog, icon: <FiClipboard />, tone: "backlog", collapse: backlogCollapse, setCollapse: setBacklogCollapse, Component: Backlog, prop: "backlogCollapse" },
		{ key: "todo", title: "To Do", items: taskState.todo, icon: <LuCircleDashed />, tone: "todo", collapse: todoCollapse, setCollapse: setTodoCollapse, Component: ToDo, prop: "todoCollapse" },
		{ key: "progress", title: "In Progress", items: taskState.inProgress, icon: <LuCircleDashed />, tone: "progress", collapse: progressCollapse, setCollapse: setProgressCollapse, Component: InProgress, prop: "progressCollapse" },
		{ key: "done", title: "Done", items: taskState.done, icon: <FiCheck />, tone: "done", collapse: doneCollapse, setCollapse: setDoneCollapse, Component: Done, prop: "doneCollapse" },
	];
	useEffect(() => {
		const handleClickOutside = (event) => {
			if (taskFilter && !event?.target.closest(".popup-box") && !event?.target.closest(".board-month-button")) dispatch(setTaskFilterP(false));
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [dispatch, taskFilter]);
	useAllTask();
	const visibleCount = Object.values(taskState).flat().filter((task) => task?.title?.toLowerCase().includes(query.toLowerCase())).length;
	return <main className="dashboard-container board-page">
		<header className="board-topbar">
			<div className="board-search"><FiSearch /><input aria-label="Search tasks" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks, events, invoices, people..." /><span>⌘ K</span></div>
			<div className="board-top-actions"><button className="board-date"><FiCalendar />Tue, 30 Sep 2026</button><button className="board-bell" aria-label="Notifications"><FiBell /><i /></button><span className="board-divider" /><span className="board-user-avatar">{avatar}</span><strong>{auth?.name || "Sumit Thakur"}</strong><FiChevronDown className="board-user-chevron" /></div>
		</header>
		<section className="board-heading-row"><div><p className="board-eyebrow">Task Board</p><h1>Board</h1><p className="board-description">Organize and track your team&apos;s work with a simple and visual board.</p></div><div className="board-actions"><button className="board-action secondary" onClick={() => dispatch(setAddPeopleM(true))}><FiUsers />Add People</button><div className="board-filter-wrap"><button className="board-action secondary board-month-button" onClick={() => dispatch(setTaskFilterP(!taskFilter))}><FiCalendar />{taskFilterName}<FiChevronDown /> </button>{taskFilter && <TaskFilter />}</div><button className="board-action primary" onClick={() => dispatch(setTaskCardM(true))}><FiPlus />Add Task</button></div></section>
		<section className="dashboard-column" aria-label="Task board">
			{columns.map(({ key, title, items = [], icon, tone, collapse, setCollapse, Component, prop }) => {
				const filtered = query ? items.filter((task) => task?.title?.toLowerCase().includes(query.toLowerCase())) : items;
				return <section className={`column column-${tone}`} key={key}>
					<header className="column-heading"><div className={`column-status-icon ${tone}`}>{icon}</div><h2>{title}</h2><span className="column-count">{items.length}</span><button className="column-add" aria-label={`Add task to ${title}`} onClick={() => dispatch(setTaskCardM(true))}><FiPlus /></button><button className="column-more" aria-label={`Collapse ${title}`} onClick={() => setCollapse(!collapse)}><VscCollapseAll /></button></header>
					<Component {...{ [prop]: collapse }} tasks={filtered} />
					<button className="column-add-task" onClick={() => dispatch(setTaskCardM(true))}><FiPlus />Add a task</button>
				</section>;
			})}
			{query && visibleCount === 0 && <div className="board-no-results">No tasks match “{query}”.</div>}
		</section>
	</main>;
};

export default Board;
