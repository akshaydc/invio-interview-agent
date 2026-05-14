import { useState, useEffect } from 'react'
import axios from 'axios'
import { API_BASE_URL as API } from '../config'
import Navbar from '../components/Navbar'

type SlotOption = { slot: string; display: string }
type DateOption = { date: string; display: string; slot_count: number; slots: SlotOption[] }

export default function BookSlot() {
  const params = new URLSearchParams(window.location.search)
  const token = params.get('token') ?? ''
  const ct = params.get('ct') ?? ''

  const [name, setName] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [availableDates, setAvailableDates] = useState<DateOption[]>([])
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedSlot, setSelectedSlot] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [confirmedSlotDisplay, setConfirmedSlotDisplay] = useState('')

  useEffect(() => {
    if (!token || !ct) {
      setError('This link is invalid or has expired.')
      setLoading(false)
      return
    }
    axios
      .get<{ name: string; job_title: string; available_dates: DateOption[] }>(
        `${API}/book-slot/available?token=${encodeURIComponent(token)}&ct=${encodeURIComponent(ct)}`
      )
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
  }, [token, ct])

  const currentDateData = availableDates.find(d => d.date === selectedDate)

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
                    <span style={{ marginLeft: 6, fontSize: '0.75rem', opacity: 0.7 }}>{d.slot_count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {currentDateData && currentDateData.slots.length > 0 && (
            <div>
              <p className="role-label" style={{ marginBottom: 10 }}>Available time slots</p>
              <div className="slot-grid">
                {currentDateData.slots.map(s => (
                  <button
                    key={s.slot}
                    className={`slot-cell slot-cell--available${selectedSlot === s.slot ? ' slot-cell--selected' : ''}`}
                    onClick={() => setSelectedSlot(s.slot)}
                  >
                    {s.display}
                  </button>
                ))}
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
