import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout.jsx'

function Customers() {
  const [customers, setCustomers] = useState([])

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const response = await fetch('http://localhost:8000/customers', {
          credentials: 'include',
        })
        if (response.ok) {
          setCustomers(await response.json())
        }
      } catch (error) {
        // hiba esetén a lista üresen marad
      }
    }

    fetchCustomers()
  }, [])

  return (
    <AdminLayout>
        <div className="app-header">
          <h1 className="app-title">Ügyfelek</h1>
          <p className="app-subtitle">Az összes rögzített ügyfél listája</p>
        </div>

        <div className="card">
          {customers.length === 0 && <p className="entity-empty">Még nincs ügyfél</p>}
          <ul className="entity-list">
            {customers.map((customer) => (
              <li key={customer.customer_id}>
                <Link
                  to={`/admin?customer_id=${customer.customer_id}&customer_name=${encodeURIComponent(customer.name)}`}
                  className="customer-row"
                >
                  <div className="customer-row-main">
                    <span className="customer-row-name">{customer.name}</span>
                    <span className="customer-row-email">{customer.email}</span>
                  </div>
                  <span className="customer-row-count">
                    {customer.order_count} rendelés
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
    </AdminLayout>
  )
}

export default Customers
