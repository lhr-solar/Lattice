export function OpenArrowIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={className ?? "h-3.5 w-3.5"}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M3 13h10V3H7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 3h4v4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 3L7 9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
