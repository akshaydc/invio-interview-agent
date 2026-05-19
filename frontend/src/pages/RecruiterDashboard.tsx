import React, { useState, useEffect, useRef, useMemo } from 'react'
import axios from 'axios'
import { API_BASE_URL as API } from '../config'
import Navbar from '../components/Navbar'
import PipelineWidget, { type Analytics } from '../components/PipelineWidget'
import LinkedInWidget, { type LinkedInAnalysis } from '../components/LinkedInWidget'

const TIMEZONE_OPTIONS = [
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (IST)', sub: 'UTC+5:30' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (GST)', sub: 'UTC+4:00' },
  { value: 'Europe/London', label: 'Europe/London (GMT)', sub: 'UTC+0:00' },
  { value: 'America/New_York', label: 'America/New_York (EST)', sub: 'UTC-5:00' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (PST)', sub: 'UTC-8:00' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (SGT)', sub: 'UTC+8:00' },
]

type CandidateStatus = 'not_started' | 'applied' | 'shortlisted' | 'interview_scheduled' | 'interview_complete' | 'rejected'

type CallStatus = {
  call_made: boolean
  call_made_at: string | null
  call_answered: boolean
  call_answered_at: string | null
  call_complete: boolean
  call_complete_at: string | null
  message_delivered: boolean
  call_sid: string
  note?: string
}

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
  job_id?: string
  job_role: string
  job_description?: string
  session_id: string | null
  status: CandidateStatus
  match_percentage?: number | null
  combined_score?: number | null
  match_summary?: string
  match_strengths?: string[]
  match_gaps?: string[]
  compensation_fit?: string
  notice_fit?: string
  recommendation?: string
  applied_at?: string
  interview_slot?: string
  call_status?: CallStatus
  linkedin_analysis?: LinkedInAnalysis | null
  additional_comments?: string
  // Component score fields
  must_have_matched?: string[]
  must_have_missing?: string[]
  good_to_have_matched?: string[]
  good_to_have_missing?: string[]
  must_have_score?: number | null
  good_to_have_score?: number | null
  notice_score?: number | null
  compensation_score?: number | null
  is_demo?: boolean
}

type SlotInfo = { slot: string; display: string; available: boolean; booked_by: string | null }

type Job = {
  id: string
  job_code?: string
  title: string
  department: string
  location: string
  job_type: string
  experience: string
  description: string
  requirements: string[]
  must_have_skills?: string[]
  good_to_have_skills?: string[]
  role_budget?: string
  preferred_notice?: string
  status: string
  created_at: string
}

type InternalRecord = {
  id: string
  type: 'internal_apply' | 'referral'
  employee_id: string
  job_id: string
  job_title: string
  job_department?: string
  job_location?: string
  candidate_name?: string
  candidate_email?: string
  candidate_phone?: string
  status: string
  note?: string
  created_at: string
}

function TagInput({ tags, onChange, placeholder, color = 'blue' }: {
  tags: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  color?: 'red' | 'blue'
}) {
  const [input, setInput] = React.useState('')
  const tagStyle: React.CSSProperties = color === 'red'
    ? { background: '#FEE2E2', color: '#B91C1C', border: '1px solid #FCA5A5' }
    : { background: '#DBEAFE', color: '#1D4ED8', border: '1px solid #93C5FD' }

  function addTag() {
    const val = input.trim()
    if (val && !tags.includes(val)) onChange([...tags, val])
    setInput('')
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '6px 8px', display: 'flex', flexWrap: 'wrap', gap: 4, background: 'var(--bg)' }}>
      {tags.map(t => (
        <span key={t} style={{ ...tagStyle, fontSize: '0.78rem', padding: '2px 8px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
          {t}
          <button onClick={() => onChange(tags.filter(x => x !== t))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: 'inherit' }}>×</button>
        </span>
      ))}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } if (e.key === 'Backspace' && !input && tags.length) onChange(tags.slice(0, -1)) }}
        placeholder={placeholder}
        style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: '0.85rem', minWidth: 120, color: 'var(--text)', fontFamily: 'inherit' }}
      />
    </div>
  )
}

function MatchScoreWidget({ c }: { c: Candidate }) {
  const [expanded, setExpanded] = React.useState(false)
  if (c.must_have_score == null && c.good_to_have_score == null) return null

  const mustTotal = (c.must_have_matched?.length ?? 0) + (c.must_have_missing?.length ?? 0)
  const goodTotal = (c.good_to_have_matched?.length ?? 0) + (c.good_to_have_missing?.length ?? 0)
  const perMust = mustTotal > 0 ? 30 / mustTotal : 0
  const perGood = goodTotal > 0 ? 20 / goodTotal : 0
  const liOverall = c.linkedin_analysis?.overall_score
  const linkedinContrib = liOverall != null ? Math.round((liOverall / 100) * 30) : 0
  const noticeScore = c.notice_score ?? 0
  const compScore = c.compensation_score ?? 0
  const skillsTotal = (c.must_have_score ?? 0) + (c.good_to_have_score ?? 0)
  const total = Math.round(skillsTotal + noticeScore + compScore + linkedinContrib)

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, marginBottom: 12, overflow: 'hidden' }}>
      <button onClick={() => setExpanded(v => !v)} style={{ width: '100%', background: '#F8FAFC', border: 'none', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>
        <span>Match Score Breakdown</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '1rem', fontWeight: 700, color: total >= 80 ? '#16a34a' : total >= 60 ? '#d97706' : '#dc2626' }}>{total}%</span>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>{expanded ? '▲' : '▼'}</span>
        </span>
      </button>
      {expanded && (
        <div style={{ padding: '12px 14px', fontSize: '0.82rem' }}>
          {mustTotal > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 600, marginBottom: 4, color: '#B91C1C' }}>Must-Have Skills (30%)</div>
              {c.must_have_matched?.map(s => <div key={s} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}><span>✅ {s}</span><span style={{ color: '#64748b' }}>+{perMust.toFixed(1)}</span></div>)}
              {c.must_have_missing?.map(s => <div key={s} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}><span>❌ {s}</span><span style={{ color: '#64748b' }}>+0</span></div>)}
            </div>
          )}
          {goodTotal > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 600, marginBottom: 4, color: '#1D4ED8' }}>Good-to-Have Skills (20%)</div>
              {c.good_to_have_matched?.map(s => <div key={s} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}><span>✅ {s}</span><span style={{ color: '#64748b' }}>+{perGood.toFixed(1)}</span></div>)}
              {c.good_to_have_missing?.map(s => <div key={s} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}><span>❌ {s}</span><span style={{ color: '#64748b' }}>+0</span></div>)}
            </div>
          )}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Notice Period (10%)</span><span style={{ fontWeight: 600 }}>{noticeScore}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Compensation (10%)</span><span style={{ fontWeight: 600 }}>{compScore}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>LinkedIn (30%)</span><span style={{ fontWeight: 600 }}>{linkedinContrib}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginTop: 4, paddingTop: 4, borderTop: '1px solid var(--border)' }}><span>Total</span><span style={{ color: total >= 80 ? '#16a34a' : total >= 60 ? '#d97706' : '#dc2626' }}>{total}%</span></div>
          </div>
        </div>
      )}
    </div>
  )
}

type Props = {
  token: string
  onLogout: () => void
  onViewScorecard: (ctNumber: string) => void
}

const STATUS_LABELS: Record<string, string> = {
  not_started: 'Not Started',
  applied: 'Applied',
  shortlisted: 'Shortlisted',
  interview_scheduled: 'Interview Scheduled',
  interview_complete: 'Interview Completed',
  rejected: 'Rejected',
}

const STATUS_CLASSES: Record<string, string> = {
  not_started: 'badge badge--muted',
  applied: 'badge badge--muted',
  shortlisted: 'badge badge--purple',
  interview_scheduled: 'badge badge--blue',
  interview_complete: 'badge badge--green',
  rejected: 'badge badge--red',
}

function recommendationBadge(rec: string | undefined) {
  if (!rec) return null
  const key = rec.toLowerCase().replace(/\s+/g, '-')
  return <span className={`rec-badge rec-badge--${key}`}>{rec}</span>
}

function matchBadge(pct: number | null | undefined, hasLinkedIn?: boolean) {
  if (pct == null) return <span className="muted" style={{ fontSize: '0.85rem' }}>—</span>
  const cls = pct >= 70 ? 'match-badge match-badge--green' : pct >= 50 ? 'match-badge match-badge--amber' : 'match-badge match-badge--red'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span className={cls}>{pct}%</span>
      {hasLinkedIn && (
        <span
          title="Includes LinkedIn verification (30%)"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 16, height: 16, background: '#0A66C2', color: '#fff',
            borderRadius: 3, fontSize: 9, fontWeight: 700, fontFamily: 'Georgia, serif',
            cursor: 'default', flexShrink: 0,
          }}
        >in</span>
      )}
    </span>
  )
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

type Tab = 'candidates' | 'jobs' | 'internal'

export default function RecruiterDashboard({ token, onLogout, onViewScorecard }: Props) {
  const [tab, setTab] = useState<Tab>('candidates')
  const [expandedCt, setExpandedCt] = useState<string | null>(null)

  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [candidatesLoading, setCandidatesLoading] = useState(true)
  const [showCandidateForm, setShowCandidateForm] = useState(false)
  const [candidateFormError, setCandidateFormError] = useState('')
  const [candidateFormLoading, setCandidateFormLoading] = useState(false)
  const [actionCt, setActionCt] = useState<string | null>(null)
  const [acFullName, setAcFullName] = useState('')
  const [acEmail, setAcEmail] = useState('')
  const [acLinkedin, setAcLinkedin] = useState('')
  const [acPhone, setAcPhone] = useState('')
  const [acLocation, setAcLocation] = useState('')
  const [acCurrentRole, setAcCurrentRole] = useState('')
  const [acCurrentCtc, setAcCurrentCtc] = useState('')
  const [acExpectedCtc, setAcExpectedCtc] = useState('')
  const [acNoticePeriod, setAcNoticePeriod] = useState('Immediate')
  const [acResume, setAcResume] = useState<File | null>(null)
  const [acAdditionalComments, setAcAdditionalComments] = useState('')
  const [acJobId, setAcJobId] = useState('')
  const acResumeRef = useRef<HTMLInputElement>(null)
  const [openJobs, setOpenJobs] = useState<Job[]>([])

  const [jobs, setJobs] = useState<Job[]>([])
  const [jobsLoading, setJobsLoading] = useState(true)
  const [internalRecords, setInternalRecords] = useState<InternalRecord[]>([])
  const [internalLoading, setInternalLoading] = useState(true)
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

  // Create/edit job skill arrays
  const [jMustHaveSkills, setJMustHaveSkills] = useState<string[]>([])
  const [jGoodToHaveSkills, setJGoodToHaveSkills] = useState<string[]>([])
  const [editMustHaveSkills, setEditMustHaveSkills] = useState<string[]>([])
  const [editGoodToHaveSkills, setEditGoodToHaveSkills] = useState<string[]>([])
  // Custom skill search
  const [customSkillQuery, setCustomSkillQuery] = useState('')
  const [customSkillResults, setCustomSkillResults] = useState<any[]>([])
  const [customSkillSearched, setCustomSkillSearched] = useState(false)
  const [customSkillLoading, setCustomSkillLoading] = useState(false)

  const [filterRole, setFilterRole] = useState('')
  const [filterSkill, setFilterSkill] = useState('')
  const [filterLocation, setFilterLocation] = useState('')
  const [filterMinMatch, setFilterMinMatch] = useState(0)
  const [filterRecommendation, setFilterRecommendation] = useState('All')
  const [filterStatus, setFilterStatus] = useState('All')
  const [filterLinkedInStatus, setFilterLinkedInStatus] = useState('All')
  const [filterHasLinkedin, setFilterHasLinkedin] = useState(false)
  const [showFilterPanel, setShowFilterPanel] = useState(false)
  const filterBtnRef = useRef<HTMLButtonElement>(null)

  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [scheduleModalCt, setScheduleModalCt] = useState('')
  const [scheduleModalJobId, setScheduleModalJobId] = useState<string | null>(null)
  const [slots, setSlots] = useState<SlotInfo[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState('')
  const [bookingLoading, setBookingLoading] = useState(false)
  const [bookSlotError, setBookSlotError] = useState('')
  const [availableDates, setAvailableDates] = useState<{ date: string; display: string }[]>([])
  const [scheduleDateSelected, setScheduleDateSelected] = useState('')
  const [scheduleTimezone, setScheduleTimezone] = useState('Asia/Kolkata')
  const [shortlistingCt, setShortlistingCt] = useState<string | null>(null)

  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(true)

  const [editingProfileCt, setEditingProfileCt] = useState<string | null>(null)
  const [epName, setEpName] = useState('')
  const [epEmail, setEpEmail] = useState('')
  const [epPhone, setEpPhone] = useState('')
  const [epCurrentRole, setEpCurrentRole] = useState('')
  const [epLocation, setEpLocation] = useState('')
  const [epCurrentCtc, setEpCurrentCtc] = useState('')
  const [epExpectedCtc, setEpExpectedCtc] = useState('')
  const [epNoticePeriod, setEpNoticePeriod] = useState('Immediate')
  const [epLinkedinUrl, setEpLinkedinUrl] = useState('')
  const [epAdditionalComments, setEpAdditionalComments] = useState('')
  const [epLoading, setEpLoading] = useState(false)
  const [epError, setEpError] = useState('')

  type ShortlistConfirm = {
    name: string
    emailSent: boolean
    emailTo: string | null
    slotBookingUrl: string
    callMade: boolean
    callSid: string
    callError: string
    candidatePhone: string
  }
  const [shortlistConfirm, setShortlistConfirm] = useState<ShortlistConfirm | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [scanningCt, setScanningCt] = useState<string | null>(null)

  const schedulePopularSlots = useMemo(() => {
    const popular = new Set<string>()
    let count = 0
    for (const s of slots) {
      if (s.available && count < 3) {
        popular.add(s.slot)
        count++
      }
    }
    return popular
  }, [slots])

  const filteredCandidates = useMemo(() => {
    let result = [...candidates].sort((a, b) => {
      if (a.is_demo && !b.is_demo) return -1
      if (!a.is_demo && b.is_demo) return 1
      const aMatch = a.combined_score ?? a.match_percentage ?? -1
      const bMatch = b.combined_score ?? b.match_percentage ?? -1
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
      result = result.filter(c => (c.combined_score ?? c.match_percentage ?? 0) >= filterMinMatch)
    }
    if (filterRecommendation !== 'All') {
      result = result.filter(c => c.recommendation === filterRecommendation)
    }
    if (filterStatus !== 'All') {
      const statusMap: Record<string, string> = {
        'Applied': 'applied',
        'Shortlisted': 'shortlisted',
        'Interview Scheduled': 'interview_scheduled',
        'Interview Complete': 'interview_complete',
        'Rejected': 'rejected',
      }
      result = result.filter(c => c.status === statusMap[filterStatus])
    }
    if (filterLinkedInStatus !== 'All') {
      const liStatusMap: Record<string, string> = {
        'Verified Match': 'verified_match',
        'Mismatch Detected': 'mismatch',
        'No URL': 'no_url',
        'Profile Not Found': 'no_match',
      }
      result = result.filter(c => c.linkedin_analysis?.status === liStatusMap[filterLinkedInStatus])
    }
    if (filterHasLinkedin) {
      result = result.filter(c => !!c.linkedin_url)
    }
    return result
  }, [candidates, filterRole, filterSkill, filterLocation, filterMinMatch, filterRecommendation, filterStatus, filterLinkedInStatus, filterHasLinkedin])

  const headers = { 'X-Auth-Token': token }

  async function fetchAnalytics() {
    setAnalyticsLoading(true)
    try {
      const res = await axios.get<Analytics>(`${API}/recruiter/analytics`, { headers })
      setAnalytics(res.data)
    } catch {
      // silent
    } finally {
      setAnalyticsLoading(false)
    }
  }

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

  async function fetchInternalRecords() {
    setInternalLoading(true)
    try {
      const res = await axios.get<InternalRecord[]>(`${API}/recruiter/internal-applications`, { headers })
      setInternalRecords(res.data)
    } catch {
      // silent
    } finally {
      setInternalLoading(false)
    }
  }

  useEffect(() => { fetchCandidates(); fetchAnalytics() }, [])
  useEffect(() => { if (tab === 'jobs') fetchJobs() }, [tab])
  useEffect(() => { if (tab === 'internal') fetchInternalRecords() }, [tab])
  useEffect(() => {
    axios.get<Job[]>(`${API}/jobs`).then(res => setOpenJobs(res.data.filter(j => j.status === 'open'))).catch(() => {})
  }, [])

  function toggleExpand(ct: string) {
    setExpandedCt(prev => prev === ct ? null : ct)
  }

  function openScheduleModal(ct: string) {
    setScheduleModalCt(ct)
    setScheduleModalJobId(candidates.find(c => c.ct_number === ct)?.job_id ?? null)
    setShowScheduleModal(true)
    setSlots([])
    setSelectedSlot('')
    setBookSlotError('')
    setAvailableDates([])
    setScheduleTimezone('Asia/Kolkata')
    const today = new Date().toISOString().split('T')[0]
    setScheduleDateSelected(today)
    fetchSlots(today, 'Asia/Kolkata')
  }

  function closeScheduleModal() {
    setShowScheduleModal(false)
    setScheduleModalCt('')
  }

  async function fetchSlots(date?: string, tz?: string) {
    setSlotsLoading(true)
    const timezone = tz ?? scheduleTimezone
    try {
      let url = `${API}/recruiter/slots?timezone=${encodeURIComponent(timezone)}`
      if (date) url += `&date=${date}`
      const res = await axios.get<{ slots: SlotInfo[]; available_dates: { date: string; display: string }[] }>(url, { headers })
      setSlots(res.data.slots ?? [])
      if (res.data.available_dates?.length) setAvailableDates(res.data.available_dates)
    } catch {
      // silent
    } finally {
      setSlotsLoading(false)
    }
  }

  function showToast(message: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast(message)
    toastTimerRef.current = setTimeout(() => setToast(null), 4000)
  }

  async function scanLinkedIn(ctNumber: string) {
    setScanningCt(ctNumber)
    try {
      const res = await axios.post(
        `${API}/recruiter/candidates/${ctNumber}/scan-linkedin`,
        null,
        { headers: { 'x-auth-token': token } },
      )
      setCandidates(prev => prev.map(c =>
        c.ct_number === ctNumber ? { ...c, linkedin_analysis: res.data } : c
      ))
      showToast('LinkedIn analysis complete')
    } catch {
      showToast('LinkedIn scan failed. Please try again.')
    } finally {
      setScanningCt(null)
    }
  }

  async function handleShortlist(ct: string) {
    setShortlistingCt(ct)
    try {
      const res = await axios.post<{
        success: boolean
        email_sent: boolean
        email_to: string | null
        slot_booking_url: string
        call_made: boolean
        call_sid: string
        call_result: { success: boolean; error?: string }
        message: string
      }>(`${API}/recruiter/candidates/${ct}/shortlist`, { job_id: candidates.find(c => c.ct_number === ct)?.job_id ?? null }, { headers })
      const cand = candidates.find(c => c.ct_number === ct)
      setCandidates(prev =>
        prev.map(c => c.ct_number === ct ? { ...c, status: 'shortlisted' as CandidateStatus } : c)
      )
      setShortlistConfirm({
        name: cand?.name ?? ct,
        emailSent: res.data.email_sent,
        emailTo: res.data.email_to,
        slotBookingUrl: res.data.slot_booking_url,
        callMade: res.data.call_made ?? false,
        callSid: res.data.call_sid ?? '',
        callError: res.data.call_result?.error ?? '',
        candidatePhone: cand?.phone ?? '',
      })
      showToast(`${cand?.name ?? ct} shortlisted. ${res.data.email_sent ? 'Email sent.' : 'Email not configured.'}`)
      fetchAnalytics()
    } catch { /* silent */ } finally { setShortlistingCt(null) }
  }

  async function handleBookSlot() {
    if (!selectedSlot) return
    setBookingLoading(true)
    setBookSlotError('')
    try {
      await axios.post(`${API}/recruiter/candidates/${scheduleModalCt}/book-slot`, { slot: selectedSlot, job_id: scheduleModalJobId }, { headers })
      setCandidates(prev =>
        prev.map(c => c.ct_number === scheduleModalCt
          ? { ...c, status: 'interview_scheduled' as CandidateStatus, interview_slot: selectedSlot }
          : c
        )
      )
      closeScheduleModal()
      fetchAnalytics()
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
      await axios.post(`${API}/recruiter/candidates/${ct}/reject`, { job_id: candidates.find(c => c.ct_number === ct)?.job_id ?? null }, { headers })
      setCandidates(prev =>
        prev.map(c => c.ct_number === ct ? { ...c, status: 'rejected' as CandidateStatus } : c)
      )
      fetchAnalytics()
    } catch { /* silent */ } finally { setActionCt(null) }
  }

  async function handleCreateCandidate() {
    setCandidateFormError('')
    if (!acFullName.trim() || !acEmail.trim() || !acPhone.trim() || !acLocation.trim() || !acCurrentRole.trim() || !acCurrentCtc.trim() || !acExpectedCtc.trim()) {
      setCandidateFormError('Please fill in all required fields.')
      return
    }
    if (!acJobId) {
      setCandidateFormError('Please select a job role.')
      return
    }
    if (!acResume) {
      setCandidateFormError('Please upload a resume.')
      return
    }
    setCandidateFormLoading(true)
    try {
      const fd = new FormData()
      fd.append('name', acFullName.trim())
      fd.append('email', acEmail.trim())
      fd.append('linkedin_url', acLinkedin.trim())
      fd.append('phone', acPhone.trim())
      fd.append('location', acLocation.trim())
      fd.append('current_role', acCurrentRole.trim())
      fd.append('current_ctc', acCurrentCtc.trim())
      fd.append('expected_ctc', acExpectedCtc.trim())
      fd.append('notice_period', acNoticePeriod)
      fd.append('resume', acResume)
      fd.append('additional_comments', acAdditionalComments.trim())
      fd.append('terms_accepted', 'true')
      await axios.post(`${API}/jobs/${acJobId}/apply`, fd)
      setAcFullName(''); setAcEmail(''); setAcLinkedin(''); setAcPhone('')
      setAcLocation(''); setAcCurrentRole(''); setAcCurrentCtc(''); setAcExpectedCtc('')
      setAcNoticePeriod('Immediate'); setAcResume(null); setAcAdditionalComments(''); setAcJobId('')
      if (acResumeRef.current) acResumeRef.current.value = ''
      setShowCandidateForm(false)
      await fetchCandidates()
      await fetchAnalytics()
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.detail ?? 'Failed to add candidate.' : 'Failed to add candidate.'
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
      fd.append('must_have_skills', JSON.stringify(jMustHaveSkills))
      fd.append('good_to_have_skills', JSON.stringify(jGoodToHaveSkills))
      fd.append('role_budget', jRoleBudget.trim())
      fd.append('preferred_notice', jPreferredNotice)
      if (jdFile) fd.append('jd_file', jdFile)
      await axios.post(`${API}/recruiter/jobs`, fd, { headers })
      setJTitle(''); setJDepartment(''); setJLocation(''); setJJobType('Full-time')
      setJExperience(''); setJRoleBudget(''); setJPreferredNotice('Flexible')
      setJDescription(''); setJRequirements(''); setJdFile(null)
      setJMustHaveSkills([]); setJGoodToHaveSkills([])
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
    setEditMustHaveSkills(job.must_have_skills ?? job.requirements ?? [])
    setEditGoodToHaveSkills(job.good_to_have_skills ?? [])
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
          must_have_skills: editMustHaveSkills,
          good_to_have_skills: editGoodToHaveSkills,
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

  async function searchCustomSkill() {
    if (!customSkillQuery.trim()) return
    setCustomSkillLoading(true)
    setCustomSkillSearched(false)
    try {
      const res = await axios.get(`${API}/recruiter/candidates/skill-search`, { params: { skill: customSkillQuery }, headers })
      setCustomSkillResults(res.data)
      setCustomSkillSearched(true)
    } catch {
      setCustomSkillResults([])
      setCustomSkillSearched(true)
    } finally {
      setCustomSkillLoading(false)
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

  function openEditProfile(c: Candidate) {
    setEditingProfileCt(c.ct_number)
    setEpName(c.name)
    setEpEmail(c.email ?? '')
    setEpPhone(c.phone ?? '')
    setEpCurrentRole(c.current_role ?? '')
    setEpLocation(c.location ?? '')
    setEpCurrentCtc(c.current_ctc ?? '')
    setEpExpectedCtc(c.expected_ctc ?? '')
    setEpNoticePeriod(c.notice_period ?? 'Immediate')
    setEpLinkedinUrl(c.linkedin_url ?? '')
    setEpAdditionalComments(c.additional_comments ?? '')
    setEpError('')
  }

  function cancelEditProfile() {
    setEditingProfileCt(null)
    setEpError('')
  }

  function clearAllFilters() {
    setFilterMinMatch(0)
    setFilterRole('')
    setFilterSkill('')
    setFilterLocation('')
    setFilterStatus('All')
    setFilterRecommendation('All')
    setFilterLinkedInStatus('All')
    setFilterHasLinkedin(false)
  }

  const activeFilterCount = [
    filterMinMatch > 0,
    filterRole.trim() !== '',
    filterSkill.trim() !== '',
    filterLocation.trim() !== '',
    filterStatus !== 'All',
    filterRecommendation !== 'All',
    filterLinkedInStatus !== 'All',
    filterHasLinkedin,
  ].filter(Boolean).length

  async function saveEditProfile(ct: string) {
    setEpLoading(true)
    setEpError('')
    try {
      const res = await axios.put<{ success: boolean; candidate: Candidate }>(
        `${API}/recruiter/candidates/${ct}`,
        {
          name: epName.trim() || undefined,
          email: epEmail.trim() || undefined,
          phone: epPhone.trim() || undefined,
          current_role: epCurrentRole.trim() || undefined,
          location: epLocation.trim() || undefined,
          current_ctc: epCurrentCtc.trim() || undefined,
          expected_ctc: epExpectedCtc.trim() || undefined,
          notice_period: epNoticePeriod || undefined,
          linkedin_url: epLinkedinUrl.trim() || undefined,
          additional_comments: epAdditionalComments.trim() || undefined,
        },
        { headers }
      )
      setCandidates(prev => prev.map(c => {
        if (c.ct_number !== ct) return c
        const updated = res.data.candidate
        return { ...c, ...updated }
      }))
      setEditingProfileCt(null)
      showToast('Profile updated successfully')
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.detail ?? 'Failed to save.' : 'Failed to save.'
      setEpError(String(msg))
    } finally {
      setEpLoading(false)
    }
  }

  return (
    <div>
      <Navbar
        rightContent={<button className="btn btn-secondary" onClick={onLogout}>Logout</button>}
      />
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
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
      {showFilterPanel && (
        <>
          <div
            onClick={() => setShowFilterPanel(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.2)', zIndex: 999 }}
          />
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'fixed', top: 0, right: 0, height: '100vh', width: 320,
              background: '#fff', boxShadow: '-8px 0 32px rgba(0,0,0,0.12)',
              zIndex: 1000, overflowY: 'auto', padding: '24px 20px',
              display: 'flex', flexDirection: 'column', gap: 16,
              transform: 'translateX(0)',
              animation: 'slideInRight 0.25s ease',
            }}
          >
            <style>{`@keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontWeight: 600, fontSize: '1rem', color: '#042C53' }}>Filters</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {activeFilterCount > 0 && (
                  <button
                    onClick={clearAllFilters}
                    style={{ background: 'none', border: 'none', color: '#A32D2D', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                  >
                    Clear All
                  </button>
                )}
                <button
                  onClick={() => setShowFilterPanel(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '1.4rem', lineHeight: 1, padding: 0 }}
                >
                  ×
                </button>
              </div>
            </div>

            <div>
              <label className="role-label">Minimum Match %: {filterMinMatch}%</label>
              <input type="range" min={0} max={100} value={filterMinMatch}
                onChange={e => setFilterMinMatch(Number(e.target.value))}
                onInput={e => setFilterMinMatch(Number((e.target as HTMLInputElement).value))}
                style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--primary)', marginTop: 4 }} />
            </div>
            <div>
              <label className="role-label">Role</label>
              <input className="role-input" placeholder="e.g. Salesforce" value={filterRole} onChange={e => setFilterRole(e.target.value)} style={{ marginTop: 4 }} />
            </div>
            <div>
              <label className="role-label">Skill</label>
              <input className="role-input" placeholder="e.g. Apex, React" value={filterSkill} onChange={e => setFilterSkill(e.target.value)} style={{ marginTop: 4 }} />
            </div>
            <div>
              <label className="role-label">Location</label>
              <input className="role-input" placeholder="e.g. Bangalore" value={filterLocation} onChange={e => setFilterLocation(e.target.value)} style={{ marginTop: 4 }} />
            </div>
            <div>
              <label className="role-label">Status</label>
              <select className="role-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ marginTop: 4 }}>
                <option>All</option>
                <option>Applied</option>
                <option>Shortlisted</option>
                <option>Interview Scheduled</option>
                <option>Interview Complete</option>
                <option>Rejected</option>
              </select>
            </div>
            <div>
              <label className="role-label">AI Recommendation</label>
              <select className="role-select" value={filterRecommendation} onChange={e => setFilterRecommendation(e.target.value)} style={{ marginTop: 4 }}>
                <option>All</option>
                <option>Strong Hire</option>
                <option>Hire</option>
                <option>Consider</option>
                <option>Reject</option>
              </select>
            </div>
            <div>
              <label className="role-label">LinkedIn Status</label>
              <select className="role-select" value={filterLinkedInStatus} onChange={e => setFilterLinkedInStatus(e.target.value)} style={{ marginTop: 4 }}>
                <option>All</option>
                <option>Verified Match</option>
                <option>Mismatch Detected</option>
                <option>Profile Not Found</option>
                <option>No URL</option>
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label className="role-label" style={{ margin: 0 }}>Has LinkedIn URL</label>
              <div
                onClick={() => setFilterHasLinkedin(v => !v)}
                style={{
                  width: 36, height: 20, borderRadius: 10, cursor: 'pointer',
                  background: filterHasLinkedin ? '#0C447C' : '#cbd5e1',
                  position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                }}
              >
                <div style={{
                  position: 'absolute', top: 2, left: filterHasLinkedin ? 18 : 2,
                  width: 16, height: 16, borderRadius: '50%', background: '#fff',
                  transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }} />
              </div>
            </div>
            <div>
              <label className="role-label">Custom Skill Search</label>
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <input
                  className="role-input"
                  placeholder="e.g. Apex, LWC"
                  value={customSkillQuery}
                  onChange={e => setCustomSkillQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && searchCustomSkill()}
                  style={{ flex: 1 }}
                />
                <button className="btn btn-secondary" onClick={searchCustomSkill} disabled={customSkillLoading} style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                  {customSkillLoading ? '…' : 'Search'}
                </button>
              </div>
              {customSkillSearched && (
                <div style={{ marginTop: 8, fontSize: '0.82rem', color: 'var(--muted)' }}>
                  {customSkillResults.length === 0
                    ? 'No candidates found.'
                    : `${customSkillResults.length} candidate${customSkillResults.length !== 1 ? 's' : ''} matched:`}
                  {customSkillResults.map(r => (
                    <div key={r.ct_number} style={{ padding: '4px 0', borderBottom: '1px solid var(--border)', color: 'var(--text)' }}>
                      <span style={{ fontWeight: 600 }}>{r.name}</span>
                      <span className="muted"> · {r.job_title} · {r.combined_score}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {showScheduleModal && (() => {
        const schedCand = candidates.find(c => c.ct_number === scheduleModalCt)
        return (
          <div className="modal-overlay" onClick={closeScheduleModal}>
            <div className="card schedule-modal" onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ margin: 0 }}>Schedule Interview{schedCand ? ` — ${schedCand.name}` : ''}</h3>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '1.5rem', lineHeight: 1 }} onClick={closeScheduleModal}>×</button>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label className="role-label" style={{ marginBottom: 6, display: 'block' }}>Timezone</label>
                <select
                  className="role-select"
                  value={scheduleTimezone}
                  onChange={e => { setScheduleTimezone(e.target.value); setSelectedSlot(''); fetchSlots(scheduleDateSelected, e.target.value) }}
                  style={{ maxWidth: 300 }}
                >
                  {TIMEZONE_OPTIONS.map(tz => (
                    <option key={tz.value} value={tz.value}>{tz.label} — {tz.sub}</option>
                  ))}
                </select>
              </div>

              {availableDates.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <p className="role-label" style={{ marginBottom: 8 }}>Select a date</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {availableDates.map(d => (
                      <button
                        key={d.date}
                        onClick={() => { setScheduleDateSelected(d.date); setSelectedSlot(''); fetchSlots(d.date) }}
                        style={{
                          padding: '7px 14px',
                          borderRadius: 20,
                          border: '1.5px solid',
                          borderColor: scheduleDateSelected === d.date ? 'var(--primary)' : 'var(--border)',
                          background: scheduleDateSelected === d.date ? 'var(--primary)' : 'transparent',
                          color: scheduleDateSelected === d.date ? '#fff' : 'var(--text)',
                          cursor: 'pointer',
                          fontSize: '0.82rem',
                          fontWeight: scheduleDateSelected === d.date ? 600 : 400,
                        }}
                      >
                        {d.display}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {slotsLoading && <p className="muted">Loading available slots...</p>}
                {!slotsLoading && slots.length === 0 && <p className="muted">No available slots for this date.</p>}
                {!slotsLoading && slots.length > 0 && (
                  <div className="slot-grid">
                    {slots.map(s => {
                      const isBooked = !s.available
                      const isSelected = selectedSlot === s.slot
                      const isPopular = !isBooked && schedulePopularSlots.has(s.slot)

                      let bg = '#fff'
                      let borderColor = '#0C447C'
                      let color = '#0C447C'
                      let cursor: React.CSSProperties['cursor'] = 'pointer'
                      let textDecoration = 'none'

                      if (isBooked) {
                        bg = '#F8FAFC'; borderColor = '#e2e8f0'; color = '#94a3b8'
                        cursor = 'not-allowed'; textDecoration = 'line-through'
                      } else if (isSelected) {
                        bg = '#0C447C'; borderColor = '#0C447C'; color = '#fff'
                      } else if (isPopular) {
                        bg = '#E1F5EE'; borderColor = '#0F6E56'; color = '#0F6E56'
                      }

                      return (
                        <div key={s.slot} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <button
                            style={{
                              padding: '8px 4px',
                              borderRadius: 7,
                              border: `1.5px solid ${borderColor}`,
                              background: bg,
                              color,
                              cursor,
                              fontSize: '0.82rem',
                              fontWeight: isSelected ? 600 : 500,
                              textDecoration,
                              transition: 'all 0.15s',
                            }}
                            disabled={isBooked}
                            onClick={() => !isBooked && setSelectedSlot(s.slot)}
                            onMouseEnter={e => {
                              if (!isBooked && !isSelected)
                                (e.target as HTMLButtonElement).style.background = '#EBF4FF'
                            }}
                            onMouseLeave={e => {
                              if (!isBooked && !isSelected)
                                (e.target as HTMLButtonElement).style.background = isPopular ? '#E1F5EE' : '#fff'
                            }}
                          >
                            {s.display}
                          </button>
                          {isBooked && (
                            <span style={{ textAlign: 'center', fontSize: 10, color: '#94a3b8' }}>Booked</span>
                          )}
                          {isPopular && !isBooked && (
                            <span style={{ textAlign: 'center', fontSize: 10, color: '#0F6E56', fontWeight: 500 }}>Popular</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
                {bookSlotError && <p className="error-text">{bookSlotError}</p>}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-primary" onClick={handleBookSlot} disabled={!selectedSlot || bookingLoading}>
                    {bookingLoading ? 'Booking...' : 'Confirm Slot'}
                  </button>
                  <button className="btn btn-secondary" onClick={closeScheduleModal}>Cancel</button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}
      {shortlistConfirm && (
        <div className="modal-overlay" onClick={() => setShortlistConfirm(null)}>
          <div
            className="card"
            style={{ maxWidth: 520, width: '100%', padding: 0, overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', background: '#5B21B6', borderRadius: '12px 12px 0 0' }}>
              <div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: '1rem' }}>Candidate Shortlisted</div>
                <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.82rem' }}>{shortlistConfirm.name}</div>
              </div>
              <button
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontWeight: 600 }}
                onClick={() => setShortlistConfirm(null)}
              >
                Close
              </button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '1.1rem' }}>{shortlistConfirm.emailSent ? '✅' : '⚠️'}</span>
                  <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.9rem' }}>
                    {shortlistConfirm.emailSent ? 'Slot booking email sent' : 'Email not sent'}
                  </span>
                </div>
                {shortlistConfirm.emailTo && (
                  <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.85rem' }}>
                    Sent to: <strong style={{ color: 'var(--text)' }}>{shortlistConfirm.emailTo}</strong>
                  </p>
                )}
                {!shortlistConfirm.emailSent && (
                  <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.82rem' }}>
                    RESEND_API_KEY may not be configured. Share the slot booking link manually.
                  </p>
                )}
              </div>

              <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '1.1rem' }}>📞</span>
                  <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.9rem' }}>AI Call</span>
                </div>
                {shortlistConfirm.callMade ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '1rem' }}>✅</span>
                      <span style={{ fontWeight: 600, color: '#16A34A', fontSize: '0.9rem' }}>Call Initiated Successfully</span>
                    </div>
                    <p style={{ margin: 0, color: 'var(--text)', fontSize: '0.85rem' }}>
                      Rina is calling {shortlistConfirm.name} now
                    </p>
                    <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.82rem' }}>
                      The candidate will receive an automated voice message about their shortlisting.
                    </p>
                    {shortlistConfirm.callSid && (
                      <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                        Call ID: {shortlistConfirm.callSid}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '1rem' }}>⚠️</span>
                      <span style={{ fontWeight: 600, color: '#B45309', fontSize: '0.9rem' }}>Call Could Not Be Made</span>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#FEF3C7', color: '#92400E', fontWeight: 500 }}>Simulation Mode</span>
                    </div>
                    {shortlistConfirm.callError && (
                      <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.85rem' }}>{shortlistConfirm.callError}</p>
                    )}
                    {shortlistConfirm.candidatePhone && (
                      <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.85rem' }}>
                        Please contact the candidate directly on{' '}
                        <strong style={{ color: 'var(--text)' }}>{shortlistConfirm.candidatePhone}</strong>
                      </p>
                    )}
                  </>
                )}
              </div>

              <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '1.1rem' }}>🔗</span>
                  <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.9rem' }}>Slot Booking Link</span>
                </div>
                <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.82rem' }}>Share this link with the candidate to let them pick an interview slot.</p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    readOnly
                    value={shortlistConfirm.slotBookingUrl}
                    style={{ flex: 1, fontSize: '0.78rem', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--muted)', fontFamily: 'monospace' }}
                    onClick={e => (e.target as HTMLInputElement).select()}
                  />
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: '0.8rem', padding: '6px 12px', whiteSpace: 'nowrap' }}
                    onClick={() => navigator.clipboard.writeText(shortlistConfirm.slotBookingUrl)}
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="dash-subheader">
        <h1 className="title" style={{ fontSize: '1.6rem' }}>Recruiter Dashboard</h1>
        <div className="dash-header-actions">
          {tab === 'candidates' && (
            <>
              <button className="btn btn-secondary" onClick={() => { fetchCandidates(); fetchAnalytics() }}>Refresh</button>
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
          {tab === 'internal' && (
            <button className="btn btn-secondary" onClick={fetchInternalRecords}>Refresh</button>
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
        <button className={`tab-btn${tab === 'internal' ? ' tab-btn--active' : ''}`} onClick={() => setTab('internal')}>
          Internal Apply
        </button>
      </div>

      {tab === 'candidates' && (
        <>
          {showCandidateForm && (
            <div className="card">
              <h3 style={{ marginBottom: 16, color: 'var(--text)' }}>Add Candidate</h3>
              <div className="form-grid">
                <div className="role-select-group">
                  <label className="role-label">Full Name *</label>
                  <input className="role-input" placeholder="Jane Smith" value={acFullName} onChange={e => setAcFullName(e.target.value)} />
                </div>
                <div className="role-select-group">
                  <label className="role-label">Email *</label>
                  <input className="role-input" type="email" placeholder="jane@example.com" value={acEmail} onChange={e => setAcEmail(e.target.value)} />
                </div>
                <div className="role-select-group">
                  <label className="role-label">LinkedIn Profile URL</label>
                  <input className="role-input" placeholder="https://linkedin.com/in/..." value={acLinkedin} onChange={e => setAcLinkedin(e.target.value)} />
                </div>
                <div className="role-select-group">
                  <label className="role-label">Phone *</label>
                  <input className="role-input" placeholder="+91 98765 43210" value={acPhone} onChange={e => setAcPhone(e.target.value)} />
                </div>
                <div className="role-select-group">
                  <label className="role-label">Current Location *</label>
                  <input className="role-input" placeholder="e.g. Bangalore, India" value={acLocation} onChange={e => setAcLocation(e.target.value)} />
                </div>
                <div className="role-select-group">
                  <label className="role-label">Current Role *</label>
                  <input className="role-input" placeholder="e.g. Senior Software Engineer" value={acCurrentRole} onChange={e => setAcCurrentRole(e.target.value)} />
                </div>
                <div className="role-select-group">
                  <label className="role-label">Current CTC *</label>
                  <input className="role-input" placeholder="e.g. 12 LPA" value={acCurrentCtc} onChange={e => setAcCurrentCtc(e.target.value)} />
                </div>
                <div className="role-select-group">
                  <label className="role-label">Expected CTC *</label>
                  <input className="role-input" placeholder="e.g. 18 LPA" value={acExpectedCtc} onChange={e => setAcExpectedCtc(e.target.value)} />
                </div>
                <div className="role-select-group">
                  <label className="role-label">Notice Period *</label>
                  <select className="role-select" value={acNoticePeriod} onChange={e => setAcNoticePeriod(e.target.value)}>
                    <option>Immediate</option>
                    <option>Up to 15 days</option>
                    <option>Up to 30 days</option>
                    <option>Up to 60 days</option>
                    <option>Up to 90 days</option>
                    <option>Flexible</option>
                  </select>
                </div>
                <div className="role-select-group">
                  <label className="role-label">Job Role *</label>
                  <select className="role-select" value={acJobId} onChange={e => setAcJobId(e.target.value)}>
                    <option value="">— Select a job —</option>
                    {openJobs.map(j => (
                      <option key={j.id} value={j.id}>{j.title}</option>
                    ))}
                  </select>
                </div>
                <div className="role-select-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="role-label">Resume (PDF or TXT) *</label>
                  <div
                    className="resume-upload-area"
                    onClick={() => acResumeRef.current?.click()}
                  >
                    <input
                      ref={acResumeRef}
                      type="file"
                      accept=".pdf,.txt"
                      style={{ display: 'none' }}
                      onChange={e => setAcResume(e.target.files?.[0] ?? null)}
                    />
                    {acResume ? (
                      <span style={{ color: 'var(--text)' }}>{acResume.name}</span>
                    ) : (
                      <span style={{ color: 'var(--muted)' }}>Click to upload resume (PDF or TXT)&hellip;</span>
                    )}
                  </div>
                  {acResume && (
                    <button
                      style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '0.8rem', cursor: 'pointer', padding: 0, marginTop: 4, textAlign: 'left' }}
                      onClick={() => { setAcResume(null); if (acResumeRef.current) acResumeRef.current.value = '' }}
                    >
                      Remove file
                    </button>
                  )}
                </div>
                <div className="role-select-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="role-label">Additional Comments</label>
                  <textarea
                    className="role-textarea"
                    rows={4}
                    placeholder="Any additional information about the candidate (optional)..."
                    value={acAdditionalComments}
                    onChange={e => setAcAdditionalComments(e.target.value)}
                  />
                </div>
              </div>
              {candidateFormError && <p className="error-text" style={{ marginTop: 12 }}>{candidateFormError}</p>}
              <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={handleCreateCandidate} disabled={candidateFormLoading}>
                {candidateFormLoading ? 'Adding...' : 'Add Candidate'}
              </button>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: -8 }}>
          {!analyticsLoading && analytics && <PipelineWidget analytics={analytics} />}

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <h3 style={{ color: 'var(--text)', margin: 0 }}>
                    {filteredCandidates.length} candidate{filteredCandidates.length !== 1 ? 's' : ''} found
                    {filteredCandidates.length !== candidates.length && ` (of ${candidates.length})`}
                  </h3>
                  <button
                    ref={filterBtnRef as React.RefObject<HTMLButtonElement>}
                    onClick={() => setShowFilterPanel(v => !v)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
                      border: '1.5px solid #0C447C',
                      background: activeFilterCount > 0 ? '#0C447C' : 'transparent',
                      color: activeFilterCount > 0 ? '#fff' : '#0C447C',
                      fontWeight: 600, fontSize: '0.85rem', flexShrink: 0,
                      transition: 'all 0.15s',
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
                    </svg>
                    {activeFilterCount > 0 ? `Filters (${activeFilterCount})` : 'Filters'}
                  </button>
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
                              <td onClick={e => e.stopPropagation()}>{matchBadge(c.combined_score ?? c.match_percentage, !!c.linkedin_analysis?.overall_score)}</td>
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
                                      className="btn"
                                      style={{ background: '#5B21B6', color: '#fff', padding: '6px 12px', fontSize: '0.82rem', borderRadius: 8, border: 'none', cursor: 'pointer' }}
                                      disabled={shortlistingCt === c.ct_number}
                                      onClick={() => handleShortlist(c.ct_number)}
                                    >
                                      {shortlistingCt === c.ct_number ? '...' : 'Shortlist'}
                                    </button>
                                    <button className="btn btn-danger" style={{ padding: '6px 12px', fontSize: '0.82rem', alignSelf: 'unset' }} disabled={actionCt === c.ct_number} onClick={() => handleReject(c.ct_number)}>Reject</button>
                                  </div>
                                )}
                                {c.status === 'shortlisted' && (
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.82rem' }} onClick={() => openScheduleModal(c.ct_number)}>Schedule</button>
                                    <button className="btn btn-danger" style={{ padding: '6px 12px', fontSize: '0.82rem', alignSelf: 'unset' }} disabled={actionCt === c.ct_number} onClick={() => handleReject(c.ct_number)}>Reject</button>
                                  </div>
                                )}
                                {c.status === 'interview_scheduled' && (
                                  <button className="btn btn-secondary" style={{ padding: '6px 14px', fontSize: '0.82rem' }} onClick={() => openScheduleModal(c.ct_number)}>Reschedule</button>
                                )}
                                {c.status === 'interview_complete' && (
                                  <button className="btn btn-secondary" style={{ padding: '6px 14px', fontSize: '0.82rem' }} onClick={() => onViewScorecard(c.ct_number)}>View Feedback</button>
                                )}
                              </td>
                            </tr>

                            {expandedCt === c.ct_number && (
                              <tr key={`${c.ct_number}-detail`}>
                                <td colSpan={6} style={{ padding: 0, background: 'var(--surface-2)' }}>
                                  <div className="candidate-panel">

                                    {editingProfileCt === c.ct_number ? (
                                      /* ── Edit Profile Form ── */
                                      <div>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                          <h4 style={{ margin: 0, color: 'var(--text)' }}>Edit Profile — {c.name}</h4>
                                          <button className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '5px 12px' }} onClick={cancelEditProfile}>Cancel</button>
                                        </div>
                                        <div className="form-grid">
                                          <div className="role-select-group">
                                            <label className="role-label">Full Name</label>
                                            <input className="role-input" value={epName} onChange={e => setEpName(e.target.value)} />
                                          </div>
                                          <div className="role-select-group">
                                            <label className="role-label">Email</label>
                                            <input className="role-input" type="email" value={epEmail} onChange={e => setEpEmail(e.target.value)} />
                                          </div>
                                          <div className="role-select-group">
                                            <label className="role-label">Phone</label>
                                            <input className="role-input" value={epPhone} onChange={e => setEpPhone(e.target.value)} />
                                          </div>
                                          <div className="role-select-group">
                                            <label className="role-label">Current Role</label>
                                            <input className="role-input" value={epCurrentRole} onChange={e => setEpCurrentRole(e.target.value)} />
                                          </div>
                                          <div className="role-select-group">
                                            <label className="role-label">Location</label>
                                            <input className="role-input" value={epLocation} onChange={e => setEpLocation(e.target.value)} />
                                          </div>
                                          <div className="role-select-group">
                                            <label className="role-label">Current CTC</label>
                                            <input className="role-input" value={epCurrentCtc} onChange={e => setEpCurrentCtc(e.target.value)} />
                                          </div>
                                          <div className="role-select-group">
                                            <label className="role-label">Expected CTC</label>
                                            <input className="role-input" value={epExpectedCtc} onChange={e => setEpExpectedCtc(e.target.value)} />
                                          </div>
                                          <div className="role-select-group">
                                            <label className="role-label">Notice Period</label>
                                            <select className="role-select" value={epNoticePeriod} onChange={e => setEpNoticePeriod(e.target.value)}>
                                              <option>Immediate</option>
                                              <option>Up to 15 days</option>
                                              <option>Up to 30 days</option>
                                              <option>Up to 60 days</option>
                                              <option>Up to 90 days</option>
                                              <option>Flexible</option>
                                            </select>
                                          </div>
                                          <div className="role-select-group" style={{ gridColumn: '1 / -1' }}>
                                            <label className="role-label">LinkedIn URL</label>
                                            <input className="role-input" placeholder="https://linkedin.com/in/..." value={epLinkedinUrl} onChange={e => setEpLinkedinUrl(e.target.value)} />
                                          </div>
                                          <div className="role-select-group" style={{ gridColumn: '1 / -1' }}>
                                            <label className="role-label">Additional Comments</label>
                                            <textarea className="role-textarea" rows={3} value={epAdditionalComments} onChange={e => setEpAdditionalComments(e.target.value)} />
                                          </div>
                                        </div>
                                        {epError && <p className="error-text" style={{ marginTop: 10 }}>{epError}</p>}
                                        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                                          <button className="btn btn-primary" style={{ fontSize: '0.875rem', padding: '8px 20px' }} disabled={epLoading} onClick={() => saveEditProfile(c.ct_number)}>
                                            {epLoading ? 'Saving…' : 'Save Changes'}
                                          </button>
                                          <button className="btn btn-secondary" style={{ fontSize: '0.875rem', padding: '8px 20px' }} onClick={cancelEditProfile}>Cancel</button>
                                        </div>
                                      </div>
                                    ) : (
                                      /* ── Detail View ── */
                                      <>
                                        {/* Header row with Edit Profile button */}
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
                                          <button
                                            className="btn btn-secondary"
                                            style={{ fontSize: '0.8rem', padding: '5px 14px' }}
                                            onClick={e => { e.stopPropagation(); openEditProfile(c) }}
                                          >
                                            Edit Profile
                                          </button>
                                        </div>

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
                                                {c.combined_score ?? c.match_percentage}%
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

                                        {/* LinkedIn Analysis Widget */}
                                        <div style={{ marginTop: 16 }}>
                                          {c.linkedin_analysis ? (
                                            <LinkedInWidget
                                              linkedin_analysis={c.linkedin_analysis}
                                              combined_score={c.combined_score}
                                              match_percentage={c.match_percentage}
                                              onScan={c.linkedin_url ? () => scanLinkedIn(c.ct_number) : undefined}
                                              scanning={scanningCt === c.ct_number}
                                            />
                                          ) : c.linkedin_url ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff' }}>
                                              <div style={{
                                                width: 26, height: 26, borderRadius: 4, background: '#0A66C2', color: '#fff',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontWeight: 700, fontSize: 13, flexShrink: 0, fontFamily: 'Georgia, serif',
                                              }}>in</div>
                                              <span style={{ fontSize: '0.85rem', color: '#042C53', fontWeight: 500, flex: 1 }}>LinkedIn not yet scanned</span>
                                              <button
                                                onClick={() => scanLinkedIn(c.ct_number)}
                                                disabled={scanningCt === c.ct_number}
                                                style={{
                                                  background: 'none', border: '1px solid #0C447C', color: '#0C447C',
                                                  borderRadius: 6, padding: '4px 12px', fontSize: '0.8rem', fontWeight: 600,
                                                  cursor: scanningCt === c.ct_number ? 'not-allowed' : 'pointer',
                                                  opacity: scanningCt === c.ct_number ? 0.6 : 1,
                                                }}
                                              >
                                                {scanningCt === c.ct_number ? 'Scanning...' : '🔍 Scan LinkedIn'}
                                              </button>
                                            </div>
                                          ) : null}
                                        </div>

                                        {/* Match Score Breakdown Widget */}
                                        <div style={{ marginTop: 16 }}>
                                          <MatchScoreWidget c={c} />
                                        </div>

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

                                        {c.call_status && (() => {
                                          const cs = c.call_status
                                          const steps = [
                                            { label: 'Call Made', done: cs.call_made === true, ts: cs.call_made_at },
                                            { label: 'Call Answered', done: cs.call_answered === true, ts: cs.call_answered_at },
                                            { label: 'Call Complete', done: cs.call_complete === true && cs.call_answered === true, ts: cs.call_complete_at },
                                          ]
                                          return (
                                            <div style={{ marginTop: 16, border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 18px', background: '#fff' }}>
                                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                                                <span style={{ fontSize: '0.95rem' }}>📞</span>
                                                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#042C53' }}>Call Status</span>
                                              </div>
                                              <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                                                {steps.map((step, i) => (
                                                  <>
                                                    <div key={step.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 80 }}>
                                                      <div style={{
                                                        width: 28, height: 28, borderRadius: '50%',
                                                        background: step.done ? '#0F6E56' : 'transparent',
                                                        border: step.done ? 'none' : '2px solid #cbd5e1',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        flexShrink: 0,
                                                      }}>
                                                        {step.done && <span style={{ color: '#fff', fontSize: 13, lineHeight: 1 }}>✓</span>}
                                                      </div>
                                                      <span style={{ fontSize: 11, fontWeight: step.done ? 600 : 400, color: step.done ? '#042C53' : '#94a3b8', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                        {step.label}
                                                      </span>
                                                      {step.done && step.ts && (
                                                        <span style={{ fontSize: 10, color: '#94a3b8', textAlign: 'center' }}>
                                                          {new Date(step.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                      )}
                                                    </div>
                                                    {i < steps.length - 1 && (
                                                      <div key={`line-${i}`} style={{
                                                        flex: 1, height: 2, marginBottom: 20,
                                                        background: (step.done && steps[i + 1].done) ? '#0F6E56' : '#e2e8f0',
                                                      }} />
                                                    )}
                                                  </>
                                                ))}
                                              </div>
                                              {cs.note && !cs.call_answered && (
                                                <div style={{ marginTop: 12, background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 7, padding: '8px 12px', fontSize: '0.8rem', color: '#92400E' }}>
                                                  Candidate did not answer. Email sent with slot booking link.
                                                </div>
                                              )}
                                              {cs.message_delivered && (
                                                <div style={{ marginTop: 12, background: '#E1F5EE', border: '1px solid #BBF7D0', borderRadius: 7, padding: '8px 12px', fontSize: '0.8rem', color: '#0F6E56', fontWeight: 500 }}>
                                                  Core message delivered successfully.
                                                </div>
                                              )}
                                            </div>
                                          )
                                        })()}

                                        <div className="candidate-panel-actions">
                                          {c.status === 'applied' && (
                                            <>
                                              <button
                                                className="btn"
                                                style={{ background: '#5B21B6', color: '#fff', fontSize: '0.875rem', padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer' }}
                                                disabled={shortlistingCt === c.ct_number}
                                                onClick={e => { e.stopPropagation(); handleShortlist(c.ct_number) }}
                                              >
                                                {shortlistingCt === c.ct_number ? 'Shortlisting…' : 'Shortlist'}
                                              </button>
                                              <button className="btn btn-danger" style={{ fontSize: '0.875rem', padding: '8px 20px', alignSelf: 'unset' }} disabled={actionCt === c.ct_number} onClick={e => { e.stopPropagation(); handleReject(c.ct_number) }}>Reject</button>
                                            </>
                                          )}
                                          {c.status === 'shortlisted' && (
                                            <>
                                              <button className="btn btn-primary" style={{ fontSize: '0.875rem', padding: '8px 20px' }} onClick={e => { e.stopPropagation(); openScheduleModal(c.ct_number) }}>Schedule Interview</button>
                                              <button className="btn btn-danger" style={{ fontSize: '0.875rem', padding: '8px 20px', alignSelf: 'unset' }} disabled={actionCt === c.ct_number} onClick={e => { e.stopPropagation(); handleReject(c.ct_number) }}>Reject</button>
                                            </>
                                          )}
                                          {c.status === 'interview_scheduled' && (
                                            <button className="btn btn-secondary" style={{ fontSize: '0.875rem', padding: '8px 20px' }} onClick={e => { e.stopPropagation(); openScheduleModal(c.ct_number) }}>Reschedule</button>
                                          )}
                                          {c.status === 'interview_complete' && (
                                            <button className="btn btn-secondary" style={{ fontSize: '0.875rem', padding: '8px 20px' }} onClick={e => { e.stopPropagation(); onViewScorecard(c.ct_number) }}>View Feedback</button>
                                          )}
                                          {c.resume_text && (
                                            <button className="btn btn-secondary" style={{ fontSize: '0.875rem', padding: '8px 20px' }} onClick={e => { e.stopPropagation(); handleViewResume(c) }}>View Resume</button>
                                          )}
                                        </div>
                                      </>
                                    )}

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

      {tab === 'internal' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ color: 'var(--text)' }}>Internal Applications &amp; Referrals ({internalRecords.length})</h3>
            <p className="muted" style={{ fontSize: '0.85rem', marginTop: 4 }}>
              Employee-submitted internal applications and referrals. These do not trigger AI interview calls.
            </p>
          </div>
          {internalLoading ? (
            <p className="muted" style={{ padding: 24 }}>Loading...</p>
          ) : internalRecords.length === 0 ? (
            <p className="muted" style={{ padding: 24 }}>No internal applications or referrals yet.</p>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Employee</th>
                    <th>Role</th>
                    <th>Candidate</th>
                    <th>Note</th>
                    <th>Status</th>
                    <th>Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {internalRecords.map(item => (
                    <tr key={item.id}>
                      <td>{item.type === 'internal_apply' ? 'Internal Apply' : 'Referral'}</td>
                      <td style={{ fontWeight: 600 }}>{item.employee_id}</td>
                      <td>
                        <strong>{item.job_title}</strong>
                        <div className="muted" style={{ fontSize: '0.78rem' }}>{item.job_id}</div>
                      </td>
                      <td>
                        {item.type === 'referral' ? (
                          <>
                            <strong>{item.candidate_name}</strong>
                            <div className="muted" style={{ fontSize: '0.78rem' }}>
                              {item.candidate_email}{item.candidate_phone ? ` / ${item.candidate_phone}` : ''}
                            </div>
                          </>
                        ) : (
                          <span className="muted">Employee self-apply</span>
                        )}
                      </td>
                      <td style={{ color: 'var(--muted)', maxWidth: 260 }}>{item.note || '-'}</td>
                      <td><span className="badge badge--blue">{item.status}</span></td>
                      <td>{new Date(item.created_at).toLocaleDateString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
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
                <div className="role-select-group">
                  <label className="role-label" style={{ color: '#B91C1C' }}>Must-Have Skills <span style={{ fontWeight: 400, fontSize: '0.78rem' }}>(type + Enter)</span></label>
                  <TagInput tags={jMustHaveSkills} onChange={setJMustHaveSkills} placeholder="Add skill…" color="red" />
                </div>
                <div className="role-select-group">
                  <label className="role-label" style={{ color: '#1D4ED8' }}>Good-to-Have Skills <span style={{ fontWeight: 400, fontSize: '0.78rem' }}>(type + Enter)</span></label>
                  <TagInput tags={jGoodToHaveSkills} onChange={setJGoodToHaveSkills} placeholder="Add skill…" color="blue" />
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
                <div className="role-select-group">
                  <label className="role-label" style={{ color: '#B91C1C' }}>Must-Have Skills</label>
                  <TagInput tags={editMustHaveSkills} onChange={setEditMustHaveSkills} placeholder="Add skill…" color="red" />
                </div>
                <div className="role-select-group">
                  <label className="role-label" style={{ color: '#1D4ED8' }}>Good-to-Have Skills</label>
                  <TagInput tags={editGoodToHaveSkills} onChange={setEditGoodToHaveSkills} placeholder="Add skill…" color="blue" />
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
                        <td>
                          <div style={{ fontWeight: 500 }}>{j.title}</div>
                          {j.job_code && <div style={{ fontSize: '0.75rem', color: 'var(--muted)', fontFamily: 'monospace', marginTop: 2 }}>{j.job_code}</div>}
                        </td>
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

      {toast && (
        <div style={{
          position: 'fixed',
          bottom: 28,
          right: 28,
          background: '#16A34A',
          color: '#fff',
          padding: '12px 20px',
          borderRadius: 10,
          fontWeight: 500,
          fontSize: '0.9rem',
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          maxWidth: 360,
          lineHeight: 1.4,
        }}>
          ✓ {toast}
        </div>
      )}
    </div>
  )
}
