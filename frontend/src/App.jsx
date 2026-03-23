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
  const [sections, setSections] = useState({
    profile: true,
    last30d: true,
    recent_tips: false,
    top_monthly: false,
    top_alltime: false,
    biggest_tips: false,
  })
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

  const handleDelete = async (jobId) => {
    if (!window.confirm('Delete this job and all its data?')) return
    try {
      const res = await fetch(`${API}/api/jobs/${jobId}/delete`, { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        if (activeJob === jobId) {
          setActiveJob(null)
          setJobData(null)
        }
        fetchJobs()
      } else {
        alert(data.error || 'Failed to delete')
      }
    } catch (e) {
      alert('Failed to delete job')
    }
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
    const enabled = Object.entries(sections).filter(([,v]) => v).map(([k]) => k).join(',')
    window.open(`${API}/api/jobs/${jobId}/download/${fmt}?sections=${enabled}`, '_blank')
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

      {/* Top row: config left, textarea right */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, alignItems: 'start', marginBottom: 16 }}>

        {/* Left: config */}
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

            <label style={css.label}>Job Name <span style={{ color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0 }}>(filename)</span></label>
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

            {/* Output field toggles */}
            <label style={{ ...css.label, marginBottom: 6 }}>Output Fields</label>
            <div style={{ marginBottom: 16 }}>
              {[
                { key: 'profile',      label: 'Profile summary' },
                { key: 'last30d',      label: 'Last 30 days' },
                { key: 'recent_tips',  label: 'Recent tips' },
                { key: 'top_monthly',  label: 'Top monthly tippers' },
                { key: 'top_alltime',  label: 'Top all-time tippers' },
                { key: 'biggest_tips', label: 'Biggest tips' },
              ].map(({ key, label }) => (
                <div
                  key={key}
                  onClick={() => setSections(s => ({ ...s, [key]: !s[key] }))}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '5px 0', cursor: 'pointer', userSelect: 'none',
                  }}
                >
                  <div style={{
                    width: 13, height: 13, flexShrink: 0,
                    border: `1px solid ${sections[key] ? 'var(--accent)' : 'var(--border)'}`,
                    background: sections[key] ? 'var(--accent)' : 'transparent',
                    borderRadius: 2,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {sections[key] && <span style={{ color: '#000', fontSize: 9, fontWeight: 'bold', lineHeight: 1 }}>✓</span>}
                  </div>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: sections[key] ? 'var(--text)' : 'var(--text-dim)' }}>
                    {label}
                  </span>
                </div>
              ))}
            </div>

            <div style={css.row}>
              <div style={{ flex: 1 }}>
                <label style={css.label}>Delay (s)</label>
                <input
                  type="number" min="1" max="30" step="0.5"
                  style={css.inputSmall}
                  value={delay}
                  onChange={e => setDelay(e.target.value)}
                  disabled={isRunning}
                />
              </div>
              <div style={{ flex: 2 }}>
                <label style={css.label}>Est. time</label>
                <div style={{ ...css.inputSmall, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', fontFamily: 'var(--mono)', fontSize: 12, padding: '8px 12px' }}>
                  {(() => {
                    const count = usernames.split('\n').filter(l => l.trim()).length
                    const secs = count * parseFloat(delay || 3)
                    if (secs < 60) return `~${Math.round(secs)}s`
                    return `~${Math.round(secs / 60)}m for ${count}`
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
                  style={{ ...css.btnSecondary, padding: '0 14px', color: 'var(--error)', borderColor: 'var(--error)' }}
                  onClick={handleStop}
                >
                  ⏹
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right: username textarea */}
        <div style={{ ...css.panel, display: 'flex', flexDirection: 'column' }}>
          <div style={css.panelHeader}>
            <span>Usernames</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)' }}>
              {usernames.split('\n').filter(l => l.trim()).length} models
            </span>
          </div>
          <div style={{ padding: 16, flex: 1, display: 'flex', flexDirection: 'column' }}>
            <textarea
              style={{
                ...css.textarea,
                flex: 1,
                minHeight: 380,
                marginBottom: 0,
                opacity: isRunning ? 0.6 : 1,
                resize: 'none',
              }}
              value={usernames}
              onChange={e => setUsernames(e.target.value)}
              placeholder={'cm---001\nyoyo__\nsomemodel\n...'}
              disabled={isRunning}
            />
          </div>
        </div>
      </div>

      {/* Bottom row: progress left, job history right */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>

        {/* Progress / active job */}
        <div style={css.panel}>
          <div style={css.panelHeader}>
            <span>Progress</span>
            {jobData && (
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)' }}>
                {jobData.done}/{jobData.total}
              </span>
            )}
          </div>
          <div style={{ padding: '14px 16px 12px' }}>
            {jobData ? (
              <>
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
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <button style={css.btnAccent} onClick={() => download(activeJob, 'xlsx')}>↓ XLSX</button>
                    <button style={css.btnAccent} onClick={() => download(activeJob, 'csv')}>↓ CSV</button>
                    {isStopped && (
                      <button style={{ ...css.btnSecondary, color: 'var(--warn)', borderColor: 'var(--warn)' }} onClick={() => handleResume(activeJob)}>
                        ↩ Resume
                      </button>
                    )}
                  </div>
                )}
                {isStopped && jobData.remaining?.length > 0 && (
                  <button style={{ ...css.btnSecondary, fontSize: 10, width: '100%', marginBottom: 4 }}
                    onClick={() => navigator.clipboard.writeText(jobData.remaining.join('\n')).then(() => alert(`Copied ${jobData.remaining.length} remaining`))}>
                    📋 Copy {jobData.remaining.length} remaining usernames
                  </button>
                )}
                {isError && (
                  <div>
                    <div style={{ color: 'var(--error)', fontFamily: 'var(--mono)', fontSize: 11, marginBottom: 8 }}>
                      Error: {jobData.error}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      {jobData.done > 0 && <button style={css.btnAccent} onClick={() => download(activeJob, 'xlsx')}>↓ Partial XLSX</button>}
                      <button style={{ ...css.btnSecondary, color: 'var(--warn)', borderColor: 'var(--warn)' }} onClick={() => handleResume(activeJob)}>
                        ↩ Resume from crash
                      </button>
                    </div>
                    {jobData.remaining?.length > 0 && (
                      <button style={{ ...css.btnSecondary, fontSize: 10, width: '100%' }}
                        onClick={() => navigator.clipboard.writeText(jobData.remaining.join('\n')).then(() => alert(`Copied ${jobData.remaining.length} remaining`))}>
                        📋 Copy {jobData.remaining.length} remaining usernames
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--mono)', fontSize: 11, padding: '20px 0', textAlign: 'center' }}>
                No active job
              </div>
            )}
          </div>
        </div>

        {/* Job history */}
        <div style={css.panel}>
          <div style={css.panelHeader}>
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
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{job.name || job.platform}</span>
                    <span style={css.tag(job.status === 'done' ? 'green' : job.status === 'running' ? 'orange' : job.status === 'error' || job.status === 'stopped' ? 'red' : 'grey')}>
                      {job.status}
                    </span>
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--mono)', fontSize: 10 }}>
                    {job.name ? `${job.platform} · ` : ''}{job.done}/{job.total} models
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {(job.status === 'done' || job.status === 'stopped') && (
                    <>
                      <button style={{ ...css.btnAccent, fontSize: 10, padding: '4px 10px' }} onClick={() => download(job.id, 'xlsx')}>XLSX</button>
                      <button style={{ ...css.btnAccent, fontSize: 10, padding: '4px 10px' }} onClick={() => download(job.id, 'csv')}>CSV</button>
                    </>
                  )}
                  {(job.status === 'error' || job.status === 'stopped') && (
                    <button style={{ ...css.btnSecondary, fontSize: 10, color: 'var(--warn)', borderColor: 'var(--warn)' }} onClick={() => handleResume(job.id)}>
                      ↩ resume
                    </button>
                  )}
                  {job.status === 'running' && (
                    <button style={{ ...css.btnSecondary, fontSize: 10 }} onClick={() => setActiveJob(job.id)}>view</button>
                  )}
                  {job.status !== 'running' && job.status !== 'queued' && (
                    <button
                      style={{ ...css.btnSecondary, fontSize: 10, color: 'var(--error)', borderColor: 'rgba(255,68,85,0.4)' }}
                      onClick={() => handleDelete(job.id)}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ padding: '40px 0 20px', borderTop: '1px solid var(--border)', marginTop: 40, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)' }}>
        statbate-scraper · private
      </div>
    </div>
  )
}
