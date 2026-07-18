import './FileViewer.css'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
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

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />
      <path d="M14 2v5a1 1 0 0 0 1 1h5" />
    </svg>
  )
}

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="m12 8-4 4 4 4" />
      <path d="M16 12H8" />
    </svg>
  )
}

function ArrowRightIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="m12 16 4-4-4-4" />
      <path d="M8 12h8" />
    </svg>
  )
}

function FileViewer() {
  const { orderId, versionId, filename: encodedFilename } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
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
  const [attachments, setAttachments] = useState([])
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [sendError, setSendError] = useState(null)

  const [versionData, setVersionData] = useState(null)

  // Az ügyfél által a visszajelzéshez csatolt fájlok — csak adminnak (readonly),
  // mert a /response-files végpontok admin-session-t igényelnek.
  const [responseFiles, setResponseFiles] = useState([])

  // A verzióhoz tartozó összes fájl, hogy a fejlécben lehessen köztük váltani
  // (egy verzióben egyszerre több fájl is érkezhet, nem csak az, amivel a
  // Megnyitás gomb elsőként megnyitotta a viewert).
  const [allFiles, setAllFiles] = useState([])
  const currentFileIndex = allFiles.indexOf(filename)

  // Az összes fájl összes pinjének száma a verzióban — az Elfogadás csak akkor
  // engedhető meg, ha SEHOL nincs pin, nem csak az épp megnyitott fájlon,
  // különben fájlváltás után úgy lehetne elfogadni, hogy egy másik fájlon
  // közben már javítást kértek.
  const [totalAnnotationCount, setTotalAnnotationCount] = useState(0)

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

  useEffect(() => {
    if (!readonly) return
    let cancelled = false

    const fetchResponseFiles = async () => {
      try {
        const response = await fetch(
          `${API_BASE}/orders/${orderId}/versions/${versionId}/response-files`,
          { credentials: 'include' },
        )
        if (response.ok && !cancelled) {
          const data = await response.json()
          setResponseFiles(data.files)
        }
      } catch (error) {
        // hiba esetén a lista üresen marad
      }
    }

    fetchResponseFiles()
    return () => {
      cancelled = true
    }
  }, [orderId, versionId, readonly])

  // Ha egy pin aktívvá válik, görgessük láthatóvá az oldalsávban.
  useEffect(() => {
    if (!activePinId) return
    document.getElementById(`comment-${activePinId}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [activePinId])

  useEffect(() => {
    let cancelled = false

    const fetchAllFiles = async () => {
      try {
        const response = await fetch(`${API_BASE}/orders/${orderId}/versions/${versionId}/files`)
        if (response.ok && !cancelled) {
          const data = await response.json()
          const sorted = [...data.files].sort((a, b) => {
            const nameA = a.includes('_') ? a.split('_').slice(1).join('_') : a
            const nameB = b.includes('_') ? b.split('_').slice(1).join('_') : b
            return nameA.localeCompare(nameB)
          })
          setAllFiles(sorted)
        }
      } catch (error) {
        // hiba esetén a fájlváltó nem jelenik meg
      }
    }

    fetchAllFiles()
    return () => {
      cancelled = true
    }
  }, [orderId, versionId])

  const switchFile = (delta) => {
    const newIndex = currentFileIndex + delta
    if (newIndex < 0 || newIndex >= allFiles.length) return

    setNewPinDraft(null)
    setDraftComment('')
    setActivePinId(null)
    setCurrentPage(1)
    setNumPages(0)

    const newFilename = allFiles[newIndex]
    navigate(
      `/viewer/${orderId}/${versionId}/${encodeURIComponent(newFilename)}${readonly ? '?mode=view' : ''}`,
      { replace: true },
    )
  }

  // A teljes verzió összes fájljának pin-száma — nem csak az épp látott fájlé —,
  // hogy az Elfogadás ne legyen elérhető, ha bárhol máshol már van megjegyzés.
  useEffect(() => {
    let cancelled = false

    const fetchTotalAnnotationCount = async () => {
      if (allFiles.length === 0) return
      try {
        const counts = await Promise.all(
          allFiles.map(async (f) => {
            const response = await fetch(
              `${API_BASE}/orders/${orderId}/versions/${versionId}/annotations?filename=${encodeURIComponent(f)}`,
            )
            if (!response.ok) return 0
            const data = await response.json()
            return data.length
          }),
        )
        if (!cancelled) {
          setTotalAnnotationCount(counts.reduce((sum, count) => sum + count, 0))
        }
      } catch (error) {
        // hiba esetén a régi összesítés marad
      }
    }

    fetchTotalAnnotationCount()
    return () => {
      cancelled = true
    }
  }, [orderId, versionId, allFiles, annotations])

  // Ha időközben (pl. fájlváltás után) máshol pin került fel, az Elfogadás már
  // nem érvényes döntés — visszaállunk, hogy a felhasználó újra válasszon.
  useEffect(() => {
    if (decision === 'accept' && totalAnnotationCount > 0) {
      setDecision(null)
    }
  }, [totalAnnotationCount, decision])

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
    (decision === 'feedback' && (generalNote.trim() !== '' || totalAnnotationCount > 0))

  const handleSend = async () => {
    if (!canSend || sending || sent) return
    setSending(true)
    setSendError(null)

    const status = decision === 'accept' ? 'approved' : 'changes_requested'
    const formData = new FormData()
    formData.append('status', status)
    formData.append('message', generalNote.trim())
    attachments.forEach((file) => formData.append('files', file))

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
        <div className="viewer-header-title">
          <span className="viewer-title">{displayName}</span>
          {allFiles.length > 1 && (
            <div className="viewer-file-switcher">
              <button
                type="button"
                className="viewer-file-switcher-btn"
                onClick={() => switchFile(-1)}
                disabled={currentFileIndex <= 0}
                aria-label="Előző fájl"
              >
                <ArrowLeftIcon />
              </button>
              <span>
                {currentFileIndex + 1} / {allFiles.length} fájl
              </span>
              <button
                type="button"
                className="viewer-file-switcher-btn"
                onClick={() => switchFile(1)}
                disabled={currentFileIndex >= allFiles.length - 1}
                aria-label="Következő fájl"
              >
                <ArrowRightIcon />
              </button>
            </div>
          )}
        </div>
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
                    <ArrowLeftIcon /> Előző
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
                    Következő <ArrowRightIcon />
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
              {responseFiles.length > 0 && (
                <>
                  <h3
                    className="sidebar-title sidebar-attachments-title"
                    title="Ügyfél által csatolt fájlok"
                    aria-label="Ügyfél által csatolt fájlok"
                  >
                    <FileIcon />
                  </h3>
                  <ul className="sidebar-attachment-list">
                    {responseFiles.map((file) => (
                      <li key={file}>
                        <a
                          href={`${API_BASE}/orders/${orderId}/versions/${versionId}/response-files/${encodeURIComponent(file)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {file.includes('_') ? file.split('_').slice(1).join('_') : file}
                        </a>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="sidebar-section sidebar-decision">
                <button
                  type="button"
                  className={`sidebar-decision-btn sidebar-decision-btn--accept${decision === 'accept' ? ' active' : ''}`}
                  onClick={() => setDecision('accept')}
                  disabled={sent || totalAnnotationCount > 0}
                  title={totalAnnotationCount > 0 ? 'Nem fogadható el, amíg bármelyik fájlon megjegyzés van' : undefined}
                >
                  ✓ Elfogadás
                </button>
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

                  <div className="field sidebar-attachments">
                    <label className="field-label">Fájlok csatolása (opcionális)</label>
                    <input
                      type="file"
                      className="file-input"
                      multiple
                      onChange={(e) => setAttachments(Array.from(e.target.files))}
                    />
                    {attachments.length > 0 && (
                      <ul className="sidebar-attachment-list">
                        {attachments.map((file, index) => (
                          <li key={`${file.name}-${index}`}>{file.name}</li>
                        ))}
                      </ul>
                    )}
                  </div>
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
