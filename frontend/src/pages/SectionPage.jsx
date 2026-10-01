import PropTypes from "prop-types";
import Navbar from "./Navbar";

const SectionPage = ({ children }) => <><Navbar />{children}</>;
SectionPage.propTypes = { children: PropTypes.node.isRequired };
export default SectionPage;
