import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { Link } from "react-router-dom";
import { useSelector } from "react-redux";
import { FiActivity, FiArrowRight, FiCalendar, FiCheckSquare, FiChevronDown, FiChevronRight, FiClock, FiCreditCard, FiFileText, FiPlus, FiSearch, FiBell, FiClipboard } from "react-icons/fi";
import { toast } from "react-toastify";
import Navbar from "./Navbar";
import EmptyState from "../components/EmptyState";
import StatusBadge from "../components/StatusBadge";
import apiRequest from "../utils/api";
import getHeader from "../utils/header";
import "../css/DashboardHomeRedesign.css";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const groups = [["events", "Events"], ["proforma", "Proforma"], ["invoices", "Tax Invoices"], ["payments", "Payments"], ["payouts", "Payouts"], ["work", "Daily Work"]];
const iconMap = { upcoming: FiCalendar, active: FiActivity, invoice: FiFileText, work: FiCheckSquare, activity: FiClock };

const formatDate = (value, options = { day: "2-digit", month: "short" }) => value ? new Date(value).toLocaleDateString("en-GB", options).toUpperCase() : "-";
const formatDateTime = (value) => value ? new Date(value).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "-";

const PanelHeader = ({ type, title, subtitle, to }) => {
	const Icon = iconMap[type];
	return <div className="panel-heading"><div className={`panel-icon panel-icon-${type}`}><Icon /></div><div className="panel-title"><h2>{title}</h2><p>{subtitle}</p></div><Link className="view-all" to={to}>View all <FiArrowRight /></Link></div>;
};
PanelHeader.propTypes = { type: PropTypes.string.isRequired, title: PropTypes.string.isRequired, subtitle: PropTypes.string.isRequired, to: PropTypes.string.isRequired };

const EmptyPanel = ({ type, title, description, action, actionClass = "primary-action" }) => {
	const Icon = iconMap[type];
	return <div className="panel-empty"><div className="empty-icon"><Icon /></div><strong>{title}</strong><p>{description}</p>{action && <Link className={actionClass} to={action.to}>{action.icon}{action.label}</Link>}</div>;
};
EmptyPanel.propTypes = { type: PropTypes.string.isRequired, title: PropTypes.string.isRequired, description: PropTypes.string.isRequired, action: PropTypes.shape({ to: PropTypes.string.isRequired, icon: PropTypes.node, label: PropTypes.string.isRequired }), actionClass: PropTypes.string };

const DashboardHomeRedesign = () => {
	const auth = useSelector((store) => store.auth);
	const [summary, setSummary] = useState(null);
	const [query, setQuery] = useState("");
	const [results, setResults] = useState(null);
	const [error, setError] = useState(false);
	useEffect(() => { apiRequest("/api/dashboard/summary", { headers: getHeader() }).then((response) => setSummary(response.data)).catch(() => setError(true)); }, []);
	useEffect(() => { const timer = setTimeout(() => { if (query.trim().length < 2) return setResults(null); apiRequest(`/api/dashboard/search?q=${encodeURIComponent(query)}`, { headers: getHeader() }).then((response) => setResults(response.data)).catch(() => toast.error("Search unavailable")); }, 250); return () => clearTimeout(timer); }, [query]);
	const name = auth?.name || "Sumit";
	const firstName = name.split(" ")[0];
	const kpis = summary ? [
		["Active Events", summary.kpis.activeEvents, "Currently running", "blue", FiCalendar],
		["Upcoming Events", summary.kpis.upcomingEvents, "Scheduled ahead", "green", FiCalendar],
		["Pending Tasks", summary.kpis.pendingTasks, "Needs attention", "orange", FiCheckSquare],
		["Today's Work", summary.kpis.todaysWork, "Tasks logged today", "purple", FiClipboard],
		["Outstanding", money(summary.kpis.totalOutstanding), "Pending receivables", "red", FiCreditCard],
	] : [];
	return <><Navbar /><main className="operations-dashboard redesign-dashboard">
		<header className="top-header"><div className="global-search"><FiSearch className="search-icon" /><input aria-label="Global search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search events, invoices, payments, payouts, tasks..." /><span className="search-shortcut">⌘ K</span>{results && <div className="search-results">{groups.flatMap(([key, label]) => (results[key] || []).map((item) => <Link key={`${key}-${item._id}`} to={item.eventId ? `/events/${item.eventId}` : key === "events" ? `/events/${item._id}` : "/"}><strong>{label}</strong>{item.eventName || item.piNumber || item.invoiceNumber || item.referenceNumber || item.vendorName || item.workDescription || item._id}</Link>))}{!groups.some(([key]) => results[key]?.length) && <EmptyState title="No results found" description="Try searching for an event, invoice, payment or payout." />}</div>}</div><div className="header-account"><button className="header-bell" aria-label="Notifications"><FiBell /><span /></button><span className="header-divider" /><span className="header-avatar">{name.slice(0, 1).toUpperCase()}</span><strong>{name}</strong><FiChevronDown /></div></header>
		{error ? <section className="dashboard-message"><EmptyState title="Unable to load dashboard" description="Your data could not be loaded right now." action={<button className="primary-action" onClick={() => window.location.reload()}>Retry</button>} /></section> : !summary ? <section className="dashboard-message"><p>Loading dashboard...</p></section> : <>
		<section className="welcome-card"><div><p className="eyebrow">Operations overview</p><h1>Good morning, {firstName} <span>👋</span></h1><p className="welcome-copy">Here&apos;s what&apos;s happening with your events, invoices and work today.</p></div><div className="dashboard-actions"><Link className="secondary-action" to="/events"><FiCalendar />View Events</Link><Link className="primary-action" to="/events"><FiPlus />Create Event</Link></div></section>
		<section className="kpi-grid">{kpis.map(([label, value, subtitle, tone, Icon]) => <div className="kpi-card" key={label}><span className={`kpi-icon kpi-${tone}`}><Icon /></span><div className="kpi-copy"><span>{label}</span><strong>{value}</strong><small>{subtitle}</small></div><span className={`kpi-arrow kpi-${tone}`}><FiChevronRight /></span></div>)}</section>
		<section className="dashboard-grid">
			<section className="dashboard-panel upcoming-panel"><PanelHeader type="upcoming" title="Upcoming Events" subtitle="Your scheduled and upcoming events" to="/events" />{summary.upcomingEvents.length ? <div className="upcoming-list">{summary.upcomingEvents.slice(0, 1).map((event) => <Link className="upcoming-row" to={`/events/${event._id}`} key={event._id}><span className="date-block"><strong>{new Date(event.eventDate).getDate()}</strong><small>{formatDate(event.eventDate, { month: "short" })}</small></span><span className="event-copy"><strong>{event.eventName || "Untitled event"}</strong><small>{event.clientName || event.city || "Event details"}</small><span><FiClock /> Upcoming</span></span><span className="event-status"><StatusBadge status={event.status || "UPCOMING"} /><FiChevronRight /></span></Link>)}</div> : <EmptyPanel type="upcoming" title="No upcoming events" description="Create your first event to start tracking operations." action={{ to: "/events", label: "Create Event", icon: <FiCalendar /> }} />}</section>
			<section className="dashboard-panel"><PanelHeader type="active" title="Active Events" subtitle="Events currently in progress" to="/events" />{summary.activeEvents.length ? <div className="upcoming-list">{summary.activeEvents.map((event) => <Link className="upcoming-row" to={`/events/${event._id}`} key={event._id}><span className="date-block date-active"><strong><FiActivity /></strong><small>LIVE</small></span><span className="event-copy"><strong>{event.eventName || "Untitled event"}</strong><small>{event.clientName || event.city || "Event details"}</small></span><span className="event-status"><StatusBadge status={event.status} /><FiChevronRight /></span></Link>)}</div> : <EmptyPanel type="active" title="No active events" description="Events marked ongoing will appear here." action={{ to: "/events", label: "Create Event", icon: <FiCalendar /> }} />}</section>
			<section className="dashboard-panel"><PanelHeader type="invoice" title="Outstanding Invoices" subtitle="Invoices waiting for payment" to="/tax-invoices" />{summary.outstandingInvoices.length ? <div className="invoice-list">{summary.outstandingInvoices.slice(0, 3).map((invoice) => <Link className="invoice-row" to="/tax-invoices" key={invoice._id}><span><strong>{invoice.invoiceNumber || invoice.piNumber || "Invoice"}</strong><small>{invoice.event?.eventName || invoice.partyName || "Outstanding balance"}</small></span><strong>{money(invoice.outstandingAmount ?? invoice.balanceAmount)}</strong></Link>)}</div> : <EmptyPanel type="invoice" title="No outstanding invoices" description="Your receivables are currently clear." action={{ to: "/tax-invoices", label: "Create Invoice", icon: <FiFileText /> }} actionClass="secondary-action" />}</section>
			<section className="dashboard-panel"><PanelHeader type="work" title="Today's Work" subtitle="Tasks and activities for today" to="/daily-work" />{summary.todaysWork.length ? <div className="invoice-list">{summary.todaysWork.slice(0, 3).map((work) => <Link className="invoice-row" to="/daily-work" key={work._id}><span><strong>{work.workDescription || "Work logged"}</strong><small>{work.company || work.workCategory || "Daily work"}</small></span><FiChevronRight /></Link>)}</div> : <EmptyPanel type="work" title="No work logged today" description="Keep the team aligned by logging today's work." action={{ to: "/daily-work", label: "+ Add Work", icon: <FiPlus /> }} />}</section>
		</section>
		<section className="dashboard-panel activity-panel"><PanelHeader type="activity" title="Recent Activity" subtitle="Latest updates across events, invoices, work" to="/events" /><div className="activity-list">{summary.recentActivity.length ? summary.recentActivity.slice(0, 4).map((activity) => <Link className="activity-row" to={activity.eventId ? `/events/${activity.eventId}` : "/events"} key={activity._id}><span className="activity-dot" /><span><strong>{activity.description || "Event activity"}</strong><small>{formatDateTime(activity.createdAt)}</small></span><time>{activity.event?.eventDate || "-"}</time></Link>) : <div className="activity-empty">No recent activity</div>}</div></section>
		</>}
	</main></>;
};
export default DashboardHomeRedesign;
