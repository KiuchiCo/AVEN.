'use client';

export function PrintButton({ label }: { label: string }) {
  return <button type="button" className="shared-doc__action" onClick={() => window.print()}>{label}</button>;
}
