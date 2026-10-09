import type { ReactElement } from 'react'

export type IconName =
  // 分类
  | 'sofa' | 'bed' | 'table' | 'chair' | 'storage' | 'fridge' | 'tv' | 'washer' | 'decor'
  // 操作
  | 'orbit' | 'roam' | 'move' | 'rotate' | 'scale' | 'grid' | 'camera'
  | 'save' | 'load' | 'trash' | 'copy' | 'plus' | 'close' | 'home' | 'chevron' | 'cube'

const PATHS: Record<IconName, ReactElement> = {
  sofa: (
    <>
      <path d="M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3" />
      <path d="M3 11a1 1 0 0 1 1 1v3h16v-3a1 1 0 1 1 1 1v5H3z" />
      <path d="M7 11h10" />
    </>
  ),
  bed: (
    <>
      <path d="M3 18v-7h18v7" />
      <path d="M3 14h18" />
      <path d="M6 11V8h5v3" />
      <path d="M3 18v2M21 18v2" />
    </>
  ),
  table: (
    <>
      <path d="M3 9h18" />
      <path d="M5 9v9M19 9v9" />
      <path d="M3 9l1-3h16l1 3" />
    </>
  ),
  chair: (
    <>
      <path d="M6 4v8h12V4" />
      <path d="M5 12h14" />
      <path d="M7 12v8M17 12v8" />
    </>
  ),
  storage: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="1.5" />
      <path d="M12 4v16M9 9h.01M15 9h.01" />
    </>
  ),
  fridge: (
    <>
      <rect x="6" y="3" width="12" height="18" rx="2" />
      <path d="M6 10h12M9 6v2M9 13v3" />
    </>
  ),
  tv: (
    <>
      <rect x="3" y="5" width="18" height="12" rx="1.5" />
      <path d="M9 21h6M12 17v4" />
    </>
  ),
  washer: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <circle cx="12" cy="14" r="4" />
      <path d="M8 6.5h.01M11 6.5h5" />
    </>
  ),
  decor: (
    <>
      <path d="M12 21c-3 0-5-2-5-5 0-4 3-6 5-9 2 3 5 5 5 9 0 3-2 5-5 5z" />
      <path d="M12 12v9" />
    </>
  ),
  orbit: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <ellipse cx="12" cy="12" rx="9" ry="4.5" transform="rotate(-20 12 12)" />
    </>
  ),
  roam: (
    <>
      <circle cx="13" cy="4.5" r="1.8" />
      <path d="M11 21l1.5-5-2.5-2 .8-4 3 2 2.7.8" />
      <path d="M12.5 16l-2 5M9.8 10L7 12l-1 3" />
    </>
  ),
  move: (
    <>
      <path d="M12 3v18M3 12h18" />
      <path d="M12 3l-2 2M12 3l2 2M12 21l-2-2M12 21l2-2M3 12l2-2M3 12l2 2M21 12l-2-2M21 12l-2 2" />
    </>
  ),
  rotate: (
    <>
      <path d="M20 12a8 8 0 1 1-2.3-5.6" />
      <path d="M20 4v4h-4" />
    </>
  ),
  scale: (
    <>
      <path d="M4 9V4h5M20 15v5h-5M15 4h5v5M9 20H4v-5" />
    </>
  ),
  grid: (
    <>
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
      <rect x="3" y="3" width="18" height="18" rx="1" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  save: (
    <>
      <path d="M5 3h11l3 3v15H5z" />
      <path d="M8 3v6h8V3M8 21v-6h8v6" />
    </>
  ),
  load: (
    <>
      <path d="M3 7h6l2 2h10v10H3z" />
      <path d="M3 7V5h6" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  home: (
    <>
      <path d="M4 11l8-7 8 7" />
      <path d="M6 10v10h12V10" />
    </>
  ),
  chevron: <path d="M15 6l-6 6 6 6" />,
  cube: (
    <>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="M12 3v18M4 7.5l8 4.5 8-4.5" />
    </>
  ),
}

export function Icon({
  name,
  size = 20,
  className = '',
}: {
  name: IconName
  size?: number
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  )
}
