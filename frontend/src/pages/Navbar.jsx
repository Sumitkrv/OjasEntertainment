import { useState } from "react";
import { FiBarChart2, FiBriefcase, FiChevronLeft, FiChevronRight, FiClipboard, FiCreditCard, FiFileText, FiGrid, FiHome, FiLogOut, FiMenu, FiSettings, FiUsers, FiX } from "react-icons/fi";
import { Link, useLocation } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { setLogoutM } from "../redux/slices/stateSlice";
import brandLogo from "../assets/ojas-entertainment-logo.png";
import "../css/Navbar.css";

const sections = [
	["WORKSPACE", [["/", "Dashboard", FiHome], ["/board", "Board", FiGrid], ["/daily-work", "Daily Work", FiClipboard]]],
	["FINANCE", [["/events", "Events", FiBriefcase], ["/proforma", "Proforma Invoices", FiFileText], ["/tax-invoices", "Tax Invoices", FiFileText], ["/payments", "Payments", FiCreditCard], ["/payouts", "Payouts", FiUsers]]],
	["INSIGHTS", [["/analytics", "Analytics", FiBarChart2]]],
	["SYSTEM", [["/settings", "Settings", FiSettings]]],
];

const Navbar = () => {
	const location = useLocation();
	const dispatch = useDispatch();
	const auth = useSelector((store) => store.auth);
	const [collapsed, setCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");
	const [mobileOpen, setMobileOpen] = useState(false);
	const toggle = () => { const next = !collapsed; setCollapsed(next); localStorage.setItem("sidebar-collapsed", String(next)); };
	const active = (path) => path === "/" ? location.pathname === "/" : location.pathname === path || location.pathname.startsWith(`${path}/`);
	return <>
		<button className="mobile-nav-toggle" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><FiMenu /></button>
		<aside className={`navbar ${collapsed ? "navbar-collapsed" : ""} ${mobileOpen ? "navbar-mobile-open" : ""}`}>
			<div className="nav-brand"><Link to="/" onClick={() => setMobileOpen(false)} aria-label="Ojas Entertainment home"><img className="brand-logo" src={brandLogo} alt="Ojas Entertainment" /></Link><button className="mobile-close" aria-label="Close navigation" onClick={() => setMobileOpen(false)}><FiX /></button></div>
			<nav className="nav-groups">{sections.map(([heading, items]) => <div className="nav-group" key={heading}><p className="nav-group-title">{heading}</p>{items.map(([path, label, Icon]) => <Link key={path} to={path} title={collapsed ? label : undefined} onClick={() => setMobileOpen(false)} className={`nav-link ${active(path) ? "nav-active" : ""}`}><Icon /><span>{label}</span></Link>)}</div>)}</nav>
			<div className="nav-bottom"><div className="nav-profile"><span className="profile-avatar">{(auth?.name || "U").slice(0, 1).toUpperCase()}</span><span className="profile-copy"><strong>{auth?.name || "Workspace user"}</strong><small>{auth?.email || "Operations"}</small></span></div><button className="nav-logout" onClick={() => dispatch(setLogoutM(true))}><FiLogOut /><span>Log out</span></button><button className="collapse-toggle" onClick={toggle} aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}>{collapsed ? <FiChevronRight /> : <FiChevronLeft />}</button></div>
		</aside>
		{mobileOpen && <button className="nav-backdrop" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
	</>;
};
export default Navbar;
