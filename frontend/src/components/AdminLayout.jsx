import AdminNav from './AdminNav.jsx'

function AdminLayout({ children, wide = false }) {
  return (
    <div className="admin-layout">
      <AdminNav />
      <div className="admin-content">
        <div className={`app-container${wide ? ' app-container--wide' : ''}`}>{children}</div>
      </div>
    </div>
  )
}

export default AdminLayout
