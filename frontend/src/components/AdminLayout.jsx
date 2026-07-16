import AdminNav from './AdminNav.jsx'

function AdminLayout({ children }) {
  return (
    <div className="admin-layout">
      <AdminNav />
      <div className="admin-content">
        <div className="app-container">{children}</div>
      </div>
    </div>
  )
}

export default AdminLayout
