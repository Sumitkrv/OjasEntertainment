import PropTypes from "prop-types";
import TaskBox from "../components/TaskBox";
import { useSelector } from "react-redux";

const Backlog = ({ backlogCollapse, tasks }) => {
	const storedBacklog = useSelector((store) => store.task.backlog);
	const backlog = tasks ?? storedBacklog;
	return (
		<div className="task-container">
			{backlog?.map((task, index) => (
				<TaskBox
					key={index}
					task={task}
					backlogCollapse={backlogCollapse}
				/>
			))}
		</div>
	);
};

Backlog.propTypes = { backlogCollapse: PropTypes.bool, tasks: PropTypes.array };

export default Backlog;
