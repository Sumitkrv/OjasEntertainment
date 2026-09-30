import { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { FiBarChart2, FiBell, FiCalendar, FiCheck, FiChevronDown, FiChevronLeft, FiChevronRight, FiClock, FiCreditCard, FiFilter, FiMoreVertical, FiPlus, FiRefreshCw, FiSearch, FiX } from "react-icons/fi";
import apiRequest from "../utils/api";
import getHeader from "../utils/header";
import "../css/Finance.css";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateLabel = (value) => {
	if (!value) return "—";
	const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
	return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-CA");
};
const dateBounds = (range) => {
	const today = new Date();
	const format = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
	if (range === "month") return { from: format(new Date(today.getFullYear(), today.getMonth(), 1)), to: format(new Date(today.getFullYear(), today.getMonth() + 1, 0)) };
	if (range === "30days") { const from = new Date(today); from.setDate(today.getDate() - 30); return { from: format(from), to: format(today) }; }
	return { from: "", to: "" };
};
const tone = (status) => {
	const value = String(status || "RECORDED").toUpperCase();
	if (value === "CANCELLED" || value === "FAILED") return "cancelled";
	if (value === "PENDING") return "pending";
	return "received";
};

const PaymentsPage = ({ rows, onCreate, onEdit, onDelete }) => {
	const auth = useSelector((store) => store.auth);
	const [query, setQuery] = useState("");
	const [paymentMode, setPaymentMode] = useState("");
	const [status, setStatus] = useState("");
	const [sort, setSort] = useState("paymentDate");
	const [direction, setDirection] = useState("desc");
	const [range, setRange] = useState("");
	const [dateFrom, setDateFrom] = useState("");
	const [dateTo, setDateTo] = useState("");
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);
	const [filterOpen, setFilterOpen] = useState(false);
	const [menuId, setMenuId] = useState("");
	const [viewing, setViewing] = useState(null);
	const [references, setReferences] = useState({ proformas: {}, taxInvoices: {} });
	const [modes, setModes] = useState([]);
	const [statuses, setStatuses] = useState([]);
	const name = auth?.name || "Workspace user";
	useEffect(() => {
		let active = true;
		Promise.allSettled([apiRequest("/api/proforma", { headers: getHeader() }), apiRequest("/api/tax-invoices", { headers: getHeader() })]).then(([proformas, taxInvoices]) => {
			if (!active) return;
			const piRows = proformas.status === "fulfilled" ? proformas.value.data || [] : [];
			const taxRows = taxInvoices.status === "fulfilled" ? taxInvoices.value.data || [] : [];
			setReferences({ proformas: Object.fromEntries(piRows.map((row) => [String(row._id), row.piNumber])), taxInvoices: Object.fromEntries(taxRows.map((row) => [String(row._id), row.invoiceNumber])) });
		});
		return () => { active = false; };
	}, []);
	useEffect(() => {
		setModes([...new Set(rows.map((row) => row.paymentMode).filter(Boolean))].sort());
		setStatuses([...new Set(rows.map((row) => row.status).filter(Boolean))].sort());
	}, [rows]);
	const filtered = useMemo(() => rows.filter((row) => {
		const invoiceRef = row.taxInvoiceId ? references.taxInvoices[String(row.taxInvoiceId)] : references.proformas[String(row.proformaInvoiceId)];
		const text = [row.referenceNumber, row.paymentMode, row.status, row.proformaInvoiceId, row.taxInvoiceId, invoiceRef].join(" ").toLowerCase();
		return (!query || text.includes(query.toLowerCase())) && (!paymentMode || row.paymentMode === paymentMode) && (!status || row.status === status) && (!dateFrom || String(row.paymentDate || "").slice(0, 10) >= dateFrom) && (!dateTo || String(row.paymentDate || "").slice(0, 10) <= dateTo);
	}).sort((a, b) => {
		const left = a[sort] ?? ""; const right = b[sort] ?? "";
		return (left > right ? 1 : left < right ? -1 : 0) * (direction === "asc" ? 1 : -1);
	}), [rows, references, query, paymentMode, status, dateFrom, dateTo, sort, direction]);
	const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
	const currentPage = Math.min(page, pageCount);
	const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
	const first = filtered.length ? (currentPage - 1) * pageSize + 1 : 0;
	const last = Math.min(currentPage * pageSize, filtered.length);
	const recorded = rows.filter((row) => !["CANCELLED", "FAILED"].includes(String(row.status || "").toUpperCase()));
	const received = recorded.reduce((total, row) => total + Number(row.amount || 0), 0);
	const pending = rows.filter((row) => String(row.status || "").toUpperCase() === "PENDING").length;
	const average = recorded.length ? received / recorded.length : 0;
	const reset = () => { setQuery(""); setPaymentMode(""); setStatus(""); setSort("paymentDate"); setDirection("desc"); setRange(""); setDateFrom(""); setDateTo(""); setPage(1); setPageSize(10); setFilterOpen(false); setMenuId(""); };
	const changeRange = (value) => { setRange(value); const bounds = dateBounds(value); setDateFrom(bounds.from); setDateTo(bounds.to); setPage(1); };
	const viewPayment = async (row) => {
		try { const response = await apiRequest(`/api/payments/${row._id}`, { headers: getHeader() }); setViewing(response.data); }
		catch (error) { window.alert(error.message); }
		setMenuId("");
	};
	const invoiceLabel = (row) => row.taxInvoiceId ? references.taxInvoices[String(row.taxInvoiceId)] || `Tax invoice ${String(row.taxInvoiceId).slice(-8)}` : row.proformaInvoiceId ? references.proformas[String(row.proformaInvoiceId)] || `Proforma ${String(row.proformaInvoiceId).slice(-8)}` : "—";
	const invoicePath = (row) => row.taxInvoiceId ? "/tax-invoices" : "/proforma";
	const empty = rows.length === 0 && !query && !paymentMode && !status && !dateFrom && !dateTo;

	return <main className="finance-container payments-page">
		<header className="payments-topbar"><label className="payments-global-search"><FiSearch /><input aria-label="Global search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search payments, invoices, clients, references..." /><span>⌘ K</span></label><div className="payments-account"><button className="payments-date"><FiCalendar />{new Date().toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}</button><button className="payments-bell" aria-label="Notifications"><FiBell /><i /></button><span className="payments-divider" /><span className="payments-avatar">{name.slice(0, 1).toUpperCase()}</span><strong>{name}</strong><FiChevronDown /></div></header>
		<section className="payments-heading"><div><p className="payments-breadcrumb">Finance <span>›</span> Payments</p><h1>Payments</h1><p>Track and manage all incoming payments from clients against your invoices.</p></div><button className="payments-create" onClick={onCreate}><FiPlus />Record Payment</button></section>
		<section className="payments-kpis" aria-label="Payment summary">{[["Total Payments", rows.length, "All payments", "blue", <FiCreditCard key="count" />], ["Total Received", money(received), "Amount received", "green", <FiCheck key="received" />], ["Pending Payments", pending, "Awaiting payment", "orange", <FiClock key="pending" />], ["Avg. Payment Amount", money(average), "Per transaction", "purple", <FiBarChart2 key="average" />]].map(([label, value, subtitle, color, Icon]) => <div className={`payments-kpi ${color}`} key={label}><span className="payments-kpi-icon">{Icon}</span><span className="payments-kpi-copy"><small>{label}</small><strong>{value}</strong><em>{subtitle}</em></span><span className="payments-kpi-wave" />{label === "Total Payments" && <span className="payments-kpi-arrow">›</span>}</div>)}</section>
		<section className="payments-toolbar" aria-label="Search and filter payments"><label className="payments-record-search"><FiSearch /><input aria-label="Search payments" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search payments..." /></label><label className="payments-select"><span className="sr-only">Filter by payment mode</span><select value={paymentMode} onChange={(event) => { setPaymentMode(event.target.value); setPage(1); }}><option value="">All payment mode</option>{modes.map((mode) => <option key={mode}>{mode}</option>)}</select><FiChevronDown /></label><label className="payments-select"><span className="sr-only">Filter by status</span><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">All status</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select><FiChevronDown /></label><label className="payments-select payments-sort"><FiCalendar /><select aria-label="Sort by payment date" value={`${sort}|${direction}`} onChange={(event) => { const [key, order] = event.target.value.split("|"); setSort(key); setDirection(order); setPage(1); }}><option value="paymentDate|desc">Sort by payment date</option><option value="paymentDate|asc">Payment date, oldest first</option><option value="amount|desc">Sort by amount</option><option value="amount|asc">Amount, low to high</option></select><FiChevronDown /></label><div className="payments-filter-wrap"><button className={dateFrom || dateTo ? "active" : ""} aria-label="Date filters" aria-expanded={filterOpen} onClick={() => setFilterOpen((open) => !open)}><FiFilter /></button>{filterOpen && <div className="payments-filter-popover"><label>Date range<select value={range} onChange={(event) => changeRange(event.target.value)}><option value="">All time</option><option value="month">This month</option><option value="30days">Last 30 days</option><option value="custom">Custom range…</option></select></label>{range === "custom" && <><label>From<input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} /></label><label>To<input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} /></label></>}</div>}</div><button className="payments-reset" onClick={reset}><FiRefreshCw />Reset</button></section>
		<section className="payments-table-card"><div className="payments-table-scroll"><table className="payments-table"><thead><tr><th><button onClick={() => { if (sort === "paymentDate") setDirection(direction === "asc" ? "desc" : "asc"); else { setSort("paymentDate"); setDirection("desc"); } setPage(1); }}>Payment Date <span>{sort === "paymentDate" ? direction === "asc" ? "↑" : "↓" : "↕"}</span></button></th><th>Reference</th><th>Invoice Reference</th><th><button onClick={() => { if (sort === "amount") setDirection(direction === "asc" ? "desc" : "asc"); else { setSort("amount"); setDirection("desc"); } setPage(1); }}>Amount <span>{sort === "amount" ? direction === "asc" ? "↑" : "↓" : "↕"}</span></button></th><th>Payment Mode</th><th>Status <span>↕</span></th><th>Calculated <span>↕</span></th><th className="payments-actions-heading">Actions</th></tr></thead><tbody>
			{pageRows.map((row) => <tr key={row._id}><td>{dateLabel(row.paymentDate)}</td><td className="payments-reference">{row.referenceNumber || "—"}</td><td><Link className="payments-invoice-link" to={invoicePath(row)}>{invoiceLabel(row)}</Link></td><td className="payments-amount">{money(row.amount)}</td><td>{String(row.paymentMode || "—").replaceAll("_", " ")}</td><td><span className={`payments-status ${tone(row.status)}`}><i />{String(row.status || "RECORDED").replaceAll("_", " ")}</span></td><td>{row.status || "Recorded"}</td><td className="payments-row-actions"><button aria-label={`Actions for ${row.referenceNumber || "payment"}`} aria-expanded={menuId === row._id} onClick={() => setMenuId((current) => current === row._id ? "" : row._id)}><FiMoreVertical /></button>{menuId === row._id && <div className="payments-menu"><button onClick={() => viewPayment(row)}>View payment</button><button onClick={() => { onEdit(row); setMenuId(""); }}>Edit payment</button><button className="danger" onClick={() => { onDelete(row._id); setMenuId(""); }}>Cancel payment</button></div>}</td></tr>)}
			{pageRows.length === 0 && <tr><td colSpan="8" className="payments-empty-cell"><div className="payments-empty"><span><FiCreditCard /></span><h2>{empty ? "No payments found" : "No matching payments"}</h2><p>{empty ? "Record your first payment to start tracking client payments against invoices." : "Try changing your search or filters."}</p><button onClick={empty ? onCreate : reset}><FiPlus />{empty ? "Record Payment" : "Reset filters"}</button></div></td></tr>}
		</tbody></table></div><footer className="payments-pagination"><p>Showing {first} to {last} of {filtered.length} entries</p><div className="payments-page-controls"><button aria-label="Previous page" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(value - 1, 1))}><FiChevronLeft /></button><span>{currentPage}</span><button aria-label="Next page" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(value + 1, pageCount))}><FiChevronRight /></button><label><span className="sr-only">Rows per page</span><select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={10}>10 / page</option><option value={25}>25 / page</option><option value={50}>50 / page</option></select><FiChevronDown /></label></div></footer></section>
		{viewing && <div className="payments-view-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setViewing(null); }}><section className="payments-view-dialog"><header><div><small>Payment details</small><h2>{viewing.referenceNumber || "Payment"}</h2></div><button aria-label="Close payment details" onClick={() => setViewing(null)}><FiX /></button></header><div className="payments-view-grid">{[["Payment Date", dateLabel(viewing.paymentDate)], ["Invoice Reference", invoiceLabel(viewing)], ["Amount", money(viewing.amount)], ["Payment Mode", String(viewing.paymentMode || "—").replaceAll("_", " ")], ["Status", viewing.status || "RECORDED"], ["Event", viewing.eventId || "—"]].map(([label, value]) => <div key={label}><small>{label}</small><strong>{value}</strong></div>)}</div><footer><button onClick={() => setViewing(null)}>Close</button></footer></section></div>}
	</main>;
};

PaymentsPage.propTypes = { rows: PropTypes.arrayOf(PropTypes.object).isRequired, onCreate: PropTypes.func.isRequired, onEdit: PropTypes.func.isRequired, onDelete: PropTypes.func.isRequired };
export default PaymentsPage;
