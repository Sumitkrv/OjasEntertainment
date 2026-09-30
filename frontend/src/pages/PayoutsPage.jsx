import { useMemo, useState } from "react";
import PropTypes from "prop-types";
import { useSelector } from "react-redux";
import { FiBell, FiBriefcase, FiCalendar, FiChevronDown, FiChevronLeft, FiChevronRight, FiCreditCard, FiDatabase, FiFilter, FiMoreVertical, FiPlus, FiRefreshCw, FiSearch, FiUser, FiUsers, FiX } from "react-icons/fi";
import { toast } from "react-toastify";
import apiRequest, { apiUrl } from "../utils/api";
import getHeader from "../utils/header";
import "../css/Finance.css";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateLabel = (value) => {
	if (!value) return "—";
	const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
	return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-CA");
};
const statusTone = (status) => {
	const value = String(status || "PENDING").toUpperCase();
	if (["PAID", "COMPLETED"].includes(value)) return "paid";
	if (["PROCESSING", "IN PROGRESS"].includes(value)) return "processing";
	if (["CANCELLED", "FAILED"].includes(value)) return "cancelled";
	return "pending";
};
const dateBounds = (range) => {
	const today = new Date();
	const format = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
	if (range === "month") return { from: format(new Date(today.getFullYear(), today.getMonth(), 1)), to: format(new Date(today.getFullYear(), today.getMonth() + 1, 0)) };
	if (range === "30days") { const from = new Date(today); from.setDate(today.getDate() - 30); return { from: format(from), to: format(today) }; }
	return { from: "", to: "" };
};
const inCompanyGroup = (company, group) => {
	const value = String(company || "").toUpperCase();
	return group === "OES" ? value.includes("OES") : value.includes("OAS") || value.includes("OJAS");
};

const PayoutsPage = ({ rows, onCreate, onEdit, onDelete, onRemoveCheque, onRefresh }) => {
	const auth = useSelector((store) => store.auth);
	const [query, setQuery] = useState("");
	const [company, setCompany] = useState("");
	const [mode, setMode] = useState("");
	const [status, setStatus] = useState("");
	const [sort, setSort] = useState("date");
	const [direction, setDirection] = useState("desc");
	const [range, setRange] = useState("");
	const [dateFrom, setDateFrom] = useState("");
	const [dateTo, setDateTo] = useState("");
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);
	const [filterOpen, setFilterOpen] = useState(false);
	const [menuId, setMenuId] = useState("");
	const [viewing, setViewing] = useState(null);
	const name = auth?.name || "Workspace user";
	const companies = [...new Set(rows.map((row) => row.company).filter(Boolean))].sort((a, b) => a.localeCompare(b));
	const modes = [...new Set(rows.map((row) => row.paymentMode).filter(Boolean))].sort();
	const statuses = [...new Set(rows.map((row) => row.status).filter(Boolean))].sort();
	const filtered = useMemo(() => rows.filter((row) => {
		const text = [row.company, row.vendorName, row.chequeNumber, row.purpose, row.remarks, row.paymentMode, row.status].join(" ").toLowerCase();
		return (!query || text.includes(query.toLowerCase())) && (!company || row.company === company) && (!mode || row.paymentMode === mode) && (!status || row.status === status) && (!dateFrom || String(row.date || "").slice(0, 10) >= dateFrom) && (!dateTo || String(row.date || "").slice(0, 10) <= dateTo);
	}).sort((a, b) => {
		const left = a[sort] ?? ""; const right = b[sort] ?? "";
		return (left > right ? 1 : left < right ? -1 : 0) * (direction === "asc" ? 1 : -1);
	}), [rows, query, company, mode, status, dateFrom, dateTo, sort, direction]);
	const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
	const currentPage = Math.min(page, pageCount);
	const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
	const first = filtered.length ? (currentPage - 1) * pageSize + 1 : 0;
	const last = Math.min(currentPage * pageSize, filtered.length);
	const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
	const oes = rows.filter((row) => inCompanyGroup(row.company, "OES")).reduce((sum, row) => sum + Number(row.amount || 0), 0);
	const oas = rows.filter((row) => inCompanyGroup(row.company, "OAS")).reduce((sum, row) => sum + Number(row.amount || 0), 0);
	const thisMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
	const monthTotal = rows.filter((row) => String(row.date || "").startsWith(thisMonth)).reduce((sum, row) => sum + Number(row.amount || 0), 0);
	const reset = () => { setQuery(""); setCompany(""); setMode(""); setStatus(""); setSort("date"); setDirection("desc"); setRange(""); setDateFrom(""); setDateTo(""); setPage(1); setPageSize(10); setFilterOpen(false); setMenuId(""); };
	const selectRange = (value) => { setRange(value); const dates = dateBounds(value); setDateFrom(dates.from); setDateTo(dates.to); setPage(1); };
	const viewPayout = async (row) => { try { const result = await apiRequest(`/api/payouts/${row._id}`, { headers: getHeader() }); setViewing(result.data); } catch (error) { window.alert(error.message); } setMenuId(""); };
	const viewCheque = async (row) => {
		const preview = window.open("", "_blank");
		try {
			const response = await fetch(apiUrl(row.chequePhoto.url), { headers: getHeader() });
			if (!response.ok) throw new Error("Unable to open cheque image");
			const objectUrl = URL.createObjectURL(await response.blob());
			if (preview) preview.location = objectUrl;
			else window.open(objectUrl, "_blank", "noopener");
			window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
		} catch (error) { preview?.close(); toast.error(error.message); }
		setMenuId("");
	};
	const empty = rows.length === 0 && !query && !company && !mode && !status && !dateFrom && !dateTo;
	const cards = [["Total Payouts", rows.length, "All payouts", "blue", <FiUsers key="count" />], ["Total OES Payout", money(oes), "OES vendors", "green", <FiBriefcase key="oes" />], ["Total OAS Payout", money(oas), "OAS vendors", "orange", <FiUser key="oas" />], ["Total Amount", money(total), "Total payout amount", "purple", <FiDatabase key="amount" />], ["Current Month Amount", money(monthTotal), "This month", "pink", <FiCalendar key="month" />]];

	return <main className="finance-container payouts-page">
		<header className="payouts-topbar"><label className="payouts-global-search"><FiSearch /><input aria-label="Global search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search payouts, vendors, companies, cheque numbers..." /><span>⌘ K</span></label><div className="payouts-account"><button className="payouts-date"><FiCalendar />{new Date().toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}</button><button className="payouts-bell" aria-label="Notifications"><FiBell /><i /></button><span className="payouts-divider" /><span className="payouts-avatar">{name.slice(0, 1).toUpperCase()}</span><strong>{name}</strong><FiChevronDown /></div></header>
		<section className="payouts-heading"><div><p className="payouts-breadcrumb">Finance <span>›</span> Payouts</p><h1>Payouts</h1><p>Manage and track all payouts to vendors, partners and service providers.</p></div><button className="payouts-create" onClick={onCreate}><FiPlus />Create Payout</button></section>
		<section className="payouts-kpis" aria-label="Payout summary">{cards.map(([label, value, subtitle, color, Icon]) => <div className={`payouts-kpi ${color}`} key={label}><span className="payouts-kpi-icon">{Icon}</span><span className="payouts-kpi-copy"><small>{label}</small><strong>{value}</strong><em>{subtitle}</em></span><span className="payouts-kpi-wave" />{label === "Total Payouts" && <span className="payouts-kpi-arrow">›</span>}</div>)}</section>
		<section className="payouts-toolbar" aria-label="Search and filter payouts"><label className="payouts-record-search"><FiSearch /><input aria-label="Search payouts" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search payouts..." /></label><label className="payouts-select"><span className="sr-only">Filter by company</span><select value={company} onChange={(event) => { setCompany(event.target.value); setPage(1); }}><option value="">All company</option>{companies.map((value) => <option key={value}>{value}</option>)}</select><FiChevronDown /></label><label className="payouts-select"><span className="sr-only">Filter by payment mode</span><select value={mode} onChange={(event) => { setMode(event.target.value); setPage(1); }}><option value="">All payment mode</option>{modes.map((value) => <option key={value} value={value}>{String(value).replaceAll("_", " ")}</option>)}</select><FiChevronDown /></label><label className="payouts-select"><span className="sr-only">Filter by status</span><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">All status</option>{statuses.map((value) => <option key={value}>{value}</option>)}</select><FiChevronDown /></label><label className="payouts-select payouts-sort"><FiCalendar /><select aria-label="Sort payouts" value={`${sort}|${direction}`} onChange={(event) => { const [key, order] = event.target.value.split("|"); setSort(key); setDirection(order); setPage(1); }}><option value="date|desc">Sort by date</option><option value="date|asc">Date, oldest first</option><option value="amount|desc">Sort by amount</option><option value="amount|asc">Amount, low to high</option></select><FiChevronDown /></label><div className="payouts-filter-wrap"><button className={dateFrom || dateTo ? "active" : ""} aria-label="Date filters" aria-expanded={filterOpen} onClick={() => setFilterOpen((open) => !open)}><FiFilter /></button>{filterOpen && <div className="payouts-filter-popover"><label>Date range<select value={range} onChange={(event) => selectRange(event.target.value)}><option value="">All time</option><option value="month">This month</option><option value="30days">Last 30 days</option><option value="custom">Custom range…</option></select></label>{range === "custom" && <><label>From<input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} /></label><label>To<input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} /></label></>}</div>}</div><button className="payouts-refresh" aria-label="Refresh payouts" title="Refresh payouts" onClick={onRefresh}><FiRefreshCw /></button><button className="payouts-reset" onClick={reset}><FiRefreshCw />Reset</button></section>
		<section className="payouts-table-card"><div className="payouts-table-scroll"><table className="payouts-table"><thead><tr>{[["company", "Company"], ["date", "Date"], ["vendorName", "Vendor Name"], ["amount", "Amount"], ["purpose", "Purpose"], ["paymentMode", "Payment Mode"], ["chequeNumber", "Cheque Number"], ["chequeDate", "Cheque Date"], ["status", "Status"], ["remarks", "Remarks"], ["calculated", "Calculated"]].map(([key, label]) => <th key={key}><button onClick={() => { const field = key === "calculated" ? "amount" : key; if (sort === field) setDirection(direction === "asc" ? "desc" : "asc"); else { setSort(field); setDirection("desc"); } setPage(1); }}>{label}<span>{sort === key || key === "calculated" && sort === "amount" ? direction === "asc" ? "↑" : "↓" : "↕"}</span></button></th>)}<th className="payouts-actions-heading">Actions</th></tr></thead><tbody>
			{pageRows.map((row) => <tr key={row._id}><td className="payouts-company">{row.company || "—"}</td><td>{dateLabel(row.date)}</td><td>{row.vendorName || "—"}</td><td className="payouts-amount">{money(row.amount)}</td><td className="payouts-purpose" title={row.purpose}>{row.purpose || "—"}</td><td>{String(row.paymentMode || "—").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())}</td><td>{row.chequeNumber || "—"}</td><td>{dateLabel(row.chequeDate)}</td><td><span className={`payouts-status ${statusTone(row.status)}`}><i />{String(row.status || "PENDING").replaceAll("_", " ")}</span></td><td className="payouts-remarks" title={row.remarks}>{row.remarks || "—"}</td><td>{row.status || "Recorded"}</td><td className="payouts-row-actions"><button aria-label={`Actions for ${row.vendorName || "payout"}`} aria-expanded={menuId === row._id} onClick={() => setMenuId((current) => current === row._id ? "" : row._id)}><FiMoreVertical /></button>{menuId === row._id && <div className="payouts-menu"><button onClick={() => viewPayout(row)}>View payout</button><button onClick={() => { onEdit(row); setMenuId(""); }}>Edit payout</button>{row.chequePhoto && <><button onClick={() => viewCheque(row)}>View cheque</button><button onClick={() => { onRemoveCheque(row._id); setMenuId(""); }}>Remove cheque</button></>}<button className="danger" onClick={() => { onDelete(row._id); setMenuId(""); }}>Delete payout</button></div>}</td></tr>)}
			{pageRows.length === 0 && <tr><td colSpan="12" className="payouts-empty-cell"><div className="payouts-empty"><span><FiCreditCard /></span><h2>{empty ? "No payouts yet" : "No matching payouts"}</h2><p>{empty ? "Record your first payout to vendors, partners or service providers. Once created, it will appear here with all the details." : "Try changing your search or filters."}</p><button onClick={empty ? onCreate : reset}><FiPlus />{empty ? "Create Payout" : "Reset filters"}</button></div></td></tr>}
		</tbody></table></div><footer className="payouts-pagination"><p>Showing {first} to {last} of {filtered.length} entries</p><div className="payouts-page-controls"><button aria-label="Previous page" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(value - 1, 1))}><FiChevronLeft /></button><span>{currentPage}</span><button aria-label="Next page" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(value + 1, pageCount))}><FiChevronRight /></button><label><span className="sr-only">Rows per page</span><select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={10}>10 / page</option><option value={25}>25 / page</option><option value={50}>50 / page</option></select><FiChevronDown /></label></div></footer></section>
		{viewing && <div className="payouts-view-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setViewing(null); }}><section className="payouts-view-dialog"><header><div><small>Payout details</small><h2>{viewing.vendorName || "Payout"}</h2></div><button aria-label="Close payout details" onClick={() => setViewing(null)}><FiX /></button></header><div className="payouts-view-grid">{[["Company", viewing.company], ["Date", dateLabel(viewing.date)], ["Vendor", viewing.vendorName], ["Amount", money(viewing.amount)], ["Purpose", viewing.purpose], ["Payment Mode", viewing.paymentMode], ["Cheque Number", viewing.chequeNumber], ["Cheque Date", dateLabel(viewing.chequeDate)], ["Status", viewing.status], ["Remarks", viewing.remarks]].map(([label, value]) => <div key={label}><small>{label}</small><strong>{value || "—"}</strong></div>)}</div><footer><button onClick={() => setViewing(null)}>Close</button></footer></section></div>}
	</main>;
};

PayoutsPage.propTypes = { rows: PropTypes.arrayOf(PropTypes.object).isRequired, onCreate: PropTypes.func.isRequired, onEdit: PropTypes.func.isRequired, onDelete: PropTypes.func.isRequired, onRemoveCheque: PropTypes.func.isRequired, onRefresh: PropTypes.func.isRequired };
export default PayoutsPage;
