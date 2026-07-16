import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout.jsx'

const STATUS_LABELS = {
  pending: 'Függőben',
  approved: 'Jóváhagyva',
  changes_requested: 'Javítás kérve',
}

function Dashboard() {
  const [customers, setCustomers] = useState([])
  const [orders, setOrders] = useState([])

  const [customerFilter, setCustomerFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [searchFilter, setSearchFilter] = useState('')

  const fetchCustomers = async () => {
    try {
      const response = await fetch('http://localhost:8000/customers', {
        credentials: 'include',
      })
      if (response.ok) {
        setCustomers(await response.json())
      }
    } catch (error) {
      // ignore, dropdown just stays empty
    }
  }

  const fetchOrders = async () => {
    try {
      const params = new URLSearchParams()
      if (customerFilter) params.set('customer_id', customerFilter)
      if (statusFilter) params.set('status', statusFilter)
      if (searchFilter) params.set('q', searchFilter)

      const response = await fetch(
        `http://localhost:8000/orders${params.toString() ? `?${params}` : ''}`,
        { credentials: 'include' },
      )
      if (response.ok) {
        setOrders(await response.json())
      }
    } catch (error) {
      // ignore, list just stays empty
    }
  }

  useEffect(() => {
    fetchCustomers()
  }, [])

  useEffect(() => {
    fetchOrders()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerFilter, statusFilter, searchFilter])

  return (
    <AdminLayout>
        <div className="app-header">
          <h1 className="app-title">Rendelések</h1>
          <p className="app-subtitle">Az összes rendelés áttekintése és szűrése</p>
        </div>

        <div className="card">
          <h2 className="card-title">Szűrők</h2>
          <div className="filter-row">
            <div className="field">
              <label className="field-label">Ügyfél</label>
              <select
                className="select"
                value={customerFilter}
                onChange={(event) => setCustomerFilter(event.target.value)}
              >
                <option value="">Összes ügyfél</option>
                {customers.map((customer) => (
                  <option key={customer.customer_id} value={customer.customer_id}>
                    {customer.name} ({customer.email})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="field-label">Állapot</label>
              <select
                className="select"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="">Összes állapot</option>
                <option value="pending">Függőben</option>
                <option value="approved">Jóváhagyva</option>
                <option value="changes_requested">Javítás kérve</option>
              </select>
            </div>
            <div className="field">
              <label className="field-label">Keresés</label>
              <input
                type="text"
                className="input"
                placeholder="Rendelésszám vagy termék neve"
                value={searchFilter}
                onChange={(event) => setSearchFilter(event.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="card-title">Rendelések listája</h2>
          {orders.length === 0 && <p className="entity-empty">Nincs a szűrésnek megfelelő rendelés</p>}
          <ul className="entity-list">
            {orders.map((order) => (
              <li key={order.order_id}>
                <Link to={`/admin/orders/${order.order_id}`} className="order-row order-row--full">
                  <div className="order-row-main">
                    <span className="order-row-product">{order.product_name}</span>
                  </div>
                  <div className="order-row-details">
                    <span>{order.customer_name}</span>
                    <span>{order.customer_email}</span>
                    <span>{order.created_at}</span>
                  </div>
                  <span
                    className={`status-badge ${
                      order.status === 'approved'
                        ? 'status-badge--approved'
                        : order.status === 'changes_requested'
                        ? 'status-badge--changes_requested'
                        : 'status-badge--pending'
                    }`}
                  >
                    {STATUS_LABELS[order.status] || order.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
    </AdminLayout>
  )
}

export default Dashboard
