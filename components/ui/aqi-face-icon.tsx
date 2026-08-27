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

  // Minimal, pastel-toned face icons — clean & modern
  switch (lvl) {
    case 1:
      // Level 1: Soft emerald pastel — gentle smile
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={className} {...props}>
          <circle cx="50" cy="50" r="48" fill="#6ee7b7" />
          {/* Simple dot eyes */}
          <circle cx="35" cy="42" r="4.5" fill="#065f46" />
          <circle cx="65" cy="42" r="4.5" fill="#065f46" />
          {/* Gentle smile */}
          <path d="M 32 58 Q 50 72 68 58" stroke="#065f46" strokeWidth="4" strokeLinecap="round" fill="none" />
        </svg>
      );

    case 2:
      // Level 2: Soft lime — light smile
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={className} {...props}>
          <circle cx="50" cy="50" r="48" fill="#bef264" />
          {/* Simple dot eyes */}
          <circle cx="35" cy="42" r="4.5" fill="#365314" />
          <circle cx="65" cy="42" r="4.5" fill="#365314" />
          {/* Slight smile */}
          <path d="M 34 58 Q 50 68 66 58" stroke="#365314" strokeWidth="4" strokeLinecap="round" fill="none" />
        </svg>
      );

    case 3:
      // Level 3: Soft amber — neutral straight mouth
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={className} {...props}>
          <circle cx="50" cy="50" r="48" fill="#fcd34d" />
          {/* Simple dot eyes */}
          <circle cx="35" cy="42" r="4.5" fill="#78350f" />
          <circle cx="65" cy="42" r="4.5" fill="#78350f" />
          {/* Straight mouth */}
          <line x1="34" y1="60" x2="66" y2="60" stroke="#78350f" strokeWidth="4" strokeLinecap="round" />
        </svg>
      );

    case 4:
      // Level 4: Soft orange — slight frown
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={className} {...props}>
          <circle cx="50" cy="50" r="48" fill="#fdba74" />
          {/* Simple dot eyes */}
          <circle cx="35" cy="42" r="4.5" fill="#7c2d12" />
          <circle cx="65" cy="42" r="4.5" fill="#7c2d12" />
          {/* Slight frown */}
          <path d="M 34 64 Q 50 54 66 64" stroke="#7c2d12" strokeWidth="4" strokeLinecap="round" fill="none" />
        </svg>
      );

    case 5:
    default:
      // Level 5: Soft rose — deeper frown
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={className} {...props}>
          <circle cx="50" cy="50" r="48" fill="#fca5a5" />
          {/* Simple dot eyes */}
          <circle cx="35" cy="42" r="4.5" fill="#7f1d1d" />
          <circle cx="65" cy="42" r="4.5" fill="#7f1d1d" />
          {/* Deeper frown */}
          <path d="M 32 66 Q 50 52 68 66" stroke="#7f1d1d" strokeWidth="4.5" strokeLinecap="round" fill="none" />
        </svg>
      );
  }
}
