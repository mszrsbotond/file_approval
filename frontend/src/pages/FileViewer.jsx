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
// Ha a kattintás ennél kevesebb pixelre van a stage tetejétől, az új pin popover-je lefelé nyílik felfelé helyett.
const POPOVER_FLIP_THRESHOLD = 190

function getExtension(name) {
  const parts = name.split('.')
  return parts.length > 1 ? parts.pop().toLowerCase() : ''
}

function CommentIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
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

  // Elfogadás/Visszajelzés döntés + az ehhez tartozó általános (ponthoz nem kötött) üzenet
  const [decision, setDecision] = useState(null) // null | 'accept' | 'feedback'
  const [showGeneralNote, setShowGeneralNote] = useState(false)
  const [generalNote, setGeneralNote] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [sendError, setSendError] = useState(null)

  const [versionData, setVersionData] = useState(null)

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

    const fetchVersion = async () => {
      try {
        const response = await fetch(`${API_BASE}/orders/${orderId}/versions/${versionId}`)
        if (response.ok && !cancelled) {
          setVersionData(await response.json())
        }
      } catch (error) {
        // hiba esetén a verzió adatai üresen maradnak
      }
    }

    fetchAnnotations()
    fetchVersion()
    return () => {
      cancelled = true
    }
  }, [orderId, versionId, filename])

  // Ha egy pin aktívvá válik, görgessük láthatóvá az oldalsávban.
  useEffect(() => {
    if (!activePinId) return
    document.getElementById(`comment-${activePinId}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [activePinId])

  const currentPageNumber = isPdf ? currentPage : 1
  const pinsForCurrentPage = annotations.filter((a) => a.page_number === currentPageNumber)

  const handleDocumentLoadSuccess = ({ numPages: total }) => {
    setNumPages(total)
    setCurrentPage(1)
  }

  const changePage = (delta) => {
    setCurrentPage((page) => Math.min(Math.max(1, page + delta), numPages || 1))
    setNewPinDraft(null)
  }

  const handleStageClick = (e) => {
    if (readonly || sent) return
    const rect = e.currentTarget.getBoundingClientRect()
    const offsetX = e.clientX - rect.left
    const offsetY = e.clientY - rect.top
    const x = offsetX / rect.width
    const y = offsetY / rect.height
    const flip = offsetY < POPOVER_FLIP_THRESHOLD
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
        setDecision('feedback')
        setActivePinId(created.annotation_id)
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
        setActivePinId((prev) => (prev === annotationId ? null : prev))
      }
    } catch (error) {
      // hiba esetén a pin a listában marad
    }
  }

  const handlePinClick = (pin) => {
    setNewPinDraft(null)
    if (!readonly) setDecision('feedback')
    setActivePinId(pin.annotation_id)
  }

  const canSend =
    decision === 'accept' ||
    (decision === 'feedback' && (generalNote.trim() !== '' || annotations.length > 0))

  const handleSend = async () => {
    if (!canSend || sending || sent) return
    setSending(true)
    setSendError(null)

    const status = decision === 'accept' ? 'approved' : 'changes_requested'
    const formData = new FormData()
    formData.append('status', status)
    formData.append('message', generalNote.trim())

    try {
      const response = await fetch(`${API_BASE}/review/${orderId}/${versionId}/feedback`, {
        method: 'POST',
        body: formData,
      })
      if (response.ok) {
        setSent(true)
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
      style={{ cursor: readonly || sent ? 'default' : 'crosshair' }}
      onClick={handleStageClick}
    >
      {pinsForCurrentPage.map((pin, index) => (
        <div
          key={pin.annotation_id}
          className={`annotation-pin${activePinId === pin.annotation_id ? ' annotation-pin--active' : ''}`}
          style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
          title={pin.comment}
          onClick={(e) => {
            e.stopPropagation()
            handlePinClick(pin)
          }}
        >
          <span className="annotation-pin--number">{index + 1}</span>
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

  const renderCommentList = (deletable) => (
    <ul className="sidebar-comment-list">
      {annotations.length === 0 && (
        <li className="sidebar-empty">
          {deletable ? 'Kattintson a fájlra egy pont kijelöléséhez.' : 'Nincs megjegyzés ehhez a fájlhoz.'}
        </li>
      )}
      {annotations.map((pin, index) => (
        <li
          key={pin.annotation_id}
          id={`comment-${pin.annotation_id}`}
          className={`sidebar-comment${activePinId === pin.annotation_id ? ' sidebar-comment--active' : ''}`}
          onClick={() => handlePinClick(pin)}
        >
          <span className="sidebar-comment-number">{index + 1}</span>
          <span className="sidebar-comment-text">
            {pin.comment}
            {isPdf && <span className="sidebar-comment-page"> · {pin.page_number}. oldal</span>}
          </span>
          {deletable && (
            <button
              type="button"
              className="sidebar-comment-delete"
              aria-label="Törlés"
              onClick={(e) => {
                e.stopPropagation()
                handleDeletePin(pin.annotation_id)
              }}
            >
              ×
            </button>
          )}
        </li>
      ))}
    </ul>
  )

  return (
    <div className="viewer-shell">
      <header className="viewer-header">
        <span className="viewer-title">{displayName}</span>
        {readonly && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.close()}>
            Bezárás
          </button>
        )}
      </header>

      <div className="viewer-body">
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

        <aside className="viewer-sidebar">
          {readonly ? (
            <div className="sidebar-section">
              <h3 className="sidebar-title">
                Megjegyzések{annotations.length > 0 ? ` (${annotations.length})` : ''}
              </h3>
              {renderCommentList(false)}
              {versionData?.feedback && (
                <p className="sidebar-hint sidebar-feedback-line">
                  <CommentIcon />
                  {versionData.feedback}
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="sidebar-section sidebar-decision">
                {annotations.length === 0 ? (<button
                  type="button"
                  className={`sidebar-decision-btn sidebar-decision-btn--accept${decision === 'accept' ? ' active' : ''}`}
                  onClick={() => setDecision('accept')}
                  disabled={sent}
                >
                  ✓ Elfogadás
                </button>) : (<button
                  type="button"
                  className={`sidebar-decision-btn sidebar-decision-btn--accept${decision === 'accept' ? ' active' : ''}`}
                  onClick={() => setDecision('accept')}
                  disabled={true}
                >
                  ✓ Elfogadás
                </button>)}
                <button
                  type="button"
                  className={`sidebar-decision-btn sidebar-decision-btn--feedback${decision === 'feedback' ? ' active' : ''}`}
                  onClick={() => setDecision('feedback')}
                  disabled={sent}
                >
                  ✎ Visszajelzés
                </button>
              </div>

              {decision === 'feedback' && !sent && (
                <div className="sidebar-section sidebar-comments">
                  <h3 className="sidebar-title">
                    Megjegyzések{annotations.length > 0 ? ` (${annotations.length})` : ''}
                  </h3>
                  {renderCommentList(true)}

                  {showGeneralNote ? (
                    <div className="field">
                      <label className="field-label">Egyéb visszajelzés</label>
                      <textarea
                        className="input textarea sidebar-general-textarea"
                        rows={4}
                        autoFocus
                        placeholder="Bármilyen általános megjegyzés, pl. határidő..."
                        value={generalNote}
                        onChange={(e) => setGeneralNote(e.target.value)}
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm sidebar-general-toggle"
                      onClick={() => setShowGeneralNote(true)}
                    >
                      + Egyéb visszajelzés
                    </button>
                  )}
                </div>
              )}

              {decision === 'accept' && !sent && (
                <div className="sidebar-section">
                  <p className="sidebar-hint">
                    A verzió jóváhagyásra kerül. Ha mégis van észrevétele, válassza a Visszajelzés opciót.
                  </p>
                </div>
              )}

              <div className="sidebar-footer">
                {sendError && <p className="sidebar-error">{sendError}</p>}
                {sent ? (
                  <>
                    <p className="sidebar-success">Köszönjük, a visszajelzés elküldve!</p>
                    <button type="button" className="btn btn-secondary" onClick={() => window.close()}>
                      Bezárás
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleSend}
                    disabled={!canSend || sending}
                  >
                    {sending ? 'Küldés...' : 'Küldés'}
                  </button>
                )}
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  )
}

export default FileViewer
