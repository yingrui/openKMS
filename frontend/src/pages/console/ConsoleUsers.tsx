import { Plus, Search, Users } from 'lucide-react';
import './ConsoleUsers.css';

const mockUsers = [
  { name: 'Admin', email: 'admin@example.com', role: 'Admin' },
  { name: 'Jane Doe', email: 'jane@example.com', role: 'Editor' },
  { name: 'John Smith', email: 'john@example.com', role: 'Viewer' },
];

export function ConsoleUsers() {
  return (
    <div className="console-users">
      <div className="page-header console-users-header">
        <div>
          <h1>Users &amp; Roles</h1>
          <p className="page-subtitle">
            Manage users and assign roles. Control access to documents, articles, and knowledge bases.
          </p>
        </div>
        <button type="button" className="btn btn-primary">
          <Plus size={18} />
          <span>Add User</span>
        </button>
      </div>
      <div className="console-users-toolbar">
        <div className="console-users-search">
          <Search size={18} />
          <input type="search" aria-label="Search users" placeholder="Search users..." />
        </div>
      </div>
      <div className="console-users-table-wrap">
        <table className="console-users-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Email</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            {mockUsers.map((u, i) => (
              <tr key={i}>
                <td>
                  <div className="console-users-table-name">
                    <Users size={18} strokeWidth={1.5} />
                    <span>{u.name}</span>
                  </div>
                </td>
                <td>{u.email}</td>
                <td>{u.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
