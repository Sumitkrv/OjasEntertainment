import PropTypes from "prop-types";
import Navbar from "./Navbar";
import FinanceModule from "./FinanceModule";

const FinancePage = ({ type }) => <><Navbar /><FinanceModule type={type} /></>;
FinancePage.propTypes = { type: PropTypes.string.isRequired };
export default FinancePage;
