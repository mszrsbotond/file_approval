import './FileViewer.css'
import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

const API_BASE = 'http://localhost:8000'
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp']
// Ha a kattintás ennél kevesebb pixelre van a stage tetejétől, a popover/bubble lefelé nyílik felfelé helyett.
const POPOVER_FLIP_THRESHOLD = 190

function getExtension(name) {
  const parts = name.split('.')
  return parts.length > 1 ? parts.pop().toLowerCase() : ''
}

function FileViewer() {
  const { orderId, versionId, filename: encodedFilename } = useParams()
  const [searchParams] = useSearchParams()
  const readonly = searchParams.get('mode') === 'view'

  const filename = decodeURIComponent(encodedFilename)
  const displayName = filename.includes('_') ? filename.split('_').slice(1).join('_') : filename
  const extension = getExtension(displayName)
  const isImage = IMAGE_EXTENSIONS.includes(extension)
  const isPdf = extension === 'pdf'

  const viewUrl = `${API_BASE}/orders/${orderId}/versions/${versionId}/view/${encodeURIComponent(filename)}`
  const downloadUrl = `${API_BASE}/orders/${orderId}/versions/${versionId}/files/${encodeURIComponent(filename)}`

  const contentRef = useRef(null)
  const overlayRef = useRef(null)
  const [pageWidth, setPageWidth] = useState(600)
  const [numPages, setNumPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)

  const [annotations, setAnnotations] = useState([])
  const [newPinDraft, setNewPinDraft] = useState(null) // {x, y, flip} or null
  const [draftComment, setDraftComment] = useState('')
  const [savingPin, setSavingPin] = useState(false)
  const [activePinId, setActivePinId] = useState(null)
  const [activePinFlip, setActivePinFlip] = useState(false)

  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [sendError, setSendError] = useState(null)

  // PDF oldal szélessége a rendelkezésre álló hely alapján, hogy az overlay pontosan
  // a ténylegesen renderelt lap méretéhez igazodjon (a stage shrink-wrap-eli a lapot).
  useEffect(() => {
    const el = contentRef.current
    if (!el || !isPdf) return

    const updateWidth = () => {
      const available = el.clientWidth - 48
      setPageWidth(Math.max(280, Math.min(available, 1000)))
    }

    updateWidth()
    const resizeObserver = new ResizeObserver(updateWidth)
    resizeObserver.observe(el)
    return () => resizeObserver.disconnect()
  }, [isPdf])

  useEffect(() => {
    let cancelled = false

    const fetchAnnotations = async () => {
      try {
        const response = await fetch(
          `${API_BASE}/orders/${orderId}/versions/${versionId}/annotations?filename=${encodeURIComponent(filename)}`,
        )
        if (response.ok && !cancelled) {
          setAnnotations(await response.json())
        }
      } catch (error) {
        // hiba esetén a pinek listája üresen marad
      }
    }

    fetchAnnotations()
    return () => {
      cancelled = true
    }
  }, [orderId, versionId, filename])

  const currentPageNumber = isPdf ? currentPage : 1
  const pinsForCurrentPage = annotations.filter((a) => a.page_number === currentPageNumber)

  const handleDocumentLoadSuccess = ({ numPages: total }) => {
    setNumPages(total)
    setCurrentPage(1)
  }

  const changePage = (delta) => {
    setCurrentPage((page) => Math.min(Math.max(1, page + delta), numPages || 1))
    setNewPinDraft(null)
    setActivePinId(null)
  }

  const handleStageClick = (e) => {
    if (readonly) return
    const rect = e.currentTarget.getBoundingClientRect()
    const offsetX = e.clientX - rect.left
    const offsetY = e.clientY - rect.top
    const x = offsetX / rect.width
    const y = offsetY / rect.height
    const flip = offsetY < POPOVER_FLIP_THRESHOLD
    setActivePinId(null)
    setDraftComment('')
    setNewPinDraft({ x, y, flip })
  }

  const handleCancelPin = () => {
    setNewPinDraft(null)
    setDraftComment('')
  }

  const handleSavePin = async () => {
    if (!newPinDraft || !draftComment.trim()) return
    setSavingPin(true)

    try {
      const response = await fetch(
        `${API_BASE}/orders/${orderId}/versions/${versionId}/annotations`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename,
            page_number: currentPageNumber,
            x: newPinDraft.x,
            y: newPinDraft.y,
            comment: draftComment.trim(),
          }),
        },
      )
      if (response.ok) {
        const created = await response.json()
        setAnnotations((prev) => [...prev, created])
        setNewPinDraft(null)
        setDraftComment('')
      }
    } catch (error) {
      // hiba esetén a popover nyitva marad, a felhasználó újra próbálhatja
    } finally {
      setSavingPin(false)
    }
  }

  const handleDeletePin = async (annotationId) => {
    try {
      const response = await fetch(
        `${API_BASE}/orders/${orderId}/versions/${versionId}/annotations/${annotationId}`,
        { method: 'DELETE' },
      )
      if (response.ok) {
        setAnnotations((prev) => prev.filter((a) => a.annotation_id !== annotationId))
        setActivePinId(null)
      }
    } catch (error) {
      // hiba esetén a pin a listában marad
    }
  }

  const handleSend = async (e) => {
    e.preventDefault()
    if (sending || sent) return

    setSending(true)
    setSendError(null)

    const trimmedMessage = feedbackMessage.trim()
    const status = trimmedMessage ? 'changes_requested' : 'approved'

    const formData = new FormData()
    formData.append('status', status)
    formData.append('message', trimmedMessage)

    try {
      const response = await fetch(
        `${API_BASE}/review/${orderId}/${versionId}/feedback`,
        {
          method: 'POST',
          body: formData,
        },
      )
      if (response.ok) {
        setSent(true)
        setTimeout(() => window.close(), 1200)
      } else {
        setSendError('Hiba történt, próbálja újra')
      }
    } catch (error) {
      setSendError('Hiba történt, próbálja újra')
    } finally {
      setSending(false)
    }
  }

  const renderOverlay = () => (
    <div
      className="annotation-overlay"
      ref={overlayRef}
      style={{ cursor: readonly ? 'default' : 'crosshair' }}
      onClick={handleStageClick}
    >
      {pinsForCurrentPage.map((pin, index) => (
        <div key={pin.annotation_id}>
          <div
            className="annotation-pin"
            style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
            onClick={(e) => {
              e.stopPropagation()
              setNewPinDraft(null)
              const overlayHeight = overlayRef.current?.getBoundingClientRect().height || 0
              setActivePinFlip(pin.y * overlayHeight < POPOVER_FLIP_THRESHOLD)
              setActivePinId((prev) => (prev === pin.annotation_id ? null : pin.annotation_id))
            }}
          >
            <span className="annotation-pin--number">{index + 1}</span>
          </div>

          {activePinId === pin.annotation_id && (
            <div
              className={`annotation-bubble${activePinFlip ? ' annotation-bubble--below' : ''}`}
              style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
              onClick={(e) => e.stopPropagation()}
            >
              <p>{pin.comment}</p>
              {!readonly && (
                <button
                  type="button"
                  className="annotation-bubble-delete"
                  onClick={() => handleDeletePin(pin.annotation_id)}
                >
                  Törlés
                </button>
              )}
            </div>
          )}
        </div>
      ))}

      {newPinDraft && !readonly && (
        <div
          className={`annotation-popover${newPinDraft.flip ? ' annotation-popover--below' : ''}`}
          style={{ left: `${newPinDraft.x * 100}%`, top: `${newPinDraft.y * 100}%` }}
          onClick={(e) => e.stopPropagation()}
        >
          <textarea
            className="input textarea"
            rows={3}
            autoFocus
            placeholder="Írja le az észrevételét..."
            value={draftComment}
            onChange={(e) => setDraftComment(e.target.value)}
          />
          <div className="annotation-popover-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleCancelPin}>
              Mégse
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleSavePin}
              disabled={!draftComment.trim() || savingPin}
            >
              {savingPin ? 'Mentés...' : 'Mentés'}
            </button>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div className="viewer-shell">
      <header className="viewer-header">
        <span className="viewer-title">{displayName}</span>
        <div className="viewer-toolbar">
          {!readonly && (isImage || isPdf) && (
            <span className="viewer-hint">Kattintson a fájlra megjegyzés hozzáadásához</span>
          )}
          {readonly && <span className="viewer-hint">Csak megtekintés</span>}
          {sendError && <span className="viewer-send-error">{sendError}</span>}

          {readonly ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.close()}>
              Bezárás
            </button>
          ) : (
            <form className="viewer-feedback-form" onSubmit={handleSend}>
              <input
                type="text"
                className="input viewer-feedback-input"
                placeholder="Visszajelzés (üresen hagyva = elfogadás)"
                value={feedbackMessage}
                onChange={(e) => setFeedbackMessage(e.target.value)}
                disabled={sending || sent}
              />
              <button type="submit" className="btn btn-primary btn-sm" disabled={sending || sent}>
                {sent ? 'Elküldve ✓' : sending ? 'Küldés...' : 'Küldés'}
              </button>
            </form>
          )}
        </div>
      </header>

      <main className="viewer-content" ref={contentRef}>
        {isImage && (
          <div className="annotation-stage">
            <img className="viewer-image" src={viewUrl} alt={displayName} draggable={false} />
            {renderOverlay()}
          </div>
        )}

        {isPdf && (
          <div className="viewer-pdf-wrap">
            <div className="annotation-stage">
              <Document
                file={viewUrl}
                onLoadSuccess={handleDocumentLoadSuccess}
                loading={<p className="viewer-pdf-status">Betöltés...</p>}
                error={<p className="viewer-pdf-status">A PDF nem tölthető be</p>}
              >
                {/* text/annotation layer nélkül, mert azok a canvas fölé kerülnek és
                    elnyelnék a kattintásokat az annotation-overlay elől */}
                <Page
                  pageNumber={currentPage}
                  width={pageWidth}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                />
              </Document>
              {renderOverlay()}
            </div>

            {numPages > 1 && (
              <div className="viewer-pdf-nav">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={currentPage <= 1}
                  onClick={() => changePage(-1)}
                >
                  &larr; Előző
                </button>
                <span>
                  {currentPage} / {numPages}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={currentPage >= numPages}
                  onClick={() => changePage(1)}
                >
                  Következő &rarr;
                </button>
              </div>
            )}
          </div>
        )}

        {!isImage && !isPdf && (
          <div className="viewer-fallback">
            <p>Ez a fájltípus nem jeleníthető meg</p>
            <a className="btn btn-primary btn-sm" href={downloadUrl}>
              Letöltés
            </a>
          </div>
        )}
      </main>
    </div>
  )
}

export default FileViewer
