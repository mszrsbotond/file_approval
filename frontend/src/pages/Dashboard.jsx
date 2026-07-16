import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout.jsx'

function KanbanColumn({ title, orders, className }) {
  return (
    <div className={`card kanban-column ${className}`}>
      <h2 className="card-title">{title}</h2>
      <ul className="entity-list">
        {orders.length === 0 && <p className="entity-empty">Nincs ide tartozó rendelés</p>}
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
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Dashboard() {
  const [customers, setCustomers] = useState([])
  const [orders, setOrders] = useState([])

  const [customerFilter, setCustomerFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [searchFilter, setSearchFilter] = useState('')

  const [approvedOrders, setApprovedOrders] = useState([])
  const [changesOrders, setChangesOrders] = useState([])
  const [pendingOrders, setPendingOrders] = useState([])

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
        const responseContent = await response.json()
        setOrders(responseContent)
        setApprovedOrders(responseContent.filter((order) => order.status === 'approved'))
        setChangesOrders(responseContent.filter((order) => order.status === 'changes_requested'))
        setPendingOrders(responseContent.filter((order) => order.status === 'pending'))
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
    <AdminLayout wide>
      <div className="app-header">
        <h1 className="app-title">Rendelések</h1>
      </div>
      <div className="cards-kanban">
        <KanbanColumn title="Jóváhagyásra vár" orders={pendingOrders} className="kanban-column--pending" />
        <KanbanColumn title="Javítás Kérve" orders={changesOrders} className="kanban-column--changes" />
        <KanbanColumn title="Jóváhagyva" orders={approvedOrders} className="kanban-column--approved" />
      </div>
    </AdminLayout>
  )
}

export default Dashboard
