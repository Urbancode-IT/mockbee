export default function Footer() {
  return (
    <footer className="main-footer main-footer--dark">
      <div className="main-footer__container container">
        <div className="main-footer__top">
          <div className="main-footer__links">
            <a href="#">Privacy Policy</a>
            <a href="#">Terms of Service</a>
            <a href="#">Support</a>
          </div>
          <div className="main-footer__social">
            <a href="#" aria-label="Twitter"><i className="fab fa-x-twitter" /></a>
            <a href="#" aria-label="Instagram"><i className="fab fa-instagram" /></a>
            <a href="#" aria-label="YouTube"><i className="fab fa-youtube" /></a>
            <a href="#" aria-label="Facebook"><i className="fab fa-facebook-f" /></a>
          </div>
        </div>
        <div className="main-footer__copyright">
          <p>ALL RIGHTS RESERVED @MOCKBEE</p>
        </div>
      </div>
    </footer>
  )
}
