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

const CONSTELLATION_POINTS = [
  { x: 18, y: 27 }, { x: 28, y: 20 }, { x: 39, y: 31 },
  { x: 61, y: 22 }, { x: 73, y: 32 }, { x: 82, y: 24 },
]

function delay(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms))
}

function playIntroSound() {
  const AudioContextCtor =
    window.AudioContext ||
    (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextCtor) return

  try {
    const context = new AudioContextCtor()
    const now = context.currentTime
    const master = context.createGain()
    const shimmer = context.createGain()
    const sweep = context.createBiquadFilter()
    const impact = context.createBiquadFilter()

    master.gain.setValueAtTime(0.0001, now)
    master.gain.exponentialRampToValueAtTime(0.34, now + 0.12)
    master.gain.exponentialRampToValueAtTime(0.0001, now + 3.15)
    master.connect(context.destination)
    if (context.state === 'suspended') void context.resume()

    sweep.type = 'bandpass'
    sweep.frequency.setValueAtTime(740, now)
    sweep.frequency.exponentialRampToValueAtTime(3900, now + 1.58)
    sweep.Q.setValueAtTime(10, now)

    const trail = context.createOscillator()
    const trailGain = context.createGain()
    trail.type = 'sine'
    trail.frequency.setValueAtTime(220, now)
    trail.frequency.exponentialRampToValueAtTime(1320, now + 1.58)
    trailGain.gain.setValueAtTime(0.0001, now)
    trailGain.gain.exponentialRampToValueAtTime(0.17, now + 0.22)
    trailGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.72)
    trail.connect(sweep)
    sweep.connect(trailGain)
    trailGain.connect(master)
    trail.start(now)
    trail.stop(now + 1.78)

    shimmer.gain.setValueAtTime(0.0001, now + 1.08)
    shimmer.gain.exponentialRampToValueAtTime(0.16, now + 1.32)
    shimmer.gain.exponentialRampToValueAtTime(0.0001, now + 2.2)
    shimmer.connect(master)

    ;[880, 1175, 1568].forEach((frequency, index) => {
      const osc = context.createOscillator()
      const gain = context.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(frequency, now + 1.18 + index * 0.05)
      gain.gain.setValueAtTime(0.0001, now + 1.18 + index * 0.05)
      gain.gain.exponentialRampToValueAtTime(0.07, now + 1.28 + index * 0.05)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.15 + index * 0.06)
      osc.connect(gain)
      gain.connect(shimmer)
      osc.start(now + 1.18 + index * 0.05)
      osc.stop(now + 2.35)
    })

    impact.type = 'lowpass'
    impact.frequency.setValueAtTime(240, now + 1.23)
    impact.frequency.exponentialRampToValueAtTime(90, now + 1.78)

    const thump = context.createOscillator()
    const thumpGain = context.createGain()
    thump.type = 'sine'
    thump.frequency.setValueAtTime(128, now + 1.23)
    thump.frequency.exponentialRampToValueAtTime(46, now + 1.72)
    thumpGain.gain.setValueAtTime(0.0001, now + 1.22)
    thumpGain.gain.exponentialRampToValueAtTime(0.22, now + 1.28)
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.95)
    thump.connect(impact)
    impact.connect(thumpGain)
    thumpGain.connect(master)
    thump.start(now + 1.22)
    thump.stop(now + 2)

    window.setTimeout(() => void context.close().catch(() => {}), 3600)
  } catch {
    // Browsers can block autoplay audio until the user interacts with the page.
  }
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
  @keyframes ai-cut-glint {
    0% { opacity: 0; transform: rotate(-12deg) scaleX(.35) scaleY(.8); filter: blur(6px); }
    24% { opacity: .95; transform: rotate(-12deg) scaleX(1.65) scaleY(1); filter: blur(0); }
    100% { opacity: 0; transform: rotate(-12deg) scaleX(2.8) scaleY(.72); filter: blur(5px); }
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
  @keyframes ai-grid-drift {
    from { transform: perspective(900px) rotateX(66deg) translateY(0); }
    to { transform: perspective(900px) rotateX(66deg) translateY(42px); }
  }
  @keyframes ai-orbit {
    from { transform: translate(-50%, -50%) rotate(0deg); }
    to { transform: translate(-50%, -50%) rotate(360deg); }
  }
  @keyframes ai-scan {
    0% { transform: translateY(-120%); opacity: 0; }
    20%, 70% { opacity: .8; }
    100% { transform: translateY(120%); opacity: 0; }
  }
  @keyframes ai-letter-sheen {
    0% { background-position: 160% 50%; }
    100% { background-position: -80% 50%; }
  }
`

export default function AstraIntro({ onComplete }: { onComplete: () => void }) {
  const wordRef = useRef<HTMLDivElement>(null)
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
      playIntroSound()
      await delay(1500)
      if (cancelled) return

      if (!wordRef.current || !lastLetterRef.current) return
      const wordRect = wordRef.current.getBoundingClientRect()
      const finalARect = lastLetterRef.current.getBoundingClientRect()
      const startX = wordRect.left - Math.max(180, wordRect.width * 0.22)
      const startY = wordRect.top + wordRect.height * 0.48
      const midX = wordRect.left + wordRect.width * 0.48
      const midY = wordRect.top + wordRect.height * 0.43
      const cutX = finalARect.left + finalARect.width * 0.52
      const cutY = finalARect.top + finalARect.height * 0.42
      const exitX = finalARect.right + Math.max(120, finalARect.width * 0.9)
      const exitY = cutY - 10
      const angle = (Math.atan2(cutY - startY, cutX - startX) * 180) / Math.PI

      setStarAngle(angle)
      setStarFired(true)

      // Wait for React to mount the star element
      await delay(50)
      if (cancelled || !starContainerRef.current) return

      starContainerRef.current.animate(
        [
          { transform: `translate(${startX}px, ${startY}px) scale(.82)`, opacity: 0 },
          { transform: `translate(${startX + 52}px, ${startY - 2}px) scale(1)`, opacity: 1, offset: 0.1 },
          { transform: `translate(${midX}px, ${midY}px) scale(1.02)`, opacity: 1, offset: 0.55 },
          { transform: `translate(${cutX}px, ${cutY}px) scale(1.08)`, opacity: 1, offset: 0.84 },
          { transform: `translate(${exitX}px, ${exitY}px) scale(.9)`, opacity: 0 },
        ],
        { duration: 1450, easing: 'cubic-bezier(.22,.72,.22,1)', fill: 'forwards' }
      )

      await delay(1240)
      if (cancelled) return

      setBurstPos({ x: cutX, y: cutY })
      setShowBurst(true)

      await delay(360)
      if (cancelled) return
      setStarFired(false)

      await delay(220)
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

  function replayIntro() {
    playIntroSound()
    setReplayKey(k => k + 1)
  }

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

      <div style={{
        position: 'absolute',
        inset: 'auto -20% -34% -20%',
        height: '55%',
        pointerEvents: 'none',
        opacity: 0.42,
        backgroundImage: [
          'linear-gradient(rgba(94, 172, 255, 0.22) 1px, transparent 1px)',
          'linear-gradient(90deg, rgba(94, 172, 255, 0.18) 1px, transparent 1px)',
        ].join(', '),
        backgroundSize: '64px 64px',
        maskImage: 'linear-gradient(to bottom, transparent, black 30%, transparent 92%)',
        WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 30%, transparent 92%)',
        animation: 'ai-grid-drift 3.6s linear infinite',
      }} />

      <div style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background: 'linear-gradient(180deg, transparent 0%, rgba(136,205,255,0.11) 48%, transparent 56%)',
        mixBlendMode: 'screen',
        animation: 'ai-scan 3.8s ease-in-out infinite',
      }} />

      <div style={{
        position: 'absolute',
        left: '50%',
        top: '48%',
        width: 'min(72vw, 720px)',
        aspectRatio: '1',
        borderRadius: '50%',
        border: '1px solid rgba(110,183,255,0.12)',
        boxShadow: 'inset 0 0 64px rgba(110,183,255,0.05), 0 0 90px rgba(70,130,255,0.08)',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
      }}>
        {[0, 1, 2].map((ring) => (
          <span key={ring} style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: `${76 + ring * 12}%`,
            height: `${38 + ring * 7}%`,
            border: '1px solid rgba(147,206,255,0.12)',
            borderRadius: '50%',
            transform: `translate(-50%, -50%) rotate(${ring * 42}deg)`,
            animation: `ai-orbit ${18 + ring * 6}s linear infinite`,
          }} />
        ))}
      </div>

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

      <svg
        aria-hidden="true"
        viewBox="0 0 100 60"
        preserveAspectRatio="none"
        style={{
          position: 'absolute',
          inset: '10% 8% auto 8%',
          height: '44%',
          opacity: 0.34,
          pointerEvents: 'none',
          filter: 'drop-shadow(0 0 10px rgba(110,183,255,0.4))',
        }}
      >
        <polyline
          points={CONSTELLATION_POINTS.map(point => `${point.x},${point.y}`).join(' ')}
          fill="none"
          stroke="rgba(136,205,255,0.44)"
          strokeWidth="0.18"
        />
        {CONSTELLATION_POINTS.map(point => (
          <circle key={`${point.x}-${point.y}`} cx={point.x} cy={point.y} r="0.6" fill="rgba(222,242,255,0.9)" />
        ))}
      </svg>

      <div ref={wordRef} style={{
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
                position: 'relative',
                opacity: 0,
                textShadow: '0 0 80px rgba(110,183,255,0.45)',
                background: 'linear-gradient(100deg, #cfe6ff 18%, #ffffff 36%, #8be7cf 52%, #6eb7ff 72%)',
                backgroundSize: '240% 100%',
                WebkitBackgroundClip: 'text',
                color: 'transparent',
                animationName: 'ai-letter-in, ai-letter-sheen',
                animationDuration: '0.55s, 2.3s',
                animationDelay: `${i * LETTER_STAGGER}ms, 1.72s`,
                animationTimingFunction: 'ease-out, cubic-bezier(.16,.8,.24,1)',
                animationFillMode: 'forwards, forwards',
              }}
            >
              {letter}
              {i === LETTERS.length - 1 && showBurst && (
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    left: '43%',
                    top: '34%',
                    width: '18%',
                    height: '18%',
                    borderRadius: '999px',
                    background: 'rgba(255,255,255,0.88)',
                    boxShadow: [
                      '0 0 12px rgba(255,255,255,0.95)',
                      '0 0 28px rgba(139,231,207,0.85)',
                      '0 0 54px rgba(110,183,255,0.5)',
                    ].join(', '),
                    transform: 'rotate(-12deg) scaleX(1.55)',
                    pointerEvents: 'none',
                    animation: 'ai-cut-glint 0.72s ease-out forwards',
                  }}
                />
              )}
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
            {/* Tail extends behind the star head. */}
            <div style={{
              position: 'absolute',
              right: 0, top: -1,
              width: 340, height: 2,
              background: 'linear-gradient(to right, transparent, rgba(110,183,255,0.18), rgba(207,230,255,0.92))',
              filter: 'blur(.7px)',
            }} />
            <div style={{
              position: 'absolute',
              right: 8, top: -7,
              width: 180, height: 14,
              background: 'linear-gradient(to right, transparent, rgba(110,183,255,0.16), rgba(207,230,255,0.38))',
              filter: 'blur(7px)',
            }} />
            {/* Head */}
            <div style={{
              position: 'absolute',
              left: -9, top: -9,
              width: 18, height: 18,
              borderRadius: '50%',
              background: 'radial-gradient(circle, #ffffff 20%, rgba(110,183,255,0.85) 60%, transparent 100%)',
              boxShadow: [
                '0 0 8px 2px rgba(255,255,255,0.92)',
                '0 0 18px 6px rgba(110,183,255,0.66)',
                '0 0 38px 12px rgba(20,60,160,0.28)',
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
          onClick={replayIntro}
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
          Replay
        </button>
      )}
    </div>
  )
}
