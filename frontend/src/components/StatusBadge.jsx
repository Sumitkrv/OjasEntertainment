import PropTypes from "prop-types";

const StatusBadge = ({ status }) => <span className={`status-badge status-${String(status || "unknown").toLowerCase().replaceAll("_", "-")}`}>{String(status || "Unknown").replaceAll("_", " ")}</span>;
StatusBadge.propTypes = { status: PropTypes.string };
export default StatusBadge;
