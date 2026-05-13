import { useEffect, useRef, useState } from 'react'

const TAGLINE = 'AI Screening, Talent & Recruitment Assistant'
const LETTERS = ['A', 'S', 'T', 'R', 'A']
const LETTER_STAGGER = 130

const STARS = Array.from({ length: 70 }, (_, i) => ({
  id: i,
  x: (i * 13.7508 + 7.3) % 100,
  y: (i * 7.3847 + 11.2) % 100,
  size: 1 + (i % 3) * 0.5,
  twinkleDelay: (i * 0.37) % 4,
  twinkleDuration: 2 + (i % 3),
}))

function delay(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms))
}

const INTRO_CSS = `
  @keyframes ai-twinkle {
    0%, 100% { opacity: .15; transform: scale(.7); }
    50% { opacity: .95; transform: scale(1.5); }
  }
  @keyframes ai-letter-in {
    0% { opacity: 0; filter: blur(24px); transform: translateY(44px); }
    100% { opacity: 1; filter: blur(0); transform: translateY(0); }
  }
  @keyframes ai-ring {
    0% { transform: translate(-50%,-50%) scale(.05); opacity: .9; }
    100% { transform: translate(-50%,-50%) scale(5); opacity: 0; }
  }
  @keyframes ai-flash {
    0% { transform: translate(-50%,-50%) scale(.2); opacity: 1; }
    100% { transform: translate(-50%,-50%) scale(7); opacity: 0; }
  }
  @keyframes ai-ray {
    0% { width: 0; opacity: 1; }
    100% { width: 130px; opacity: 0; }
  }
  @keyframes ai-char-in {
    0% { opacity: 0; transform: translateY(9px); }
    100% { opacity: .82; transform: translateY(0); }
  }
  @keyframes ai-replay-in {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes ai-glow-pulse {
    0%, 100% { opacity: .06; }
    50% { opacity: .13; }
  }
`

export default function AstraIntro({ onComplete }: { onComplete: () => void }) {
  const lastLetterRef = useRef<HTMLSpanElement>(null)
  const starContainerRef = useRef<HTMLDivElement>(null)
  const onCompleteRef = useRef(onComplete)

  const [starAngle, setStarAngle] = useState(28)
  const [starFired, setStarFired] = useState(false)
  const [showBurst, setShowBurst] = useState(false)
  const [burstPos, setBurstPos] = useState({ x: 0, y: 0 })
  const [taglineVisible, setTaglineVisible] = useState(false)
  const [showReplay, setShowReplay] = useState(false)
  const [fadingOut, setFadingOut] = useState(false)
  const [replayKey, setReplayKey] = useState(0)

  useEffect(() => { onCompleteRef.current = onComplete }, [onComplete])

  useEffect(() => {
    let cancelled = false

    setStarFired(false)
    setShowBurst(false)
    setBurstPos({ x: 0, y: 0 })
    setTaglineVisible(false)
    setShowReplay(false)
    setFadingOut(false)

    async function run() {
      await delay(1500)
      if (cancelled) return

      if (!lastLetterRef.current) return
      const rect = lastLetterRef.current.getBoundingClientRect()
      const endX = rect.left + rect.width / 2
      const endY = rect.top + rect.height / 2
      const angle = (Math.atan2(endY - (-180), endX - (-220)) * 180) / Math.PI

      setStarAngle(angle)
      setStarFired(true)

      // Wait for React to mount the star element
      await delay(50)
      if (cancelled || !starContainerRef.current) return

      starContainerRef.current.animate(
        [
          { transform: 'translate(-220px, -180px)' },
          { transform: `translate(${endX}px, ${endY}px)` },
        ],
        { duration: 1700, easing: 'cubic-bezier(.55,.08,.68,.53)', fill: 'forwards' }
      )

      await delay(1750)
      if (cancelled) return

      if (lastLetterRef.current) {
        const r2 = lastLetterRef.current.getBoundingClientRect()
        setBurstPos({ x: r2.left + r2.width / 2, y: r2.top + r2.height / 2 })
      }
      setStarFired(false)
      setShowBurst(true)

      await delay(450)
      if (cancelled) return
      setTaglineVisible(true)

      await delay(1400)
      if (cancelled) return
      setShowReplay(true)

      await delay(500)
      if (cancelled) return
      setFadingOut(true)

      await delay(800)
      if (cancelled) return
      onCompleteRef.current()
    }

    run()
    return () => { cancelled = true }
  }, [replayKey])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#050b1a',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
      opacity: fadingOut ? 0 : 1,
      transition: fadingOut ? 'opacity 0.8s ease' : 'none',
      pointerEvents: fadingOut ? 'none' : 'all',
    }}>
      <style>{INTRO_CSS}</style>

      {/* Ambient radial glows */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: [
          'radial-gradient(ellipse 70% 50% at 50% 50%, rgba(110,183,255,0.07) 0%, transparent 70%)',
          'radial-gradient(ellipse 40% 30% at 15% 65%, rgba(30,90,200,0.06) 0%, transparent 70%)',
          'radial-gradient(ellipse 35% 25% at 85% 30%, rgba(60,120,220,0.05) 0%, transparent 70%)',
        ].join(', '),
        animation: 'ai-glow-pulse 4s ease-in-out infinite',
      }} />

      {/* Stars */}
      {STARS.map(s => (
        <div key={s.id} style={{
          position: 'absolute',
          left: `${s.x}%`, top: `${s.y}%`,
          width: s.size, height: s.size,
          borderRadius: '50%',
          background: '#cfe6ff',
          animation: `ai-twinkle ${s.twinkleDuration}s ${s.twinkleDelay}s ease-in-out infinite`,
          pointerEvents: 'none',
        }} />
      ))}

      {/* ASTRA letters */}
      <div style={{
        display: 'flex',
        fontFamily: "'Instrument Serif', serif",
        fontSize: 'clamp(4.5rem, 13vw, 10rem)',
        letterSpacing: '0.14em',
        color: '#cfe6ff',
        lineHeight: 1,
        position: 'relative',
        zIndex: 2,
        userSelect: 'none',
      }}>
        {LETTERS.map((letter, i) => (
          <span
            key={i}
            ref={i === LETTERS.length - 1 ? lastLetterRef : undefined}
            style={{
              display: 'inline-block',
              opacity: 0,
              animation: `ai-letter-in 0.55s ease-out ${i * LETTER_STAGGER}ms forwards`,
              textShadow: '0 0 80px rgba(110,183,255,0.45)',
            }}
          >
            {letter}
          </span>
        ))}
      </div>

      {/* Tagline */}
      {taglineVisible && (
        <div style={{
          marginTop: '1.6rem',
          fontFamily: "'Space Grotesk', 'Inter', sans-serif",
          fontSize: 'clamp(0.6rem, 1.5vw, 0.85rem)',
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: '#6eb7ff',
          display: 'flex', flexWrap: 'wrap', justifyContent: 'center',
          zIndex: 2,
          userSelect: 'none',
        }}>
          {TAGLINE.split('').map((ch, i) => (
            <span
              key={i}
              style={{
                opacity: 0,
                display: 'inline-block',
                animation: `ai-char-in 0.3s ease-out ${i * 32}ms forwards`,
                whiteSpace: ch === ' ' ? 'pre' : 'normal',
              }}
            >
              {ch}
            </span>
          ))}
        </div>
      )}

      {/* Shooting star */}
      {starFired && (
        <div
          ref={starContainerRef}
          style={{
            position: 'fixed',
            top: 0, left: 0,
            transform: 'translate(-220px, -180px)',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          <div style={{ transform: `rotate(${starAngle}deg)`, position: 'relative', width: 0, height: 0 }}>
            {/* Tail — extends behind (−x direction in rotated frame) */}
            <div style={{
              position: 'absolute',
              right: 0, top: -2,
              width: 260, height: 4,
              background: 'linear-gradient(to right, transparent, rgba(110,183,255,0.45), rgba(207,230,255,0.85))',
              filter: 'blur(1.5px)',
            }} />
            {/* Head */}
            <div style={{
              position: 'absolute',
              left: -12, top: -12,
              width: 24, height: 24,
              borderRadius: '50%',
              background: 'radial-gradient(circle, #ffffff 20%, rgba(110,183,255,0.85) 60%, transparent 100%)',
              boxShadow: [
                '0 0 8px 3px rgba(110,183,255,0.9)',
                '0 0 18px 7px rgba(50,110,210,0.6)',
                '0 0 36px 14px rgba(20,60,160,0.35)',
              ].join(', '),
            }} />
          </div>
        </div>
      )}

      {/* Impact burst */}
      {showBurst && (
        <div style={{
          position: 'fixed',
          left: burstPos.x, top: burstPos.y,
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          zIndex: 10,
        }}>
          {/* Flash */}
          <div style={{
            position: 'absolute',
            width: 80, height: 80,
            left: '50%', top: '50%',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(110,183,255,0.8) 45%, transparent 100%)',
            animation: 'ai-flash 0.75s ease-out forwards',
          }} />
          {/* Rings */}
          {[0, 150, 290].map((d, i) => (
            <div key={i} style={{
              position: 'absolute',
              width: 56, height: 56,
              left: '50%', top: '50%',
              borderRadius: '50%',
              border: `${1.5 - i * 0.3}px solid rgba(110,183,255,${0.8 - i * 0.15})`,
              animation: `ai-ring 0.9s ease-out ${d}ms forwards`,
            }} />
          ))}
          {/* 8 radial rays */}
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} style={{
              position: 'absolute',
              top: '50%', left: '50%',
              marginTop: -1,
              width: 0, height: 2,
              background: 'linear-gradient(90deg, rgba(255,255,255,0.9), rgba(110,183,255,0.5), transparent)',
              transformOrigin: '0 50%',
              transform: `rotate(${i * 45}deg)`,
              animation: `ai-ray 0.65s ease-out ${i * 22}ms forwards`,
            }} />
          ))}
        </div>
      )}

      {/* Replay button */}
      {showReplay && !fadingOut && (
        <button
          onClick={() => setReplayKey(k => k + 1)}
          style={{
            position: 'fixed',
            bottom: 32, right: 32,
            background: 'rgba(110,183,255,0.12)',
            border: '1px solid rgba(110,183,255,0.35)',
            color: '#6eb7ff',
            padding: '8px 20px',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: '0.78rem',
            letterSpacing: '0.1em',
            fontFamily: "'Space Grotesk', 'Inter', sans-serif",
            animation: 'ai-replay-in 0.4s ease-out forwards',
            zIndex: 20,
          }}
        >
          ↺ Replay
        </button>
      )}
    </div>
  )
}
