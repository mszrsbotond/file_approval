import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
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
                <span>{order.order_number}</span>
                <span>{order.customer_name}</span>
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
  const [searchParams, setSearchParams] = useSearchParams()
  const [customers, setCustomers] = useState([])
  const [orders, setOrders] = useState([])
  const [searchInput, setSearchInput] = useState('')
  // Ha az Ügyfelek oldalról érkeztünk egy ügyfélre kattintva, a keresőmező az ő
  // nevét mutatja, de a szűrés pontos customer_id egyezésen alapul, nem szövegen —
  // amint a felhasználó átírja a mezőt, visszaáll a normál cím/rendelésszám keresésre.
  const [customerIdFilter, setCustomerIdFilter] = useState(null)

  const fetchOrders = async () => {
    try {
      const response = await fetch('http://localhost:8000/orders', { credentials: 'include' })
      if (response.ok) setOrders(await response.json())
    } catch (error) {
      // ignore
    }
  }

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

  useEffect(() => {
    fetchCustomers()
    fetchOrders()
  }, [])

  useEffect(() => {
    const customerId = searchParams.get('customer_id')
    const customerName = searchParams.get('customer_name')
    if (customerId) {
      setCustomerIdFilter(customerId)
      setSearchInput(customerName || '')
    }
  }, [searchParams])

  const handleSearchChange = (e) => {
    setSearchInput(e.target.value)
    if (customerIdFilter) {
      setCustomerIdFilter(null)
      setSearchParams({}, { replace: true })
    }
  }

  const q = searchInput.trim().toLowerCase()
  const filtered = customerIdFilter
    ? orders.filter((o) => o.customer_id === customerIdFilter)
    : q
    ? orders.filter((o) =>
        [o.product_name, o.order_number].some((f) => f?.toLowerCase().includes(q)),
      )
    : orders

  const byStatus = (s) => filtered.filter((o) => o.status === s)

  return (
    <AdminLayout wide>
      <div className="app-header">
        <h1 className="app-title">Rendelések</h1>
      </div>
      <input
        type="text"
        className="searchBar"
        placeholder="Keresés..."
        value={searchInput}
        onChange={handleSearchChange}
      />
      <div className="cards-kanban">
        <KanbanColumn title="Jóváhagyásra vár" orders={byStatus('pending')} className="kanban-column--pending" />
        <KanbanColumn title="Javítás Kérve" orders={byStatus('changes_requested')} className="kanban-column--changes" />
        <KanbanColumn title="Jóváhagyva" orders={byStatus('approved')} className="kanban-column--approved" />
      </div>
    </AdminLayout>
  )
}

export default Dashboard