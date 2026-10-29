"use client";

export function PrintButton() {
  return (
    <button onClick={() => window.print()} className="rounded-full bg-primary px-5 py-2.5 font-medium text-primary-foreground hover:opacity-90">
      Download PDF
    </button>
  );
}
