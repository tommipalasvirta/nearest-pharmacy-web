/** The green cross of a European pharmacy sign. Decorative. */
export function PharmacyCross({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M8.5 1h7v7.5H23v7h-7.5V23h-7v-7.5H1v-7h7.5z" />
    </svg>
  )
}
