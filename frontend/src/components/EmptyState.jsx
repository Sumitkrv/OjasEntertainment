import PropTypes from "prop-types";

const EmptyState = ({ title, description, action }) => <div className="empty-state-block"><strong>{title}</strong><p>{description}</p>{action}</div>;
EmptyState.propTypes = { title: PropTypes.string.isRequired, description: PropTypes.string.isRequired, action: PropTypes.node };
export default EmptyState;
