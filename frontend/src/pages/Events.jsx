import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useSelector } from "react-redux";
import { toast } from "react-toastify";
import { FiBell, FiBriefcase, FiCalendar, FiCheck, FiChevronDown, FiChevronLeft, FiChevronRight, FiClock, FiFilter, FiMoreVertical, FiPlus, FiSearch, FiX } from "react-icons/fi";
import apiRequest from "../utils/api";
import getHeader from "../utils/header";
import Navbar from "./Navbar";
import StatusBadge from "../components/StatusBadge";
import "../css/Finance.css";

const initialForm = { eventName: "", clientName: "", company: "", eventType: "", eventDate: "", city: "", venue: "", priority: "MEDIUM", description: "" };
const PAGE_SIZE_OPTIONS = [10, 25, 50];
const dateLabel = (value) => {
	if (!value) return "—";
	const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
	return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-CA");
};
const makeRange = (range) => {
	const today = new Date();
	const asDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
	if (range === "month") return { dateFrom: asDate(new Date(today.getFullYear(), today.getMonth(), 1)), dateTo: asDate(new Date(today.getFullYear(), today.getMonth() + 1, 0)) };
	if (range === "next30") { const end = new Date(today); end.setDate(today.getDate() + 30); return { dateFrom: asDate(today), dateTo: asDate(end) }; }
	return { dateFrom: "", dateTo: "" };
};

const Events = () => {
	const auth = useSelector((store) => store.auth);
	const [events, setEvents] = useState([]);
	const [count, setCount] = useState(0);
	const [stats, setStats] = useState({ total: 0, UPCOMING: 0, ONGOING: 0, COMPLETED: 0 });
	const [status, setStatus] = useState("");
	const [search, setSearch] = useState("");
	const [dateFrom, setDateFrom] = useState("");
	const [dateTo, setDateTo] = useState("");
	const [range, setRange] = useState("");
	const [client, setClient] = useState("");
	const [clients, setClients] = useState([]);
	const [company, setCompany] = useState("");
	const [companyOptions, setCompanyOptions] = useState([]);
	const [showCompanyFilter, setShowCompanyFilter] = useState(false);
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);
	const [sortOrder, setSortOrder] = useState("desc");
	const [form, setForm] = useState(null);
	const [editing, setEditing] = useState(false);
	const [openMenu, setOpenMenu] = useState("");
	const [busy, setBusy] = useState(false);
	const name = auth?.name || "Workspace user";
	const requestHeaders = useMemo(() => getHeader(), []);

	const load = useCallback(async () => {
		try {
			const query = new URLSearchParams({ limit: String(pageSize), page: String(page), sort: "eventDate", order: sortOrder });
			if (status) query.set("status", status);
			if (search.trim()) query.set("search", search.trim());
			if (dateFrom) query.set("dateFrom", dateFrom);
			if (dateTo) query.set("dateTo", dateTo);
			if (client) query.set("client", client);
			if (company) query.set("company", company);
			const response = await apiRequest(`/api/events?${query}`, { headers: requestHeaders });
			setEvents(response.data || []);
			setCount(response.meta?.total ?? response.data?.length ?? 0);
		} catch (error) { toast.error(error.message); }
	}, [status, search, dateFrom, dateTo, client, company, page, pageSize, sortOrder, requestHeaders]);
	const loadStats = useCallback(async () => {
		try {
			const statuses = ["UPCOMING", "ONGOING", "COMPLETED"];
			const responses = await Promise.all([apiRequest("/api/events?limit=1", { headers: requestHeaders }), ...statuses.map((value) => apiRequest(`/api/events?limit=1&status=${value}`, { headers: requestHeaders })), apiRequest("/api/events?limit=200", { headers: requestHeaders })]);
			setStats({ total: responses[0].meta?.total || 0, ...Object.fromEntries(statuses.map((value, index) => [value, responses[index + 1].meta?.total || 0])) });
			const allEvents = responses[4].data || [];
			setClients([...new Set(allEvents.map((event) => event.clientName).filter(Boolean))].sort((a, b) => a.localeCompare(b)));
			setCompanyOptions([...new Set(allEvents.map((event) => event.company).filter(Boolean))].sort((a, b) => a.localeCompare(b)));
		} catch { /* Summary cards can remain at zero if the list request succeeds independently. */ }
	}, [requestHeaders]);
	useEffect(() => { load(); }, [load]);
	useEffect(() => { loadStats(); }, [loadStats]);
	const pageCount = Math.max(1, Math.ceil(count / pageSize));
	const currentPage = Math.min(page, pageCount);
	const startEntry = count ? (currentPage - 1) * pageSize + 1 : 0;
	const endEntry = Math.min(currentPage * pageSize, count);

	const setDateRange = (value) => {
		setRange(value);
		const dates = makeRange(value);
		setDateFrom(dates.dateFrom); setDateTo(dates.dateTo); setPage(1);
	};
	const reset = () => { setStatus(""); setSearch(""); setClient(""); setCompany(""); setDateRange(""); setPage(1); setPageSize(10); setSortOrder("desc"); setShowCompanyFilter(false); };
	const openCreate = () => { setEditing(false); setForm({ ...initialForm }); };
	const openEdit = (item) => {
		setEditing(true);
		setForm({ _id: item._id, ...Object.fromEntries(Object.keys(initialForm).map((key) => [key, item[key] ?? initialForm[key]])) });
		setOpenMenu("");
	};
	const save = async (event) => {
		event.preventDefault(); setBusy(true);
		try {
			await apiRequest(editing ? `/api/events/${form._id}` : "/api/events", { method: editing ? "PUT" : "POST", headers: { ...getHeader(), "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(Object.entries(form).filter(([key]) => key !== "_id"))) });
			toast.success(editing ? "Event updated" : "Event created"); setForm(null); await Promise.all([load(), loadStats()]);
		} catch (error) { toast.error(error.message); } finally { setBusy(false); }
	};
	const updateForm = (key, value) => setForm((current) => ({ ...current, [key]: value }));

	return <><Navbar /><main className="finance-container events-page">
		<header className="events-topbar">
			<label className="events-global-search"><FiSearch /><input aria-label="Global search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search events, clients, invoices, work..." /><span>⌘ K</span></label>
			<div className="events-account"><button className="events-date"><FiCalendar />{new Date().toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}</button><button className="events-bell" aria-label="Notifications"><FiBell /><i /></button><span className="events-divider" /><span className="events-avatar">{name.slice(0, 1).toUpperCase()}</span><strong>{name}</strong><FiChevronDown /></div>
		</header>
		<section className="events-heading"><div><p className="events-eyebrow">Event Management</p><h1>Events</h1><p>Create, manage and track all your events with clients, work items and invoices.</p></div><button className="events-create" onClick={openCreate}><FiPlus />Create Event</button></section>
		<section className="events-kpis" aria-label="Event summary">
			{[["Total Events", stats.total, "All events", "blue", <FiCalendar key="total" />, ""], ["Upcoming", stats.UPCOMING, "Scheduled events", "green", <FiCalendar key="upcoming" />, "UPCOMING"], ["Ongoing", stats.ONGOING, "Currently active", "blue", <FiClock key="ongoing" />, "ONGOING"], ["Completed", stats.COMPLETED, "Finished events", "purple", <FiCheck key="completed" />, "COMPLETED"]].map(([label, value, subtitle, tone, Icon, filterStatus]) => <button key={label} className={`events-kpi events-kpi-${tone}`} onClick={() => { setStatus(filterStatus); setPage(1); }}><span className="events-kpi-icon">{Icon}</span><span className="events-kpi-copy"><small>{label}</small><strong>{value}</strong><em>{subtitle}</em></span><span className="events-kpi-art" /><span className="events-kpi-arrow"><FiChevronRight /></span></button>)}
		</section>
		<section className="events-toolbar" aria-label="Search and filter events">
			<label className="events-record-search"><FiSearch /><input aria-label="Search events" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search events..." /></label>
			<label className="events-select"><span className="sr-only">Filter by status</span><select aria-label="Filter by status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">All Status</option><option value="DRAFT">Draft</option><option value="UPCOMING">Upcoming</option><option value="ONGOING">Ongoing</option><option value="COMPLETED">Completed</option><option value="ARCHIVED">Archived</option></select><FiChevronDown /></label>
			<label className="events-select"><span className="sr-only">Filter by client</span><select aria-label="Filter by client" value={client} onChange={(event) => { setClient(event.target.value); setPage(1); }}><option value="">All Clients</option>{clients.map((item) => <option key={item}>{item}</option>)}</select><FiChevronDown /></label>
			<label className="events-select events-time-select"><FiCalendar /><select aria-label="Filter by date" value={range} onChange={(event) => setDateRange(event.target.value)}><option value="">All Time</option><option value="month">This Month</option><option value="next30">Next 30 Days</option><option value="custom">Custom range…</option></select><FiChevronDown /></label>
			{range === "custom" && <div className="events-custom-range"><label>From<input aria-label="Events from date" type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} /></label><label>To<input aria-label="Events to date" type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} /></label></div>}
			<div className="events-extra-filter"><button className={company ? "active" : ""} aria-label="Additional filters" aria-expanded={showCompanyFilter} onClick={() => setShowCompanyFilter((value) => !value)}><FiFilter /></button>{showCompanyFilter && <div className="events-company-popover"><label>Company<select aria-label="Filter by company" value={company} onChange={(event) => { setCompany(event.target.value); setPage(1); }}><option value="">All Companies</option>{companyOptions.map((item) => <option key={item}>{item}</option>)}</select></label></div>}</div><span className="events-toolbar-spacer" /><button className="events-reset" onClick={reset}><FiX />Reset</button>
		</section>
		<section className="events-table-card"><div className="events-table-scroll"><table className="events-table"><thead><tr><th>Reference <span>↕</span></th><th>Event <span>↕</span></th><th>Client <span>↕</span></th><th><button onClick={() => { setSortOrder((order) => order === "asc" ? "desc" : "asc"); setPage(1); }}>Date <span>{sortOrder === "asc" ? "↑" : "↕"}</span></button></th><th>Status <span>↕</span></th><th>Open</th><th className="events-actions-heading">Actions</th></tr></thead><tbody>
			{events.map((item) => <tr key={item._id}><td className="events-reference" title={item.eventCode}>{item.eventCode || item._id}</td><td className="events-name">{item.eventName}</td><td>{item.clientName || "—"}</td><td>{dateLabel(item.eventDate)}</td><td><StatusBadge status={item.status} /></td><td><Link className="events-open-link" to={`/events/${item._id}`}>View workspace</Link></td><td className="events-row-menu"><button aria-label={`Actions for ${item.eventName}`} aria-expanded={openMenu === item._id} onClick={() => setOpenMenu((current) => current === item._id ? "" : item._id)}><FiMoreVertical /></button>{openMenu === item._id && <div className="events-menu"><Link to={`/events/${item._id}`} onClick={() => setOpenMenu("")}>View workspace</Link><button onClick={() => openEdit(item)}>Edit event</button></div>}</td></tr>)}
			{events.length === 0 && <tr><td colSpan="7" className="events-empty-cell"><div className="events-empty"><span><FiBriefcase /></span><h2>{count === 0 && !search && !status && !client && !company && !dateFrom && !dateTo ? "No events yet" : "No events found"}</h2><p>{count === 0 && !search && !status && !client && !company && !dateFrom && !dateTo ? "Create your first event to start tracking operations and finances." : "Try changing your search or filters."}</p><button onClick={count === 0 && !search && !status && !client && !company && !dateFrom && !dateTo ? openCreate : reset}><FiPlus />{count === 0 && !search && !status && !client && !company && !dateFrom && !dateTo ? "Create Event" : "Reset filters"}</button></div></td></tr>}
			</tbody></table></div><footer className="events-pagination"><p>Showing {startEntry} to {endEntry} of {count} entries</p><div className="events-page-controls"><button aria-label="Previous page" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(value - 1, 1))}><FiChevronLeft /></button><span>{currentPage}</span><button aria-label="Next page" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(value + 1, pageCount))}><FiChevronRight /></button><label><span className="sr-only">Rows per page</span><select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>{PAGE_SIZE_OPTIONS.map((value) => <option key={value} value={value}>{value} / page</option>)}</select><FiChevronDown /></label></div></footer></section>
		{form && <div className="events-form-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setForm(null); }}><form className="events-form" onSubmit={save}><header><div><p>{editing ? "Update event details" : "Create a new event"}</p><h2>{editing ? "Edit Event" : "Create Event"}</h2></div><button type="button" aria-label="Close" onClick={() => setForm(null)}><FiX /></button></header><div className="events-form-grid">{Object.entries(form).filter(([key]) => key !== "_id").map(([key, value]) => key === "priority" ? <label key={key}>{key}<select value={value} onChange={(event) => updateForm(key, event.target.value)}><option>LOW</option><option>MEDIUM</option><option>HIGH</option></select></label> : <label key={key}>{key}<input required={["eventName", "clientName", "city", "eventDate"].includes(key)} type={key === "eventDate" ? "date" : "text"} value={value} onChange={(event) => updateForm(key, event.target.value)} /></label>)}</div><div className="events-form-actions"><button type="button" onClick={() => setForm(null)}>Cancel</button><button type="submit" disabled={busy}>{busy ? "Saving…" : editing ? "Save Changes" : "Create Event"}</button></div></form></div>}
	</main></>;
};
export default Events;
