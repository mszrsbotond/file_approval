import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout.jsx'

const STATUS_LABELS = {
  pending: 'Jóváhagyásra vár',
  changes_requested: 'Javítás kérve',
  approved: 'Jóváhagyva',
}

function Archives() {
  const [orders, setOrders] = useState([])
  const [restoringId, setRestoringId] = useState(null)

  const fetchArchivedOrders = async () => {
    try {
      const response = await fetch('http://localhost:8000/orders?archived=true', {
        credentials: 'include',
      })
      if (response.ok) setOrders(await response.json())
    } catch (error) {
      // hiba esetén a lista üresen marad
    }
  }

  useEffect(() => {
    fetchArchivedOrders()
  }, [])

  const restoreOrder = async (orderId) => {
    setRestoringId(orderId)
    try {
      const response = await fetch(`http://localhost:8000/orders/${orderId}/archive`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ archived: false }),
      })
      if (response.ok) {
        setOrders((prev) => prev.filter((o) => o.order_id !== orderId))
      }
    } catch (error) {
      // hiba esetén a rendelés archiválva marad
    } finally {
      setRestoringId(null)
    }
  }

  return (
    <AdminLayout>
      <div className="app-header">
        <h1 className="app-title">Archívum</h1>
        <p className="app-subtitle">Archivált rendelések, amelyek nem jelennek meg a dashboardon</p>
      </div>

      <div className="card">
        {orders.length === 0 && <p className="entity-empty">Nincs archivált rendelés</p>}
        <ul className="entity-list">
          {orders.map((order) => (
            <li key={order.order_id}>
              <div className="order-row order-row--full order-row--archived">
                <Link to={`/admin/orders/${order.order_id}`} className="order-row-link">
                  <div className="order-row-main">
                    <span className="order-row-product">{order.product_name}</span>
                  </div>
                  <div className="order-row-details">
                    <span>{order.order_number}</span>
                    <span>{order.customer_name}</span>
                    <span>{STATUS_LABELS[order.status] || order.status}</span>
                  </div>
                </Link>
                <button
                  className="btn btn-secondary"
                  onClick={() => restoreOrder(order.order_id)}
                  disabled={restoringId === order.order_id}
                >
                  Visszaállítás
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </AdminLayout>
  )
}

export default Archives
