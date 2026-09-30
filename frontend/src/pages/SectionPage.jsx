import Navbar from "./Navbar";

const SectionPage = ({ children }) => <><Navbar />{children}</>;
SectionPage.propTypes = { children: PropTypes.node.isRequired };
export default SectionPage;
import PropTypes from "prop-types";
