import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { checkValidSignUpFrom } from "../utils/validate";
import { FiBell, FiCalendar, FiChevronDown, FiEye, FiEyeOff, FiInfo, FiLock, FiMail, FiSearch, FiUser } from "react-icons/fi";
import { useDispatch, useSelector } from "react-redux";
import { Link, useNavigate } from "react-router-dom";
import { removeAuth } from "../redux/slices/authSlice";
import getHeader from "../utils/header";
import apiRequest from "../utils/api";
import EmptyState from "../components/EmptyState";
import "../css/Settings.css";

const SEARCH_GROUPS = [["events", "Events"], ["proforma", "Proforma"], ["invoices", "Tax Invoices"], ["payments", "Payments"], ["payouts", "Payouts"], ["work", "Daily Work"]];

const Settings = () => {
	const auth = useSelector((store) => store.auth);
	const [name, setName] = useState(auth.name);
	const [email, setEmail] = useState(auth.email);
	const [oldPassword, setOldPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [load, setLoad] = useState("");
	const [isShowO, setIsShowO] = useState(false);
	const [isShowN, setIsShowN] = useState(false);
	const [query, setQuery] = useState("");
	const [searchResults, setSearchResults] = useState(null);
	const dispatch = useDispatch();
	const navigate = useNavigate();

	useEffect(() => {
		setName(auth.name || "");
		setEmail(auth.email || "");
	}, [auth.name, auth.email]);

	useEffect(() => {
		const timer = setTimeout(() => {
			if (query.trim().length < 2) return setSearchResults(null);
			apiRequest(`/api/dashboard/search?q=${encodeURIComponent(query)}`, { headers: getHeader() })
				.then((response) => setSearchResults(response.data))
				.catch(() => toast.error("Search unavailable"));
		}, 250);
		return () => clearTimeout(timer);
	}, [query]);

	const handleName = (value) => setName(value.charAt(0).toUpperCase() + value.slice(1));
	const handlePasswordOld = (value) => setOldPassword(value.trim());
	const handlePasswordNew = (value) => setNewPassword(value.trim());

	const updateUser = (event) => {
		const updateButton = event.currentTarget;
		toast.loading("Wait until you SignUp");
		updateButton.disabled = true;
		apiRequest("/api/user/update", {
			method: "PUT",
			headers: getHeader(),
			body: JSON.stringify({ name, email, oldPassword, newPassword }),
		})
			.then((json) => {
				setLoad("");
				updateButton.disabled = false;
				toast.dismiss();
				if (json?.message === "success") {
					toast.success("Update Successfully");
					localStorage.removeItem("token");
					dispatch(removeAuth());
					navigate("/login");
				} else {
					toast.error(json?.message);
				}
			})
			.catch((error) => {
				console.error("Error:", error);
				setLoad("");
				toast.dismiss();
				toast.error("Something went wrong");
				updateButton.disabled = false;
			});
	};

	const handleUpdate = (event) => {
		if (name && email && newPassword && oldPassword) {
			const validError = checkValidSignUpFrom(name, email, newPassword);
			if (validError) {
				toast.error(validError);
				return;
			}
			setLoad("Loading...");
			updateUser(event);
		} else {
			toast.error("All fields are required");
		}
	};

	return (
		<main className="dashboard-container settings-page">
			<header className="settings-topbar">
				<div className="settings-global-search"><FiSearch /><input aria-label="Global search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search events, invoices, clients, payments..." /><span>⌘ K</span>
					{searchResults && <div className="settings-search-results">
						{SEARCH_GROUPS.flatMap(([key, label]) => (searchResults[key] || []).map((item) => <Link key={`${key}-${item._id}`} to={item.eventId ? `/events/${item.eventId}` : key === "events" ? `/events/${item._id}` : "/"}><strong>{label}</strong>{item.eventName || item.piNumber || item.invoiceNumber || item.referenceNumber || item.vendorName || item.workDescription || item._id}</Link>))}
						{!Object.values(searchResults).some((items) => items?.length) && <EmptyState title="No results found" description="Try searching for an event, invoice, payment or payout." />}
					</div>}
				</div>
				<div className="settings-account"><span className="settings-date"><FiCalendar />{new Date().toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}</span><button type="button" className="settings-bell" aria-label="Notifications"><FiBell /><i /></button><span className="settings-account-divider" /><span className="settings-avatar">{(auth?.name || "U").slice(0, 1).toUpperCase()}</span><strong>{auth?.name || "Workspace user"}</strong><FiChevronDown /></div>
			</header>

			<section className="settings-heading">
				<p className="settings-breadcrumb">System <span>›</span> Settings</p>
				<h1>Account &amp; Security</h1>
				<p>Manage your account details and update your password to keep your account secure.</p>
			</section>

			<form className="settings-form">
				<section className="settings-card profile-card" aria-labelledby="profile-title">
					<div className="settings-card-icon"><FiUser /></div>
					<div className="settings-card-content">
						<header className="settings-card-heading"><h2 id="profile-title">Profile Information</h2><p>Your basic account information used to access Pro Manage.</p></header>
						<div className="settings-fields">
							<label className="settings-field"><span>User Name</span><span className="settings-input-wrap"><FiUser /><input type="text" name="name" aria-label="User Name" value={name || ""} onChange={(event) => handleName(event.target.value)} required /></span></label>
							<label className="settings-field"><span>Email Address</span><span className="settings-input-wrap"><FiMail /><input type="email" name="email" aria-label="Email Address" value={email || ""} onChange={(event) => setEmail(event.target.value)} required /></span></label>
						</div>
					</div>
				</section>

				<section className="settings-card security-card" aria-labelledby="security-title">
					<div className="settings-card-icon"><FiLock /></div>
					<div className="settings-card-content">
						<header className="settings-card-heading"><h2 id="security-title">Security</h2><p>Update your password to keep your account secure.</p></header>
						<div className="settings-fields">
							<label className="settings-field"><span>Current Password</span><span className="settings-input-wrap"><FiLock /><input type={isShowO ? "text" : "password"} name="oldPassword" aria-label="Current Password" placeholder="Current Password" value={oldPassword} onChange={(event) => handlePasswordOld(event.target.value)} autoComplete="current-password" /><button type="button" aria-label={isShowO ? "Hide current password" : "Show current password"} onClick={() => setIsShowO(!isShowO)}>{isShowO ? <FiEyeOff /> : <FiEye />}</button></span></label>
							<label className="settings-field"><span>New Password</span><span className="settings-input-wrap"><FiLock /><input type={isShowN ? "text" : "password"} name="newPassword" aria-label="New Password" placeholder="New Password" value={newPassword} onChange={(event) => handlePasswordNew(event.target.value)} autoComplete="new-password" /><button type="button" aria-label={isShowN ? "Hide new password" : "Show new password"} onClick={() => setIsShowN(!isShowN)}>{isShowN ? <FiEyeOff /> : <FiEye />}</button></span></label>
						</div>
						<div className="settings-security-note"><FiInfo /><p>Use a strong password with a mix of letters, numbers and special characters to keep your account safe.</p></div>
						<div className="settings-form-actions"><button type="button" className="settings-update-button" disabled={Boolean(load)} onClick={handleUpdate}>{load || "Update"}</button></div>
					</div>
				</section>
			</form>
		</main>
	);
};

export default Settings;
