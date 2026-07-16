import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

function ReviewPage() {
  const { orderId } = useParams()

  const [order, setOrder] = useState(null)

  const [versions, setVersions] = useState([])
  const [versionFiles, setVersionFiles] = useState({})
  const [annotationCounts, setAnnotationCounts] = useState({})

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const response = await fetch(
          `http://localhost:8000/orders/${orderId}`,
          {
            credentials: 'include',
          },
        )
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
        { credentials: 'include' },
      )
      if (response.ok) {
        const data = await response.json()
        setVersionFiles((prev) => ({ ...prev, [versionId]: data.files }))
        data.files.forEach((filename) => fetchAnnotationCount(versionId, filename))
      }
    } catch (error) {
      // hiba esetén a fájllista üresen marad
    }
  }

  const fetchAnnotationCount = async (versionId, filename) => {
    try {
      const response = await fetch(
        `http://localhost:8000/orders/${orderId}/versions/${versionId}/annotations?filename=${encodeURIComponent(filename)}`,
      )
      if (response.ok) {
        const data = await response.json()
        setAnnotationCounts((prev) => ({ ...prev, [`${versionId}::${filename}`]: data.length }))
      }
    } catch (error) {
      // hiba esetén a számláló üresen marad
    }
  }

  const fetchVersions = async () => {
    try {
      const response = await fetch(
        `http://localhost:8000/orders/${orderId}/versions`,
        {
          credentials: 'include',
        },
      )
      if (response.ok) {
        const data = await response.json()
        setVersions(data)
        data.forEach((version) => fetchVersionFiles(version.version_id))
      }
    } catch (error) {
      // hiba esetén a verziólista üresen marad
    }
  }

  return (
    <div className="app-page">
      <div className="app-container">
        <div className="app-header">
          <h1 className="app-title">{order?.product_name}</h1>
        </div>

        <div className="card">
          <h2 className="card-title">Verziók</h2>
          {versions.length === 0 && (
            <p className="entity-empty">Még nincs feltöltött verzió</p>
          )}
          <ul className="entity-list">
            {versions.map((version) => (
              <li key={version.version_id} className="version-item">
                <div className="version-row">
                  <span className="version-toggle">
                    v{version.version_number} · {version.created_at}
                  </span>
                  <div className="version-actions">
                    <a
                      className="version-download"
                      href={`http://localhost:8000/orders/${orderId}/versions/${version.version_id}/download`}
                    >
                      Download
                    </a>
                  </div>
                </div>

                <ul className="version-files">
                  {(versionFiles[version.version_id] || []).length === 0 && (
                    <li>Nincsenek fájlok</li>
                  )}
                  {(versionFiles[version.version_id] || []).map((filename) => (
                    <li key={filename} className="version-file-row">
                      <a
                        href={`http://localhost:8000/orders/${orderId}/versions/${version.version_id}/files/${filename}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {filename.includes('_')
                          ? filename.split('_').slice(1).join('_')
                          : filename}
                      </a>
                      {annotationCounts[`${version.version_id}::${filename}`] > 0 && (
                        <span className="version-annotation-count">
                          {annotationCounts[`${version.version_id}::${filename}`]} megjegyzés
                        </span>
                      )}
                    </li>
                  ))}
                </ul>

                {version.status && version.status !== 'pending' ? (
                  <div className="version-review-summary">
                    <p>
                      Állapot:{' '}
                      <span
                        className={`status-badge ${
                          version.status === 'approved'
                            ? 'status-badge--approved'
                            : 'status-badge--changes_requested'
                        }`}
                      >
                        {version.status === 'approved'
                          ? 'Jóváhagyva'
                          : 'Javítás kérve'}
                      </span>
                    </p>
                    {version.feedback && (
                      <p>Visszajelzés: {version.feedback}</p>
                    )}
                  </div>
                ) : (
                  (versionFiles[version.version_id] || []).length > 0 && (
                    <div className="version-open-panel">
                      <a
                        className="btn btn-primary version-open-btn"
                        href={`/viewer/${orderId}/${version.version_id}/${encodeURIComponent(
                          versionFiles[version.version_id][0],
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Megnyitás és visszajelzés
                      </a>
                    </div>
                  )
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

export default ReviewPage
