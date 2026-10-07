'use client';

/** Flat, ink-outlined illustration matching the companion's yellow storybook. */
export default function ChestIllustration({ stage }: { stage: number }) {
  return (
    <svg
      data-stage={stage}
      className="chest-illustration"
      viewBox="0 0 280 240"
      aria-hidden="true"
    >
      <ellipse cx="140" cy="214" rx="91" ry="11" fill="#dce8ed" />
      <g
        className="chest-sparkles"
        fill="#ffcf44"
        stroke="#e4ac20"
        strokeWidth="2"
        strokeLinejoin="round"
      >
        <path d="m44 49 4 12 12 4-12 4-4 12-4-12-12-4 12-4Z" />
        <path d="m229 47 3 9 9 3-9 3-3 9-3-9-9-3 9-3Z" />
        <path d="m212 103 5 13 13 5-13 5-5 13-5-13-13-5 13-5Z" />
        <circle cx="82" cy="34" r="4" />
        <circle cx="200" cy="24" r="3" />
      </g>
      <g
        stroke="#343331"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M55 121 Q140 97 225 121 L218 157 H62Z" fill="#58473b" />
        <g className="chest-goodies">
          <path d="m111 101 16-21h27l15 21-29 34Z" fill="#71d1f5" />
          <path
            d="m111 101 29 7 29-7M127 80l13 28 14-28m-14 28v27"
            fill="none"
            stroke="#3689a9"
            strokeWidth="2.5"
          />
          <circle cx="85" cy="116" r="16" fill="#ffda57" />
          <path
            d="m85 107 3 6 6 1-5 5 1 6-5-3-5 3 1-6-5-5 6-1Z"
            fill="#efb438"
            stroke="none"
          />
          <circle cx="184" cy="117" r="16" fill="#ffda57" />
          <path
            d="m184 108 3 6 6 1-5 5 1 6-5-3-5 3 1-6-5-5 6-1Z"
            fill="#efb438"
            stroke="none"
          />
        </g>
        <path
          d="M55 124 Q140 137 225 124 L219 189 Q217 207 197 208H83Q63 207 61 189Z"
          fill="#ffcd4b"
        />
        <path
          d="M65 156q75 17 150 0M70 183q70 13 140 0"
          fill="none"
          stroke="#e2a936"
          strokeWidth="2.5"
        />
        <path d="m79 130 6 77h17l-5-74m86 0-5 74h17l6-77" fill="#fff0b3" />
        <g className="chest-drawn-lid">
          <path
            d="M54 127v-21q0-49 43-52h86q43 3 43 52v21q-86 19-172 0Z"
            fill="#ffdb67"
          />
          <path
            d="M55 104q85 15 170 0"
            fill="none"
            stroke="#e7b33b"
            strokeWidth="2.5"
          />
          <path
            d="M83 55q-10 20-10 49v27l19 3v-29q0-31 12-50m72 0q12 19 12 50v29l19-3v-27q0-29-10-49"
            fill="#fff1bb"
          />
          <path d="M115 67h43" fill="none" stroke="#fff9dc" strokeWidth="5" />
        </g>
        <g className="chest-drawn-lock">
          <rect x="123" y="127" width="34" height="38" rx="10" fill="#77caf0" />
          <path
            d="M140 138a4 4 0 0 1 2 7v8h-4v-8a4 4 0 0 1 2-7Z"
            fill="#343331"
            stroke="none"
          />
        </g>
      </g>
    </svg>
  );
}
