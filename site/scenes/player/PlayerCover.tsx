import { useId } from "react"

/** The sleeve art: a paper plane over a low sun, a satellite's orbit, two hills. Fills its box. */
export function PlayerCover() {
  const id = useId()
  return (
    <div data-part="cover" className="relative size-full overflow-hidden">
      <svg
        data-role="art"
        viewBox="0 0 200 200"
        preserveAspectRatio="xMidYMid slice"
        className="block size-full"
        role="img"
        aria-label="Low Orbit Songs cover: a paper plane over a setting sun"
      >
        <defs>
          <linearGradient id={`${id}sky`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ff9e6b" />
            <stop offset="0.52" stopColor="#e2557a" />
            <stop offset="1" stopColor="#3b2a6e" />
          </linearGradient>
          <radialGradient id={`${id}glow`} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#ffe7b8" />
            <stop offset="0.7" stopColor="#ffc98a" />
            <stop offset="1" stopColor="#ffb070" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="200" height="200" fill={`url(#${id}sky)`} />
        <circle cx="128" cy="86" r="62" fill={`url(#${id}glow)`} opacity="0.55" />
        <circle cx="128" cy="86" r="38" fill="#ffe3b0" />
        <ellipse
          cx="100"
          cy="98"
          rx="92"
          ry="26"
          fill="none"
          stroke="#fff"
          strokeOpacity="0.55"
          strokeWidth="1.3"
          transform="rotate(-16 100 98)"
        />
        <circle cx="27" cy="128" r="3.6" fill="#fff" />
        <path
          d="M58 58 L82 50 L70 66 Z M70 66 L74 57"
          fill="#fff"
          stroke="#fff"
          strokeWidth="0.8"
          strokeLinejoin="round"
        />
        <path d="M0 146 Q48 124 98 142 T200 132 V200 H0Z" fill="#3a2465" />
        <path d="M0 168 Q62 148 124 166 T200 158 V200 H0Z" fill="#1d1340" />
        <circle cx="40" cy="30" r="1" fill="#fff" opacity="0.8" />
        <circle cx="170" cy="22" r="1.2" fill="#fff" opacity="0.7" />
        <circle cx="18" cy="70" r="0.9" fill="#fff" opacity="0.6" />
      </svg>
    </div>
  )
}
