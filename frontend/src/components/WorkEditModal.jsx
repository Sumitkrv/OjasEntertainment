import PropTypes from "prop-types";
import { FiActivity, FiBriefcase, FiCalendar, FiChevronDown, FiClock, FiFileText, FiFlag, FiMessageCircle, FiX } from "react-icons/fi";

const iconFor = {
	date: FiCalendar,
	company: FiBriefcase,
	workCategory: FiFileText,
	workDescription: FiFileText,
	priority: FiFlag,
	status: FiActivity,
	startTime: FiClock,
	endTime: FiClock,
	remarks: FiMessageCircle,
};

const fieldOrder = ["date", "company", "workCategory", "workDescription", "priority", "status", "startTime", "endTime", "remarks"];
const required = new Set(["date", "company", "workCategory", "workDescription", "priority", "status", "startTime", "endTime"]);

const WorkEditModal = ({ form, setForm, fields, onSave, onCancel }) => {
	const fieldMap = new Map(fields.map((field) => [field[0], field]));
	const visibleFields = fieldOrder.map((key) => fieldMap.get(key)).filter(Boolean);
	const updateField = (key, value) => setForm((current) => ({ ...current, [key]: value }));
	const renderField = ([key, label, kind, options]) => {
		const Icon = iconFor[key] || FiFileText;
		const isFull = ["date", "workDescription", "remarks"].includes(key);
		const choices = kind === "select" ? [...new Set([...(options || []), ...(form[key] && !(options || []).includes(form[key]) ? [form[key]] : [])])] : [];
		return <div className={`work-edit-field ${isFull ? "is-full" : ""}`} key={key}>
			<label htmlFor={`work-edit-${key}`}>{label} {required.has(key) && <span>*</span>}</label>
			{key === "remarks" ? <div className="work-edit-textarea-wrap"><Icon /><textarea id={`work-edit-${key}`} name={key} value={form[key] ?? ""} maxLength={5000} placeholder="Add remarks..." onChange={(event) => updateField(key, event.target.value)} /></div> : <div className={`work-edit-control ${kind === "select" ? "is-select" : ""}`}>
				<Icon />
				{kind === "select" ? <><select id={`work-edit-${key}`} name={key} value={form[key] ?? ""} onChange={(event) => updateField(key, event.target.value)}>{!form[key] && <option value="">Select {label.toLowerCase()}</option>}{choices.map((option) => <option key={option} value={option}>{option}</option>)}</select><FiChevronDown className="work-edit-trailing-icon" /></> : <input id={`work-edit-${key}`} name={key} type={kind} value={form[key] ?? ""} onChange={(event) => updateField(key, event.target.value)} />}
			</div>}
		</div>;
	};
	return <div className="model-container work-edit-overlay">
		<form className="model-box work-edit-dialog" onSubmit={onSave}>
			<header className="work-edit-header"><h2>Edit Daily Work</h2><button type="button" aria-label="Close edit work dialog" onClick={onCancel}><FiX /></button></header>
			<div className="work-edit-grid">{visibleFields.map(renderField)}</div>
			<footer className="work-edit-footer"><button className="work-edit-cancel" type="button" onClick={onCancel}>Cancel</button><button className="work-edit-submit" type="submit">Update</button></footer>
		</form>
	</div>;
};

WorkEditModal.propTypes = {
	form: PropTypes.object.isRequired,
	setForm: PropTypes.func.isRequired,
	fields: PropTypes.array.isRequired,
	onSave: PropTypes.func.isRequired,
	onCancel: PropTypes.func.isRequired,
};

export default WorkEditModal;
