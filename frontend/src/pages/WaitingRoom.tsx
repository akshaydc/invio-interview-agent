import { useState, useEffect } from 'react'
import axios from 'axios'
import Navbar from '../components/Navbar'
import { API_BASE_URL as API } from '../config'

type SlotOption = { slot: string; display: string }

type Props = {
  candidateName: string
  interviewSlot: string
  token: string
  onStartInterview: () => void
  onLogout: () => void
}

function formatFullSlot(slot: string): string {
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

function getSecondsUntilSlot(slot: string): number {
  try {
    const [datePart, timePart] = slot.split(' ')
    const [year, month, day] = datePart.split('-').map(Number)
    const [hour, minute] = timePart.split(':').map(Number)
    return Math.floor((new Date(year, month - 1, day, hour, minute).getTime() - Date.now()) / 1000)
  } catch {
    return -1
  }
}

export default function WaitingRoom({ candidateName, interviewSlot, token, onStartInterview, onLogout }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(() => getSecondsUntilSlot(interviewSlot))
  const [showReschedule, setShowReschedule] = useState(false)
  const [slots, setSlots] = useState<SlotOption[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState('')
  const [rescheduling, setRescheduling] = useState(false)
  const [rescheduleError, setRescheduleError] = useState('')

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft(getSecondsUntilSlot(interviewSlot))
    }, 1000)
    return () => clearInterval(interval)
  }, [interviewSlot])

  async function fetchSlots() {
    setSlotsLoading(true)
    try {
      const res = await axios.get<{ available_slots: SlotOption[] }>(
        `${API}/candidate/slots`,
        { headers: { 'X-Auth-Token': token } }
      )
      setSlots(res.data.available_slots.filter(s => s.slot !== interviewSlot))
    } catch {
      // silent
    } finally {
      setSlotsLoading(false)
    }
  }

  function handleOpenReschedule() {
    setShowReschedule(true)
    setSelectedSlot('')
    setRescheduleError('')
    fetchSlots()
  }

  async function handleReschedule() {
    if (!selectedSlot) return
    setRescheduling(true)
    setRescheduleError('')
    try {
      await axios.post(`${API}/candidate/reschedule`, { new_slot: selectedSlot }, { headers: { 'X-Auth-Token': token } })
      window.location.reload()
    } catch {
      setRescheduleError('Could not reschedule. Please try again.')
      setRescheduling(false)
    }
  }

  const canStart = secondsLeft <= 120
  const absSeconds = Math.abs(secondsLeft)
  const hours = Math.floor(absSeconds / 3600)
  const minutes = Math.floor((absSeconds % 3600) / 60)
  const seconds = absSeconds % 60
  const countdownText = secondsLeft <= 0
    ? 'Interview time!'
    : hours > 0
    ? `${hours}h ${minutes}m`
    : `${minutes}m ${String(seconds).padStart(2, '0')}s`

  return (
    <>
      <Navbar rightContent={<button className="btn btn-secondary" onClick={onLogout}>Exit</button>} />
      <main style={{ maxWidth: 600, margin: '0 auto', padding: '40px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div className="card" style={{ textAlign: 'center', padding: '40px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: '2.5rem' }}>🕐</div>
          <h2 style={{ margin: 0 }}>Hi {candidateName}, your interview is scheduled</h2>
          <div style={{
            background: 'var(--primary-bg)',
            border: '1px solid var(--primary-border)',
            borderRadius: 10,
            padding: '12px 24px',
            color: 'var(--primary-light)',
            fontWeight: 600,
            fontSize: '1rem',
          }}>
            {formatFullSlot(interviewSlot)}
          </div>
          {!canStart && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <p className="muted" style={{ marginBottom: 4 }}>Interview starts in</p>
              <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: '2.5rem',
                fontWeight: 700,
                color: 'var(--primary)',
                letterSpacing: '0.04em',
              }}>
                {countdownText}
              </div>
            </div>
          )}
          {canStart && (
            <button className="btn btn-primary" style={{ fontSize: '1rem', padding: '12px 32px' }} onClick={onStartInterview}>
              Start Interview
            </button>
          )}
          <button className="btn btn-secondary" style={{ fontSize: '0.875rem' }} onClick={handleOpenReschedule}>
            Reschedule Interview
          </button>
        </div>

        {showReschedule && (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h3 style={{ margin: 0 }}>Pick a new time slot</h3>
            {slotsLoading && <p className="muted">Loading slots...</p>}
            {!slotsLoading && slots.length === 0 && (
              <p className="muted">No other slots available today.</p>
            )}
            {!slotsLoading && slots.length > 0 && (
              <div className="slot-grid">
                {slots.map(s => (
                  <button
                    key={s.slot}
                    className={`slot-cell slot-cell--available${selectedSlot === s.slot ? ' slot-cell--selected' : ''}`}
                    onClick={() => setSelectedSlot(s.slot)}
                  >
                    {s.display}
                  </button>
                ))}
              </div>
            )}
            {rescheduleError && <p className="error-text">{rescheduleError}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" onClick={handleReschedule} disabled={!selectedSlot || rescheduling}>
                {rescheduling ? 'Rescheduling...' : 'Confirm'}
              </button>
              <button className="btn btn-secondary" onClick={() => setShowReschedule(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </main>
    </>
  )
}
