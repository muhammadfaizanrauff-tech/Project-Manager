export function EmptyIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 160"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="ei-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
        <linearGradient id="ei-b" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f0abfc" />
          <stop offset="100%" stopColor="#ec4899" />
        </linearGradient>
        <linearGradient id="ei-c" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#5eead4" />
          <stop offset="100%" stopColor="#0ea5e9" />
        </linearGradient>
      </defs>

      <ellipse cx="100" cy="140" rx="70" ry="8" fill="currentColor" opacity="0.06" />

      <rect x="55" y="40" width="90" height="70" rx="10" fill="url(#ei-a)" opacity="0.15" />
      <rect x="70" y="55" width="90" height="70" rx="10" fill="url(#ei-a)" />

      <circle cx="90" cy="75" r="5" fill="white" opacity="0.9" />
      <rect x="102" y="71" width="40" height="8" rx="4" fill="white" opacity="0.7" />
      <circle cx="90" cy="95" r="5" fill="white" opacity="0.9" />
      <rect x="102" y="91" width="30" height="8" rx="4" fill="white" opacity="0.55" />
      <circle cx="90" cy="115" r="5" fill="white" opacity="0.9" />
      <rect x="102" y="111" width="35" height="8" rx="4" fill="white" opacity="0.4" />

      <circle cx="45" cy="45" r="14" fill="url(#ei-b)" />
      <path d="M39 45l4 4 8-8" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />

      <circle cx="158" cy="40" r="10" fill="url(#ei-c)" opacity="0.9" />
      <circle cx="168" cy="95" r="6" fill="url(#ei-b)" opacity="0.7" />
    </svg>
  );
}
