import React from 'react';

interface BrandMarkProps {
  className?: string;
}

export const BrandMark: React.FC<BrandMarkProps> = ({ className = 'w-6 h-6' }) => (
  <svg
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <text
      x="24"
      y="35"
      fill="currentColor"
      fontFamily="Manrope, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
      fontSize="34"
      fontWeight="700"
      letterSpacing="-1.2"
      textAnchor="middle"
    >
      AF
    </text>
  </svg>
);
