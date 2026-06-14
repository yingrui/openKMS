import { appVersion } from '../../version';
import './BuildStamp.scss';

/** Unobtrusive build id for screenshot/debug correlation. */
export function BuildStamp() {
  if (!appVersion || appVersion === 'dev') return null;
  return (
    <span className="app-build-stamp" aria-hidden="true" title={`openKMS ${appVersion}`}>
      {appVersion}
    </span>
  );
}
