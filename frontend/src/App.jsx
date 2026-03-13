import { useState, useEffect, useRef } from 'react'

const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

const PLATFORMS = [
  { id: '1', name: 'Chaturbate' },
  { id: '3', name: 'Stripchat' },
  { id: '2', name: 'BongaCams' },
  { id: '4', name: 'CamSoda' },
  { id: '6', name: 'MFC' },
]

const css = {
  app: {
    minHeight: '100vh',
    display: 'grid',
    gridTemplateRows: 'auto 1fr',
    maxWidth: 960,
    margin: '0 auto',
    padding: '0 24px',
  },
  header: {
    padding: '32px 0 24px',
    borderBottom: '1px solid var(--border)',
    marginBottom: 32,
  },
  wordmark: {
    fontFamily: 'var(--mono)',
    fontSize: 13,
    color: 'var(--accent)',
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  title: {
    fontFamily: 'var(--mono)',
    fontSize: 28,
    fontWeight: 600,
    color: 'var(--text)',
    letterSpacing: '-0.02em',
  },
  subtitle: {
    color: 'var(--text-dim)',
    fontSize: 13,
    marginTop: 6,
    fontFamily: 'var(--mono)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 380px',
    gap: 24,
    alignItems: 'start',
  },
  panel: {
    background: 'var(--bg-panel)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  panelHeader: {
    padding: '12px 16px',
    borderBottom: '1px solid var(--border)',
    fontFamily: 'var(--mono)',
    fontSize: 11,
    color: 'var(--text-dim)',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  panelBody: {
    padding: 16,
  },
  label: {
    fontFamily: 'var(--mono)',
    fontSize: 11,
    color: 'var(--text-dim)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    marginBottom: 8,
    display: 'block',
  },
  select: {
    width: '100%',
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: 3,
    color: 'var(--text)',
    padding: '8px 12px',
    fontFamily: 'var(--mono)',
    fontSize: 13,
    outline: 'none',
    cursor: 'pointer',
    marginBottom: 16,
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
  },
  textarea: {
    width: '100%',
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: 3,
    color: 'var(--text)',
    padding: '10px 12px',
    fontFamily: 'var(--mono)',
    fontSize: 12,
    lineHeight: 1.7,
    resize: 'vertical',
    outline: 'none',
    minHeight: 200,
    marginBottom: 16,
  },
  row: {
    display: 'flex',
    gap: 12,
    marginBottom: 16,
    alignItems: 'flex-end',
  },
  inputSmall: {
    flex: 1,
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: 3,
    color: 'var(--text)',
    padding: '8px 12px',
    fontFamily: 'var(--mono)',
    fontSize: 13,
    outline: 'none',
  },
  btnPrimary: {
    width: '100%',
    padding: '12px',
    background: 'var(--accent)',
    border: 'none',
    borderRadius: 3,
    color: '#000',
    fontFamily: 'var(--mono)',
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: '0.05em',
    cursor: 'pointer',
    transition: 'opacity 0.15s',
  },
  btnSecondary: {
    padding: '7px 14px',
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 3,
    color: 'var(--text-dim)',
    fontFamily: 'var(--mono)',
    fontSize: 11,
    cursor: 'pointer',
    transition: 'border-color 0.15s, color 0.15s',
    letterSpacing: '0.05em',
  },
  btnAccent: {
    padding: '7px 14px',
    background: 'var(--accent-glow)',
    border: '1px solid var(--accent)',
    borderRadius: 3,
    color: 'var(--accent)',
    fontFamily: 'var(--mono)',
    fontSize: 11,
    cursor: 'pointer',
    letterSpacing: '0.05em',
    fontWeight: 600,
  },
  progressBar: (pct) => ({
    height: 2,
    background: 'var(--border)',
    borderRadius: 1,
    marginBottom: 12,
    overflow: 'hidden',
  }),
  progressFill: (pct) => ({
    height: '100%',
    width: `${pct}%`,
    background: 'var(--accent)',
    transition: 'width 0.4s ease',
    boxShadow: '0 0 8px var(--accent)',
  }),
  logBox: {
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: 3,
    padding: '10px 12px',
    fontFamily: 'var(--mono)',
    fontSize: 11,
    color: 'var(--text-dim)',
    lineHeight: 1.8,
    maxHeight: 240,
    overflowY: 'auto',
    marginBottom: 12,
  },
  statusDot: (status) => ({
    display: 'inline-block',
    width: 7,
    height: 7,
    borderRadius: '50%',
    marginRight: 8,
    background: status === 'done' ? 'var(--success)'
               : status === 'running' ? 'var(--warn)'
               : status === 'error' ? 'var(--error)'
               : 'var(--text-muted)',
    boxShadow: status === 'running' ? '0 0 6px var(--warn)' : 'none',
  }),
  jobRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 0',
    borderBottom: '1px solid var(--border)',
    fontSize: 12,
  },
  tag: (color) => ({
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 2,
    fontFamily: 'var(--mono)',
    fontSize: 10,
    letterSpacing: '0.05em',
    background: color === 'green' ? 'rgba(0,255,136,0.1)' : color === 'orange' ? 'rgba(255,170,0,0.1)' : 'rgba(255,68,85,0.1)',
    color: color === 'green' ? 'var(--success)' : color === 'orange' ? 'var(--warn)' : 'var(--error)',
    border: `1px solid ${color === 'green' ? 'rgba(0,255,136,0.3)' : color === 'orange' ? 'rgba(255,170,0,0.3)' : 'rgba(255,68,85,0.3)'}`,
  }),
}

function formatPct(done, total) {
  if (!total) return 0
  return Math.round((done / total) * 100)
}

export default function App() {
  const [platform, setPlatform] = useState('3')
  const [usernames, setUsernames] = useState('')
  const [delay, setDelay] = useState('3')
  const [jobName, setJobName] = useState('')
  const [activeJob, setActiveJob] = useState(null)
  const [jobData, setJobData] = useState(null)
  const [jobs, setJobs] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const logRef = useRef(null)
  const pollRef = useRef(null)

  // Poll active job
  useEffect(() => {
    if (!activeJob) return
    const poll = async () => {
      try {
        const res = await fetch(`${API}/api/jobs/${activeJob}`)
        const data = await res.json()
        setJobData(data)
        if (data.status === 'done' || data.status === 'error' || data.status === 'stopped') {
          clearInterval(pollRef.current)
          fetchJobs()
        }
      } catch (e) {}
    }
    poll()
    pollRef.current = setInterval(poll, 1500)
    return () => clearInterval(pollRef.current)
  }, [activeJob])

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [jobData?.log])

  const fetchJobs = async () => {
    try {
      const res = await fetch(`${API}/api/jobs`)
      setJobs(await res.json())
    } catch (e) {}
  }

  useEffect(() => { fetchJobs() }, [])

  const handleSubmit = async () => {
    if (!usernames.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch(`${API}/api/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, usernames, delay: parseFloat(delay), name: jobName }),
      })
      const data = await res.json()
      if (data.job_id) {
        setActiveJob(data.job_id)
        setJobData(null)
      }
    } catch (e) {
      alert('Failed to start job')
    }
    setSubmitting(false)
  }

  const handleStop = async () => {
    if (!activeJob) return
    try {
      await fetch(`${API}/api/jobs/${activeJob}/stop`, { method: 'POST' })
    } catch (e) {}
  }

  const handleResume = async (jobId) => {
    try {
      const res = await fetch(`${API}/api/jobs/${jobId}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delay: parseFloat(delay) }),
      })
      const data = await res.json()
      if (data.job_id) {
        setActiveJob(data.job_id)
        setJobData(null)
        fetchJobs()
      } else {
        alert(data.error || 'Failed to resume')
      }
    } catch (e) {
      alert('Failed to resume job')
    }
  }

  const download = (jobId, fmt) => {
    window.open(`${API}/api/jobs/${jobId}/download/${fmt}`, '_blank')
  }

  const pct = jobData ? formatPct(jobData.done, jobData.total) : 0
  const isRunning = jobData?.status === 'running' || jobData?.status === 'queued'
  const isDone = jobData?.status === 'done'
  const isStopped = jobData?.status === 'stopped'
  const isError = jobData?.status === 'error'

  return (
    <div style={css.app}>
      {/* Header */}
      <header style={css.header}>
        <div style={css.wordmark}>// statbate</div>
        <h1 style={css.title}>Scraper</h1>
        <p style={css.subtitle}>Model earnings intelligence — Chaturbate · Stripchat · BongaCams · CamSoda · MFC</p>
      </header>

      <div style={css.grid}>
        {/* Left: Input */}
        <div>
          <div style={css.panel}>
            <div style={css.panelHeader}>
              <span>New Scrape Job</span>
              {jobData && (
                <span style={{ color: isDone ? 'var(--success)' : isRunning ? 'var(--warn)' : 'var(--text-dim)' }}>
                  <span style={css.statusDot(jobData.status)} />
                  {jobData.status}
                </span>
              )}
            </div>
            <div style={css.panelBody}>
              <label style={css.label}>Job Name <span style={{ color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0 }}>(used as filename)</span></label>
              <input
                type="text"
                style={{ ...css.inputSmall, width: '100%', marginBottom: 16 }}
                value={jobName}
                onChange={e => setJobName(e.target.value)}
                placeholder="e.g. SC batch 1"
                disabled={isRunning}
              />

              <label style={css.label}>Platform</label>
              <select
                style={css.select}
                value={platform}
                onChange={e => setPlatform(e.target.value)}
                disabled={isRunning}
              >
                {PLATFORMS.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>

              <label style={css.label}>Usernames <span style={{ color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0 }}>(one per line)</span></label>
              <textarea
                style={{
                  ...css.textarea,
                  borderColor: isRunning ? 'var(--border)' : undefined,
                  opacity: isRunning ? 0.6 : 1,
                }}
                value={usernames}
                onChange={e => setUsernames(e.target.value)}
                placeholder={"cm---001\nyoyo__\nsomemodel\n..."}
                disabled={isRunning}
              />

              <div style={css.row}>
                <div style={{ flex: 1 }}>
                  <label style={css.label}>Delay (sec)</label>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    step="0.5"
                    style={css.inputSmall}
                    value={delay}
                    onChange={e => setDelay(e.target.value)}
                    disabled={isRunning}
                  />
                </div>
                <div style={{ flex: 2 }}>
                  <label style={css.label}>
                    Estimated time
                  </label>
                  <div style={{ ...css.inputSmall, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', fontFamily: 'var(--mono)', fontSize: 12, padding: '8px 12px' }}>
                    {(() => {
                      const count = usernames.split('\n').filter(l => l.trim()).length
                      const secs = count * parseFloat(delay || 3)
                      if (secs < 60) return `~${Math.round(secs)}s`
                      return `~${Math.round(secs / 60)}m for ${count} models`
                    })()}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  style={{ ...css.btnPrimary, flex: 1, opacity: isRunning || submitting ? 0.5 : 1 }}
                  onClick={handleSubmit}
                  disabled={isRunning || submitting}
                >
                  {submitting ? 'STARTING...' : isRunning ? `RUNNING... ${pct}%` : '▶ RUN SCRAPE'}
                </button>
                {isRunning && (
                  <button
                    style={{ ...css.btnSecondary, padding: '0 16px', color: 'var(--error)', borderColor: 'var(--error)' }}
                    onClick={handleStop}
                  >
                    ⏹ STOP
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Progress + log */}
          {jobData && (
            <div style={{ ...css.panel, marginTop: 16 }}>
              <div style={css.panelHeader}>
                <span>Progress</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)' }}>
                  {jobData.done}/{jobData.total}
                </span>
              </div>
              <div style={{ padding: '14px 16px 4px' }}>
                <div style={css.progressBar(pct)}>
                  <div style={css.progressFill(pct)} />
                </div>
                <div ref={logRef} style={css.logBox}>
                  {jobData.log?.length ? jobData.log.map((line, i) => (
                    <div key={i} style={{ color: line.includes('error') ? 'var(--error)' : line.includes('not_found') ? 'var(--warn)' : 'var(--text-dim)' }}>
                      {line}
                    </div>
                  )) : <span style={{ color: 'var(--text-muted)' }}>Waiting for output...</span>}
                </div>
                {(isDone || isStopped) && (
                  <div style={{ display: 'flex', gap: 8, paddingBottom: 2 }}>
                    <button style={css.btnAccent} onClick={() => download(activeJob, 'xlsx')}>
                      ↓ Download XLSX
                    </button>
                    <button style={css.btnAccent} onClick={() => download(activeJob, 'csv')}>
                      ↓ Download CSV
                    </button>
                    {isStopped && (
                      <button style={{ ...css.btnSecondary, color: 'var(--warn)', borderColor: 'var(--warn)' }} onClick={() => handleResume(activeJob)}>
                        ↩ Resume
                      </button>
                    )}
                  </div>
                )}
                {isStopped && jobData.remaining?.length > 0 && (
                  <div style={{ marginTop: 8, marginBottom: 4 }}>
                    <button
                      style={{ ...css.btnSecondary, fontSize: 10, width: '100%' }}
                      onClick={() => {
                        navigator.clipboard.writeText(jobData.remaining.join('\n'))
                          .then(() => alert(`Copied ${jobData.remaining.length} remaining usernames to clipboard`))
                      }}
                    >
                      📋 Copy {jobData.remaining.length} remaining usernames
                    </button>
                  </div>
                )}
                {isError && (
                  <div style={{ paddingBottom: 4 }}>
                    <div style={{ color: 'var(--error)', fontFamily: 'var(--mono)', fontSize: 11, marginBottom: 8 }}>
                      Error: {jobData.error}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      {jobData.done > 0 && (
                        <button style={css.btnAccent} onClick={() => download(activeJob, 'xlsx')}>
                          ↓ Partial XLSX
                        </button>
                      )}
                      <button style={{ ...css.btnSecondary, color: 'var(--warn)', borderColor: 'var(--warn)' }} onClick={() => handleResume(activeJob)}>
                        ↩ Resume from crash
                      </button>
                    </div>
                    {jobData.remaining?.length > 0 && (
                      <button
                        style={{ ...css.btnSecondary, fontSize: 10, width: '100%' }}
                        onClick={() => {
                          navigator.clipboard.writeText(jobData.remaining.join('\n'))
                            .then(() => alert(`Copied ${jobData.remaining.length} remaining usernames to clipboard`))
                        }}
                      >
                        📋 Copy {jobData.remaining.length} remaining usernames
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: Job history */}
        <div>
          <div style={css.panel}>
            <div style={{ ...css.panelHeader }}>
              <span>Job History</span>
              <button style={css.btnSecondary} onClick={fetchJobs}>refresh</button>
            </div>
            <div style={{ padding: '0 16px' }}>
              {jobs.length === 0 && (
                <div style={{ padding: '20px 0', color: 'var(--text-muted)', fontFamily: 'var(--mono)', fontSize: 11, textAlign: 'center' }}>
                  No jobs yet
                </div>
              )}
              {jobs.map(job => (
                <div key={job.id} style={css.jobRow}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={css.statusDot(job.status)} />
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                        {job.name || job.platform}
                      </span>
                      <span style={css.tag(job.status === 'done' ? 'green' : job.status === 'running' ? 'orange' : job.status === 'error' || job.status === 'stopped' ? 'red' : 'grey')}>
                        {job.status}
                      </span>
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--mono)', fontSize: 10 }}>
                      {job.name ? `${job.platform} · ` : ''}{job.done}/{job.total} models
                      {job.resumed_from && <span style={{ marginLeft: 6, color: 'var(--warn)' }}>↩ resumed</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {(job.status === 'done' || job.status === 'stopped') && (
                      <>
                        <button style={{ ...css.btnAccent, fontSize: 10, padding: '4px 10px' }} onClick={() => download(job.id, 'xlsx')}>
                          XLSX
                        </button>
                        <button style={{ ...css.btnAccent, fontSize: 10, padding: '4px 10px' }} onClick={() => download(job.id, 'csv')}>
                          CSV
                        </button>
                      </>
                    )}
                    {(job.status === 'error' || job.status === 'stopped') && (
                      <button style={{ ...css.btnSecondary, fontSize: 10, color: 'var(--warn)', borderColor: 'var(--warn)' }} onClick={() => handleResume(job.id)}>
                        ↩ resume
                      </button>
                    )}
                    {job.status === 'running' && (
                      <button style={{ ...css.btnSecondary, fontSize: 10 }} onClick={() => setActiveJob(job.id)}>
                        view
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Info card */}
          <div style={{ ...css.panel, marginTop: 16 }}>
            <div style={css.panelHeader}>Output Fields</div>
            <div style={{ padding: '12px 16px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)', lineHeight: 2 }}>
              <div style={{ color: 'var(--accent)', marginBottom: 4 }}>// summary sheet</div>
              <div>Type · Last online · Last month $ · All time $</div>
              <div style={{ color: 'var(--accent)', margin: '8px 0 4px' }}>// table sheets</div>
              <div>Last 30d · Recent tips · Top monthly</div>
              <div>Top all-time · Biggest tips</div>
              <div style={{ color: 'var(--accent)', margin: '8px 0 4px' }}>// chart data</div>
              <div>Earnings · Daily · Tippers (time series)</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '40px 0 20px', borderTop: '1px solid var(--border)', marginTop: 40, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)' }}>
        statbate-scraper · private
      </div>
    </div>
  )
}
