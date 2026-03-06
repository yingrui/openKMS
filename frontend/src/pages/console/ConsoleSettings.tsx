import { Settings } from 'lucide-react';
import './ConsoleSettings.css';

export function ConsoleSettings() {
  return (
    <div className="console-settings">
      <div className="page-header">
        <h1>System Settings</h1>
        <p className="page-subtitle">
          Configure system-wide settings, API endpoints, and admin preferences.
        </p>
      </div>
      <div className="console-settings-card">
        <h2>
          <Settings size={20} />
          General
        </h2>
        <div className="console-settings-section">
          <label>System name</label>
          <input type="text" defaultValue="openKMS" className="console-settings-input" />
        </div>
        <div className="console-settings-section">
          <label>Default timezone</label>
          <select className="console-settings-select" defaultValue="UTC">
            <option value="UTC">UTC</option>
            <option value="Asia/Shanghai">Asia/Shanghai</option>
            <option value="America/New_York">America/New_York</option>
          </select>
        </div>
      </div>
      <div className="console-settings-card">
        <h2>API &amp; Integrations</h2>
        <div className="console-settings-section">
          <label>Default API base URL</label>
          <input type="url" placeholder="https://api.example.com" className="console-settings-input" />
        </div>
      </div>
    </div>
  );
}
