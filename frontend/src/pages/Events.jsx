import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import apiRequest from "../utils/api";
import getHeader from "../utils/header";
import Navbar from "./Navbar";
import StatusBadge from "../components/StatusBadge";
import EmptyState from "../components/EmptyState";
import "../css/Finance.css";

const initialForm = { eventName: "", clientName: "", company: "", eventType: "", eventDate: "", city: "", venue: "", priority: "MEDIUM", description: "" };

const Events = () => {
	const [events, setEvents] = useState([]);
	const [count, setCount] = useState(0);
	const [status, setStatus] = useState("");
	const [search, setSearch] = useState("");
	const [dateFrom, setDateFrom] = useState("");
	const [dateTo, setDateTo] = useState("");
	const [client, setClient] = useState("");
	const [company, setCompany] = useState("");
	const [form, setForm] = useState(null);
	const load = useCallback(async () => { try { const query = new URLSearchParams({ limit: "200" }); if (status) query.set("status", status); if (search) query.set("search", search); if (dateFrom) query.set("dateFrom", dateFrom); if (dateTo) query.set("dateTo", dateTo); if (client) query.set("client", client); if (company) query.set("company", company); const response = await apiRequest(`/api/events?${query}`, { headers: getHeader() }); setEvents(response.data || []); setCount(response.meta?.total ?? response.data?.length ?? 0); } catch (error) { toast.error(error.message); } }, [status, search, dateFrom, dateTo, client, company]);
	useEffect(() => { load(); }, [load]);
	const save = async (event) => { event.preventDefault(); try { await apiRequest("/api/events", { method: "POST", headers: { ...getHeader(), "Content-Type": "application/json" }, body: JSON.stringify(form) }); toast.success("Event created"); setForm(null); load(); } catch (error) { toast.error(error.message); } };
	return <><Navbar /><main className="finance-container"><div className="finance-header"><div><h2>Events</h2><p>{count} records</p></div><button className="model-submit" onClick={() => setForm({ ...initialForm })}>Create Event</button></div><div className="finance-toolbar"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search events, client, city, or reference" /><input aria-label="Filter by client" placeholder="Client" value={client} onChange={(event) => setClient(event.target.value)} /><input aria-label="Filter by company" placeholder="Company" value={company} onChange={(event) => setCompany(event.target.value)} /><input aria-label="Events from date" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /><input aria-label="Events to date" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All Events</option><option value="DRAFT">Draft</option><option value="UPCOMING">Upcoming</option><option value="ONGOING">Active</option><option value="COMPLETED">Finished</option><option value="ARCHIVED">History</option></select></div><div className="finance-table-wrap"><table><thead><tr><th>Reference</th><th>Event</th><th>Client</th><th>Date</th><th>Status</th><th>Open</th></tr></thead><tbody>{events.length ? events.map((event) => <tr key={event._id}><td>{event.eventCode}</td><td>{event.eventName}</td><td>{event.clientName || "-"}</td><td>{event.eventDate || "-"}</td><td><StatusBadge status={event.status} /></td><td><Link to={`/events/${event._id}`}>View workspace</Link></td></tr>) : <tr><td colSpan="6"><EmptyState title="No events yet" description="Create your first event to start tracking operations and finances." action={<button className="model-submit" onClick={() => setForm({ ...initialForm })}>Create Event</button>} /></td></tr>}</tbody></table></div>{form && <form className="model" onSubmit={save}><h3>Create Event</h3><p className="form-helper">Set up the operational record first. Financial records can be added from the workspace.</p>{Object.entries(form).map(([key, value]) => key === "priority" ? <label key={key}>{key}<select value={value} onChange={(event) => setForm({ ...form, priority: event.target.value })}><option>LOW</option><option>MEDIUM</option><option>HIGH</option></select></label> : <label key={key}>{key}<input required={["eventName", "clientName", "city", "eventDate"].includes(key)} type={key === "eventDate" ? "date" : "text"} value={value} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></label>)}<div className="model-actions"><button className="model-submit">Create Event</button><button type="button" className="model-cancel" onClick={() => setForm(null)}>Cancel</button></div></form>}</main></>;
};
export default Events;
