import { useMemo, useState } from "react";
import PropTypes from "prop-types";
import { useSelector } from "react-redux";
import { FiBell, FiBriefcase, FiCalendar, FiCheckCircle, FiChevronDown, FiChevronLeft, FiChevronRight, FiClock, FiEdit2, FiFileText, FiFilter, FiPlus, FiRefreshCw, FiSearch, FiTrash2, FiArrowUp, FiArrowDown } from "react-icons/fi";

const columns = [
	["date", "Date"], ["company", "Company"], ["workCategory", "Work Category"], ["workDescription", "Work Description"], ["priority", "Priority"], ["status", "Status"], ["startTime", "Start Time"], ["endTime", "End Time"],
];

const dateLabel = (value) => {
	if (!value) return "—";
	const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
	return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};
const timeLabel = (value) => {
	if (!value) return "—";
	const [hours, minutes] = String(value).split(":").map(Number);
	if (Number.isNaN(hours) || Number.isNaN(minutes)) return value;
	return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
};
const durationLabel = (row) => {
	const provided = row.workHours ?? row.hours ?? row.duration;
	if (provided !== undefined && provided !== null && provided !== "") return `${provided} hrs`;
	if (!row.startTime || !row.endTime) return "—";
	const [startHour, startMinute] = row.startTime.split(":").map(Number);
	const [endHour, endMinute] = row.endTime.split(":").map(Number);
	if ([startHour, startMinute, endHour, endMinute].some(Number.isNaN)) return "—";
	let minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
	if (minutes < 0) minutes += 24 * 60;
	return `${(minutes / 60).toFixed(1)} hrs`;
};
const normalizedStatus = (status) => String(status || "").toUpperCase().replace(/[ _-]+/g, " ").trim();
const FilterSelect = ({ label, value, options, onChange }) => <label className="work-select-wrap"><span className="sr-only">{label}</span><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}><option value="">All {label}</option>{options.map((option) => <option key={String(option)} value={option}>{option}</option>)}</select><FiChevronDown /></label>;
FilterSelect.propTypes = { label: PropTypes.string.isRequired, value: PropTypes.string, options: PropTypes.array, onChange: PropTypes.func.isRequired };

const DailyWorkPage = ({ rows, filtered, query, setQuery, filter, setFilter, sort, setSort, sortDirection, setSortDirection, values, fields, onCreate, onEdit, onDelete, onReset }) => {
	const auth = useSelector((store) => store.auth);
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);
	const [selected, setSelected] = useState([]);
	const [filterPopover, setFilterPopover] = useState(false);
	const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
	const currentPage = Math.min(page, pageCount);
	const pageRows = useMemo(() => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize), [filtered, currentPage, pageSize]);
	const completedCount = rows.filter((row) => ["COMPLETED", "DONE"].includes(normalizedStatus(row.status))).length;
	const pendingCount = rows.filter((row) => ["PENDING", "BLOCKED"].includes(normalizedStatus(row.status))).length;
	const progressCount = rows.filter((row) => normalizedStatus(row.status) === "IN PROGRESS").length;
	const completionPercent = rows.length ? Math.round(completedCount / rows.length * 100) : 0;
	const activeFilterCount = Object.values(filter).filter(Boolean).length;
	const optionsFor = (key) => [...new Set([...(fields.find(([field]) => field === key)?.[3] || []), ...values(key)])];
	const updateFilter = (key, value) => { setFilter((previous) => ({ ...previous, [key]: value })); setPage(1); setSelected([]); };
	const clearFilters = () => { setFilter({}); setFilterPopover(false); setPage(1); setSelected([]); };
	const reset = () => { onReset(); setPage(1); setPageSize(10); setSelected([]); setFilterPopover(false); };
	const toggleRow = (id) => setSelected((previous) => previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]);
	const togglePage = () => setSelected((previous) => pageRows.every((row) => previous.includes(row._id)) ? previous.filter((id) => !pageRows.some((row) => row._id === id)) : [...new Set([...previous, ...pageRows.map((row) => row._id)])]);
	const startEntry = filtered.length ? (currentPage - 1) * pageSize + 1 : 0;
	const endEntry = Math.min(currentPage * pageSize, filtered.length);
	const name = auth?.name || "Sumit Thakur";

	return <main className="finance-container work-page">
		<header className="work-topbar">
			<div className="work-global-search"><FiSearch /><input aria-label="Search work items" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search work items, events, invoices, people..." /><span>⌘ K</span></div>
			<div className="work-top-actions"><button className="work-date"><FiCalendar />Tue, 30 Sep 2026</button><button className="work-bell" aria-label="Notifications"><FiBell /><i /></button><span className="work-divider" /><span className="work-avatar">{name.slice(0, 1).toUpperCase()}</span><strong>{name}</strong><FiChevronDown className="work-user-chevron" /></div>
		</header>
		<section className="work-page-heading"><div><p className="work-eyebrow">Work Management</p><h1>Daily Work</h1><p>Track, manage and complete your daily work items across events, invoices and operations.</p></div><button className="work-create-button" onClick={onCreate}><FiPlus />Create Work</button></section>
		<section className="work-kpis" aria-label="Daily work summary">
			{[["Total Work Items", rows.length, "All time tasks", "blue", <FiFileText key="all-work-icon" />], ["Completed", completedCount, `${completionPercent}% completion`, "green", <FiCheckCircle key="completed-icon" />], ["Pending", pendingCount, "Awaiting action", "orange", <FiClock key="pending-icon" />], ["In Progress", progressCount, "Currently active", "purple", <FiRefreshCw key="progress-icon" />]].map(([label, value, subtitle, tone, Icon]) => <button key={label} className={`work-kpi work-kpi-${tone}`} onClick={() => { if (label === "Total Work Items") reset(); else updateFilter("status", label === "In Progress" ? "In Progress" : label); }}><span className={`work-kpi-icon ${tone}`}>{Icon}</span><span className="work-kpi-copy"><small>{label}</small><strong>{value}</strong><em>{subtitle}</em></span><span className="work-kpi-art" aria-hidden="true" /><span className="work-kpi-arrow"><FiChevronRight /></span></button>)}
		</section>
		<section className="work-toolbar" aria-label="Search and filter work items">
			<label className="work-record-search"><FiSearch /><input aria-label="Search records" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search records..." /></label>
			<FilterSelect label="Company" value={filter.company || ""} options={optionsFor("company")} onChange={(value) => updateFilter("company", value)} />
			<FilterSelect label="Work Category" value={filter.workCategory || ""} options={optionsFor("workCategory")} onChange={(value) => updateFilter("workCategory", value)} />
			<FilterSelect label="Status" value={filter.status || ""} options={optionsFor("status")} onChange={(value) => updateFilter("status", value)} />
			<FilterSelect label="Priority" value={filter.priority || ""} options={optionsFor("priority")} onChange={(value) => updateFilter("priority", value)} />
			<label className="work-sort-control"><FiCalendar /><select aria-label="Sort by date" value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}><option value="date">Sort by date</option></select><button type="button" aria-label={`Sort ${sortDirection === "asc" ? "descending" : "ascending"}`} title={sortDirection === "asc" ? "Oldest first" : "Newest first"} onClick={() => setSortDirection(sortDirection === "asc" ? "desc" : "asc")}>{sortDirection === "asc" ? <FiArrowUp /> : <FiArrowDown />}</button><FiChevronDown /></label>
			<div className="work-toolbar-spacer" />
			<div className="work-filter-wrap"><button className={`work-filter-button ${activeFilterCount ? "has-filters" : ""}`} aria-label="Filter options" aria-expanded={filterPopover} onClick={() => setFilterPopover((open) => !open)}><FiFilter />{activeFilterCount > 0 && <span>{activeFilterCount}</span>}</button>{filterPopover && <div className="work-filter-popover"><strong>{activeFilterCount ? `${activeFilterCount} active filter${activeFilterCount === 1 ? "" : "s"}` : "No filters selected"}</strong><p>Use the company, category, status and priority controls to narrow these results.</p>{activeFilterCount > 0 && <button onClick={clearFilters}>Clear filters</button>}</div>}</div>
			<button className="work-reset-button" onClick={reset}>Reset</button>
		</section>
		<section className="work-table-card">
			<div className="work-table-scroll"><table className="work-table"><thead><tr><th className="work-check-cell"><input type="checkbox" aria-label="Select current page" checked={pageRows.length > 0 && pageRows.every((row) => selected.includes(row._id))} onChange={togglePage} /></th>{columns.map(([key, label]) => <th key={key}>{key === sort ? <button className="is-sorted" onClick={() => setSortDirection(sortDirection === "asc" ? "desc" : "asc")}>{label}{sortDirection === "asc" ? <FiArrowUp /> : <FiArrowDown />}</button> : <span>{label}<span className="work-sort-both">↕</span></span>}</th>)}<th>Calculated</th><th>Actions</th></tr></thead>
							<tbody>{pageRows.map((row) => <tr key={row._id}><td className="work-check-cell"><input type="checkbox" aria-label={`Select ${row.workDescription || "work item"}`} checked={selected.includes(row._id)} onChange={() => toggleRow(row._id)} /></td><td>{dateLabel(row.date)}</td><td>{row.company || "—"}</td><td>{row.workCategory || "—"}</td><td className="work-description-cell" title={row.workDescription}>{row.workDescription || "—"}</td><td><span className={`work-priority priority-${String(row.priority || "").toLowerCase()}`}>{row.priority || "—"}</span></td><td><span className={`work-status status-${normalizedStatus(row.status).toLowerCase().replace(/\s+/g, "-")}`}>{row.status || "—"}</span></td><td>{timeLabel(row.startTime)}</td><td>{timeLabel(row.endTime)}</td><td>{durationLabel(row)}</td><td className="work-row-actions"><button className="work-edit-action" aria-label={`Edit ${row.workDescription || "work item"}`} title="Edit" onClick={() => onEdit(row)}><FiEdit2 /></button><button className="work-delete-action" aria-label={`Delete ${row.workDescription || "work item"}`} title="Delete" onClick={() => onDelete(row._id)}><FiTrash2 /></button></td></tr>)}
				{pageRows.length === 0 && <tr><td colSpan={columns.length + 3} className="work-empty-cell"><div className="work-empty-state"><span><FiBriefcase /></span><h2>{rows.length === 0 ? "No work items found" : "No matching work items"}</h2><p>{rows.length === 0 ? "You haven't added any work items yet." : "Try changing your search or filters."}</p><button onClick={rows.length === 0 ? onCreate : reset}><FiPlus />{rows.length === 0 ? "Create Work" : "Reset filters"}</button></div></td></tr>}</tbody>
			</table></div>
			<footer className="work-pagination"><p>Showing {startEntry} to {endEntry} of {filtered.length} entries</p><div className="work-page-controls"><button aria-label="Previous page" disabled={currentPage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><FiChevronLeft /></button><span>{currentPage}</span><button aria-label="Next page" disabled={currentPage >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}><FiChevronRight /></button><label><span className="sr-only">Rows per page</span><select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={10}>10 / page</option><option value={25}>25 / page</option><option value={50}>50 / page</option></select><FiChevronDown /></label></div></footer>
		</section>
	</main>;
};

DailyWorkPage.propTypes = {
	rows: PropTypes.arrayOf(PropTypes.object).isRequired,
	filtered: PropTypes.arrayOf(PropTypes.object).isRequired,
	query: PropTypes.string.isRequired,
	setQuery: PropTypes.func.isRequired,
	filter: PropTypes.object.isRequired,
	setFilter: PropTypes.func.isRequired,
	sort: PropTypes.string.isRequired,
	setSort: PropTypes.func.isRequired,
	sortDirection: PropTypes.string.isRequired,
	setSortDirection: PropTypes.func.isRequired,
	values: PropTypes.func.isRequired,
	fields: PropTypes.array.isRequired,
	onCreate: PropTypes.func.isRequired,
	onEdit: PropTypes.func.isRequired,
	onDelete: PropTypes.func.isRequired,
	onReset: PropTypes.func.isRequired,
};

export default DailyWorkPage;
