import { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import { API_BASE_URL as API } from '../config'
import PageLayout from '../components/PageLayout'

export type Job = {
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

type Props = {
  onSelectJob: (job: Job) => void
  onCandidateLoginClick: () => void
  onRecruiterLoginClick: () => void
  onInternalLoginClick: () => void
  onHome?: () => void
}

const WORK_TYPES = ['All Types', 'Remote', 'Hybrid', 'On-site']
const LOCATIONS = ['All Locations', 'Bangalore', 'Mumbai', 'Pune', 'Delhi', 'Remote']
const DEPARTMENTS = ['All Departments', 'Engineering', 'Salesforce', 'Design', 'Marketing', 'HR', 'Finance', 'Operations', 'Product', 'QA', 'Sales Operations']
const EXPERIENCES = ['Any Experience', '0-2 years', '2-4 years', '2-5 years', '3-5 years', '3-6 years', '4-6 years', '4-7 years', '5-8 years', '5+ years']

export default function JobListings({ onSelectJob, onCandidateLoginClick, onRecruiterLoginClick, onInternalLoginClick, onHome }: Props) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)

  const [filterSearch, setFilterSearch] = useState('')
  const [filterWorkType, setFilterWorkType] = useState('All Types')
  const [filterLocation, setFilterLocation] = useState('All Locations')
  const [filterDepartment, setFilterDepartment] = useState('All Departments')
  const [filterExperience, setFilterExperience] = useState('Any Experience')

  useEffect(() => {
    axios.get<Job[]>(`${API}/jobs`)
      .then(res => setJobs(res.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const hasActiveFilters = filterSearch.trim() !== '' || filterWorkType !== 'All Types' || filterLocation !== 'All Locations' || filterDepartment !== 'All Departments' || filterExperience !== 'Any Experience'

  const filteredJobs = useMemo(() => {
    let result = jobs
    if (filterSearch.trim()) {
      const s = filterSearch.toLowerCase()
      result = result.filter(j =>
        j.title.toLowerCase().includes(s) ||
        j.description.toLowerCase().includes(s) ||
        j.requirements.some(r => r.toLowerCase().includes(s))
      )
    }
    if (filterWorkType !== 'All Types') {
      const wt = filterWorkType.toLowerCase()
      result = result.filter(j => j.location.toLowerCase().includes(wt) || j.job_type.toLowerCase().includes(wt))
    }
    if (filterLocation !== 'All Locations') {
      const loc = filterLocation.toLowerCase()
      result = result.filter(j => j.location.toLowerCase().includes(loc))
    }
    if (filterDepartment !== 'All Departments') {
      const dept = filterDepartment.toLowerCase()
      result = result.filter(j => j.department.toLowerCase().includes(dept))
    }
    if (filterExperience !== 'Any Experience') {
      result = result.filter(j => j.experience === filterExperience)
    }
    return result
  }, [jobs, filterSearch, filterWorkType, filterLocation, filterDepartment, filterExperience])

  function clearFilters() {
    setFilterSearch('')
    setFilterWorkType('All Types')
    setFilterLocation('All Locations')
    setFilterDepartment('All Departments')
    setFilterExperience('Any Experience')
  }

  const selectStyle: React.CSSProperties = {
    padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)',
    background: 'var(--bg)', color: 'var(--text)', fontSize: '0.85rem',
    cursor: 'pointer', outline: 'none', fontFamily: 'inherit',
  }

  return (
    <PageLayout
      navbar={{
        onHome,
        showLoginButtons: true,
        onCandidateLogin: onCandidateLoginClick,
        onRecruiterLogin: onRecruiterLoginClick,
        onInternalLogin: onInternalLoginClick,
      }}
    >
      <div>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text)' }}>Open Positions</h1>
        <p className="muted" style={{ marginTop: 6 }}>
          Join our team — find a role that fits your skills and ambitions.
        </p>
      </div>

      {/* Filter bar */}
      <div style={{
        background: '#fff', borderRadius: 10, padding: '14px 18px',
        border: '1px solid #e2e8f0', marginBottom: 8,
        display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 180 }}>
          <svg
            style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }}
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            style={{ ...selectStyle, paddingLeft: 30, width: '100%', boxSizing: 'border-box' }}
            placeholder="Search roles, skills..."
            value={filterSearch}
            onChange={e => setFilterSearch(e.target.value)}
          />
        </div>

        <select style={selectStyle} value={filterWorkType} onChange={e => setFilterWorkType(e.target.value)}>
          {WORK_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>

        <select style={selectStyle} value={filterLocation} onChange={e => setFilterLocation(e.target.value)}>
          {LOCATIONS.map(l => <option key={l}>{l}</option>)}
        </select>

        <select style={selectStyle} value={filterDepartment} onChange={e => setFilterDepartment(e.target.value)}>
          {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
        </select>

        <select style={selectStyle} value={filterExperience} onChange={e => setFilterExperience(e.target.value)}>
          {EXPERIENCES.map(e => <option key={e}>{e}</option>)}
        </select>

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600, padding: '4px 2px', whiteSpace: 'nowrap' }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Count line */}
      {!loading && (
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 4 }}>
          {filteredJobs.length} job{filteredJobs.length !== 1 ? 's' : ''} found
          {filteredJobs.length !== jobs.length && ` (of ${jobs.length})`}
        </p>
      )}

      {loading ? (
        <p className="muted" style={{ textAlign: 'center', padding: '40px 0' }}>Loading jobs...</p>
      ) : filteredJobs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <p className="muted" style={{ marginBottom: 12 }}>
            {jobs.length === 0 ? 'No open positions at the moment.' : 'No jobs match your filters.'}
          </p>
          {hasActiveFilters && (
            <button className="btn btn-secondary" onClick={clearFilters}>Clear filters</button>
          )}
        </div>
      ) : (
        <div className="jobs-grid">
          {filteredJobs.map(job => (
            <div key={job.id} className="job-card" onClick={() => onSelectJob(job)}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="job-dept-badge">{job.department}</span>
                {job.job_code && (
                  <span style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>
                    Job ID: {job.job_code}
                  </span>
                )}
              </div>
              <h2 className="job-card-title">{job.title}</h2>
              <div className="job-meta">
                <span className="job-meta-item">{job.location}</span>
                <span className="job-meta-sep">·</span>
                <span className="job-meta-item">{job.job_type}</span>
                <span className="job-meta-sep">·</span>
                <span className="job-meta-item">{job.experience}</span>
              </div>
              <p className="job-desc-preview">
                {job.description.slice(0, 100)}{job.description.length > 100 ? '...' : ''}
              </p>
              <button className="btn btn-primary" style={{ marginTop: 4 }} onClick={e => { e.stopPropagation(); onSelectJob(job) }}>
                View &amp; Apply
              </button>
            </div>
          ))}
        </div>
      )}
    </PageLayout>
  )
}
