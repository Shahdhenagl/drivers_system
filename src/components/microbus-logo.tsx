import type { SVGProps } from "react";

/** لوجو ميكروباص للمكتب */
export function MicrobusLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {/* جسم الميكروباص */}
      <path d="M6 40V22a6 6 0 0 1 6-6h32l12 12v12a2 2 0 0 1-2 2h-4" />
      <path d="M6 40v0a2 2 0 0 0 2 2h4" />
      {/* الشبابيك */}
      <path d="M14 16v12" />
      <path d="M24 16v12" />
      <path d="M34 16v12" />
      <path d="M44 16l8 8" />
      <path d="M9 28h47" />
      {/* العجلات */}
      <circle cx="18" cy="44" r="5" />
      <circle cx="44" cy="44" r="5" />
      {/* وصل بين العجلات */}
      <path d="M23 44h16" />
    </svg>
  );
}
