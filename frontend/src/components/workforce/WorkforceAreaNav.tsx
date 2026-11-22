import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "./WorkforceAreaNav.scss";

/** The Workforce area: the employees and what they can carry. Running them is a page reached from the list header. */
export function WorkforceAreaNav() {
  const { t } = useTranslation("workforce");

  return (
    <nav className="workforce-area-nav" aria-label={t("nav.areaLabel")}>
      <NavLink
        to="/workforce"
        end
        className={({ isActive }) =>
          `workforce-area-nav-link${isActive ? " active" : ""}`
        }
      >
        {t("nav.agents")}
      </NavLink>
      <NavLink
        to="/workforce/skills"
        className={({ isActive }) =>
          `workforce-area-nav-link${isActive ? " active" : ""}`
        }
      >
        {t("nav.skills")}
      </NavLink>
      <NavLink
        to="/workforce/tools"
        className={({ isActive }) => `workforce-area-nav-link${isActive ? " active" : ""}`}
      >
        {t("nav.tools")}
      </NavLink>
    </nav>
  );
}
