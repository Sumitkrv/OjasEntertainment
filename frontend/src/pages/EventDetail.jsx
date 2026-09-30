import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { FiBriefcase, FiCalendar, FiCheckCircle, FiChevronDown, FiClock, FiCreditCard, FiDownload, FiFile, FiFileText, FiMapPin, FiTrendingUp, FiUpload, FiUser } from "react-icons/fi";
import apiRequest, { apiUrl } from "../utils/api";
import getHeader from "../utils/header";
import Navbar from "./Navbar";
import StatusBadge from "../components/StatusBadge";
import "../css/Finance.css";
import "../css/EventDetail.css";

const sections = [
	{ key: "proformaInvoices", title: "Proforma Invoices", emptyTitle: "No proforma invoices yet", emptyDescription: "Proforma invoices related to this event will appear here.", Icon: FiFileText },
	{ key: "taxInvoices", title: "Tax Invoices", emptyTitle: "No tax invoices yet", emptyDescription: "Tax invoices related to this event will appear here.", Icon: FiFileText },
	{ key: "payments", title: "Payments", emptyTitle: "No payments recorded", emptyDescription: "Payments recorded against this event will appear here.", Icon: FiCreditCard },
	{ key: "payouts", title: "Payouts", emptyTitle: "No payouts recorded", emptyDescription: "Payouts associated with this event will appear here.", Icon: FiCreditCard },
	{ key: "workLogs", title: "Daily Work", emptyTitle: "No daily work logged", emptyDescription: "Work items related to this event will appear here.", Icon: FiBriefcase },
];
const statusActions = { DRAFT: ["UPCOMING"], UPCOMING: ["ONGOING"], ONGOING: ["COMPLETED"], COMPLETED: ["ARCHIVED"], ARCHIVED: [] };
const actionLabels = { UPCOMING: "Mark Upcoming", ONGOING: "Mark Ongoing", COMPLETED: "Mark Completed", ARCHIVED: "Archive event" };
const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateLabel = (value) => value ? String(value).slice(0, 10) : "—";
const displayValue = (value) => value === 0 ? "0" : value || "—";
const workDuration = (row) => {
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

const tableColumns = {
	proformaInvoices: [
		["piNumber", "PI Number"], ["piDate", "Date", dateLabel], ["company", "Company", (value, row) => value || row.partyName || "—"],
		["grossInvoiceValue", "Amount", (value, row) => money(value ?? row.totalInvoiceValue ?? row.piAmount ?? row.amountDue)], ["status", "Status", (value) => <StatusBadge status={value || "ISSUED"} />],
	],
	taxInvoices: [
		["invoiceNumber", "Invoice Number", (value, row) => value || row.taxInvoiceNumber || "—"], ["invoiceDate", "Date", dateLabel], ["company", "Company", (value, row) => value || row.partyName || "—"],
		["grossInvoiceValue", "Amount", (value, row) => money(value ?? row.totalInvoiceValue)], ["status", "Status", (value) => <StatusBadge status={value || "ISSUED"} />],
	],
	payments: [
		["paymentDate", "Payment Date", dateLabel], ["referenceNumber", "Reference"], ["amount", "Amount", money],
		["paymentMode", "Payment Mode", (value) => String(value || "—").replaceAll("_", " ")], ["status", "Status", (value) => <StatusBadge status={value || "RECORDED"} />],
	],
	payouts: [
		["date", "Date", (value, row) => dateLabel(value || row.paymentDate)], ["vendorName", "Vendor"], ["company", "Company"], ["amount", "Amount", money], ["purpose", "Purpose"],
		["paymentMode", "Payment Mode", (value) => String(value || "—").replaceAll("_", " ")], ["chequeNumber", "Cheque Number"], ["chequeDate", "Cheque Date", dateLabel], ["status", "Status", (value) => <StatusBadge status={value || "PENDING"} />],
	],
	workLogs: [
		["workDate", "Date", (value, row) => dateLabel(value || row.date)], ["company", "Company"], ["workCategory", "Work Category", (value, row) => value || row.category || "—"],
		["workDescription", "Description"], ["priority", "Priority"], ["status", "Status", (value) => <StatusBadge status={value} />],
		["startTime", "Start Time"], ["endTime", "End Time"], ["duration", "Calculated", (value, row) => workDuration({ ...row, duration: value })],
	],
};

const EventDetail = () => {
	const { id } = useParams();
	const [detail, setDetail] = useState(null);
	const [summary, setSummary] = useState(null);
	const [file, setFile] = useState(null);
	const [expandedSections, setExpandedSections] = useState(() => new Set());
	const fileInputRef = useRef(null);
	const load = useCallback(async () => {
		try {
			const [eventResponse, summaryResponse] = await Promise.all([
				apiRequest(`/api/events/${id}`, { headers: getHeader() }),
				apiRequest(`/api/events/${id}/financial-summary`, { headers: getHeader() }),
			]);
			setDetail(eventResponse.data);
			setSummary(summaryResponse.data);
		} catch (error) {
			toast.error(error.message);
		}
	}, [id]);
	useEffect(() => { load(); }, [load]);

	if (!detail) return <><Navbar /><main className="finance-container event-workspace"><p>Loading event...</p></main></>;
	const event = detail.event;
	const changeStatus = async (status) => {
		try {
			const response = await apiRequest(`/api/events/${id}/status`, { method: "PATCH", headers: { ...getHeader(), "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
			const warnings = response.data?.completionWarnings || [];
			if (warnings.length) toast.warn(`Event completed with ${warnings.length} unresolved item(s). Review the Event workspace.`);
			else toast.success(`Event marked ${status.toLowerCase()}`);
			load();
		} catch (error) { toast.error(error.message); }
	};
	const upload = async (formEvent) => {
		formEvent.preventDefault();
		if (!file) return;
		try {
			const body = new FormData();
			body.append("file", file);
			body.append("eventId", id);
			body.append("documentType", "OTHER");
			await apiRequest("/api/documents", { method: "POST", headers: getHeader(body), body });
			toast.success("Document uploaded");
			setFile(null);
			if (fileInputRef.current) fileInputRef.current.value = "";
			load();
		} catch (error) { toast.error(error.message); }
	};
	const removeDocument = async (documentId) => {
		try {
			await apiRequest(`/api/documents/${documentId}`, { method: "DELETE", headers: getHeader() });
			toast.success("Document deleted");
			load();
		} catch (error) { toast.error(error.message); }
	};
	const nextActions = statusActions[event.status] || [];
	const toggleSection = (key) => setExpandedSections((current) => {
		const next = new Set(current);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		return next;
	});
	const overviewItems = [
		["Client", event.clientName, FiUser], ["Company", event.company, FiBriefcase], ["Event Date", event.eventDate, FiCalendar],
		["Location", [event.city, event.venue].filter(Boolean).join(" · "), FiMapPin],
	];

	return <>
		<Navbar />
		<main className="finance-container event-workspace">
			<header className="event-workspace-heading">
				<div className="event-heading-copy">
					<p className="event-breadcrumb"><Link to="/events">Events</Link><span>›</span><span>Workspace</span></p>
					<h1>{event.eventName}</h1>
					<div className="event-reference-row"><span>{event.eventCode || event._id}</span><StatusBadge status={event.status} /></div>
				</div>
				<div className="event-status-actions">{nextActions.map((status) => <button className="event-status-action" key={status} onClick={() => changeStatus(status)}>{actionLabels[status]}</button>)}{!nextActions.length && <span className="event-final-state"><FiCheckCircle />{event.status === "ARCHIVED" ? "Archived" : String(event.status || "").replaceAll("_", " ")}</span>}</div>
			</header>

			<section className="event-workspace-kpis" aria-label="Event financial summary">
				{[["Invoice Value", summary?.totalPIValue, FiFileText, "blue"], ["Total Due", summary?.totalDue, FiCreditCard, "purple"], ["Received", summary?.totalReceived, FiDownload, "green"], ["Outstanding", summary?.totalOutstanding, FiClock, "amber"], ["Overpaid", summary?.totalOverpaid, FiTrendingUp, "red"], ["Payout", summary?.totalPayout, FiBriefcase, "slate"]].map(([label, value, Icon, tone]) => <article className={`event-kpi-card event-kpi-${tone}`} key={label}><span className="event-kpi-icon"><Icon /></span><div><small>{label}</small><strong>{money(value)}</strong></div></article>)}
			</section>

			<section className="event-workspace-card event-overview-card">
				<header className="event-section-heading"><h2>Overview</h2></header>
				<div className="event-overview-grid">{overviewItems.map(([label, value, Icon]) => <div className="event-overview-item" key={label}><span className="event-overview-label"><Icon />{label}</span><strong>{displayValue(value)}</strong></div>)}</div>
				{event.description && <p className="event-description">{event.description}</p>}
			</section>

			<div className="event-related-sections">
				{sections.map(({ key, title, emptyTitle, emptyDescription, Icon }) => {
					const rows = detail[key] || [];
					const columns = [...tableColumns[key], ["eventId", "Event", (value) => value ? <Link to={`/events/${value}`}>Event</Link> : "—"]];
					const isExpanded = expandedSections.has(key);
					return <section className="event-workspace-card event-related-card" key={key}>
						<button className="event-section-toggle" type="button" aria-expanded={isExpanded} onClick={() => toggleSection(key)}><span className="event-section-title-icon"><Icon /></span><span className="event-section-toggle-copy"><strong>{title}</strong><small>{rows.length ? `${rows.length} ${rows.length === 1 ? "record" : "records"}` : "No records yet"}</small></span><span className="event-section-count">{rows.length}</span><FiChevronDown className={`event-section-chevron ${isExpanded ? "expanded" : ""}`} /></button>
						{isExpanded && (rows.length ? <div className="event-table-scroll"><table className="event-related-table"><thead><tr>{columns.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map((item) => <tr key={item._id}>{columns.map(([field, , render]) => <td key={`${item._id}-${field}`}>{render ? render(item[field], item) : displayValue(item[field])}</td>)}</tr>)}</tbody></table></div> : <div className="event-section-empty"><span><Icon /></span><strong>{emptyTitle}</strong><small>{emptyDescription}</small></div>)}
					</section>;
				})}
			</div>

			<section className="event-workspace-card event-documents-card">
				<header className="event-section-heading"><span className="event-section-title-icon"><FiFile /></span><h2>Documents</h2><span className="event-section-count">{(detail.documents || []).length}</span></header>
				{(detail.documents || []).length ? <ul className="event-document-list">{detail.documents.map((item) => <li key={item._id}><span className="event-document-icon"><FiFileText /></span><span className="event-document-info"><a href={apiUrl(item.url)} target="_blank" rel="noreferrer">{item.originalFileName || item.fileName}</a><small>{item.createdAt ? new Date(item.createdAt).toLocaleDateString("en-GB") : "Document"}</small></span><a className="event-document-download" href={apiUrl(item.url)} target="_blank" rel="noreferrer" aria-label={`Open ${item.originalFileName || item.fileName}`}><FiDownload /></a><button className="event-document-delete" type="button" onClick={() => removeDocument(item._id)}>Delete</button></li>)}</ul> : <div className="event-section-empty event-documents-empty"><span><FiFile /></span><strong>No documents yet</strong><small>Upload event files to keep them together in one place.</small></div>}
				<form className="event-upload-form" onSubmit={upload}>
					<input ref={fileInputRef} className="event-file-input" id="event-document-file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} />
					<label className="event-choose-file" htmlFor="event-document-file"><FiFile />Choose file</label>
					<span className="event-selected-file">{file?.name || "No file chosen"}</span>
					<button className="event-upload-button" type="submit" disabled={!file}><FiUpload />Upload document</button>
				</form>
			</section>

			<section className="event-workspace-card event-activity-card">
				<header className="event-section-heading"><span className="event-section-title-icon"><FiClock /></span><h2>Activity</h2><span className="event-section-count">{(detail.activities || []).length}</span></header>
				{(detail.activities || []).length ? <ol className="event-activity-timeline">{detail.activities.map((item) => <li key={item._id}><span className="event-timeline-dot" /><div><strong>{item.description}</strong><small>{item.createdAt ? new Date(item.createdAt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) : ""}</small></div></li>)}</ol> : <div className="event-section-empty event-activity-empty"><span><FiClock /></span><strong>No activity yet</strong><small>Changes and updates for this event will appear here.</small></div>}
			</section>
		</main>
	</>;
};

export default EventDetail;
