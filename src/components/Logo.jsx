// The VERDICT mark — an asterisk star, like the agents' signal mark.
export default function Logo({ size = 32 }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-lg bg-gradient-to-br from-[#7aa2ff] to-[#2b68ff] shadow-[0_0_20px_rgba(43,104,255,0.4)]"
      style={{ width: size, height: size }}
    >
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none">
        <path
          d="M12 2v20M2 12h20M4.9 4.9l14.2 14.2M19.1 4.9L4.9 19.1"
          stroke="white"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
      </svg>
    </span>
  )
}
