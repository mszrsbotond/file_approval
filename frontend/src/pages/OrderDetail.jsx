import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout.jsx'

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function CommentIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function OrderDetail() {
  const { orderId } = useParams()

  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')

  const [emailMessage, setEmailMessage] = useState("")
  const [chosenEmailMessage, setChosenEmailMessage] = useState("")

  const [order, setOrder] = useState(null)

  const [versions, setVersions] = useState([])
  const [versionFiles, setVersionFiles] = useState({})
  const [responseFiles, setResponseFiles] = useState({})


  const predefinedEmails = ["Kesz a rendeles", "Tekintsd meg a latvanytervet", "Kesz vagyunk kisbohoc", "Saját üzenet"]

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const response = await fetch(`http://localhost:8000/orders/${orderId}`, {
          credentials: 'include',
        })
        if (response.ok) {
          setOrder(await response.json())
        }
      } catch (error) {
        // hiba esetén az order adatok üresen maradnak
      }
    }

    fetchOrder()
    fetchVersions()
  }, [orderId])

  const fetchVersionFiles = async (versionId) => {
    try {
      const response = await fetch(
        `http://localhost:8000/orders/${orderId}/versions/${versionId}/files`,
        { credentials: 'include' }
      )
      if (response.ok) {
        const data = await response.json()
        setVersionFiles((prev) => ({ ...prev, [versionId]: data.files }))
      }
    } catch (error) {
      // hiba esetén a fájllista üresen marad
    }
  }

  const fetchResponseFiles = async (versionId) => {
    try {
      const response = await fetch(
        `http://localhost:8000/orders/${orderId}/versions/${versionId}/response-files`,
        { credentials: 'include' }
      )
      if (response.ok) {
        const data = await response.json()
        setResponseFiles((prev) => ({ ...prev, [versionId]: data.files }))
      }
    } catch (error) {
      // hiba esetén a fájllista üresen marad
    }
  }

  const fetchVersions = async () => {
    try {
      const response = await fetch(`http://localhost:8000/orders/${orderId}/versions`, {
        credentials: 'include',
      })
      if (response.ok) {
        const data = await response.json()
        setVersions(data)
        data.forEach((version) => {
          fetchVersionFiles(version.version_id)
          fetchResponseFiles(version.version_id)
        })
      }
    } catch (error) {
      // hiba esetén a verziólista üresen marad
    }
  }

  const handleFileChange = (event) => {
    setFiles(Array.from(event.target.files))
  }

  const handleUpload = async (event) => {
    event.preventDefault()
    if (files.length === 0) return

    setUploading(true)
    setMessage('')

    const formData = new FormData()
    files.forEach((file) => formData.append('files', file))
    if (chosenEmailMessage === "Saját üzenet") {
      formData.append("email_message", emailMessage)
    } else {
      formData.append("email_message", chosenEmailMessage)
    }

    try {
      const response = await fetch(`http://localhost:8000/orders/${orderId}/versions`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })

      setUploading(false)

      if (response.ok) {
        const data = await response.json()
        setMessage(`Verzió létrehozva (${data.file_count} fájl)`)
        setFiles([])
        fetchVersions()
        setEmailMessage("")
        setChosenEmailMessage("")
      } else {
        setMessage('A feltöltés sikertelen')
      }
    } catch (error) {
      setUploading(false)
      setMessage('A feltöltés sikertelen')
    }
  }

  return (
    <AdminLayout>
        <Link to="/admin" className="app-back-link">
          &larr; Vissza a rendelésekhez
        </Link>

        <div className="app-header">
          <h1 className="app-title">{order?.product_name}</h1>
          <p className="app-subtitle">Rendelés azonosító: {orderId}</p>
        </div>

        {order && (
          <div className="card">
            <ul className="info-list">
              <li><span>Rendelésszám</span><span>{order.order_number}</span></li>
              <li><span>Megrendelő</span><span>{order.customer_name}</span></li>
              <li><span>E-mail</span><span>{order.customer_email}</span></li>
              <li><span>Létrehozva</span><span>{order.created_at}</span></li>
            </ul>
          </div>
        )}

        <div className="card">
          <h2 className="card-title">Új verzió feltöltése</h2>
          <form className="form-row" onSubmit={handleUpload}>
            <input type="file" className="file-input" multiple onChange={handleFileChange} />
            <select
            className="select"
            value={chosenEmailMessage}
            onChange={(e) => setChosenEmailMessage(e.target.value)}
            >
                <option value="">Válasszon...</option>
                {predefinedEmails.map((predefinedEmail) => (
                  <option key={predefinedEmail} value={predefinedEmail}>
                  {predefinedEmail}
                  </option>
                ))}
          </select>
          {chosenEmailMessage === "Saját üzenet" && <input
                type="text"
                className="input"
                placeholder="Üzenet az ügyfélnek"
                value={emailMessage}
                onChange={(e) => setEmailMessage(e.target.value)}
          />}
            <button type="submit" className="btn btn-primary" disabled={files.length === 0 || uploading || chosenEmailMessage === ""}>
              {uploading ? 'Feltöltés...' : 'Új verzió feltöltése'}
            </button>
          </form>
          {message && <p className="status-message">{message}</p>}
        </div>

        <div className="card">
          <h2 className="card-title">Verziók</h2>
          {versions.length === 0 && <p className="entity-empty">Még nincs feltöltött verzió</p>}
          <ul className="entity-list">
            {versions.map((version) => (
              <li key={version.version_id} className="version-item">
                <div className="version-row">
                  <span className="version-toggle">
                    v{version.version_number} · {version.created_at}
                  </span>
                  <div className="version-actions">
                    <span
                      className={`status-badge ${
                        version.status === 'approved'
                          ? 'status-badge--approved'
                          : version.status === 'changes_requested'
                          ? 'status-badge--changes_requested'
                          : 'status-badge--pending'
                      }`}
                    >
                      {version.status === 'approved'
                        ? 'Jóváhagyva'
                        : version.status === 'changes_requested'
                        ? 'Javítás kérve'
                        : 'Jóváhagyásra vár'}
                    </span>
                    <a
                      className="version-download"
                      href={`http://localhost:8000/orders/${orderId}/versions/${version.version_id}/download`}
                    >
                      Download
                    </a>
                  </div>
                </div>

                <ul className="version-files">
                  {(versionFiles[version.version_id] || []).length === 0 && <li>Nincsenek fájlok</li>}
                  {(versionFiles[version.version_id] || []).map((filename) => (
                    <li key={filename} className="version-file-row">
                      <a
                        href={`http://localhost:8000/orders/${orderId}/versions/${version.version_id}/files/${filename}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {filename.includes('_') ? filename.split('_').slice(1).join('_') : filename}
                      </a>
                      <a
                        className="btn btn-secondary btn-sm version-file-open"
                        href={`/viewer/${orderId}/${version.version_id}/${encodeURIComponent(filename)}?mode=view`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <EyeIcon />
                        Megnyitás
                      </a>
                    </li>
                  ))}
                </ul>

                {version.status !== 'pending' && (
                  <div className="version-review-summary">
                    {version.feedback && (
                      <p className="version-feedback-line">
                        <CommentIcon />
                        {version.feedback}
                      </p>
                    )}
                    {(responseFiles[version.version_id] || []).length > 0 && (
                      <>
                        <p>Ügyfél által csatolt fájlok:</p>
                        <ul className="version-files">
                          {responseFiles[version.version_id].map((filename) => (
                            <li key={filename}>
                              <a
                                href={`http://localhost:8000/orders/${orderId}/versions/${version.version_id}/response-files/${filename}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {filename.includes('_') ? filename.split('_').slice(1).join('_') : filename}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
    </AdminLayout>
  )
}

export default OrderDetail
