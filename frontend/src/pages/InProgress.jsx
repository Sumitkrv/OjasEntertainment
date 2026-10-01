import { useSelector } from "react-redux";
import PropTypes from "prop-types";
import TaskBox from "../components/TaskBox";

const InProgress = ({ progressCollapse, tasks, onDragStart, updatingTaskId }) => {
	const storedInProgress = useSelector((store) => store.task.inProgress);
	const inProgress = tasks ?? storedInProgress;
	return (
		<div className="task-container">
			{inProgress?.map((task, index) => (
				<TaskBox
					key={index}
					task={task}
					progressCollapse={progressCollapse}
					onDragStart={onDragStart}
					updatingTaskId={updatingTaskId}
				/>
			))}
		</div>
	);
};

InProgress.propTypes = { progressCollapse: PropTypes.bool, tasks: PropTypes.array, onDragStart: PropTypes.func, updatingTaskId: PropTypes.string };

export default InProgress;
