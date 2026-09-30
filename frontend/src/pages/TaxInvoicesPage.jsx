import { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { FiBell, FiCalendar, FiChevronDown, FiChevronLeft, FiChevronRight, FiDollarSign, FiFileText, FiMoreVertical, FiPlus, FiRefreshCw, FiSearch, FiX } from "react-icons/fi";
import apiRequest from "../utils/api";
import getHeader from "../utils/header";
import "../css/Finance.css";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateLabel = (value) => {
	if (!value) return "—";
	const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
	return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-CA");
};
const statusClass = (status) => {
	const normalized = String(status || "ISSUED").toUpperCase();
	if (["PAID", "COMPLETED"].includes(normalized)) return "paid";
	if (["PENDING", "DRAFT", "PROCESSING"].includes(normalized)) return "pending";
	if (["CANCELLED", "CANCELED", "VOID"].includes(normalized)) return "cancelled";
	return "open";
};
const setRangeDates = (range) => {
	const today = new Date();
	const format = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
	if (range === "month") return { from: format(new Date(today.getFullYear(), today.getMonth(), 1)), to: format(new Date(today.getFullYear(), today.getMonth() + 1, 0)) };
	if (range === "30days") { const from = new Date(today); from.setDate(today.getDate() - 30); return { from: format(from), to: format(today) }; }
	return { from: "", to: "" };
};

const TaxInvoicesPage = ({ rows, onRefresh }) => {
	const auth = useSelector((store) => store.auth);
	const navigate = useNavigate();
	const [query, setQuery] = useState("");
	const [status, setStatus] = useState("");
	const [sort, setSort] = useState("invoiceDate");
	const [direction, setDirection] = useState("desc");
	const [range, setRange] = useState("");
	const [dateFrom, setDateFrom] = useState("");
	const [dateTo, setDateTo] = useState("");
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);
	const [menuId, setMenuId] = useState("");
	const [viewing, setViewing] = useState(null);
	const [loadingView, setLoadingView] = useState(false);
	const [references, setReferences] = useState({ proformas: {}, events: {} });
	const name = auth?.name || "Workspace user";
	useEffect(() => {
		let active = true;
		Promise.allSettled([apiRequest("/api/proforma", { headers: getHeader() }), apiRequest("/api/events?limit=200", { headers: getHeader() })]).then(([proformas, events]) => {
			if (!active) return;
			setReferences({
				proformas: proformas.status === "fulfilled" ? Object.fromEntries((proformas.value.data || []).map((row) => [String(row._id), row.piNumber])) : {},
				events: events.status === "fulfilled" ? Object.fromEntries((events.value.data || []).map((row) => [String(row._id), row.eventName])) : {},
			});
		});
		return () => { active = false; };
	}, []);
	const statuses = [...new Set(rows.map((row) => row.status).filter(Boolean))].sort();
	const filtered = useMemo(() => rows.filter((row) => {
		const text = [row.invoiceNumber, row.proformaInvoiceId, row.eventId, row.partyName, row.company, row.status].join(" ").toLowerCase();
		return (!query || text.includes(query.toLowerCase())) && (!status || row.status === status) && (!dateFrom || String(row.invoiceDate || "").slice(0, 10) >= dateFrom) && (!dateTo || String(row.invoiceDate || "").slice(0, 10) <= dateTo);
	}).sort((a, b) => {
		const left = a[sort] ?? ""; const right = b[sort] ?? "";
		return (left > right ? 1 : left < right ? -1 : 0) * (direction === "asc" ? 1 : -1);
	}), [rows, query, status, dateFrom, dateTo, sort, direction]);
	const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
	const currentPage = Math.min(page, pageCount);
	const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
	const first = filtered.length ? (currentPage - 1) * pageSize + 1 : 0;
	const last = Math.min(currentPage * pageSize, filtered.length);
	const reset = () => { setQuery(""); setStatus(""); setSort("invoiceDate"); setDirection("desc"); setRange(""); setDateFrom(""); setDateTo(""); setPage(1); setPageSize(10); setMenuId(""); };
	const selectRange = (value) => { setRange(value); const dates = setRangeDates(value); setDateFrom(dates.from); setDateTo(dates.to); setPage(1); };
	const openInvoice = async (id) => {
		setLoadingView(true); setMenuId("");
		try { const response = await apiRequest(`/api/tax-invoices/${id}`, { headers: getHeader() }); setViewing(response.data); }
		catch (error) { window.alert(error.message); }
		finally { setLoadingView(false); }
	};
	const createInvoice = () => navigate("/proforma");
	const value = rows.reduce((total, invoice) => total + Number(invoice.grossInvoiceValue ?? invoice.totalInvoiceValue ?? 0), 0);
	const empty = rows.length === 0 && !query && !status && !dateFrom && !dateTo;

	return <main className="finance-container tax-invoices-page">
		<header className="tax-topbar"><label className="tax-global-search"><FiSearch /><input aria-label="Global search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search invoices, clients, events, PI number..." /><span>⌘ K</span></label><div className="tax-account"><button className="tax-date"><FiCalendar />{new Date().toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}</button><button className="tax-bell" aria-label="Notifications"><FiBell /><i /></button><span className="tax-divider" /><span className="tax-avatar">{name.slice(0, 1).toUpperCase()}</span><strong>{name}</strong><FiChevronDown /></div></header>
		<section className="tax-heading"><div><p className="tax-breadcrumb">Finance <span>›</span> Tax Invoices</p><h1>Tax Invoices</h1><p>Create, manage and track all your tax invoices with clients, events and payment details.</p></div><button className="tax-create" onClick={createInvoice}><FiPlus />Create Tax Invoice</button></section>
		<section className="tax-kpis" aria-label="Tax invoice summary"><div className="tax-kpi"><span className="tax-kpi-icon blue"><FiFileText /></span><span className="tax-kpi-copy"><small>Total Tax Invoices</small><strong>{rows.length}</strong><em>All tax invoices</em></span><span className="tax-wave blue-wave" /><span className="tax-arrow">›</span></div><div className="tax-kpi"><span className="tax-kpi-icon green"><FiDollarSign /></span><span className="tax-kpi-copy"><small>Total Value</small><strong>{money(value)}</strong><em>Gross value of all invoices</em></span><span className="tax-wave green-wave" /></div></section>
		<section className="tax-toolbar" aria-label="Search and filter tax invoices"><label className="tax-record-search"><FiSearch /><input aria-label="Search records" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search records..." /></label><label className="tax-select"><span className="sr-only">Filter by status</span><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">All status</option>{statuses.map((value) => <option key={value}>{value}</option>)}</select><FiChevronDown /></label><label className="tax-select tax-sort"><span className="sr-only">Sort invoices</span><select value={`${sort}|${direction}`} onChange={(event) => { const [key, order] = event.target.value.split("|"); setSort(key); setDirection(order); setPage(1); }}><option value="invoiceDate|desc">Sort by invoice date</option><option value="invoiceDate|asc">Invoice date, oldest first</option><option value="grossInvoiceValue|desc">Sort by gross value</option><option value="grossInvoiceValue|asc">Gross value, low to high</option></select><FiChevronDown /></label><label className="tax-select tax-time"><FiCalendar /><select aria-label="Filter by invoice date" value={range} onChange={(event) => selectRange(event.target.value)}><option value="">All time</option><option value="month">This month</option><option value="30days">Last 30 days</option><option value="custom">Custom range…</option></select><FiChevronDown /></label>{range === "custom" && <div className="tax-custom-range"><input aria-label="Invoice date from" type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} /><input aria-label="Invoice date to" type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} /></div>}<button className="tax-toolbar-icon" aria-label="Refresh invoices" title="Refresh invoices" onClick={onRefresh}><FiRefreshCw /></button><button className="tax-reset" onClick={reset}><FiRefreshCw />Reset</button></section>
		<section className="tax-table-card"><div className="tax-table-scroll"><table className="tax-table"><thead><tr>{[["invoiceNumber", "Invoice Number"], ["invoiceDate", "Invoice Date"], ["proformaInvoiceId", "PI Reference"], ["eventId", "Event Reference"], ["partyName", "Party"], ["company", "Company"], ["taxableValue", "Taxable Value"], ["gstAmount", "GST"], ["tdsAmount", "TDS"], ["grossInvoiceValue", "Gross Value"], ["netPayable", "Net Payable"]].map(([key, label]) => <th key={key}><button onClick={() => { if (sort === key) setDirection(direction === "asc" ? "desc" : "asc"); else { setSort(key); setDirection("desc"); } setPage(1); }}>{label}<span>{sort === key ? direction === "asc" ? "↑" : "↓" : "↕"}</span></button></th>)}<th>Status</th><th className="tax-actions-heading">Actions</th></tr></thead><tbody>
			{pageRows.map((row) => <tr key={row._id}><td className="tax-invoice-number">{row.invoiceNumber || "—"}</td><td>{dateLabel(row.invoiceDate)}</td><td className="tax-reference">{row.relatedProformaInvoice?.piNumber || references.proformas[String(row.proformaInvoiceId)] || (row.proformaInvoiceId ? String(row.proformaInvoiceId).slice(-8) : "—")}</td><td className="tax-reference">{row.relatedEvent?.eventName || references.events[String(row.eventId)] || (row.eventId ? String(row.eventId).slice(-8) : "—")}</td><td>{row.partyName || "—"}</td><td>{row.company || "—"}</td><td>{money(row.taxableValue)}</td><td>{money(row.gstAmount ?? row.gst)}</td><td>{money(row.tdsAmount)}</td><td>{money(row.grossInvoiceValue ?? row.totalInvoiceValue)}</td><td>{money(row.netPayable)}</td><td><span className={`tax-status status-${statusClass(row.status)}`}><i />{String(row.status || "ISSUED").replaceAll("_", " ")}</span></td><td className="tax-row-actions"><button aria-label={`Actions for ${row.invoiceNumber || "tax invoice"}`} aria-expanded={menuId === row._id} onClick={() => setMenuId((current) => current === row._id ? "" : row._id)}><FiMoreVertical /></button>{menuId === row._id && <div className="tax-menu"><button onClick={() => openInvoice(row._id)}>View invoice</button></div>}</td></tr>)}
			{pageRows.length === 0 && <tr><td colSpan="13" className="tax-empty-cell"><div className="tax-empty"><span><FiFileText /></span><h2>{empty ? "No tax invoices yet" : "No matching tax invoices"}</h2><p>{empty ? "Create your first tax invoice to get started. Once created, it will appear here with all the details." : "Try changing your search, status, or date filter."}</p><button onClick={empty ? createInvoice : reset}><FiPlus />{empty ? "Create Tax Invoice" : "Reset filters"}</button></div></td></tr>}
		</tbody></table></div><footer className="tax-pagination"><p>Showing {first} to {last} of {filtered.length} entries</p><div className="tax-page-controls"><button aria-label="Previous page" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(value - 1, 1))}><FiChevronLeft /></button><span>{currentPage}</span><button aria-label="Next page" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(value + 1, pageCount))}><FiChevronRight /></button><label><span className="sr-only">Rows per page</span><select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={10}>10 / page</option><option value={25}>25 / page</option><option value={50}>50 / page</option></select><FiChevronDown /></label></div></footer></section>
		{viewing && <div className="tax-view-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setViewing(null); }}><section className="tax-view-dialog"><header><div><small>Tax invoice details</small><h2>{viewing.invoiceNumber || "Tax Invoice"}</h2></div><button aria-label="Close invoice details" onClick={() => setViewing(null)}><FiX /></button></header><div className="tax-view-grid">{[["Invoice Date", dateLabel(viewing.invoiceDate)], ["Proforma Reference", viewing.relatedProformaInvoice?.piNumber || "—"], ["Event", viewing.relatedEvent?.eventName || "—"], ["Party", viewing.partyName], ["Company", viewing.company], ["Taxable Value", money(viewing.taxableValue)], ["GST", money(viewing.gstAmount ?? viewing.gst)], ["TDS", money(viewing.tdsAmount)], ["Gross Value", money(viewing.grossInvoiceValue)], ["Net Payable", money(viewing.netPayable)], ["Status", viewing.status]].map(([label, value]) => <div key={label}><small>{label}</small><strong>{value || "—"}</strong></div>)}</div><footer><button onClick={() => setViewing(null)}>Close</button></footer></section></div>}{loadingView && <div className="tax-loading-view" role="status">Loading invoice details…</div>}
	</main>;
};

TaxInvoicesPage.propTypes = { rows: PropTypes.arrayOf(PropTypes.object).isRequired, onRefresh: PropTypes.func.isRequired };
export default TaxInvoicesPage;
