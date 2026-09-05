// The Council's two companions — each has its own motion signature:
//   Bull  → vertical "charge-bob" (bounces up, tilts horns, steam when hyped)
//   Bear  → horizontal "heavy sway" (rocks side to side, stomps when hyped)
// `hype` = the agent is typing right now → faster animation + glow + sparks.

const SPARK_X = [8, 50, 44]

export function BullMascot({ hype = false, size = 64 }) {
  return (
    <span
      className={`mascot block shrink-0 ${hype ? 'hype-bull' : ''}`}
      style={size !== 64 ? { width: size, height: size, transform: `scale(${size / 64})`, transformOrigin: 'top left' } : undefined}
      aria-hidden="true"
    >
      <span className="mb-bull">
        <span className="mb-head">
          <i className="horn horn-l" />
          <i className="horn horn-r" />
          <i className="ear ear-l" />
          <i className="ear ear-r" />
          <i className="eye eye-l" />
          <i className="eye eye-r" />
          <span className="muzzle"><i /><i /></span>
          <span className="steam steam-l" />
          <span className="steam steam-r" />
        </span>
      </span>
      {SPARK_X.map((x, i) => (
        <span key={i} className="spark" style={{ left: `${x}%`, animationDelay: `${i * 0.3}s` }} />
      ))}
      <span className="mb-shadow" />
    </span>
  )
}

export function BearMascot({ hype = false, size = 64 }) {
  return (
    <span
      className={`mascot block shrink-0 ${hype ? 'hype-bear' : ''}`}
      style={size !== 64 ? { width: size, height: size, transform: `scale(${size / 64})`, transformOrigin: 'top left' } : undefined}
      aria-hidden="true"
    >
      <span className="mb-bear">
        <span className="mb-head">
          <i className="ear ear-l" />
          <i className="ear ear-r" />
          <i className="eye eye-l" />
          <i className="eye eye-r" />
          <span className="muzzle" />
        </span>
      </span>
      {SPARK_X.map((x, i) => (
        <span key={i} className="spark" style={{ left: `${x}%`, animationDelay: `${i * 0.3}s` }} />
      ))}
      <span className="mb-shadow" />
    </span>
  )
}

// Tiny square avatar versions for chat bubbles
export function BullAvatar({ size = 26 }) {
  return (
    <span className="relative block overflow-hidden rounded-full bg-success/10 border border-success/30" style={{ width: size, height: size }}>
      <span className="absolute" style={{ transform: `scale(${size / 64})`, transformOrigin: 'top left' }}>
        <BullMascot />
      </span>
    </span>
  )
}

export function BearAvatar({ size = 26 }) {
  return (
    <span className="relative block overflow-hidden rounded-full bg-danger/10 border border-danger/30" style={{ width: size, height: size }}>
      <span className="absolute" style={{ transform: `scale(${size / 64})`, transformOrigin: 'top left' }}>
        <BearMascot />
      </span>
    </span>
  )
}
