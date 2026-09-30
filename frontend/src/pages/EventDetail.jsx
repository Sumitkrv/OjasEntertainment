import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import apiRequest from "../utils/api";
import getHeader from "../utils/header";
import Navbar from "./Navbar";
import StatusBadge from "../components/StatusBadge";
import "../css/Finance.css";

const sections = [["proformaInvoices", "Proforma Invoices"], ["taxInvoices", "Tax Invoices"], ["payments", "Payments"], ["payouts", "Payouts"], ["workLogs", "Daily Work"], ["documents", "Documents"], ["activities", "Activity"]];
const statusActions = { DRAFT: ["UPCOMING"], UPCOMING: ["ONGOING"], ONGOING: ["COMPLETED"], COMPLETED: ["ARCHIVED"], ARCHIVED: [] };
const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const EventDetail = () => {
	const { id } = useParams();
	const [detail, setDetail] = useState(null);
	const [summary, setSummary] = useState(null);
	const [file, setFile] = useState(null);
	const load = useCallback(async () => { try { const [eventResponse, summaryResponse] = await Promise.all([apiRequest(`/api/events/${id}`, { headers: getHeader() }), apiRequest(`/api/events/${id}/financial-summary`, { headers: getHeader() })]); setDetail(eventResponse.data); setSummary(summaryResponse.data); } catch (error) { toast.error(error.message); } }, [id]);
	useEffect(() => { load(); }, [load]);
	if (!detail) return <><Navbar /><main className="finance-container"><p>Loading event...</p></main></>;
	const event = detail.event;
	const changeStatus = async (status) => { try { const response = await apiRequest(`/api/events/${id}/status`, { method: "PATCH", headers: { ...getHeader(), "Content-Type": "application/json" }, body: JSON.stringify({ status }) }); const warnings = response.data?.completionWarnings || []; if (warnings.length) toast.warn(`Event completed with ${warnings.length} unresolved item(s). Review the Event workspace.`); else toast.success(`Event marked ${status.toLowerCase()}`); load(); } catch (error) { toast.error(error.message); } };
	const upload = async (formEvent) => { formEvent.preventDefault(); if (!file) return; try { const body = new FormData(); body.append("file", file); body.append("eventId", id); body.append("documentType", "OTHER"); await apiRequest("/api/documents", { method: "POST", headers: getHeader(body), body }); toast.success("Document uploaded"); setFile(null); load(); } catch (error) { toast.error(error.message); } };
	const removeDocument = async (documentId) => { try { await apiRequest(`/api/documents/${documentId}`, { method: "DELETE", headers: getHeader() }); toast.success("Document deleted"); load(); } catch (error) { toast.error(error.message); } };
	return <><Navbar /><main className="finance-container"><div className="finance-header"><div><Link to="/events">Events / Workspace</Link><h2>{event.eventName}</h2><p>{event.eventCode} <StatusBadge status={event.status} /></p></div><div>{statusActions[event.status].map((status) => <button className="model-submit" key={status} onClick={() => changeStatus(status)}>{status === "ARCHIVED" ? "Archive event" : `Mark ${status}`}</button>)}</div></div><section className="finance-summary">{[["Invoice Value", summary?.totalPIValue], ["Total Due", summary?.totalDue], ["Received", summary?.totalReceived], ["Outstanding", summary?.totalOutstanding], ["Overpaid", summary?.totalOverpaid], ["Payout", summary?.totalPayout]].map(([label, value]) => <div className="finance-summary-card" key={label}><span>{label}</span><strong>{money(value)}</strong></div>)}</section><section className="event-overview finance-table-wrap"><h3>Overview</h3><div className="event-meta"><span><b>Client</b>{event.clientName || "-"}</span><span><b>Company</b>{event.company || "-"}</span><span><b>Event date</b>{event.eventDate || "-"}</span><span><b>Location</b>{[event.city, event.venue].filter(Boolean).join(" · ") || "-"}</span></div><p>{event.description || "No description"}</p></section>{sections.map(([key, label]) => <section className="finance-table-wrap" key={key}><h3>{label}</h3>{key === "activities" ? <ol className="activity-list">{(detail[key] || []).map((item) => <li key={item._id}><span className="activity-dot" /><div><strong>{item.description}</strong><small>{item.createdAt ? new Date(item.createdAt).toLocaleString() : ""}</small></div></li>)}</ol> : key === "documents" ? <>{(detail[key] || []).map((item) => <p key={item._id}><a href={`${import.meta.env.VITE_BACKEND_URL}${item.url}`} target="_blank" rel="noreferrer">{item.originalFileName || item.fileName}</a> <button onClick={() => removeDocument(item._id)}>Delete</button></p>)}<form className="upload-row" onSubmit={upload}><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setFile(event.target.files[0])} /><button className="model-submit">Upload document</button></form></> : <table><tbody>{(detail[key] || []).map((item) => <tr key={item._id}><td>{item.piNumber || item.invoiceNumber || item.referenceNumber || item.workDescription || item.vendorName || item.amount || item.status || item._id}</td><td>{item.status || "-"}</td><td>{item.eventId ? <Link to={`/events/${item.eventId}`}>Event</Link> : "-"}</td></tr>)}</tbody></table>}</section>)}</main></>;
};
export default EventDetail;
