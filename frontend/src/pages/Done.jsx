import { useSelector } from "react-redux";
import PropTypes from "prop-types";
import TaskBox from "../components/TaskBox";

const Done = ({ doneCollapse, tasks }) => {
	const storedDone = useSelector((store) => store.task.done);
	const done = tasks ?? storedDone;
	return (
		<div className="task-container">
			{done?.map((task, index) => (
				<TaskBox key={index} task={task} doneCollapse={doneCollapse} />
			))}
		</div>
	);
};

Done.propTypes = { doneCollapse: PropTypes.bool, tasks: PropTypes.array };

export default Done;
