import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "./WorkforceAreaNav.scss";

/** The Workforce area's two halves: the employees, and the skills they can carry. */
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
