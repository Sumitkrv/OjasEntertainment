import PropTypes from "prop-types";
import TaskBox from "../components/TaskBox";
import { useSelector } from "react-redux";

const Backlog = ({ backlogCollapse, tasks, onDragStart, updatingTaskId }) => {
	const storedBacklog = useSelector((store) => store.task.backlog);
	const backlog = tasks ?? storedBacklog;
	return (
		<div className="task-container">
			{backlog?.map((task, index) => (
				<TaskBox
					key={index}
					task={task}
					backlogCollapse={backlogCollapse}
					onDragStart={onDragStart}
					updatingTaskId={updatingTaskId}
				/>
			))}
		</div>
	);
};

Backlog.propTypes = { backlogCollapse: PropTypes.bool, tasks: PropTypes.array, onDragStart: PropTypes.func, updatingTaskId: PropTypes.string };

export default Backlog;
