import { useMemo, useState } from "react";
import PropTypes from "prop-types";
import { useSelector } from "react-redux";
import { FiArrowDown, FiArrowUp, FiBell, FiCalendar, FiChevronDown, FiChevronLeft, FiChevronRight, FiClock, FiCreditCard, FiDownload, FiFileText, FiMoreVertical, FiPercent, FiPlus, FiRefreshCw, FiSearch, FiShuffle } from "react-icons/fi";
import "../css/Finance.css";

const pageSizes = [10, 25, 50];
const amount = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateLabel = (value) => {
	if (!value) return "—";
	const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
	return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-CA");
};
const statusLabel = (row) => row.conversionIntegrityError ? "INTEGRITY ERROR" : row.hasTaxInvoice ? "CONVERTED" : "OPEN";
const metrics = (rows) => [
	["Total PIs", rows.length, "All proforma invoices", "blue", <FiFileText key="pi" />],
	["Total PI Amount", amount(rows.reduce((sum, row) => sum + Number(row.piAmount || 0), 0)), "Total value", "green", <FiCreditCard key="amount" />],
	["Total Received", amount(rows.reduce((sum, row) => sum + Number(row.amountReceived || 0), 0)), "Amount received", "purple", <FiDownload key="received" />],
	["Total Outstanding", amount(rows.reduce((sum, row) => sum + Number(row.balanceAmount ?? row.outstandingAmount ?? 0), 0)), "Pending amount", "orange", <FiClock key="outstanding" />],
	["Total TDS", amount(rows.reduce((sum, row) => sum + Number(row.tdsAmount || 0), 0)), "TDS amount", "blue", <FiPercent key="tds" />],
	["Pending Conversion", rows.filter((row) => !row.hasTaxInvoice && !row.conversionIntegrityError).length, "To be converted to tax invoice", "pink", <FiShuffle key="convert" />],
];

const ProformaInvoicesPage = ({ rows, query, setQuery, filter, setFilter, sort, setSort, sortDirection, setSortDirection, onCreate, onEdit, onDelete, onConvert, convertingId, onReset }) => {
	const auth = useSelector((store) => store.auth);
	const [date, setDate] = useState("");
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);
	const [openMenu, setOpenMenu] = useState("");
	const name = auth?.name || "Workspace user";
	const companies = [...new Set(rows.map((row) => row.company).filter(Boolean))].sort((a, b) => a.localeCompare(b));
	const conversionStatuses = [...new Set(rows.map((row) => row.conversionStatus || (row.hasTaxInvoice ? "CONVERTED" : "PENDING_CONVERSION")).filter(Boolean))].sort();
	const filtered = useMemo(() => rows.filter((row) => {
		const text = [row.company, row.partyName, row.piNumber, row.eventId].join(" ").toLowerCase();
		const rowStatus = row.conversionStatus || (row.hasTaxInvoice ? "CONVERTED" : "PENDING_CONVERSION");
		return (!query || text.includes(query.toLowerCase())) && (!filter.company || row.company === filter.company) && (!filter.conversionStatus || rowStatus === filter.conversionStatus) && (!date || String(row.piDate || "").slice(0, 10) === date);
	}).sort((a, b) => {
		const left = a[sort] ?? ""; const right = b[sort] ?? "";
		return (left > right ? 1 : left < right ? -1 : 0) * (sortDirection === "asc" ? 1 : -1);
	}), [rows, query, filter, date, sort, sortDirection]);
	const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
	const currentPage = Math.min(page, pageCount);
	const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
	const start = filtered.length ? (currentPage - 1) * pageSize + 1 : 0;
	const end = Math.min(currentPage * pageSize, filtered.length);
	const reset = () => { onReset(); setDate(""); setPage(1); setPageSize(10); setOpenMenu(""); };
	const updateFilter = (key, value) => { setFilter((previous) => ({ ...previous, [key]: value })); setPage(1); };
	const toggleDirection = () => { setSortDirection(sortDirection === "asc" ? "desc" : "asc"); setPage(1); };
	const empty = rows.length === 0 && !query && !filter.company && !filter.conversionStatus && !date;

	return <main className="finance-container proforma-page">
		<header className="proforma-topbar"><label className="proforma-global-search"><FiSearch /><input aria-label="Global search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search invoices, clients, events, PI number..." /><span>⌘ K</span></label><div className="proforma-account"><button className="proforma-date"><FiCalendar />{new Date().toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}</button><button className="proforma-bell" aria-label="Notifications"><FiBell /><i /></button><span className="proforma-divider" /><span className="proforma-avatar">{name.slice(0, 1).toUpperCase()}</span><strong>{name}</strong><FiChevronDown /></div></header>
		<section className="proforma-heading"><div><p className="proforma-breadcrumb">Finance <span>›</span> Proforma Invoices</p><h1>Proforma Invoices</h1><p>Create and manage proforma invoices for your events and clients.</p></div><button className="proforma-create" onClick={onCreate}><FiPlus />Create Proforma Invoice</button></section>
		<section className="proforma-kpis" aria-label="Proforma invoice summary">{metrics(rows).map(([label, value, subtitle, tone, Icon]) => <div className={`proforma-kpi tone-${tone}`} key={label}><span className="proforma-kpi-icon">{Icon}</span><span className="proforma-kpi-copy"><small>{label}</small><strong>{value}</strong><em>{subtitle}</em></span><span className="proforma-kpi-wave" /><span className="proforma-kpi-arrow">›</span></div>)}</section>
		<section className="proforma-toolbar" aria-label="Search and filter proforma invoices"><label className="proforma-record-search"><FiSearch /><input aria-label="Search records" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search records..." /></label><label className="proforma-select"><span className="sr-only">Filter by company</span><select value={filter.company || ""} onChange={(event) => updateFilter("company", event.target.value)}><option value="">All company</option>{companies.map((company) => <option key={company}>{company}</option>)}</select><FiChevronDown /></label><label className="proforma-select"><span className="sr-only">Filter by conversion status</span><select value={filter.conversionStatus || ""} onChange={(event) => updateFilter("conversionStatus", event.target.value)}><option value="">All conversion status</option>{conversionStatuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select><FiChevronDown /></label><label className="proforma-select proforma-sort"><span className="sr-only">Sort proforma invoices</span><select value={`${sort}|${sortDirection}`} onChange={(event) => { const [key, direction] = event.target.value.split("|"); setSort(key); setSortDirection(direction); setPage(1); }}><option value="piDate|desc">Sort by PI date</option><option value="piDate|asc">PI date, oldest first</option><option value="balanceAmount|desc">Sort by outstanding</option><option value="balanceAmount|asc">Outstanding, low to high</option></select><FiChevronDown /></label><label className="proforma-date-filter"><FiCalendar /><input aria-label="Filter by PI date" type="date" value={date} onChange={(event) => { setDate(event.target.value); setPage(1); }} /></label><button className="proforma-reset" onClick={reset}><FiRefreshCw />Reset</button></section>
		<section className="proforma-table-card"><div className="proforma-table-scroll"><table className="proforma-table"><thead><tr><th>Company</th><th>Party Name</th><th>PI Number</th><th><button onClick={toggleDirection}>PI Date {sortDirection === "asc" ? <FiArrowUp /> : <FiArrowDown />}</button></th><th>PI Amount</th><th>Taxable Value</th><th>GST</th><th>TDS Rate</th><th>Amount Received</th><th>Status</th><th className="proforma-actions-heading">Actions</th></tr></thead><tbody>
			{pageRows.map((row) => <tr key={row._id}><td className="proforma-company">{row.company || "—"}</td><td>{row.partyName || "—"}</td><td className="proforma-number">{row.piNumber || "—"}</td><td>{dateLabel(row.piDate)}</td><td>{amount(row.piAmount)}</td><td>{amount(row.taxableValue)}</td><td>{amount(row.gstAmount ?? row.gst)}</td><td>{Number(row.tdsRate || 0)}%</td><td>{amount(row.amountReceived)}</td><td><span className={`proforma-status status-${statusLabel(row).toLowerCase().replaceAll(" ", "-")}`}><i />{statusLabel(row)}</span></td><td className="proforma-row-actions"><button aria-label={`Actions for ${row.piNumber || "proforma invoice"}`} aria-expanded={openMenu === row._id} onClick={() => setOpenMenu((current) => current === row._id ? "" : row._id)}><FiMoreVertical /></button>{openMenu === row._id && <div className="proforma-menu">{!row.hasTaxInvoice && !row.conversionIntegrityError && <button disabled={convertingId === row._id} onClick={() => { onConvert(row._id); setOpenMenu(""); }}>{convertingId === row._id ? "Converting…" : "Convert to Tax Invoice"}</button>}{row.hasTaxInvoice && <span>Tax Invoice {row.taxInvoiceNumber || "created"}</span>}{row.conversionIntegrityError && <span>Integrity error — review required</span>}<button onClick={() => { onEdit(row); setOpenMenu(""); }}>Edit invoice</button><button className="danger" onClick={() => { onDelete(row._id); setOpenMenu(""); }}>Delete invoice</button></div>}</td></tr>)}
			{pageRows.length === 0 && <tr><td colSpan="11" className="proforma-empty-cell"><div className="proforma-empty"><span><FiFileText /></span><h2>{empty ? "No proforma invoices found" : "No matching proforma invoices"}</h2><p>{empty ? "Create your first proforma invoice to get started." : "Try changing your search or filters."}</p><button onClick={empty ? onCreate : reset}><FiPlus />{empty ? "Create Proforma Invoice" : "Reset filters"}</button></div></td></tr>}
		</tbody></table></div><footer className="proforma-pagination"><p>Showing {start} to {end} of {filtered.length} entries</p><div className="proforma-page-controls"><button aria-label="Previous page" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><FiChevronLeft /></button><span>{currentPage}</span><button aria-label="Next page" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}><FiChevronRight /></button><label><span className="sr-only">Rows per page</span><select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>{pageSizes.map((size) => <option key={size} value={size}>{size} / page</option>)}</select><FiChevronDown /></label></div></footer></section>
	</main>;
};

ProformaInvoicesPage.propTypes = { rows: PropTypes.arrayOf(PropTypes.object).isRequired, query: PropTypes.string.isRequired, setQuery: PropTypes.func.isRequired, filter: PropTypes.object.isRequired, setFilter: PropTypes.func.isRequired, sort: PropTypes.string.isRequired, setSort: PropTypes.func.isRequired, sortDirection: PropTypes.string.isRequired, setSortDirection: PropTypes.func.isRequired, onCreate: PropTypes.func.isRequired, onEdit: PropTypes.func.isRequired, onDelete: PropTypes.func.isRequired, onConvert: PropTypes.func.isRequired, convertingId: PropTypes.string, onReset: PropTypes.func.isRequired };
export default ProformaInvoicesPage;
