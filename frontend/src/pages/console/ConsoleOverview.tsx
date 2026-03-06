import { Activity, GitBranch, ListTodo, Cpu, Users } from 'lucide-react';
import './ConsoleOverview.css';

const stats = [
  { label: 'Active Jobs', value: '3', icon: ListTodo },
  { label: 'Pipelines', value: '2', icon: GitBranch },
  { label: 'Models', value: '7', icon: Cpu },
  { label: 'Users', value: '12', icon: Users },
];

export function ConsoleOverview() {
  return (
    <div className="console-overview">
      <div className="page-header">
        <h1>Console Overview</h1>
        <p className="page-subtitle">
          System administration dashboard. Manage pipelines, jobs, models, users, and settings.
        </p>
      </div>
      <section className="console-overview-stats">
        {stats.map(({ label, value, icon: Icon }) => (
          <div key={label} className="console-overview-stat">
            <div className="console-overview-stat-icon">
              <Icon size={24} strokeWidth={1.75} />
            </div>
            <div>
              <span className="console-overview-stat-value">{value}</span>
              <span className="console-overview-stat-label">{label}</span>
            </div>
          </div>
        ))}
      </section>
      <section className="console-overview-card">
        <h2>Recent Activity</h2>
        <div className="console-overview-activity">
          <Activity size={20} />
          <p>No recent activity. Use the sidebar to manage pipelines, jobs, models, and users.</p>
        </div>
      </section>
    </div>
  );
}
