import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import "../css/Analytics.css";
import Loading from "../components/Loading";
import apiRequest from "../utils/api";
import getHeader from "../utils/header";

const RANGE_OPTIONS = [
	{ value: "today", label: "Today" },
	{ value: "this-week", label: "This Week" },
	{ value: "this-month", label: "This Month" },
	{ value: "last-month", label: "Last Month" },
	{ value: "this-quarter", label: "This Quarter" },
	{ value: "this-year", label: "This Year" },
	{ value: "year-to-date", label: "Year to Date" },
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

const buildChartPoints = (items, width, height) => {
	if (!items.length) return "";
	const max = Math.max(...items.map((item) => item.value || 0), 1);
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

const CurrencyCard = ({ label, value, tone = "blue" }) => (
	<div className={`metric-card metric-${tone}`}>
		<span>{label}</span>
		<strong>{toCurrency(value)}</strong>
	</div>
);

const SimpleBarChart = ({ items = [], formatter = (value) => value }) => {
	if (!items.length) {
		return <div className="empty-state-block"><div><strong>No data for this period.</strong><p>Use a broader date range or change the company filter.</p></div></div>;
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

const LineChart = ({ items = [], valueKey = "value", labelKey = "label" }) => {
	if (!items.length) {
		return <div className="empty-state-block"><div><strong>No trend data.</strong><p>There are no matching records for the selected period.</p></div></div>;
	}
	const width = 420;
	const height = 180;
	const points = buildChartPoints(items, width, height);
	return (
		<div className="line-chart-wrap">
			<svg viewBox={`0 0 ${width} ${height}`} className="line-chart" preserveAspectRatio="none">
				<polyline fill="none" stroke="#3b70e9" strokeWidth="3" points={points} />
				{items.map((item, index) => {
					const max = Math.max(...items.map((entry) => Number(entry[valueKey] || 0)), 1);
					const x = items.length === 1 ? width / 2 : (index / Math.max(items.length - 1, 1)) * width;
					const y = height - ((Number(item[valueKey] || 0) / max) * (height - 18)) - 10;
					return <circle key={`${item[labelKey]}-${index}`} cx={x} cy={y} r="4" fill="#3b70e9" />;
				})}
			</svg>
			<div className="line-chart-labels">
				{items.map((item) => (
					<span key={`${item[labelKey]}-label`}>{item[labelKey]}</span>
				))}
			</div>
		</div>
	);
};

const Table = ({ columns, rows = [] }) => {
	if (!rows.length) {
		return <div className="empty-state-block"><div><strong>No data found.</strong><p>Adjust the filters to see the relevant records.</p></div></div>;
	}
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

const Analytics = () => {
	const [activeTab, setActiveTab] = useState("overview");
	const [filters, setFilters] = useState({ range: "this-month", company: "", status: "", from: "", to: "" });
	const [analytics, setAnalytics] = useState(null);
	const [loading, setLoading] = useState(true);

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
		const queryString = getQueryString(filters);
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
		const backendUrl = import.meta.env.VITE_BACKEND_URL;
		if (!backendUrl) {
			toast.error("Analytics export is not configured for this deployment");
			return;
		}
		const params = getQueryString(filters);
		window.open(`${backendUrl}/api/analytics/export?type=${type}&${params}`, "_blank");
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
		{ label: "Total Events", value: kpis.totalEvents || 0, tone: "blue" },
		{ label: "Upcoming Events", value: kpis.upcomingEvents || 0, tone: "green" },
		{ label: "Active Events", value: kpis.activeEvents || 0, tone: "amber" },
		{ label: "Completed Events", value: kpis.completedEvents || 0, tone: "blue" },
		{ label: "Invoice Value", value: kpis.invoiceValue || 0, tone: "blue" },
		{ label: "Received", value: kpis.received || 0, tone: "green" },
		{ label: "Outstanding", value: kpis.outstanding || 0, tone: "amber" },
		{ label: "TDS", value: kpis.tds || 0, tone: "red" },
		{ label: "Payouts", value: kpis.payouts || 0, tone: "amber" },
		{ label: "Work Logged", value: kpis.workLogged || 0, tone: "green" },
	];

	const renderOverview = () => (
		<div className="analytics-section-stack">
			<div className="kpi-grid">
				{overviewCards.map((card) => (
					<div key={card.label} className={`kpi-card ${card.tone}`}>
						<span>{card.label}</span>
						<strong>{card.label.toLowerCase().includes("value") || card.label.toLowerCase().includes("received") || card.label.toLowerCase().includes("outstanding") || card.label.toLowerCase().includes("tds") || card.label.toLowerCase().includes("payouts") || card.label.toLowerCase().includes("work") ? toCurrency(card.value) : Number(card.value).toLocaleString("en-IN")}</strong>
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
					<LineChart items={(financeData.monthly || []).map((entry) => ({ label: entry.label, value: entry.invoiceValue }))} />
				</div>
			</div>
			<div className="analytics-card">
				<div className="panel-header">
					<h3>Outstanding Invoices</h3>
				</div>
				<Table
					columns={[
						{ key: "eventName", label: "Event" },
						{ key: "invoiceNumber", label: "Invoice" },
						{ key: "outstanding", label: "Outstanding", render: (value) => toCurrency(value) },
						{ key: "status", label: "Status", render: (value) => <StatusPill value={value} /> },
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
			<div className="dashboard-header analytics-header">
				<div className="header-user">
					<h3>Analytics</h3>
				</div>
				<div className="analytics-actions">
					<div className="filter-group range-selectors">
						{RANGE_OPTIONS.map((option) => (
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
			<span>Event Status</span>
			<select aria-label="Event Status" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
				<option value="">All Event Statuses</option>
								<option value="UPCOMING">Upcoming</option>
								<option value="ONGOING">Active</option>
								<option value="COMPLETED">Completed</option>
								<option value="ARCHIVED">Archived</option>
								<option value="DRAFT">Draft</option>
							</select>
						</label>
		<button type="button" className="secondary-button" onClick={() => setFilters({ range: "this-month", company: "", status: "", from: "", to: "" })}>Clear Filters</button>
					</div>
					<div className="export-actions">
						<button type="button" className="secondary-button" onClick={() => exportCsv("events")}>Export Events</button>
						<button type="button" className="secondary-button" onClick={() => exportCsv("invoices")}>Export Invoices</button>
						<button type="button" className="secondary-button" onClick={() => exportCsv("payments")}>Export Payments</button>
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
