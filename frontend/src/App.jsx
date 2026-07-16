import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import CreateOrder from './pages/CreateOrder.jsx'
import Customers from './pages/Customers.jsx'
import OrderDetail from './pages/OrderDetail.jsx'
import ReviewPage from './pages/ReviewPage.jsx'
import FileViewer from './pages/FileViewer.jsx'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/admin" element={<Dashboard />} />
        <Route path="/admin/new-order" element={<CreateOrder />} />
        <Route path="/admin/customers" element={<Customers />} />
        <Route path="/admin/orders/:orderId" element={<OrderDetail />} />
        <Route path="/review/:orderId/:versionId" element={<ReviewPage />} />
        <Route path="/viewer/:orderId/:versionId/:filename" element={<FileViewer />} />
      </Routes>
    </BrowserRouter>
  )
}


export default App
