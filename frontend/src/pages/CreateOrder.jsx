import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout.jsx'

const NEW_CUSTOMER_VALUE = ''

function CreateOrder() {
  const navigate = useNavigate()

  const [customers, setCustomers] = useState([])
  const [selectedCustomerId, setSelectedCustomerId] = useState(NEW_CUSTOMER_VALUE)
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [productName, setProductName] = useState('')
  const [creatingOrder, setCreatingOrder] = useState(false)
  const [orderMessage, setOrderMessage] = useState('')

  const isNewCustomer = selectedCustomerId === NEW_CUSTOMER_VALUE

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
  }, [])

  const handleAddOrder = async (event) => {
    event.preventDefault()
    if (!productName) return
    if (isNewCustomer && (!customerName || !customerEmail)) return

    setCreatingOrder(true)
    setOrderMessage('')

    try {
      const response = await fetch('http://localhost:8000/add_order', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          isNewCustomer
            ? { name: customerName, email: customerEmail, product_name: productName }
            : { customer_id: selectedCustomerId, product_name: productName }
        ),
      })

      setCreatingOrder(false)

      if (response.ok) {
        const data = await response.json()
        navigate(`/admin/orders/${data.order_id}`)
      } else if (response.status === 401) {
        setOrderMessage('Nincs bejelentkezve')
      } else {
        setOrderMessage('A rendelés létrehozása sikertelen')
      }
    } catch (error) {
      setCreatingOrder(false)
      setOrderMessage('A rendelés létrehozása sikertelen')
    }
  }

  return (
    <AdminLayout>
        <div className="app-header">
          <h1 className="app-title">Új rendelés</h1>
          <p className="app-subtitle">Új rendelés létrehozása meglévő vagy új ügyfélnek</p>
        </div>

        <div className="card">
          <h2 className="card-title">Rendelés adatai</h2>
          <form className="form-row" onSubmit={handleAddOrder}>
            <div className="field">
              <label className="field-label">Ügyfél</label>
              <select
                className="select"
                value={selectedCustomerId}
                onChange={(event) => setSelectedCustomerId(event.target.value)}
              >
                <option value={NEW_CUSTOMER_VALUE}>Új ügyfél</option>
                {customers.map((customer) => (
                  <option key={customer.customer_id} value={customer.customer_id}>
                    {customer.name} ({customer.email})
                  </option>
                ))}
              </select>
            </div>
            {isNewCustomer && (
              <>
                <div className="field">
                  <label className="field-label">Ügyfél neve</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Ügyfél neve"
                    value={customerName}
                    onChange={(event) => setCustomerName(event.target.value)}
                  />
                </div>
                <div className="field">
                  <label className="field-label">Ügyfél e-mail címe</label>
                  <input
                    type="email"
                    className="input"
                    placeholder="Ügyfél e-mail címe"
                    value={customerEmail}
                    onChange={(event) => setCustomerEmail(event.target.value)}
                  />
                </div>
              </>
            )}
            <div className="field">
              <label className="field-label">Termék neve</label>
              <input
                type="text"
                className="input"
                placeholder="Termék neve"
                value={productName}
                onChange={(event) => setProductName(event.target.value)}
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={
                !productName ||
                (isNewCustomer && (!customerName || !customerEmail)) ||
                creatingOrder
              }
            >
              {creatingOrder ? 'Rendelés létrehozása...' : 'Rendelés létrehozása'}
            </button>
          </form>
          {orderMessage && <p className="status-message">{orderMessage}</p>}
        </div>
    </AdminLayout>
  )
}

export default CreateOrder
