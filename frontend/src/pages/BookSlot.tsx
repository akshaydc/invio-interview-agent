import { useState, useEffect } from 'react'
import axios from 'axios'
import { API_BASE_URL as API } from '../config'
import Navbar from '../components/Navbar'

type SlotOption = { slot: string; display: string; available?: boolean; booked_by?: string | null }
type DateOption = { date: string; display: string; slot_count: number; slots: SlotOption[] }

const TIMEZONE_OPTIONS = [
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (IST)', sub: 'UTC+5:30' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (GST)', sub: 'UTC+4:00' },
  { value: 'Europe/London', label: 'Europe/London (GMT)', sub: 'UTC+0:00' },
  { value: 'America/New_York', label: 'America/New_York (EST)', sub: 'UTC-5:00' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (PST)', sub: 'UTC-8:00' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (SGT)', sub: 'UTC+8:00' },
]

export default function BookSlot() {
  const params = new URLSearchParams(window.location.search)
  const token = params.get('token') ?? ''
  const ct = params.get('ct') ?? ''

  const [name, setName] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [availableDates, setAvailableDates] = useState<DateOption[]>([])
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedSlot, setSelectedSlot] = useState('')
  const [timezone, setTimezone] = useState('Asia/Kolkata')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [confirmedSlotDisplay, setConfirmedSlotDisplay] = useState('')

  function buildUrl() {
    return `${API}/book-slot/available?token=${encodeURIComponent(token)}&ct=${encodeURIComponent(ct)}&timezone=${encodeURIComponent(timezone)}`
  }

  useEffect(() => {
    if (!token || !ct) {
      setError('This link is invalid or has expired.')
      setLoading(false)
      return
    }
    setLoading(true)
    setSelectedSlot('')
    axios
      .get<{ name: string; job_title: string; available_dates: DateOption[] }>(buildUrl())
      .then(res => {
        setName(res.data.name)
        setJobTitle(res.data.job_title)
        setAvailableDates(res.data.available_dates)
        if (res.data.available_dates.length > 0) {
          setSelectedDate(res.data.available_dates[0].date)
        }
      })
      .catch(() => setError('This link is invalid or has expired.'))
      .finally(() => setLoading(false))
  }, [token, ct, timezone])

  const currentDateData = availableDates.find(d => d.date === selectedDate)

  // First 3 available slots are "popular"
  const popularSlots = new Set<string>()
  if (currentDateData) {
    let count = 0
    for (const s of currentDateData.slots) {
      if (s.available !== false && count < 3) {
        popularSlots.add(s.slot)
        count++
      }
    }
  }

  async function handleConfirm() {
    if (!selectedSlot) return
    setConfirming(true)
    setError('')
    try {
      const res = await axios.post<{ success: boolean; slot: string; slot_display: string }>(
        `${API}/book-slot/confirm`,
        { token, ct_number: ct, slot: selectedSlot }
      )
      setConfirmedSlotDisplay(res.data.slot_display)
      setConfirmed(true)
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.detail ?? 'Booking failed.' : 'Booking failed.'
      setError(String(msg))
    } finally {
      setConfirming(false)
    }
  }

  if (loading) {
    return (
      <>
        <Navbar />
        <main style={{ maxWidth: 600, margin: '0 auto', padding: '40px 24px', textAlign: 'center' }}>
          <p className="muted">Loading...</p>
        </main>
      </>
    )
  }

  if (error && !confirmed) {
    return (
      <>
        <Navbar />
        <main style={{ maxWidth: 600, margin: '0 auto', padding: '40px 24px' }}>
          <div className="card center-card">
            <div style={{ fontSize: '2.5rem' }}>⚠</div>
            <h2>Invalid Link</h2>
            <p className="muted">{error}</p>
          </div>
        </main>
      </>
    )
  }

  if (confirmed) {
    return (
      <>
        <Navbar />
        <main style={{ maxWidth: 600, margin: '0 auto', padding: '40px 24px' }}>
          <div className="card" style={{ textAlign: 'center', padding: '40px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div className="thankyou-check-circle">
              <span className="thankyou-checkmark">✓</span>
            </div>
            <h2 style={{ margin: 0 }}>Slot Confirmed!</h2>
            <p className="muted">Your interview is scheduled for:</p>
            <div style={{
              background: 'var(--primary-bg)',
              border: '1px solid var(--primary-border)',
              borderRadius: 10,
              padding: '12px 24px',
              color: 'var(--primary-light)',
              fontWeight: 600,
              fontSize: '1rem',
            }}>
              {confirmedSlotDisplay}
            </div>
            <p className="muted" style={{ fontSize: '0.875rem' }}>You will receive a confirmation email shortly.</p>
            <a href="/" className="btn btn-primary" style={{ marginTop: 8 }}>Login to ASTRA →</a>
          </div>
        </main>
      </>
    )
  }

  return (
    <>
      <Navbar />
      <main style={{ maxWidth: 680, margin: '0 auto', padding: '40px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div>
          <h1 className="title" style={{ fontSize: '1.6rem' }}>Book Your Interview Slot</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            Welcome <strong>{name}</strong>! Please select your preferred interview time for <strong>{jobTitle}</strong>.
          </p>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Timezone selector */}
          <div>
            <label className="role-label" style={{ marginBottom: 6, display: 'block' }}>Timezone</label>
            <select
              className="role-select"
              value={timezone}
              onChange={e => { setTimezone(e.target.value); setSelectedSlot('') }}
              style={{ maxWidth: 320 }}
            >
              {TIMEZONE_OPTIONS.map(tz => (
                <option key={tz.value} value={tz.value}>
                  {tz.label} — {tz.sub}
                </option>
              ))}
            </select>
          </div>

          {availableDates.length > 0 && (
            <div>
              <p className="role-label" style={{ marginBottom: 10 }}>Select a date</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {availableDates.map(d => (
                  <button
                    key={d.date}
                    onClick={() => { setSelectedDate(d.date); setSelectedSlot('') }}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 20,
                      border: '1.5px solid',
                      borderColor: selectedDate === d.date ? 'var(--primary)' : 'var(--border)',
                      background: selectedDate === d.date ? 'var(--primary)' : 'transparent',
                      color: selectedDate === d.date ? '#fff' : 'var(--text)',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      fontWeight: selectedDate === d.date ? 600 : 400,
                    }}
                  >
                    {d.display}
                  </button>
                ))}
              </div>
            </div>
          )}

          {currentDateData && currentDateData.slots.length > 0 && (
            <div>
              <p className="role-label" style={{ marginBottom: 10 }}>Available time slots</p>
              <div className="slot-grid">
                {currentDateData.slots.map(s => {
                  const isBooked = s.available === false || !!s.booked_by
                  const isSelected = selectedSlot === s.slot
                  const isPopular = !isBooked && popularSlots.has(s.slot)

                  let bg = '#fff'
                  let borderColor = '#0C447C'
                  let color = '#0C447C'
                  let cursor: React.CSSProperties['cursor'] = 'pointer'
                  let textDecoration = 'none'

                  if (isBooked) {
                    bg = '#F8FAFC'
                    borderColor = '#e2e8f0'
                    color = '#94a3b8'
                    cursor = 'not-allowed'
                    textDecoration = 'line-through'
                  } else if (isSelected) {
                    bg = '#0C447C'
                    borderColor = '#0C447C'
                    color = '#fff'
                  } else if (isPopular) {
                    bg = '#E1F5EE'
                    borderColor = '#0F6E56'
                    color = '#0F6E56'
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
                          if (!isBooked && !isSelected) {
                            (e.target as HTMLButtonElement).style.background = '#EBF4FF'
                          }
                        }}
                        onMouseLeave={e => {
                          if (!isBooked && !isSelected) {
                            (e.target as HTMLButtonElement).style.background = isPopular ? '#E1F5EE' : '#fff'
                          }
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
            </div>
          )}

          {error && <p className="error-text">{error}</p>}

          <button
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={!selectedSlot || confirming}
            style={{ fontSize: '1rem', padding: '12px 24px', alignSelf: 'flex-start' }}
          >
            {confirming ? 'Confirming...' : 'Confirm My Slot →'}
          </button>
        </div>
      </main>
    </>
  )
}
