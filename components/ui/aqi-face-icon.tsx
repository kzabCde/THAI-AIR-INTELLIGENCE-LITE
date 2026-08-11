"use client";

import type { SVGProps } from "react";

export type AqiFaceLevel = 1 | 2 | 3 | 4 | 5;

export function AqiFaceIcon({
  level = 3,
  size = 72,
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

  // Exact 1:1 match of the reference face icons
  switch (lvl) {
    case 1:
      // Level 1: Dark Green (#16a34a) - Happy smile
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={className} {...props}>
          <circle cx="50" cy="50" r="48" fill="#16a34a" />
          <circle cx="35" cy="42" r="5.5" fill="#000000" />
          <circle cx="65" cy="42" r="5.5" fill="#000000" />
          <path d="M 30 58 Q 50 78 70 58 Z" fill="#000000" />
        </svg>
      );

    case 2:
      // Level 2: Lime Green (#84cc16) - Friendly smile
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={className} {...props}>
          <circle cx="50" cy="50" r="48" fill="#84cc16" />
          <circle cx="35" cy="42" r="5.5" fill="#000000" />
          <circle cx="65" cy="42" r="5.5" fill="#000000" />
          <path d="M 32 60 Q 50 74 68 60" stroke="#000000" strokeWidth="5.5" strokeLinecap="round" fill="none" />
        </svg>
      );

    case 3:
      // Level 3: Bright Yellow (#facc15 / #fde047) - EXACT MATCH of image 1 & 3: 2 dot eyes + 1 straight line mouth!
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={className} {...props}>
          <circle cx="50" cy="50" r="48" fill="#facc15" />
          {/* Dot Eyes */}
          <circle cx="34" cy="42" r="6" fill="#000000" />
          <circle cx="66" cy="42" r="6" fill="#000000" />
          {/* Straight Horizontal Line Mouth */}
          <line x1="30" y1="64" x2="70" y2="64" stroke="#000000" strokeWidth="6.5" strokeLinecap="round" />
        </svg>
      );

    case 4:
      // Level 4: Orange (#f97316) - Worried face with downturned mouth
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={className} {...props}>
          <circle cx="50" cy="50" r="48" fill="#f97316" />
          <path d="M 28 34 Q 36 38 42 36" stroke="#000000" strokeWidth="4" strokeLinecap="round" fill="none" />
          <path d="M 72 34 Q 64 38 58 36" stroke="#000000" strokeWidth="4" strokeLinecap="round" fill="none" />
          <circle cx="35" cy="45" r="5.5" fill="#000000" />
          <circle cx="65" cy="45" r="5.5" fill="#000000" />
          <path d="M 32 68 Q 50 54 68 68" stroke="#000000" strokeWidth="5.5" strokeLinecap="round" fill="none" />
        </svg>
      );

    case 5:
    default:
      // Level 5: Red (#ef4444) - Sad face
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={className} {...props}>
          <circle cx="50" cy="50" r="48" fill="#ef4444" />
          <path d="M 26 32 L 42 38" stroke="#000000" strokeWidth="4.5" strokeLinecap="round" />
          <path d="M 74 32 L 58 38" stroke="#000000" strokeWidth="4.5" strokeLinecap="round" />
          <circle cx="35" cy="45" r="5.5" fill="#000000" />
          <circle cx="65" cy="45" r="5.5" fill="#000000" />
          <path d="M 30 70 Q 50 54 70 70" stroke="#000000" strokeWidth="6" strokeLinecap="round" fill="none" />
        </svg>
      );
  }
}
