import { NavLink } from 'react-router-dom'

function AdminNav() {
  return (
    <aside className="admin-sidebar">
      <div className="admin-sidebar-title">Print2000</div>
      <nav className="admin-nav">
        <NavLink
          to="/admin"
          end
          className={({ isActive }) => `admin-nav-link${isActive ? ' admin-nav-link--active' : ''}`}
        >
          Rendelések
        </NavLink>
        <NavLink
          to="/admin/new-order"
          className={({ isActive }) => `admin-nav-link${isActive ? ' admin-nav-link--active' : ''}`}
        >
          Új rendelés
        </NavLink>
        <NavLink
          to="/admin/customers"
          className={({ isActive }) => `admin-nav-link${isActive ? ' admin-nav-link--active' : ''}`}
        >
          Ügyfelek
        </NavLink>
      </nav>
    </aside>
  )
}

export default AdminNav
