"use client";

import type { SVGProps } from "react";

export function PersonMaskAvatar({
  size = 110,
  className = "",
  ...props
}: {
  size?: number;
  className?: string;
} & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 160 160"
      fill="none"
      className={className}
      {...props}
    >
      {/* Hair (Back) */}
      <path
        d="M 40 60 C 40 30, 120 30, 120 60 C 120 100, 130 120, 130 150 L 30 150 C 30 120, 40 100, 40 60 Z"
        fill="#111827"
      />

      {/* Yellow Shirt (Exact match of image 1!) */}
      <path
        d="M 30 145 C 30 125, 50 115, 80 115 C 110 115, 130 125, 130 145 L 130 160 L 30 160 Z"
        fill="#facc15"
      />

      {/* Neck */}
      <rect x="70" y="94" width="20" height="24" rx="4" fill="#fbcfe8" />
      <rect x="70" y="94" width="20" height="24" rx="4" fill="#f472b6" opacity="0.2" />

      {/* Face Skin */}
      <path
        d="M 52 56 C 52 38, 108 38, 108 56 C 108 78, 98 100, 80 100 C 62 100, 52 78, 52 56 Z"
        fill="#fed7aa"
      />

      {/* Hair Front Bangs */}
      <path
        d="M 44 54 C 48 34, 76 32, 80 46 C 84 32, 112 34, 116 54 C 106 42, 92 40, 80 44 C 68 40, 54 42, 44 54 Z"
        fill="#111827"
      />

      {/* Eyebrows */}
      <path d="M 60 48 Q 67 45 74 48" stroke="#111827" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M 86 48 Q 93 45 100 48" stroke="#111827" strokeWidth="2.5" strokeLinecap="round" />

      {/* Eyes */}
      <circle cx="67" cy="56" r="4" fill="#111827" />
      <circle cx="93" cy="56" r="4" fill="#111827" />

      {/* Ears */}
      <circle cx="50" cy="68" r="6" fill="#fed7aa" />
      <circle cx="110" cy="68" r="6" fill="#fed7aa" />

      {/* White Face Mask (Exact match of image 1!) */}
      <path
        d="M 50 66 C 50 66, 80 62, 110 66 C 114 82, 102 100, 80 100 C 58 100, 46 82, 50 66 Z"
        fill="#ffffff"
        stroke="#e4e4e7"
        strokeWidth="1.5"
      />

      {/* Ear Straps */}
      <path d="M 50 68 Q 44 71 50 76" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M 110 68 Q 116 71 110 76" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}
