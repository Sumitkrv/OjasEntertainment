import { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { FiBarChart2, FiBell, FiBriefcase, FiCalendar, FiCheckCircle, FiChevronDown, FiClock, FiCreditCard, FiDownload, FiFileText, FiFilter, FiPercent, FiPlay, FiSearch, FiTrendingUp } from "react-icons/fi";
import "../css/Analytics.css";
import Loading from "../components/Loading";
import { apiUrl } from "../utils/api";
import EmptyState from "../components/EmptyState";
import apiRequest from "../utils/api";
import getHeader from "../utils/header";

const RANGE_OPTIONS = [
	{ value: "today", label: "Today" },
	{ value: "this-week", label: "This Week" },
	{ value: "this-month", label: "This Month" },
	{ value: "last-month", label: "Last Month" },
	{ value: "this-quarter", label: "This Quarter" },
	{ value: "this-year", label: "This Year" },
];

const TABS = ["overview", "events", "finance", "payments", "payouts", "work", "companies"];

const toCurrency = (value) =>
	new Intl.NumberFormat("en-IN", {
		style: "currency",
		currency: "INR",
		maximumFractionDigits: 2,
	}).format(Number(value || 0));

const getQueryString = (filters) => {
	const params = new URLSearchParams();
	if (filters.range) params.set("range", filters.range);
	if (filters.from) params.set("from", filters.from);
	if (filters.to) params.set("to", filters.to);
	if (filters.company) params.set("company", filters.company);
	if (filters.status) params.set("status", filters.status);
	return params.toString();
};

const buildChartPoints = (items, width, height, sharedMax) => {
	if (!items.length) return "";
	const max = sharedMax || Math.max(...items.map((item) => item.value || 0), 1);
	return items
		.map((item, index) => {
			const x = items.length === 1 ? width / 2 : (index / (items.length - 1)) * width;
			const y = height - ((item.value || 0) / max) * (height - 18) - 10;
			return `${x},${y}`;
		})
		.join(" ");
};

const StatusPill = ({ value }) => (
	<span className={`status-badge status-${String(value || "pending").toLowerCase().replace(/_/g, "-")}`}>
		{String(value || "Pending")}
	</span>
);
StatusPill.propTypes = { value: PropTypes.any };

const CurrencyCard = ({ label, value, tone = "blue" }) => (
	<div className={`metric-card metric-${tone}`}>
		<span>{label}</span>
		<strong>{toCurrency(value)}</strong>
	</div>
);
CurrencyCard.propTypes = { label: PropTypes.string.isRequired, value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]), tone: PropTypes.string };

const ChartEmptyState = ({ title, description }) => (
	<div className="empty-state-block"><div className="analytics-empty-copy"><span className="analytics-empty-icon"><FiBarChart2 /></span><strong>{title}</strong><p>{description}</p></div></div>
);
ChartEmptyState.propTypes = { title: PropTypes.string.isRequired, description: PropTypes.string.isRequired };

const SimpleBarChart = ({ items = [], formatter = (value) => value }) => {
	if (!items.length) {
		return <ChartEmptyState title="No data for this period." description="Use a broader date range or change the company filter." />;
	}
	const max = Math.max(...items.map((item) => Number(item.value || 0)), 1);
	return (
		<div className="bar-chart">
			{items.map((item) => (
				<div key={`${item.label}-${item.value}`} className="bar-row">
					<div className="bar-label">{item.label}</div>
					<div className="bar-track">
						<div className="bar-fill" style={{ width: `${(Number(item.value || 0) / max) * 100}%` }} />
					</div>
					<div className="bar-value">{formatter(item.value)}</div>
				</div>
			))}
		</div>
	);
};
SimpleBarChart.propTypes = { items: PropTypes.arrayOf(PropTypes.object), formatter: PropTypes.func };

const LineChart = ({ items = [], valueKey = "value", secondValueKey, labelKey = "label" }) => {
	if (!items.length) {
		return <ChartEmptyState title="No trend data." description="There are no matching records for the selected period." />;
	}
	const width = 420;
	const height = 180;
	const values = items.map((item) => Number(item[valueKey] || 0));
	const secondValues = secondValueKey ? items.map((item) => Number(item[secondValueKey] || 0)) : [];
	const chartMax = Math.max(...values, ...secondValues, 1);
	const points = buildChartPoints(values.map((value) => ({ value })), width, height, chartMax);
	return (
		<div className="line-chart-wrap">
			<svg viewBox={`0 0 ${width} ${height}`} className="line-chart" preserveAspectRatio="none">
				<polyline fill="none" stroke="#3b70e9" strokeWidth="3" points={points} />
				{secondValueKey && <polyline fill="none" stroke="#22c55e" strokeWidth="3" points={buildChartPoints(secondValues.map((value) => ({ value })), width, height, chartMax)} />}
				{items.map((item, index) => {
					const x = items.length === 1 ? width / 2 : (index / Math.max(items.length - 1, 1)) * width;
					const y = height - ((Number(item[valueKey] || 0) / chartMax) * (height - 18)) - 10;
					return <circle key={`${item[labelKey]}-${index}`} cx={x} cy={y} r="4" fill="#3b70e9" />;
				})}
			</svg>
			<div className="line-chart-labels">
				{items.map((item) => <span key={`${item[labelKey]}-label`}>{item[labelKey]}</span>)}
			</div>
		</div>
	);
};
LineChart.propTypes = { items: PropTypes.arrayOf(PropTypes.object), valueKey: PropTypes.string, secondValueKey: PropTypes.string, labelKey: PropTypes.string };

const Table = ({ columns, rows = [] }) => {
	return (
		<div className="analytics-table-wrap">
			<table className="analytics-table">
				<thead>
					<tr>
						{columns.map((column) => (
							<th key={column.key}>{column.label}</th>
						))}
					</tr>
				</thead>
				<tbody>
					{!rows.length && <tr><td className="analytics-table-empty-cell" colSpan={columns.length}><div className="analytics-table-empty"><span><FiFileText /></span><strong>No data found.</strong><small>Adjust the filters to see the relevant records.</small></div></td></tr>}
					{rows.map((row, index) => (
						<tr key={`${row.id || row.name || index}`}>
							{columns.map((column) => (
								<td key={`${column.key}-${index}`}>{column.render ? column.render(row[column.key], row) : row[column.key]}</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
};
Table.propTypes = { columns: PropTypes.arrayOf(PropTypes.object).isRequired, rows: PropTypes.arrayOf(PropTypes.object) };

const Analytics = () => {
	const auth = useSelector((store) => store.auth);
	const [activeTab, setActiveTab] = useState("overview");
	const [query, setQuery] = useState("");
	const [searchResults, setSearchResults] = useState(null);
	const [filters, setFilters] = useState({ range: "this-month", company: "", status: "", from: "", to: "" });
	const [analytics, setAnalytics] = useState(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const timer = setTimeout(() => {
			if (query.trim().length < 2) return setSearchResults(null);
			apiRequest(`/api/dashboard/search?q=${encodeURIComponent(query)}`, { headers: getHeader() })
				.then((response) => setSearchResults(response.data))
				.catch(() => toast.error("Search unavailable"));
		}, 250);
		return () => clearTimeout(timer);
	}, [query]);

	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const nextRange = params.get("range") || "this-month";
		const nextCompany = params.get("company") || "";
		const nextStatus = params.get("status") || "";
		const nextFrom = params.get("from") || "";
		const nextTo = params.get("to") || "";
		setFilters((current) => ({ ...current, range: nextRange, company: nextCompany, status: nextStatus, from: nextFrom, to: nextTo }));
	}, []);

	useEffect(() => {
		const params = new URLSearchParams();
		if (filters.range) params.set("range", filters.range);
		if (filters.company) params.set("company", filters.company);
		if (filters.status) params.set("status", filters.status);
		if (filters.from) params.set("from", filters.from);
		if (filters.to) params.set("to", filters.to);
		window.history.replaceState({}, "", `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`);
	}, [filters]);

	useEffect(() => {
		if (filters.range === "custom" && (!filters.from || !filters.to)) { setLoading(false); return; }
		const queryString = getQueryString({ range: filters.range, company: filters.company, status: filters.status, from: filters.from, to: filters.to });
		const requestUrl = queryString ? `/api/analytics?${queryString}` : "/api/analytics";
		setLoading(true);
		apiRequest(requestUrl, {
			method: "GET",
			headers: getHeader(),
		})
			.then((json) => {
				if (json?.message === "success") {
					setAnalytics(json.data);
				} else {
					toast.error("Unable to load analytics data");
				}
			})
			.catch((error) => {
				console.error(error);
				toast.error("Unable to load analytics data");
			})
			.finally(() => setLoading(false));
	}, [filters.range, filters.company, filters.status, filters.from, filters.to]);

	const companyOptions = useMemo(() => {
		const list = [...(analytics?.events?.byCompany || []), ...(analytics?.companies || [])];
		const unique = [...new Set(list.map((item) => item.label || item.company).filter((value) => value && value !== "Unspecified"))];
		return unique.sort((left, right) => left.localeCompare(right));
	}, [analytics]);

	const exportCsv = (type) => {
		const params = getQueryString(filters);
		window.open(apiUrl(`/api/analytics/export?type=${type}&${params}`), "_blank");
	};

	if (loading || analytics == null) {
		return <Loading />;
	}

	const snapshot = analytics && typeof analytics === "object" ? analytics : {};
	const kpis = snapshot.kpis || {};
	const eventData = snapshot.events || {};
	const financeData = snapshot.finance || {};
	const paymentData = snapshot.payments || {};
	const payoutData = snapshot.payouts || {};
	const workData = snapshot.work || {};
	const companiesList = snapshot.companies || [];
	const outstandingRows = snapshot.outstandingTable || [];

	const overviewCards = [
		{ label: "Total Events", value: kpis.totalEvents || 0, subtitle: "All events", tone: "blue", Icon: FiCalendar },
		{ label: "Upcoming Events", value: kpis.upcomingEvents || 0, subtitle: "Scheduled", tone: "amber", Icon: FiClock },
		{ label: "Active Events", value: kpis.activeEvents || 0, subtitle: "In progress", tone: "green", Icon: FiPlay },
		{ label: "Completed Events", value: kpis.completedEvents || 0, subtitle: "Finished", tone: "purple", Icon: FiCheckCircle },
		{ label: "Invoice Value", value: kpis.invoiceValue || 0, subtitle: "Total value", tone: "pink", currency: true, Icon: FiFileText },
		{ label: "Received", value: kpis.received || 0, subtitle: "Amount received", tone: "green", currency: true, Icon: FiDownload },
		{ label: "Outstanding", value: kpis.outstanding || 0, subtitle: "Pending amount", tone: "amber", currency: true, Icon: FiClock },
		{ label: "TDS", value: kpis.tds || 0, subtitle: "Total TDS", tone: "blue", currency: true, Icon: FiPercent },
		{ label: "Payouts", value: kpis.payouts || 0, subtitle: "Total payouts", tone: "purple", currency: true, Icon: FiCreditCard },
		{ label: "Work Logged", value: kpis.workLogged || 0, subtitle: "Total work items", tone: "slate", currency: true, Icon: FiBriefcase },
	];

	const renderOverview = () => (
		<div className="analytics-section-stack">
			<div className="kpi-grid">
				{overviewCards.map((card) => (
					<div key={card.label} className={`kpi-card analytics-kpi-card metric-${card.tone}`}>
						<span className={`analytics-kpi-icon icon-${card.tone}`}><card.Icon /></span>
						<div className="analytics-kpi-copy"><span>{card.label}</span>
						<strong>{card.currency ? toCurrency(card.value) : Number(card.value).toLocaleString("en-IN")}</strong>
						<small>{card.subtitle}</small></div>
						<FiTrendingUp className={`analytics-kpi-trend trend-${card.tone}`} aria-hidden="true" />
					</div>
				))}
			</div>
			<div className="analytics-grid two-column">
				<div className="analytics-card">
					<div className="panel-header">
						<h3>Events by Status</h3>
					</div>
					<SimpleBarChart items={eventData.byStatus || []} formatter={(value) => Number(value).toLocaleString("en-IN")} />
				</div>
				<div className="analytics-card">
					<div className="panel-header">
						<h3>Invoice vs Received</h3>
					</div>
					<LineChart items={financeData.monthly || []} valueKey="invoiceValue" secondValueKey="received" />
				</div>
			</div>
			<div className="analytics-card">
				<div className="panel-header">
					<h3>Outstanding Invoices</h3>
				</div>
				<Table
					columns={[
						{ key: "invoiceNumber", label: "Invoice Number" },
						{ key: "company", label: "Company", render: (value) => value || "—" },
						{ key: "invoiceDate", label: "Invoice Date", render: (value) => value || "—" },
						{ key: "invoiceValue", label: "Amount", render: (value) => toCurrency(value) },
						{ key: "outstanding", label: "Outstanding", render: (value) => toCurrency(value) },
						{ key: "status", label: "Status", render: (value) => <StatusPill value={value} /> },
						{ key: "actions", label: "Actions", render: () => "—" },
					]}
					rows={outstandingRows.slice(0, 8).map((row) => ({ ...row, id: `${row.eventId || row.invoiceNumber}-${row.invoiceNumber}` }))}
				/>
			</div>
		</div>
	);

	const renderEvents = () => (
		<div className="analytics-section-stack">
			<div className="analytics-grid two-column">
				<div className="analytics-card">
					<div className="panel-header"><h3>Events by Status</h3></div>
					<SimpleBarChart items={eventData.byStatus || []} formatter={(value) => Number(value).toLocaleString("en-IN")} />
				</div>
				<div className="analytics-card">
					<div className="panel-header"><h3>Monthly Event Trend</h3></div>
					<LineChart items={eventData.byMonth || []} />
				</div>
			</div>
			<div className="analytics-grid three-column">
				<div className="analytics-card">
					<div className="panel-header"><h3>Events by Company</h3></div>
					<SimpleBarChart items={eventData.byCompany || []} formatter={(value) => Number(value).toLocaleString("en-IN")} />
				</div>
				<div className="analytics-card">
					<div className="panel-header"><h3>Events by City</h3></div>
					<SimpleBarChart items={eventData.byCity || []} formatter={(value) => Number(value).toLocaleString("en-IN")} />
				</div>
				<div className="analytics-card">
					<div className="panel-header"><h3>Events by Type</h3></div>
					<SimpleBarChart items={eventData.byEventType || []} formatter={(value) => Number(value).toLocaleString("en-IN")} />
				</div>
			</div>
		</div>
	);

	const renderFinance = () => (
		<div className="analytics-section-stack">
			<div className="kpi-grid">
				<CurrencyCard label="Invoice Value" value={kpis.invoiceValue || 0} tone="blue" />
				<CurrencyCard label="Received" value={kpis.received || 0} tone="green" />
				<CurrencyCard label="Outstanding" value={kpis.outstanding || 0} tone="amber" />
				<CurrencyCard label="TDS" value={kpis.tds || 0} tone="red" />
			</div>
			<div className="analytics-grid two-column">
				<div className="analytics-card">
					<div className="panel-header"><h3>Invoice vs Received</h3></div>
					<LineChart items={(financeData.monthly || []).map((entry) => ({ label: entry.label, value: entry.invoiceValue }))} />
				</div>
				<div className="analytics-card">
					<div className="panel-header"><h3>Outstanding Trend</h3></div>
					<LineChart items={(financeData.monthly || []).map((entry) => ({ label: entry.label, value: entry.outstanding }))} />
				</div>
			</div>
			<div className="analytics-card">
				<div className="panel-header"><h3>Outstanding Breakdown</h3></div>
				<Table
					columns={[
						{ key: "eventName", label: "Event" },
						{ key: "invoiceNumber", label: "Invoice" },
						{ key: "invoiceValue", label: "Invoice Value", render: (value) => toCurrency(value) },
						{ key: "received", label: "Received", render: (value) => toCurrency(value) },
						{ key: "outstanding", label: "Outstanding", render: (value) => toCurrency(value) },
						{ key: "status", label: "Status", render: (value) => <StatusPill value={value} /> },
					]}
					rows={outstandingRows.slice(0, 12).map((row) => ({ ...row, id: `${row.eventId || row.invoiceNumber}-${row.invoiceNumber}` }))}
				/>
			</div>
		</div>
	);

	const renderPayments = () => (
		<div className="analytics-section-stack">
			<div className="kpi-grid">
				<CurrencyCard label="Total Received" value={kpis.received || 0} tone="green" />
				<CurrencyCard label="Payments" value={paymentData.count || 0} tone="blue" />
				<CurrencyCard label="Average Payment" value={paymentData.averagePayment || 0} tone="amber" />
			</div>
			<div className="analytics-grid two-column">
				<div className="analytics-card">
					<div className="panel-header"><h3>Payments by Month</h3></div>
					<LineChart items={paymentData.byMonth || []} />
				</div>
				<div className="analytics-card">
					<div className="panel-header"><h3>Payment Mode</h3></div>
					<SimpleBarChart items={paymentData.byMode || []} formatter={(value) => toCurrency(value)} />
				</div>
			</div>
		</div>
	);

	const renderPayouts = () => (
		<div className="analytics-section-stack">
			<div className="kpi-grid">
				<CurrencyCard label="Total Payout" value={kpis.payouts || 0} tone="amber" />
				<CurrencyCard label="Pending" value={payoutData.pending || 0} tone="amber" />
				<CurrencyCard label="Paid" value={payoutData.paid || 0} tone="green" />
				<CurrencyCard label="Cancelled" value={payoutData.cancelled || 0} tone="red" />
			</div>
			<div className="analytics-grid two-column">
				<div className="analytics-card">
					<div className="panel-header"><h3>Payout by Month</h3></div>
					<LineChart items={payoutData.byMonth || []} />
				</div>
				<div className="analytics-card">
					<div className="panel-header"><h3>Payout by Company</h3></div>
					<SimpleBarChart items={payoutData.byCompany || []} formatter={(value) => toCurrency(value)} />
				</div>
			</div>
		</div>
	);

	const renderWork = () => (
		<div className="analytics-section-stack">
			<div className="kpi-grid">
				<CurrencyCard label="Work Entries" value={workData.totalEntries || 0} tone="blue" />
				<CurrencyCard label="Completed" value={workData.completed || 0} tone="green" />
				<CurrencyCard label="Pending" value={workData.pending || 0} tone="amber" />
				<CurrencyCard label="Hours Logged" value={workData.hoursLogged || 0} tone="blue" />
			</div>
			<div className="analytics-grid three-column">
				<div className="analytics-card">
					<div className="panel-header"><h3>Work by Category</h3></div>
					<SimpleBarChart items={workData.byCategory || []} formatter={(value) => Number(value).toLocaleString("en-IN")} />
				</div>
				<div className="analytics-card">
					<div className="panel-header"><h3>Work by Company</h3></div>
					<SimpleBarChart items={workData.byCompany || []} formatter={(value) => Number(value).toLocaleString("en-IN")} />
				</div>
				<div className="analytics-card">
					<div className="panel-header"><h3>Work by Event</h3></div>
					<SimpleBarChart items={workData.byEvent || []} formatter={(value) => Number(value).toLocaleString("en-IN")} />
				</div>
			</div>
		</div>
	);

	const renderCompanies = () => (
		<div className="analytics-card">
			<div className="panel-header"><h3>Companies</h3></div>
			<Table
				columns={[
					{ key: "company", label: "Company" },
					{ key: "events", label: "Events" },
					{ key: "invoiceValue", label: "Invoice Value", render: (value) => toCurrency(value) },
					{ key: "received", label: "Received", render: (value) => toCurrency(value) },
					{ key: "outstanding", label: "Outstanding", render: (value) => toCurrency(value) },
					{ key: "payouts", label: "Payouts", render: (value) => toCurrency(value) },
					{ key: "workEntries", label: "Work Entries" },
				]}
				rows={companiesList}
			/>
		</div>
	);

	const renderContent = () => {
		switch (activeTab) {
			case "events": return renderEvents();
			case "finance": return renderFinance();
			case "payments": return renderPayments();
			case "payouts": return renderPayouts();
			case "work": return renderWork();
			case "companies": return renderCompanies();
			default: return renderOverview();
		}
	};

	return (
		<div className="dashboard-container analytics-page">
			<header className="analytics-topbar">
				<div className="analytics-global-search"><FiSearch /><input aria-label="Global search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search events, invoices, clients, payments..." /><span>⌘ K</span>
					{searchResults && <div className="analytics-search-results">
						{[["events", "Events"], ["proforma", "Proforma"], ["invoices", "Tax Invoices"], ["payments", "Payments"], ["payouts", "Payouts"], ["work", "Daily Work"]].flatMap(([key, label]) => (searchResults[key] || []).map((item) => <Link key={`${key}-${item._id}`} to={item.eventId ? `/events/${item.eventId}` : key === "events" ? `/events/${item._id}` : "/"}><strong>{label}</strong>{item.eventName || item.piNumber || item.invoiceNumber || item.referenceNumber || item.vendorName || item.workDescription || item._id}</Link>))}
						{!Object.values(searchResults).some((items) => items?.length) && <EmptyState title="No results found" description="Try searching for an event, invoice, payment or payout." />}
					</div>}
				</div>
				<div className="analytics-account"><span className="analytics-date"><FiCalendar />{new Date().toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}</span><button className="analytics-bell" aria-label="Notifications"><FiBell /><i /></button><span className="analytics-account-divider" /><span className="analytics-avatar">{(auth?.name || "S").slice(0, 1).toUpperCase()}</span><strong>{auth?.name || "Sumit Thakur"}</strong><FiChevronDown /></div>
			</header>
			<div className="dashboard-header analytics-header">
				<div className="analytics-title-block">
					<h1>Analytics</h1>
					<p>Get a complete overview of your events, invoices, payments and business performance.</p>
				</div>
				<div className="analytics-actions">
					<div className="filter-group range-selectors">
						{[...RANGE_OPTIONS, ...(filters.range === "year-to-date" ? [{ value: "year-to-date", label: "Year to Date" }] : [])].map((option) => (
							<button
								key={option.value}
								type="button"
								className={filters.range === option.value ? "active" : ""}
								onClick={() => setFilters((current) => ({ ...current, range: option.value, from: "", to: "" }))}
							>
								{option.label}
							</button>
						))}
					</div>
					<div className="filter-inline">
						<label>
							<span>From</span>
							<input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, range: "custom", from: event.target.value }))} />
						</label>
						<label>
							<span>To</span>
							<input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, range: "custom", to: event.target.value }))} />
						</label>
						<label>
							<span>Company</span>
							<select value={filters.company} onChange={(event) => setFilters((current) => ({ ...current, company: event.target.value }))}>
								<option value="">All Companies</option>
								{companyOptions.map((item) => (
									<option key={item} value={item}>{item}</option>
								))}
							</select>
						</label>
						<label>
							<span>Status</span>
							<select aria-label="Status" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
								<option value="">All Statuses</option>
								<option value="UPCOMING">Upcoming</option>
								<option value="ONGOING">Active</option>
								<option value="COMPLETED">Completed</option>
								<option value="ARCHIVED">Archived</option>
								<option value="DRAFT">Draft</option>
							</select>
						</label>
						<button type="button" className="secondary-button" onClick={() => setFilters({ range: "this-month", company: "", status: "", from: "", to: "" })}><FiFilter /> Clear Filters</button>
					</div>
					<div className="export-actions">
						<button type="button" className="secondary-button" onClick={() => exportCsv("events")}><FiDownload /> Export Events</button>
						<button type="button" className="secondary-button" onClick={() => exportCsv("invoices")}><FiDownload /> Export Invoices</button>
						<button type="button" className="secondary-button" onClick={() => exportCsv("payments")}><FiDownload /> Export Payments</button>
					</div>
				</div>
			</div>
			<div className="analytics-tabs" role="tablist" aria-label="Analytics sections">
				{TABS.map((tab) => (
					<button key={tab} type="button" className={activeTab === tab ? "tab active" : "tab"} onClick={() => setActiveTab(tab)}>
						{tab.charAt(0).toUpperCase() + tab.slice(1)}
					</button>
				))}
			</div>
			{renderContent()}
		</div>
	);
};

export default Analytics;
