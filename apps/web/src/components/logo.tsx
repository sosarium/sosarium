export function Logo({ className }: Readonly<{ className?: string }>) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <path d="M32 2 62 32 32 62 2 32Z" fill="#1d1913" stroke="#b08349" strokeWidth="2" />
      <path d="M32 9 55 32 32 55 9 32Z" fill="#2a231a" stroke="#8a6538" strokeWidth="1" />
      <path
        d="M38.5 22.5c-1.2-2.4-3.6-3.7-6.5-3.7-2.8 0-4.7 1.3-4.7 3.2 0 1.8 1.5 2.7 5.2 3.5 5.4 1.2 7.6 3.1 7.6 6.7 0 4.3-3.4 7-8.4 7-4.6 0-7.7-1.8-9-5.1l3.7-1.8c.9 2.1 2.6 3.2 5.3 3.2 2.8 0 4.6-1.2 4.6-3.1 0-1.7-1.3-2.6-5-3.4-5.5-1.2-7.8-3.2-7.8-6.9 0-4.1 3.4-6.8 8.3-6.8 4.3 0 7.4 1.7 8.9 4.6Z"
        fill="#d8a860"
      />
    </svg>
  );
}
