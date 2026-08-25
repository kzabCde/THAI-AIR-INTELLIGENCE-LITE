"use client";

import type { SVGProps } from "react";

export type AqiFaceLevel = 1 | 2 | 3 | 4 | 5;

export function AqiFaceIcon({
  level = 3,
  size = 80,
  className = "",
  ...props
}: {
  level?: AqiFaceLevel | number;
  size?: number;
  className?: string;
} & SVGProps<SVGSVGElement>) {
  let lvl: AqiFaceLevel = 3;
  if (typeof level === "number") {
    if (level <= 1) lvl = 1;
    else if (level <= 25) lvl = 1;
    else if (level <= 50) lvl = 2;
    else if (level <= 100) lvl = 3;
    else if (level <= 150) lvl = 4;
    else lvl = 5;
  }

  // Super cute, polished vector face icons matching AQI severity levels
  switch (lvl) {
    case 1:
      // Level 1: Emerald Green (#10b981) - Super cute joyful smile with shiny eyes & rosy cheeks
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={className} {...props}>
          {/* Main Face Circle */}
          <circle cx="50" cy="50" r="48" fill="#10b981" />
          {/* Cute Rosy Cheeks */}
          <ellipse cx="23" cy="53" rx="6.5" ry="4" fill="#6ee7b7" opacity="0.85" />
          <ellipse cx="77" cy="53" rx="6.5" ry="4" fill="#6ee7b7" opacity="0.85" />
          {/* Shiny Sparkle Eyes */}
          <circle cx="34" cy="40" r="6" fill="#022c22" />
          <circle cx="36.5" cy="37.5" r="2.2" fill="#ffffff" />
          <circle cx="66" cy="40" r="6" fill="#022c22" />
          <circle cx="68.5" cy="37.5" r="2.2" fill="#ffffff" />
          {/* Joyful Open Mouth with Cute Tongue */}
          <path d="M 28 55 Q 50 82 72 55 Z" fill="#022c22" />
          <path d="M 36 67 Q 50 78 64 67 Q 50 60 36 67 Z" fill="#f43f5e" />
        </svg>
      );

    case 2:
      // Level 2: Lime Green (#84cc16) - Friendly happy smile with cute eyes & blush
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={className} {...props}>
          {/* Main Face Circle */}
          <circle cx="50" cy="50" r="48" fill="#84cc16" />
          {/* Cute Rosy Cheeks */}
          <ellipse cx="22" cy="52" rx="6" ry="3.5" fill="#d9f99d" opacity="0.85" />
          <ellipse cx="78" cy="52" rx="6" ry="3.5" fill="#d9f99d" opacity="0.85" />
          {/* Shiny Eyes */}
          <circle cx="34" cy="41" r="6" fill="#1a2e05" />
          <circle cx="36.5" cy="38.5" r="2.2" fill="#ffffff" />
          <circle cx="66" cy="41" r="6" fill="#1a2e05" />
          <circle cx="68.5" cy="38.5" r="2.2" fill="#ffffff" />
          {/* Cheerful Smile */}
          <path d="M 30 58 Q 50 75 70 58" stroke="#1a2e05" strokeWidth="6" strokeLinecap="round" fill="none" />
        </svg>
      );

    case 3:
      // Level 3: Golden Yellow (#facc15) - Cute calm neutral face with big round eyes & straight mouth
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={className} {...props}>
          {/* Main Face Circle */}
          <circle cx="50" cy="50" r="48" fill="#facc15" />
          {/* Subtle Cheeks */}
          <ellipse cx="22" cy="52" rx="5.5" ry="3" fill="#fef08a" opacity="0.9" />
          <ellipse cx="78" cy="52" rx="5.5" ry="3" fill="#fef08a" opacity="0.9" />
          {/* Big Round Shiny Eyes */}
          <circle cx="34" cy="42" r="6.5" fill="#422006" />
          <circle cx="36.5" cy="39.5" r="2.4" fill="#ffffff" />
          <circle cx="66" cy="42" r="6.5" fill="#422006" />
          <circle cx="68.5" cy="39.5" r="2.4" fill="#ffffff" />
          {/* Neat Straight Horizontal Line Mouth */}
          <line x1="30" y1="62" x2="70" y2="62" stroke="#422006" strokeWidth="6.5" strokeLinecap="round" />
        </svg>
      );

    case 4:
      // Level 4: Vibrant Orange (#f97316) - Cute worried face with sad eyebrows & downturned mouth
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={className} {...props}>
          {/* Main Face Circle */}
          <circle cx="50" cy="50" r="48" fill="#f97316" />
          {/* Worried Eyebrows */}
          <path d="M 26 33 Q 35 38 42 36" stroke="#431407" strokeWidth="4.5" strokeLinecap="round" fill="none" />
          <path d="M 74 33 Q 65 38 58 36" stroke="#431407" strokeWidth="4.5" strokeLinecap="round" fill="none" />
          {/* Shiny Worried Eyes */}
          <circle cx="34" cy="44" r="6" fill="#431407" />
          <circle cx="36" cy="42" r="2" fill="#ffffff" />
          <circle cx="66" cy="44" r="6" fill="#431407" />
          <circle cx="68" cy="42" r="2" fill="#ffffff" />
          {/* Sad Downturned Mouth */}
          <path d="M 30 68 Q 50 53 70 68" stroke="#431407" strokeWidth="6" strokeLinecap="round" fill="none" />
        </svg>
      );

    case 5:
    default:
      // Level 5: Vibrant Red (#ef4444) - Cute distressed face with frowning mouth & steep eyebrows
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={className} {...props}>
          {/* Main Face Circle */}
          <circle cx="50" cy="50" r="48" fill="#ef4444" />
          {/* Frowning Eyebrows */}
          <path d="M 25 31 L 43 38" stroke="#450a0a" strokeWidth="5" strokeLinecap="round" />
          <path d="M 75 31 L 57 38" stroke="#450a0a" strokeWidth="5" strokeLinecap="round" />
          {/* Distressed Shiny Eyes */}
          <circle cx="34" cy="45" r="6" fill="#450a0a" />
          <circle cx="36" cy="43" r="2" fill="#ffffff" />
          <circle cx="66" cy="45" r="6" fill="#450a0a" />
          <circle cx="68" cy="43" r="2" fill="#ffffff" />
          {/* Deep Sad Frown */}
          <path d="M 28 70 Q 50 50 72 70" stroke="#450a0a" strokeWidth="7" strokeLinecap="round" fill="none" />
        </svg>
      );
  }
}
