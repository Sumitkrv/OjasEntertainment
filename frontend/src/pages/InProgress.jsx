import { useSelector } from "react-redux";
import PropTypes from "prop-types";
import TaskBox from "../components/TaskBox";

const InProgress = ({ progressCollapse, tasks }) => {
	const storedInProgress = useSelector((store) => store.task.inProgress);
	const inProgress = tasks ?? storedInProgress;
	return (
		<div className="task-container">
			{inProgress?.map((task, index) => (
				<TaskBox
					key={index}
					task={task}
					progressCollapse={progressCollapse}
				/>
			))}
		</div>
	);
};

InProgress.propTypes = { progressCollapse: PropTypes.bool, tasks: PropTypes.array };

export default InProgress;
