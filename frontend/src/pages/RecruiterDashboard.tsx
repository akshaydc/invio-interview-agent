import { useState, useEffect, useRef, useMemo } from 'react'
import axios from 'axios'
import { API_BASE_URL as API } from '../config'
import Navbar from '../components/Navbar'

const JOB_ROLES = [
  'Software Engineer',
  'Frontend Developer',
  'Backend Developer',
  'Full Stack Developer',
  'Salesforce Administrator',
  'Product Manager',
  'Salesforce Developer',
  'QA Engineer',
]

type CandidateStatus = 'not_started' | 'applied' | 'interview_scheduled' | 'interview_complete' | 'rejected'

type Candidate = {
  name: string
  ct_number: string
  email?: string
  phone?: string
  location?: string
  linkedin_url?: string
  resume_text?: string
  current_role?: string
  current_ctc?: string
  expected_ctc?: string
  notice_period?: string
  job_role: string
  job_description: string
  session_id: string | null
  status: CandidateStatus
  match_percentage?: number | null
  match_summary?: string
  match_strengths?: string[]
  match_gaps?: string[]
  compensation_fit?: string
  notice_fit?: string
  recommendation?: string
  applied_at?: string
  interview_slot?: string
}

type SlotInfo = { slot: string; display: string; available: boolean; booked_by: string | null }

type Job = {
  id: string
  title: string
  department: string
  location: string
  job_type: string
  experience: string
  description: string
  requirements: string[]
  role_budget?: string
  preferred_notice?: string
  status: string
  created_at: string
}

type Props = {
  token: string
  onLogout: () => void
  onViewScorecard: (ctNumber: string) => void
}

const STATUS_LABELS: Record<string, string> = {
  not_started: 'Not Started',
  applied: 'Applied',
  interview_scheduled: 'Scheduled',
  interview_complete: 'Completed',
  rejected: 'Rejected',
}

const STATUS_CLASSES: Record<string, string> = {
  not_started: 'badge badge--muted',
  applied: 'badge badge--muted',
  interview_scheduled: 'badge badge--blue',
  interview_complete: 'badge badge--green',
  rejected: 'badge badge--red',
}

function recommendationBadge(rec: string | undefined) {
  if (!rec) return null
  const key = rec.toLowerCase().replace(/\s+/g, '-')
  return <span className={`rec-badge rec-badge--${key}`}>{rec}</span>
}

function matchBadge(pct: number | null | undefined) {
  if (pct == null) return <span className="muted" style={{ fontSize: '0.85rem' }}>—</span>
  const cls = pct >= 70 ? 'match-badge match-badge--green' : pct >= 50 ? 'match-badge match-badge--amber' : 'match-badge match-badge--red'
  return <span className={cls}>{pct}%</span>
}

function formatSlotDisplay(slot: string): string {
  try {
    const [datePart, timePart] = slot.split(' ')
    const [year, month, day] = datePart.split('-').map(Number)
    const [hour, minute] = timePart.split(':').map(Number)
    const dt = new Date(year, month - 1, day, hour, minute)
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const amPm = hour < 12 ? 'AM' : 'PM'
    const displayHour = hour % 12 || 12
    return `${dayNames[dt.getDay()]}, ${day} ${monthNames[dt.getMonth()]} ${year} · ${displayHour}:${String(minute).padStart(2, '0')} ${amPm}`
  } catch {
    return slot
  }
}

type Tab = 'candidates' | 'jobs'

export default function RecruiterDashboard({ token, onLogout, onViewScorecard }: Props) {
  const [tab, setTab] = useState<Tab>('candidates')
  const [expandedCt, setExpandedCt] = useState<string | null>(null)

  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [candidatesLoading, setCandidatesLoading] = useState(true)
  const [showCandidateForm, setShowCandidateForm] = useState(false)
  const [candidateFormError, setCandidateFormError] = useState('')
  const [candidateFormLoading, setCandidateFormLoading] = useState(false)
  const [actionCt, setActionCt] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [ctNumber, setCtNumber] = useState('')
  const [jobRole, setJobRole] = useState('Software Engineer')
  const [customRole, setCustomRole] = useState('')
  const [jobDescription, setJobDescription] = useState('')

  const [jobs, setJobs] = useState<Job[]>([])
  const [jobsLoading, setJobsLoading] = useState(true)
  const [showJobForm, setShowJobForm] = useState(false)
  const [jobFormError, setJobFormError] = useState('')
  const [jobFormLoading, setJobFormLoading] = useState(false)
  const [jTitle, setJTitle] = useState('')
  const [jDepartment, setJDepartment] = useState('')
  const [jLocation, setJLocation] = useState('')
  const [jJobType, setJJobType] = useState('Full-time')
  const [jExperience, setJExperience] = useState('')
  const [jRoleBudget, setJRoleBudget] = useState('')
  const [jPreferredNotice, setJPreferredNotice] = useState('Flexible')
  const [jDescription, setJDescription] = useState('')
  const [jRequirements, setJRequirements] = useState('')
  const [jdFile, setJdFile] = useState<File | null>(null)
  const jdFileInputRef = useRef<HTMLInputElement>(null)

  const [editingJob, setEditingJob] = useState<Job | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDepartment, setEditDepartment] = useState('')
  const [editLocation, setEditLocation] = useState('')
  const [editJobType, setEditJobType] = useState('Full-time')
  const [editExperience, setEditExperience] = useState('')
  const [editRoleBudget, setEditRoleBudget] = useState('')
  const [editPreferredNotice, setEditPreferredNotice] = useState('Flexible')
  const [editDescription, setEditDescription] = useState('')
  const [editRequirements, setEditRequirements] = useState('')
  const [editFormLoading, setEditFormLoading] = useState(false)
  const [editFormError, setEditFormError] = useState('')
  const [editSuccessMsg, setEditSuccessMsg] = useState('')

  const [resumeModal, setResumeModal] = useState<{ name: string; text: string; filename: string } | null>(null)

  const [filterRole, setFilterRole] = useState('')
  const [filterSkill, setFilterSkill] = useState('')
  const [filterLocation, setFilterLocation] = useState('')
  const [filterMinMatch, setFilterMinMatch] = useState(0)
  const [filterRecommendation, setFilterRecommendation] = useState('All')
  const [filterStatus, setFilterStatus] = useState('All')

  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [scheduleModalCt, setScheduleModalCt] = useState('')
  const [scheduleOption, setScheduleOption] = useState<'pick' | 'call' | null>(null)
  const [callSuccess, setCallSuccess] = useState(false)
  const [callLoading, setCallLoading] = useState(false)
  const [slots, setSlots] = useState<SlotInfo[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState('')
  const [bookingLoading, setBookingLoading] = useState(false)
  const [bookSlotError, setBookSlotError] = useState('')

  const filteredCandidates = useMemo(() => {
    let result = [...candidates].sort((a, b) => {
      const aMatch = a.match_percentage ?? -1
      const bMatch = b.match_percentage ?? -1
      return bMatch - aMatch
    })
    if (filterRole.trim()) {
      const r = filterRole.toLowerCase().trim()
      result = result.filter(c => c.job_role.toLowerCase().includes(r))
    }
    if (filterSkill.trim()) {
      const s = filterSkill.toLowerCase().trim()
      result = result.filter(c =>
        (c.resume_text || '').toLowerCase().includes(s) ||
        (c.match_summary || '').toLowerCase().includes(s)
      )
    }
    if (filterLocation.trim()) {
      const l = filterLocation.toLowerCase().trim()
      result = result.filter(c => (c.location || '').toLowerCase().includes(l))
    }
    if (filterMinMatch > 0) {
      result = result.filter(c => (c.match_percentage ?? 0) >= filterMinMatch)
    }
    if (filterRecommendation !== 'All') {
      result = result.filter(c => c.recommendation === filterRecommendation)
    }
    if (filterStatus !== 'All') {
      const statusMap: Record<string, string> = {
        'Applied': 'applied',
        'Interview Scheduled': 'interview_scheduled',
        'Interview Complete': 'interview_complete',
        'Rejected': 'rejected',
      }
      result = result.filter(c => c.status === statusMap[filterStatus])
    }
    return result
  }, [candidates, filterRole, filterSkill, filterLocation, filterMinMatch, filterRecommendation, filterStatus])

  const headers = { 'X-Auth-Token': token }

  async function fetchCandidates() {
    setCandidatesLoading(true)
    try {
      const res = await axios.get<Candidate[]>(`${API}/recruiter/candidates`, { headers })
      setCandidates(res.data)
    } catch {
      // silent
    } finally {
      setCandidatesLoading(false)
    }
  }

  async function fetchJobs() {
    setJobsLoading(true)
    try {
      const res = await axios.get<Job[]>(`${API}/recruiter/jobs`, { headers })
      setJobs(res.data)
    } catch {
      // silent
    } finally {
      setJobsLoading(false)
    }
  }

  useEffect(() => { fetchCandidates() }, [])
  useEffect(() => { if (tab === 'jobs') fetchJobs() }, [tab])

  function toggleExpand(ct: string) {
    setExpandedCt(prev => prev === ct ? null : ct)
  }

  function openScheduleModal(ct: string) {
    setScheduleModalCt(ct)
    setShowScheduleModal(true)
    setScheduleOption(null)
    setCallSuccess(false)
    setCallLoading(false)
    setSlots([])
    setSelectedSlot('')
    setBookSlotError('')
  }

  function closeScheduleModal() {
    setShowScheduleModal(false)
    setScheduleModalCt('')
    setScheduleOption(null)
  }

  async function fetchSlots() {
    setSlotsLoading(true)
    try {
      const res = await axios.get<SlotInfo[]>(`${API}/recruiter/slots`, { headers })
      setSlots(res.data)
    } catch {
      // silent
    } finally {
      setSlotsLoading(false)
    }
  }

  async function handleMakeCall() {
    setCallLoading(true)
    try {
      await axios.post(`${API}/recruiter/candidates/${scheduleModalCt}/make-call`, {}, { headers })
      setCandidates(prev =>
        prev.map(c => c.ct_number === scheduleModalCt ? { ...c, status: 'interview_scheduled' as CandidateStatus } : c)
      )
      setCallSuccess(true)
    } catch {
      // silent
    } finally {
      setCallLoading(false)
    }
  }

  async function handleBookSlot() {
    if (!selectedSlot) return
    setBookingLoading(true)
    setBookSlotError('')
    try {
      await axios.post(`${API}/recruiter/candidates/${scheduleModalCt}/book-slot`, { slot: selectedSlot }, { headers })
      setCandidates(prev =>
        prev.map(c => c.ct_number === scheduleModalCt
          ? { ...c, status: 'interview_scheduled' as CandidateStatus, interview_slot: selectedSlot }
          : c
        )
      )
      closeScheduleModal()
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.detail ?? 'Booking failed.' : 'Booking failed.'
      setBookSlotError(String(msg))
    } finally {
      setBookingLoading(false)
    }
  }

  async function handleReject(ct: string) {
    setActionCt(ct)
    try {
      await axios.post(`${API}/recruiter/candidates/${ct}/reject`, {}, { headers })
      setCandidates(prev =>
        prev.map(c => c.ct_number === ct ? { ...c, status: 'rejected' as CandidateStatus } : c)
      )
    } catch { /* silent */ } finally { setActionCt(null) }
  }

  async function handleCancelSchedule(ct: string) {
    setActionCt(ct)
    try {
      await axios.post(`${API}/recruiter/candidates/${ct}/cancel-schedule`, {}, { headers })
      setCandidates(prev =>
        prev.map(c => c.ct_number === ct ? { ...c, status: 'applied' as CandidateStatus } : c)
      )
    } catch { /* silent */ } finally { setActionCt(null) }
  }

  async function handleCreateCandidate() {
    setCandidateFormError('')
    if (!name.trim() || !ctNumber.trim()) {
      setCandidateFormError('Name and CT Number are required.')
      return
    }
    setCandidateFormLoading(true)
    try {
      await axios.post(
        `${API}/recruiter/candidates`,
        {
          name: name.trim(),
          ct_number: ctNumber.trim().toUpperCase(),
          job_role: customRole.trim() || jobRole,
          job_description: jobDescription,
        },
        { headers }
      )
      setName(''); setCtNumber(''); setJobRole('Software Engineer')
      setCustomRole(''); setJobDescription('')
      setShowCandidateForm(false)
      await fetchCandidates()
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.detail ?? 'Failed to create.' : 'Failed to create.'
      setCandidateFormError(String(msg))
    } finally {
      setCandidateFormLoading(false)
    }
  }

  async function handleCreateJob() {
    setJobFormError('')
    if (!jTitle.trim() || !jDepartment.trim() || !jLocation.trim()) {
      setJobFormError('Title, department, and location are required.')
      return
    }
    if (!jDescription.trim() && !jdFile) {
      setJobFormError('Please upload a JD file or paste the job description.')
      return
    }
    setJobFormLoading(true)
    try {
      const fd = new FormData()
      fd.append('title', jTitle.trim())
      fd.append('department', jDepartment.trim())
      fd.append('location', jLocation.trim())
      fd.append('job_type', jJobType)
      fd.append('experience', jExperience.trim())
      fd.append('description', jDescription.trim())
      fd.append('requirements', jRequirements.split(',').map(r => r.trim()).filter(Boolean).join(','))
      fd.append('role_budget', jRoleBudget.trim())
      fd.append('preferred_notice', jPreferredNotice)
      if (jdFile) fd.append('jd_file', jdFile)
      await axios.post(`${API}/recruiter/jobs`, fd, { headers })
      setJTitle(''); setJDepartment(''); setJLocation(''); setJJobType('Full-time')
      setJExperience(''); setJRoleBudget(''); setJPreferredNotice('Flexible')
      setJDescription(''); setJRequirements(''); setJdFile(null)
      if (jdFileInputRef.current) jdFileInputRef.current.value = ''
      setShowJobForm(false)
      await fetchJobs()
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.detail ?? 'Failed to create job.' : 'Failed to create job.'
      setJobFormError(String(msg))
    } finally {
      setJobFormLoading(false)
    }
  }

  function handleEditStart(job: Job) {
    setEditingJob(job)
    setEditTitle(job.title)
    setEditDepartment(job.department)
    setEditLocation(job.location)
    setEditJobType(job.job_type)
    setEditExperience(job.experience)
    setEditRoleBudget(job.role_budget ?? '')
    setEditPreferredNotice(job.preferred_notice ?? 'Flexible')
    setEditDescription(job.description)
    setEditRequirements(job.requirements.join(', '))
    setEditFormError('')
    setEditSuccessMsg('')
  }

  function handleEditCancel() {
    setEditingJob(null)
    setEditFormError('')
    setEditSuccessMsg('')
  }

  async function handleSaveEdit() {
    if (!editingJob) return
    setEditFormError('')
    setEditSuccessMsg('')
    if (!editTitle.trim() || !editDepartment.trim() || !editLocation.trim()) {
      setEditFormError('Title, department, and location are required.')
      return
    }
    setEditFormLoading(true)
    try {
      const res = await axios.put<{ success: boolean; recalculated: number; job: Job }>(
        `${API}/recruiter/jobs/${editingJob.id}`,
        {
          title: editTitle.trim(),
          department: editDepartment.trim(),
          location: editLocation.trim(),
          job_type: editJobType,
          experience: editExperience.trim(),
          description: editDescription.trim(),
          requirements: editRequirements.split(',').map(r => r.trim()).filter(Boolean),
          role_budget: editRoleBudget.trim(),
          preferred_notice: editPreferredNotice,
        },
        { headers }
      )
      const updatedJob = res.data.job
      setJobs(prev => prev.map(j => j.id === updatedJob.id ? updatedJob : j))
      setEditSuccessMsg(
        `Job updated. Match scores recalculated for ${res.data.recalculated} candidate${res.data.recalculated !== 1 ? 's' : ''}.`
      )
      setEditingJob(null)
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.detail ?? 'Failed to save.' : 'Failed to save.'
      setEditFormError(String(msg))
    } finally {
      setEditFormLoading(false)
    }
  }

  async function handleCloseJob(jobId: string) {
    try {
      await axios.put(`${API}/recruiter/jobs/${jobId}`, { status: 'closed' }, { headers })
      await fetchJobs()
    } catch {
      // silent
    }
  }

  async function handleReopenJob(jobId: string) {
    try {
      await axios.put(`${API}/recruiter/jobs/${jobId}`, { status: 'open' }, { headers })
      await fetchJobs()
    } catch {
      // silent
    }
  }

  function handleViewResume(c: Candidate) {
    if (c.resume_text) {
      setResumeModal({ name: c.name, text: c.resume_text, filename: '' })
    }
  }

  return (
    <div>
      <Navbar
        rightContent={<button className="btn btn-secondary" onClick={onLogout}>Logout</button>}
      />
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {resumeModal && (
        <div className="modal-overlay" onClick={() => setResumeModal(null)}>
          <div
            className="card"
            style={{ maxWidth: 680, width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', background: 'var(--primary)', borderRadius: '12px 12px 0 0' }}>
              <div>
                <div style={{ color: '#fff', fontWeight: 600, fontSize: '1rem' }}>{resumeModal.name}</div>
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem' }}>Resume</div>
              </div>
              <button
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontWeight: 600 }}
                onClick={() => setResumeModal(null)}
              >
                Close
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
              <pre style={{ fontFamily: 'monospace', fontSize: '0.82rem', lineHeight: 1.7, color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
                {resumeModal.text}
              </pre>
            </div>
          </div>
        </div>
      )}
      {showScheduleModal && (
        <div className="modal-overlay" onClick={closeScheduleModal}>
          <div className="card schedule-modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0 }}>Schedule Interview</h3>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '1.5rem', lineHeight: 1 }} onClick={closeScheduleModal}>×</button>
            </div>
            {!scheduleOption && (
              <div className="schedule-options">
                <div className="schedule-option-card" onClick={() => { setScheduleOption('call'); handleMakeCall() }}>
                  <div style={{ fontSize: '2rem' }}>📞</div>
                  <h4 style={{ margin: '8px 0 4px' }}>Make a Call</h4>
                  <p className="muted" style={{ fontSize: '0.85rem' }}>Invite the candidate to join immediately.</p>
                </div>
                <div className="schedule-option-card" onClick={() => { setScheduleOption('pick'); fetchSlots() }}>
                  <div style={{ fontSize: '2rem' }}>📅</div>
                  <h4 style={{ margin: '8px 0 4px' }}>Pick a Slot</h4>
                  <p className="muted" style={{ fontSize: '0.85rem' }}>Choose a time. Candidate gets an email.</p>
                </div>
              </div>
            )}
            {scheduleOption === 'call' && (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                {callLoading && <p className="muted">Initiating call...</p>}
                {callSuccess && (
                  <>
                    <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>✅</div>
                    <p style={{ color: 'var(--green)', fontWeight: 600, marginBottom: 8 }}>Call initiated successfully</p>
                    <p className="muted" style={{ fontSize: '0.875rem' }}>The candidate can log in and start their interview immediately.</p>
                    <button className="btn btn-secondary" style={{ marginTop: 16 }} onClick={closeScheduleModal}>Done</button>
                  </>
                )}
              </div>
            )}
            {scheduleOption === 'pick' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {slotsLoading && <p className="muted">Loading available slots...</p>}
                {!slotsLoading && (
                  <div className="slot-grid">
                    {slots.map(s => (
                      <button
                        key={s.slot}
                        className={`slot-cell ${s.available ? 'slot-cell--available' : 'slot-cell--booked'}${selectedSlot === s.slot ? ' slot-cell--selected' : ''}`}
                        disabled={!s.available}
                        onClick={() => s.available && setSelectedSlot(s.slot)}
                      >
                        {s.display}
                      </button>
                    ))}
                  </div>
                )}
                {bookSlotError && <p className="error-text">{bookSlotError}</p>}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-primary" onClick={handleBookSlot} disabled={!selectedSlot || bookingLoading}>
                    {bookingLoading ? 'Booking...' : 'Confirm Slot'}
                  </button>
                  <button className="btn btn-secondary" onClick={() => setScheduleOption(null)}>Back</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      <div className="dash-subheader">
        <h1 className="title" style={{ fontSize: '1.6rem' }}>Recruiter Dashboard</h1>
        <div className="dash-header-actions">
          {tab === 'candidates' && (
            <>
              <button className="btn btn-secondary" onClick={fetchCandidates}>Refresh</button>
              <button className="btn btn-primary" onClick={() => setShowCandidateForm(!showCandidateForm)}>
                {showCandidateForm ? 'Cancel' : '+ Add Candidate'}
              </button>
            </>
          )}
          {tab === 'jobs' && (
            <>
              <button className="btn btn-secondary" onClick={fetchJobs}>Refresh</button>
              <button className="btn btn-primary" onClick={() => setShowJobForm(!showJobForm)}>
                {showJobForm ? 'Cancel' : '+ Add Job'}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="tab-bar">
        <button className={`tab-btn${tab === 'candidates' ? ' tab-btn--active' : ''}`} onClick={() => setTab('candidates')}>
          Candidates
        </button>
        <button className={`tab-btn${tab === 'jobs' ? ' tab-btn--active' : ''}`} onClick={() => setTab('jobs')}>
          Manage Jobs
        </button>
      </div>

      {tab === 'candidates' && (
        <>
          {showCandidateForm && (
            <div className="card">
              <h3 style={{ marginBottom: 16, color: 'var(--text)' }}>New Candidate</h3>
              <div className="form-grid">
                <div className="role-select-group">
                  <label className="role-label">Full Name</label>
                  <input className="role-input" placeholder="Jane Smith" value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div className="role-select-group">
                  <label className="role-label">CT Number</label>
                  <input className="role-input" placeholder="CT001" value={ctNumber} onChange={e => setCtNumber(e.target.value.toUpperCase())} />
                </div>
                <div className="role-select-group">
                  <label className="role-label">Job Role</label>
                  <select className="role-select" value={jobRole} onChange={e => { setJobRole(e.target.value); setCustomRole('') }}>
                    {JOB_ROLES.map(r => <option key={r}>{r}</option>)}
                  </select>
                  <label className="role-label" style={{ marginTop: 8 }}>Or custom role</label>
                  <input className="role-input" placeholder="e.g. DevOps Engineer" value={customRole} onChange={e => setCustomRole(e.target.value)} />
                </div>
                <div className="role-select-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="role-label">Job Description (optional)</label>
                  <textarea className="role-textarea" placeholder="Paste job description..." value={jobDescription} onChange={e => setJobDescription(e.target.value)} />
                </div>
              </div>
              {candidateFormError && <p className="error-text" style={{ marginTop: 12 }}>{candidateFormError}</p>}
              <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={handleCreateCandidate} disabled={candidateFormLoading}>
                {candidateFormLoading ? 'Creating...' : 'Create Candidate'}
              </button>
            </div>
          )}

          <div className="filter-bar">
            <div className="filter-bar-item">
              <label className="role-label">Role</label>
              <input className="role-input" placeholder="e.g. Salesforce" value={filterRole} onChange={e => setFilterRole(e.target.value)} />
            </div>
            <div className="filter-bar-item">
              <label className="role-label">Skill</label>
              <input className="role-input" placeholder="e.g. Apex, React" value={filterSkill} onChange={e => setFilterSkill(e.target.value)} />
            </div>
            <div className="filter-bar-item">
              <label className="role-label">Location</label>
              <input className="role-input" placeholder="e.g. Bangalore" value={filterLocation} onChange={e => setFilterLocation(e.target.value)} />
            </div>
            <div className="filter-bar-item filter-bar-item--range">
              <label className="role-label">Min Match: {filterMinMatch}%</label>
              <input type="range" min={0} max={100} value={filterMinMatch} onChange={e => setFilterMinMatch(Number(e.target.value))} style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--primary)', marginTop: 4 }} />
            </div>
            <div className="filter-bar-item">
              <label className="role-label">Recommendation</label>
              <select className="role-select" value={filterRecommendation} onChange={e => setFilterRecommendation(e.target.value)}>
                <option>All</option>
                <option>Strong Hire</option>
                <option>Hire</option>
                <option>Consider</option>
                <option>Reject</option>
              </select>
            </div>
            <div className="filter-bar-item">
              <label className="role-label">Status</label>
              <select className="role-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option>All</option>
                <option>Applied</option>
                <option>Interview Scheduled</option>
                <option>Interview Complete</option>
                <option>Rejected</option>
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button
                className="btn btn-secondary"
                style={{ fontSize: '0.85rem', padding: '8px 16px', whiteSpace: 'nowrap' }}
                onClick={() => { setFilterRole(''); setFilterSkill(''); setFilterLocation(''); setFilterMinMatch(0); setFilterRecommendation('All'); setFilterStatus('All') }}
              >
                Clear
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ color: 'var(--text)' }}>
                    {filteredCandidates.length} candidate{filteredCandidates.length !== 1 ? 's' : ''} found
                    {filteredCandidates.length !== candidates.length && ` (of ${candidates.length})`}
                  </h3>
                </div>
                {candidatesLoading ? (
                  <p className="muted" style={{ padding: 24 }}>Loading...</p>
                ) : candidates.length === 0 ? (
                  <p className="muted" style={{ padding: 24 }}>No candidates yet. Add one above.</p>
                ) : filteredCandidates.length === 0 ? (
                  <p className="muted" style={{ padding: 24 }}>No candidates match your filters.</p>
                ) : (
                  <div className="table-wrapper">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th style={{ minWidth: 140 }}>Name</th>
                          <th style={{ minWidth: 120 }}>CT Number</th>
                          <th style={{ minWidth: 160 }}>Job Role</th>
                          <th style={{ minWidth: 90 }}>Match %</th>
                          <th style={{ minWidth: 120 }}>Rec.</th>
                          <th style={{ minWidth: 140 }}>Status</th>
                          <th style={{ minWidth: 200 }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCandidates.map(c => (
                          <>
                            <tr
                              key={c.ct_number}
                              style={{ cursor: 'pointer' }}
                              onClick={() => toggleExpand(c.ct_number)}
                            >
                              <td style={{ fontWeight: 500 }}>{c.name}</td>
                              <td style={{ color: 'var(--muted)', fontFamily: 'monospace' }}>{c.ct_number}</td>
                              <td>{c.job_role}</td>
                              <td onClick={e => e.stopPropagation()}>{matchBadge(c.match_percentage)}</td>
                              <td onClick={e => e.stopPropagation()}>{recommendationBadge(c.recommendation)}</td>
                              <td onClick={e => e.stopPropagation()}>
                                <span className={STATUS_CLASSES[c.status] ?? 'badge badge--muted'}>
                                  {STATUS_LABELS[c.status] ?? c.status}
                                </span>
                              </td>
                              <td onClick={e => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
                                {c.status === 'applied' && (
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <button
                                      className="btn btn-primary"
                                      style={{ padding: '6px 12px', fontSize: '0.82rem' }}
                                      onClick={() => openScheduleModal(c.ct_number)}
                                    >
                                      Schedule
                                    </button>
                                    <button
                                      className="btn btn-danger"
                                      style={{ padding: '6px 12px', fontSize: '0.82rem', alignSelf: 'unset' }}
                                      disabled={actionCt === c.ct_number}
                                      onClick={() => handleReject(c.ct_number)}
                                    >
                                      Reject
                                    </button>
                                  </div>
                                )}
                                {c.status === 'interview_scheduled' && (
                                  <button
                                    className="btn btn-secondary"
                                    style={{ padding: '6px 14px', fontSize: '0.82rem' }}
                                    disabled={actionCt === c.ct_number}
                                    onClick={() => handleCancelSchedule(c.ct_number)}
                                  >
                                    Cancel
                                  </button>
                                )}
                                {c.status === 'interview_complete' && (
                                  <button
                                    className="btn btn-secondary"
                                    style={{ padding: '6px 14px', fontSize: '0.82rem' }}
                                    onClick={() => onViewScorecard(c.ct_number)}
                                  >
                                    View Feedback
                                  </button>
                                )}
                              </td>
                            </tr>

                            {expandedCt === c.ct_number && (
                              <tr key={`${c.ct_number}-detail`}>
                                <td colSpan={6} style={{ padding: 0, background: 'var(--surface-2)' }}>
                                  <div className="candidate-panel">

                                    <div className="candidate-details-grid">
                                      {c.email && (
                                        <div className="candidate-detail-item">
                                          <span className="role-label">Email</span>
                                          <span style={{ color: 'var(--text)', fontSize: '0.9rem' }}>{c.email}</span>
                                        </div>
                                      )}
                                      {c.phone && (
                                        <div className="candidate-detail-item">
                                          <span className="role-label">Phone</span>
                                          <span style={{ color: 'var(--text)', fontSize: '0.9rem' }}>{c.phone}</span>
                                        </div>
                                      )}
                                      {c.current_role && (
                                        <div className="candidate-detail-item">
                                          <span className="role-label">Current Role</span>
                                          <span style={{ color: 'var(--text)', fontSize: '0.9rem' }}>{c.current_role}</span>
                                        </div>
                                      )}
                                      {c.notice_period && (
                                        <div className="candidate-detail-item">
                                          <span className="role-label">Notice Period</span>
                                          <span style={{ color: 'var(--text)', fontSize: '0.9rem' }}>{c.notice_period}</span>
                                        </div>
                                      )}
                                      {(c.current_ctc || c.expected_ctc) && (
                                        <div className="candidate-detail-item">
                                          <span className="role-label">CTC (Current → Expected)</span>
                                          <span style={{ color: 'var(--text)', fontSize: '0.9rem' }}>
                                            {c.current_ctc || '—'} → {c.expected_ctc || '—'}
                                          </span>
                                        </div>
                                      )}
                                    </div>

                                    {c.match_percentage != null ? (
                                      <>
                                        <div className="candidate-panel-match" style={{ marginTop: 20 }}>
                                          <div
                                            className="candidate-match-score"
                                            style={{
                                              color: c.match_percentage >= 70
                                                ? 'var(--green)'
                                                : c.match_percentage >= 50
                                                ? 'var(--amber)'
                                                : 'var(--red)',
                                            }}
                                          >
                                            {c.match_percentage}%
                                          </div>
                                          <div style={{ flex: 1 }}>
                                            <p className="role-label" style={{ marginBottom: 6 }}>Match Summary</p>
                                            <p style={{ color: 'var(--text)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                                              {c.match_summary || '—'}
                                            </p>
                                            {(c.compensation_fit || c.notice_fit) && (
                                              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                                                {c.compensation_fit && (
                                                  <span className={`fit-badge fit-badge--${c.compensation_fit === 'good' ? 'good' : c.compensation_fit === 'partial' ? 'partial' : 'mismatch'}`}>
                                                    Compensation: {c.compensation_fit}
                                                  </span>
                                                )}
                                                {c.notice_fit && (
                                                  <span className={`fit-badge fit-badge--${c.notice_fit === 'good' ? 'good' : c.notice_fit === 'partial' ? 'partial' : 'mismatch'}`}>
                                                    Notice: {c.notice_fit}
                                                  </span>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        </div>

                                        {(c.match_strengths?.length || c.match_gaps?.length) ? (
                                          <div className="two-col" style={{ marginTop: 16 }}>
                                            {c.match_strengths && c.match_strengths.length > 0 && (
                                              <div>
                                                <p className="role-label" style={{ marginBottom: 8 }}>Strengths</p>
                                                <ul className="tag-list tag-list--green">
                                                  {c.match_strengths.map((s, i) => <li key={i}>{s}</li>)}
                                                </ul>
                                              </div>
                                            )}
                                            {c.match_gaps && c.match_gaps.length > 0 && (
                                              <div>
                                                <p className="role-label" style={{ marginBottom: 8 }}>Gaps</p>
                                                <ul className="tag-list tag-list--red">
                                                  {c.match_gaps.map((g, i) => <li key={i}>{g}</li>)}
                                                </ul>
                                              </div>
                                            )}
                                          </div>
                                        ) : null}
                                      </>
                                    ) : (
                                      <p className="muted" style={{ fontSize: '0.875rem', marginTop: 12 }}>
                                        No resume analysis available.
                                      </p>
                                    )}

                                    {c.recommendation && (
                                      <div style={{ marginTop: 16 }}>
                                        <p className="role-label" style={{ marginBottom: 6 }}>AI Recommendation</p>
                                        {recommendationBadge(c.recommendation)}
                                      </div>
                                    )}

                                    {c.interview_slot && (
                                      <div style={{ marginTop: 16 }}>
                                        <p className="role-label" style={{ marginBottom: 6 }}>Scheduled Interview</p>
                                        <span style={{ color: 'var(--primary-light)', fontWeight: 600, fontSize: '0.9rem' }}>
                                          {formatSlotDisplay(c.interview_slot)}
                                        </span>
                                      </div>
                                    )}

                                    <div className="candidate-panel-actions">
                                      {c.status === 'applied' && (
                                        <>
                                          <button
                                            className="btn btn-primary"
                                            style={{ fontSize: '0.875rem', padding: '8px 20px' }}
                                            onClick={e => { e.stopPropagation(); openScheduleModal(c.ct_number) }}
                                          >
                                            Schedule Interview
                                          </button>
                                          <button
                                            className="btn btn-danger"
                                            style={{ fontSize: '0.875rem', padding: '8px 20px', alignSelf: 'unset' }}
                                            disabled={actionCt === c.ct_number}
                                            onClick={e => { e.stopPropagation(); handleReject(c.ct_number) }}
                                          >
                                            Reject
                                          </button>
                                        </>
                                      )}
                                      {c.status === 'interview_scheduled' && (
                                        <button
                                          className="btn btn-secondary"
                                          style={{ fontSize: '0.875rem', padding: '8px 20px' }}
                                          disabled={actionCt === c.ct_number}
                                          onClick={e => { e.stopPropagation(); handleCancelSchedule(c.ct_number) }}
                                        >
                                          {actionCt === c.ct_number ? 'Cancelling…' : 'Cancel Schedule'}
                                        </button>
                                      )}
                                      {c.status === 'interview_complete' && (
                                        <button
                                          className="btn btn-secondary"
                                          style={{ fontSize: '0.875rem', padding: '8px 20px' }}
                                          onClick={e => { e.stopPropagation(); onViewScorecard(c.ct_number) }}
                                        >
                                          View Feedback
                                        </button>
                                      )}
                                      {c.resume_text && (
                                        <button
                                          className="btn btn-secondary"
                                          style={{ fontSize: '0.875rem', padding: '8px 20px' }}
                                          onClick={e => { e.stopPropagation(); handleViewResume(c) }}
                                        >
                                          View Resume
                                        </button>
                                      )}
                                    </div>

                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
        </>
      )}

      {tab === 'jobs' && (
        <>
          {showJobForm && (
            <div className="card">
              <h3 style={{ marginBottom: 16, color: 'var(--text)' }}>New Job Posting</h3>
              <div className="form-grid">
                <div className="role-select-group">
                  <label className="role-label">Job Title</label>
                  <input className="role-input" placeholder="e.g. Software Engineer" value={jTitle} onChange={e => setJTitle(e.target.value)} />
                </div>
                <div className="role-select-group">
                  <label className="role-label">Department</label>
                  <input className="role-input" placeholder="e.g. Engineering" value={jDepartment} onChange={e => setJDepartment(e.target.value)} />
                </div>
                <div className="role-select-group">
                  <label className="role-label">Location</label>
                  <input className="role-input" placeholder="e.g. Remote" value={jLocation} onChange={e => setJLocation(e.target.value)} />
                </div>
                <div className="role-select-group">
                  <label className="role-label">Job Type</label>
                  <select className="role-select" value={jJobType} onChange={e => setJJobType(e.target.value)}>
                    <option>Full-time</option>
                    <option>Part-time</option>
                    <option>Contract</option>
                    <option>Internship</option>
                  </select>
                </div>
                <div className="role-select-group">
                  <label className="role-label">Experience</label>
                  <input className="role-input" placeholder="e.g. 3-5 years" value={jExperience} onChange={e => setJExperience(e.target.value)} />
                </div>
                <div className="role-select-group">
                  <label className="role-label">Role Budget</label>
                  <input className="role-input" placeholder="e.g. 10-15 LPA" value={jRoleBudget} onChange={e => setJRoleBudget(e.target.value)} />
                </div>
                <div className="role-select-group">
                  <label className="role-label">Preferred Notice Period</label>
                  <select className="role-select" value={jPreferredNotice} onChange={e => setJPreferredNotice(e.target.value)}>
                    <option>Immediate</option>
                    <option>Up to 15 days</option>
                    <option>Up to 30 days</option>
                    <option>Up to 60 days</option>
                    <option>Flexible</option>
                  </select>
                </div>
                <div className="role-select-group">
                  <label className="role-label">Requirements (comma-separated)</label>
                  <input className="role-input" placeholder="Python, React, FastAPI" value={jRequirements} onChange={e => setJRequirements(e.target.value)} />
                </div>
                <div className="role-select-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="role-label">Upload JD File (PDF or TXT)</label>
                  <div
                    className="resume-upload-area"
                    onClick={() => jdFileInputRef.current?.click()}
                  >
                    <input
                      ref={jdFileInputRef}
                      type="file"
                      accept=".pdf,.txt"
                      style={{ display: 'none' }}
                      onChange={e => setJdFile(e.target.files?.[0] ?? null)}
                    />
                    {jdFile ? (
                      <span style={{ color: 'var(--text)' }}>{jdFile.name}</span>
                    ) : (
                      <span style={{ color: 'var(--muted)' }}>Click to upload JD file (optional if pasting below)&hellip;</span>
                    )}
                  </div>
                  {jdFile && (
                    <button
                      style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '0.8rem', cursor: 'pointer', padding: 0, marginTop: 4, textAlign: 'left' }}
                      onClick={() => { setJdFile(null); if (jdFileInputRef.current) jdFileInputRef.current.value = '' }}
                    >
                      Remove file
                    </button>
                  )}
                </div>
                <div className="role-select-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="role-label">Or Paste JD Here</label>
                  <textarea className="role-textarea" placeholder="Paste job description (used if no file uploaded)..." value={jDescription} onChange={e => setJDescription(e.target.value)} />
                </div>
              </div>
              {jobFormError && <p className="error-text" style={{ marginTop: 12 }}>{jobFormError}</p>}
              <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={handleCreateJob} disabled={jobFormLoading}>
                {jobFormLoading ? 'Creating...' : 'Create Job'}
              </button>
            </div>
          )}

          {editSuccessMsg && (
            <div className="info-box" style={{ marginBottom: 0 }}>{editSuccessMsg}</div>
          )}

          {editingJob && (
            <div className="card">
              <h3 style={{ marginBottom: 16, color: 'var(--text)' }}>Edit Job — {editingJob.title}</h3>
              <div className="form-grid">
                <div className="role-select-group">
                  <label className="role-label">Job Title</label>
                  <input className="role-input" value={editTitle} onChange={e => setEditTitle(e.target.value)} />
                </div>
                <div className="role-select-group">
                  <label className="role-label">Department</label>
                  <input className="role-input" value={editDepartment} onChange={e => setEditDepartment(e.target.value)} />
                </div>
                <div className="role-select-group">
                  <label className="role-label">Location</label>
                  <input className="role-input" value={editLocation} onChange={e => setEditLocation(e.target.value)} />
                </div>
                <div className="role-select-group">
                  <label className="role-label">Job Type</label>
                  <select className="role-select" value={editJobType} onChange={e => setEditJobType(e.target.value)}>
                    <option>Full-time</option>
                    <option>Part-time</option>
                    <option>Contract</option>
                    <option>Internship</option>
                  </select>
                </div>
                <div className="role-select-group">
                  <label className="role-label">Experience</label>
                  <input className="role-input" value={editExperience} onChange={e => setEditExperience(e.target.value)} />
                </div>
                <div className="role-select-group">
                  <label className="role-label">Role Budget</label>
                  <input className="role-input" placeholder="e.g. 10-15 LPA" value={editRoleBudget} onChange={e => setEditRoleBudget(e.target.value)} />
                </div>
                <div className="role-select-group">
                  <label className="role-label">Preferred Notice Period</label>
                  <select className="role-select" value={editPreferredNotice} onChange={e => setEditPreferredNotice(e.target.value)}>
                    <option>Immediate</option>
                    <option>Up to 15 days</option>
                    <option>Up to 30 days</option>
                    <option>Up to 60 days</option>
                    <option>Flexible</option>
                  </select>
                </div>
                <div className="role-select-group">
                  <label className="role-label">Requirements (comma-separated)</label>
                  <input className="role-input" value={editRequirements} onChange={e => setEditRequirements(e.target.value)} />
                </div>
                <div className="role-select-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="role-label">Job Description</label>
                  <textarea className="role-textarea" value={editDescription} onChange={e => setEditDescription(e.target.value)} />
                </div>
              </div>
              {editFormError && <p className="error-text" style={{ marginTop: 12 }}>{editFormError}</p>}
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button className="btn btn-primary" onClick={handleSaveEdit} disabled={editFormLoading}>
                  {editFormLoading ? 'Saving…' : 'Save Changes'}
                </button>
                <button className="btn btn-secondary" onClick={handleEditCancel} disabled={editFormLoading}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ color: 'var(--text)' }}>Job Postings ({jobs.length})</h3>
            </div>
            {jobsLoading ? (
              <p className="muted" style={{ padding: 24 }}>Loading...</p>
            ) : jobs.length === 0 ? (
              <p className="muted" style={{ padding: 24 }}>No jobs yet. Add one above.</p>
            ) : (
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Department</th>
                      <th>Location</th>
                      <th>Experience</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map(j => (
                      <tr key={j.id}>
                        <td style={{ fontWeight: 500 }}>{j.title}</td>
                        <td style={{ color: 'var(--muted)' }}>{j.department}</td>
                        <td style={{ color: 'var(--muted)' }}>{j.location}</td>
                        <td style={{ color: 'var(--muted)' }}>{j.experience}</td>
                        <td>
                          <span className={j.status === 'open' ? 'badge badge--green' : 'badge badge--muted'}>
                            {j.status === 'open' ? 'Open' : 'Closed'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '6px 14px', fontSize: '0.85rem' }}
                              onClick={() => handleEditStart(j)}
                            >
                              Edit
                            </button>
                            {j.status === 'open' && (
                              <button
                                className="btn btn-danger"
                                style={{ padding: '6px 14px', fontSize: '0.85rem' }}
                                onClick={() => handleCloseJob(j.id)}
                              >
                                Close
                              </button>
                            )}
                            {j.status === 'closed' && (
                              <button
                                className="btn btn-secondary"
                                style={{ padding: '6px 14px', fontSize: '0.85rem' }}
                                onClick={() => handleReopenJob(j.id)}
                              >
                                Reopen
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
      </div>
    </div>
  )
}
