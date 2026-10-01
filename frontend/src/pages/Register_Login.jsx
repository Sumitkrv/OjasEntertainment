import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { checkValidSignInFrom, checkValidSignUpFrom } from "../utils/validate";
import { PiEye, PiEyeClosedLight } from "react-icons/pi";
import { CiLock, CiMail, CiUser } from "react-icons/ci";
import { FiArrowRight } from "react-icons/fi";
import { useDispatch } from "react-redux";
import { addAuth } from "../redux/slices/authSlice";
import AuthImage from "../assets/AuthImage.png";
import OjasLogo from "../assets/ojas-entertainment-logo.png";
import "../css/Register_Login.css";
import apiRequest from "../utils/api";

const Register_Login = () => {
	const [isRegister, setIsRegister] = useState(false);
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [cpassword, setCPassword] = useState("");
	const [load, setLoad] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isShow, setIsShow] = useState(false);
	const [isShowC, setIsShowC] = useState(false);
	const navigate = useNavigate();
	const dispatch = useDispatch();

	// Login
	const logInUser = () => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		toast.loading("Wait until you SignIn");
		apiRequest("/api/auth/login", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				email: email,
				password: password,
			}),
		})
			.then((json) => {
				setLoad("");
				setIsSubmitting(false);
				toast.dismiss();
				if (json.token) {
					localStorage.setItem("token", json.token);
					dispatch(addAuth(json.data));
					navigate("/");
					toast.success(json?.message);
				} else {
					toast.error(json?.message);
				}
			})
			.catch((error) => {
				console.error("Error:", error);
				setLoad("");
				toast.dismiss();
				toast.error(error.message || "Something went wrong");
				setIsSubmitting(false);
			});
	};
	const handleLogin = () => {
		if (email && password) {
			const validError = checkValidSignInFrom(email, password);
			if (validError) {
				toast.error(validError);
				return;
			}
			setLoad("Loading...");
			logInUser();
		} else {
			toast.error("All fields are required");
		}
	};

	// Signup
	const registerUser = () => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		toast.loading("Wait until you SignUp");
		apiRequest("/api/auth/register", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				name: name,
				email: email,
				password: password,
			}),
		})
			.then((json) => {
				setLoad("");
				setIsSubmitting(false);
				toast.dismiss();
				if (json.token) {
					setIsRegister(false);
					setPassword("");
					setCPassword("");
					toast.success(json?.message);
				} else {
					toast.error(json?.message);
				}
			})
			.catch((error) => {
				console.error("Error:", error);
				setLoad("");
				toast.dismiss();
				toast.error(error.message || "Something went wrong");
				setIsSubmitting(false);
			});
	};
	const handleRegister = () => {
		if (name && email && password) {
			const validError = checkValidSignUpFrom(name, email, password);
			if (validError) {
				toast.error(validError);
				return;
			}
			if (password != cpassword) {
				toast.error("Passwords don't match");
				return;
			}
			setLoad("Loading...");
			registerUser();
		} else {
			toast.error("All fields are required");
		}
	};
	const handleName = (name) => {
		name = name.charAt(0).toUpperCase() + name.slice(1);
		setName(name);
	};

	const handlePassword = (password) => {
		password = password.trim();
		setPassword(password);
	};
	return (
		<div className="register_login_box">
			<section className="auth-visual" aria-label="TaskFlow productivity overview">
				<div className="auth-visual-glow" />
				<div className="auth-brand auth-brand-light"><img src={OjasLogo} alt="Ojas Entertainment" /></div>
				<div className="auth-visual-copy">
					<p className="auth-eyebrow">Plan <span>·</span> Track <span>·</span> Achieve</p>
					<h1>Organize<br />Your Work,<br /><span>Achieve More.</span></h1>
					<p className="auth-visual-description">A simple and powerful task manager to keep you focused, productive, and always a step ahead.</p>
				</div>
				<div className="auth-illustration"><div className="illustration-halo" /><img src={AuthImage} alt="Astronaut organizing tasks on a laptop" /></div>
				<blockquote><span>&ldquo;</span><div><strong>Small steps every day lead to big results.</strong><small>Stay consistent. Stay productive.</small></div></blockquote>
			</section>
			<section className="auth-panel">
				<form className="form_box" onSubmit={(e) => { e.preventDefault(); if (isRegister) handleRegister(e); else handleLogin(e); }}>
					<div className="auth-card">
						<div className="auth-card-header">
							<div className="auth-brand auth-brand-dark"><img src={OjasLogo} alt="Ojas Entertainment" /></div>
							<p>Sign in to continue to your workspace</p>
						</div>
						{isRegister && (
							<div className="auth-field">
								<label htmlFor="auth-name">Full name</label>
								<div className="input_p_box"><CiUser className="field-icon" aria-hidden="true" /><input id="auth-name" type="text" placeholder="Your name" name="name" value={name} onChange={(e) => handleName(e.target.value)} required /></div>
							</div>
						)}
						<div className="auth-field">
							<label htmlFor="auth-email">Email address</label>
							<div className="input_p_box"><CiMail className="field-icon" aria-hidden="true" /><input id="auth-email" type="email" placeholder="you@company.com" name="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
						</div>
						<div className="auth-field">
							<label htmlFor="auth-password">Password</label>
							<div className="input_p_box"><CiLock className="field-icon" aria-hidden="true" /><input id="auth-password" type={isShow ? "text" : "password"} placeholder="Enter your password" name="password" value={password} onChange={(e) => handlePassword(e.target.value)} /><button type="button" className="hide_show_btn" aria-label={isShow ? "Hide password" : "Show password"} aria-pressed={isShow} onClick={() => setIsShow(!isShow)}>{isShow ? <PiEyeClosedLight /> : <PiEye />}</button></div>
						</div>
						{isRegister && (
							<div className="auth-field">
								<label htmlFor="auth-confirm-password">Confirm password</label>
								<div className="input_p_box"><CiLock className="field-icon" aria-hidden="true" /><input id="auth-confirm-password" type={isShowC ? "text" : "password"} placeholder="Repeat your password" value={cpassword} onChange={(e) => setCPassword(e.target.value)} /><button type="button" className="hide_show_btn" aria-label={isShowC ? "Hide confirm password" : "Show confirm password"} aria-pressed={isShowC} onClick={() => setIsShowC(!isShowC)}>{isShowC ? <PiEyeClosedLight /> : <PiEye />}</button></div>
							</div>
						)}
						{!isRegister && <div className="auth-options"><label className="remember-option"><input type="checkbox" /> <span>Remember me</span></label><button type="button" className="forgot-link" disabled>Forgot password?</button></div>}
						<button type="submit" disabled={isSubmitting} className="submit_button"><span>{load === "" ? `${isRegister ? "Create account" : "Login"}` : load}</span>{!isSubmitting && <FiArrowRight aria-hidden="true" />}</button>
						<div className="auth-divider"><span>{isRegister ? "Already have an account?" : "Don't have an account yet?"}</span></div>
						<button type="button" className="button_change" onClick={() => setIsRegister(!isRegister)}>{isRegister ? "Back to login" : "Create new account"}</button>
					</div>
				</form>
			</section>
		</div>
	);
};

export default Register_Login;
