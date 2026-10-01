import { useSelector } from "react-redux";
import PropTypes from "prop-types";
import TaskBox from "../components/TaskBox";

const ToDo = ({ todoCollapse, tasks, onDragStart, updatingTaskId }) => {
	const storedTodo = useSelector((store) => store.task.todo);
	const todo = tasks ?? storedTodo;
	return (
		<div className="task-container">
			{todo?.map((task, index) => (
				<TaskBox key={index} task={task} todoCollapse={todoCollapse} onDragStart={onDragStart} updatingTaskId={updatingTaskId} />
			))}
		</div>
	);
};

ToDo.propTypes = { todoCollapse: PropTypes.bool, tasks: PropTypes.array, onDragStart: PropTypes.func, updatingTaskId: PropTypes.string };

export default ToDo;
