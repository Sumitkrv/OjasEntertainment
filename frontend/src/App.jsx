import React, { Suspense, useEffect, useRef, useState } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import DashboardHome from "./pages/DashboardHome";
import FinancePage from "./pages/FinancePage";
import Analytics from "./pages/Analytics";
import Settings from "./pages/Settings";
import SectionPage from "./pages/SectionPage";
import PageNotFound from "./pages/PageNotFound";
import Register_Login from "./pages/Register_Login";
import PrivateRoute from "./components/PrivateRoute";
import Loading from "./components/Loading";
import { useDispatch, useSelector } from "react-redux";
import { addAuth } from "./redux/slices/authSlice";
import { setLoading } from "./redux/slices/stateSlice";
import { TaskCardPublic } from "./components/Model";
import getHeader from "./utils/header";
import apiRequest from "./utils/api";
import { toast } from "react-toastify";
import Events from "./pages/Events";
import EventDetail from "./pages/EventDetail";

function App() {
	const dispatch = useDispatch();
	const navigate = useNavigate();
	const { pathname } = useLocation();
	const loading = useSelector((store) => store.state.loading);
	const token = localStorage.getItem("token");
	const [authReady, setAuthReady] = useState(false);
	const authBootstrapStarted = useRef(false);

	useEffect(() => {
		const expireSession = () => {
			dispatch(addAuth(null));
			if (window.location.pathname !== "/login") navigate("/login");
			toast.error("Your session expired. Please sign in again.");
		};
		window.addEventListener("app:session-expired", expireSession);
		return () => window.removeEventListener("app:session-expired", expireSession);
	}, [dispatch, navigate]);

	useEffect(() => {
		if (authBootstrapStarted.current) return;
		authBootstrapStarted.current = true;
		const storedToken = localStorage.getItem("token");
		if (!storedToken) { setAuthReady(true); return; }
		dispatch(setLoading(true));
		apiRequest("/api/user/profile", { method: "GET", headers: { Authorization: `Bearer ${storedToken}` } })
			.then((json) => {
				if (json?.data) {
					dispatch(addAuth(json.data));
					if (pathname === "/login") navigate("/");
				} else {
					localStorage.removeItem("token");
					dispatch(addAuth(null));
					if (pathname !== "/login") navigate("/login");
				}
			})
			.catch((error) => {
				localStorage.removeItem("token");
				dispatch(addAuth(null));
				if (pathname !== "/login") navigate("/login");
				if (error.status !== 401) toast.error("Unable to verify your session");
			})
			.finally(() => { dispatch(setLoading(false)); setAuthReady(true); });
	}, [dispatch, navigate, pathname]);

	return (
		<div className="app-container">
			{loading && <Loading />}
			{!authReady && token ? <Loading /> : <Suspense fallback={<Loading />}>
				<Routes>
					<Route
						path="/"
						element={
							<PrivateRoute>
								<DashboardHome />
							</PrivateRoute>
						}
					/>
					<Route path="/login" element={<Register_Login />} />
					<Route path="/events" element={<PrivateRoute><Events /></PrivateRoute>} />
					<Route path="/events/:id" element={<PrivateRoute><EventDetail /></PrivateRoute>} />
					<Route path="/board" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
					<Route path="/daily-work" element={<PrivateRoute><FinancePage type="work" /></PrivateRoute>} />
					<Route path="/proforma" element={<PrivateRoute><FinancePage type="proforma" /></PrivateRoute>} />
					<Route path="/tax-invoices" element={<PrivateRoute><FinancePage type="taxInvoices" /></PrivateRoute>} />
					<Route path="/payments" element={<PrivateRoute><FinancePage type="payments" /></PrivateRoute>} />
					<Route path="/payouts" element={<PrivateRoute><FinancePage type="payouts" /></PrivateRoute>} />
					<Route path="/analytics" element={<PrivateRoute><SectionPage><Analytics /></SectionPage></PrivateRoute>} />
					<Route path="/settings" element={<PrivateRoute><SectionPage><Settings /></SectionPage></PrivateRoute>} />
					<Route path="/task/:id" element={<TaskCardPublic />} />
					<Route path="*" element={<PageNotFound />} />
				</Routes>
			</Suspense>}
		</div>
	);
}

export default App;
