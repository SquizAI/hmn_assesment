import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function defaults(props: IconProps, size = 16): SVGProps<SVGSVGElement> {
  const { size: s = size, className = "", ...rest } = props;
  return { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className, ...rest };
}

// ── Assessment template icons ──────────────────────────────

export function ClipboardIcon(props: IconProps) {
  return <svg {...defaults(props)}><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>;
}

export function RobotIcon(props: IconProps) {
  return <svg {...defaults(props)}><rect x="4" y="8" width="16" height="12" rx="2" /><path d="M9 8V6a3 3 0 016 0v2" /><circle cx="9" cy="14" r="1.5" fill="currentColor" stroke="none" /><circle cx="15" cy="14" r="1.5" fill="currentColor" stroke="none" /><path d="M10 17h4" /></svg>;
}

export function CompassIcon(props: IconProps) {
  return <svg {...defaults(props)}><circle cx="12" cy="12" r="10" /><polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88" fill="currentColor" stroke="none" opacity="0.4" /><polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88" /></svg>;
}

export function BrainIcon(props: IconProps) {
  return <svg {...defaults(props)}><path d="M12 2a4 4 0 00-4 4c0 .6.13 1.17.37 1.68A3.5 3.5 0 005 11a3.5 3.5 0 001.46 2.85A3.5 3.5 0 006 16a3.5 3.5 0 003.5 3.5c.58 0 1.13-.14 1.61-.39A1.5 1.5 0 0012 20" /><path d="M12 2a4 4 0 014 4c0 .6-.13 1.17-.37 1.68A3.5 3.5 0 0119 11a3.5 3.5 0 01-1.46 2.85A3.5 3.5 0 0118 16a3.5 3.5 0 01-3.5 3.5c-.58 0-1.13-.14-1.61-.39A1.5 1.5 0 0012 20" /><path d="M12 2v18" /></svg>;
}

export function SearchIcon(props: IconProps) {
  return <svg {...defaults(props)}><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>;
}

// ── Builder phase icons ────────────────────────────────────

export function TargetIcon(props: IconProps) {
  return <svg {...defaults(props)}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></svg>;
}

export function WrenchIcon(props: IconProps) {
  return <svg {...defaults(props)}><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" /></svg>;
}

export function ChatBubbleIcon(props: IconProps) {
  return <svg {...defaults(props)}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>;
}

export function ScaleIcon(props: IconProps) {
  return <svg {...defaults(props)}><path d="M12 3v18" /><path d="M4.5 7.5L12 5l7.5 2.5" /><path d="M4.5 7.5L2 14h5l-2.5-6.5z" /><path d="M19.5 7.5L22 14h-5l2.5-6.5z" /><circle cx="2" cy="14" r="0" /><path d="M2 14a3 3 0 005 0M17 14a3 3 0 005 0" /></svg>;
}

export function CheckCircleIcon(props: IconProps) {
  return <svg {...defaults(props)}><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><path d="M22 4L12 14.01l-3-3" /></svg>;
}

// ── Quick Action icons ─────────────────────────────────────

export function EnvelopeIcon(props: IconProps) {
  return <svg {...defaults(props)}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 4l-10 8L2 4" /></svg>;
}

export function BuildingIcon(props: IconProps) {
  return <svg {...defaults(props)}><rect x="4" y="2" width="16" height="20" rx="1" /><path d="M9 22V12h6v10" /><path d="M8 6h.01M16 6h.01M8 10h.01M16 10h.01" /></svg>;
}

export function UsersIcon(props: IconProps) {
  return <svg {...defaults(props)}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></svg>;
}

export function SparklesIcon(props: IconProps) {
  return <svg {...defaults(props)}><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z" /></svg>;
}

export function DocumentIcon(props: IconProps) {
  return <svg {...defaults(props)}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /><path d="M16 13H8M16 17H8M10 9H8" /></svg>;
}

export function RulerIcon(props: IconProps) {
  return <svg {...defaults(props)}><path d="M21.7 2.3a1 1 0 00-1.4 0L2.3 20.3a1 1 0 000 1.4l.7.7a1 1 0 001.4 0L22.4 4.4a1 1 0 000-1.4l-.7-.7z" /><path d="M18.5 5.5l-2 2M14.5 9.5l-2 2M10.5 13.5l-2 2M6.5 17.5l-2 2" /></svg>;
}

export function RefreshIcon(props: IconProps) {
  return <svg {...defaults(props)}><path d="M1 4v6h6" /><path d="M23 20v-6h-6" /><path d="M20.49 9A9 9 0 005.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 013.51 15" /></svg>;
}

// ── Tool Activity icons ────────────────────────────────────

export function PencilIcon(props: IconProps) {
  return <svg {...defaults(props)}><path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>;
}

export function PlusIcon(props: IconProps) {
  return <svg {...defaults(props)}><path d="M12 5v14M5 12h14" /></svg>;
}

export function TrashIcon(props: IconProps) {
  return <svg {...defaults(props)}><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>;
}

export function BookIcon(props: IconProps) {
  return <svg {...defaults(props)}><path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" /></svg>;
}

export function CopyIcon(props: IconProps) {
  return <svg {...defaults(props)}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>;
}

export function ArchiveIcon(props: IconProps) {
  return <svg {...defaults(props)}><path d="M21 8v13H3V8" /><path d="M1 3h22v5H1z" /><path d="M10 12h4" /></svg>;
}

export function ChartIcon(props: IconProps) {
  return <svg {...defaults(props)}><path d="M18 20V10M12 20V4M6 20v-6" /></svg>;
}

export function TrendingUpIcon(props: IconProps) {
  return <svg {...defaults(props)}><path d="M23 6l-9.5 9.5-5-5L1 18" /><path d="M17 6h6v6" /></svg>;
}

export function DownloadIcon(props: IconProps) {
  return <svg {...defaults(props)}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></svg>;
}

export function MicroscopeIcon(props: IconProps) {
  return <svg {...defaults(props)}><path d="M6 18h8" /><path d="M3 22h18" /><path d="M14 22a7 7 0 100-14h-1" /><path d="M9 14h2" /><path d="M9 12a2 2 0 01-2-2V6h6v4a2 2 0 01-2 2z" /><path d="M12 6V3a1 1 0 00-1-1H8a1 1 0 00-1 1v3" /></svg>;
}

export function GearIcon(props: IconProps) {
  return <svg {...defaults(props)}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>;
}

// ── Toast icons ────────────────────────────────────────────

export function PartyIcon(props: IconProps) {
  return <svg {...defaults(props)}><path d="M5.8 11.3L2 22l10.7-3.8" /><path d="M4 3h.01M22 8h.01M15 2h.01M22 20h.01M22 2l-2.24.75a2.9 2.9 0 00-1.96 3.12l.2 1.5" /><path d="M8.56 2.75a2.9 2.9 0 00-1.81 3.75l3 8" /><path d="M18.63 15.95a2.9 2.9 0 00-3.75-1.81l-8-3" /></svg>;
}

export function BoltIcon(props: IconProps) {
  return <svg {...defaults(props)}><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>;
}

export function AlertTriangleIcon(props: IconProps) {
  return <svg {...defaults(props)}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><path d="M12 9v4M12 17h.01" /></svg>;
}

// ── Icon lookup by name ────────────────────────────────────

const ICON_MAP: Record<string, (props: IconProps) => JSX.Element> = {
  clipboard: ClipboardIcon,
  robot: RobotIcon,
  compass: CompassIcon,
  brain: BrainIcon,
  search: SearchIcon,
  target: TargetIcon,
  wrench: WrenchIcon,
  "chat-bubble": ChatBubbleIcon,
  scale: ScaleIcon,
  "check-circle": CheckCircleIcon,
  envelope: EnvelopeIcon,
  building: BuildingIcon,
  users: UsersIcon,
  sparkles: SparklesIcon,
  document: DocumentIcon,
  ruler: RulerIcon,
  refresh: RefreshIcon,
  pencil: PencilIcon,
  plus: PlusIcon,
  trash: TrashIcon,
  book: BookIcon,
  copy: CopyIcon,
  archive: ArchiveIcon,
  chart: ChartIcon,
  "trending-up": TrendingUpIcon,
  download: DownloadIcon,
  microscope: MicroscopeIcon,
  gear: GearIcon,
  party: PartyIcon,
  bolt: BoltIcon,
  "alert-triangle": AlertTriangleIcon,
};

/**
 * Render an icon by name. Falls back to ClipboardIcon if name not found.
 * If `name` is an emoji string (non-ASCII), renders ClipboardIcon as fallback.
 */
export function Icon({ name, ...props }: IconProps & { name?: string | null }) {
  if (!name) return <ClipboardIcon {...props} />;
  const Component = ICON_MAP[name];
  if (Component) return <Component {...props} />;
  // Legacy emoji string — render clipboard fallback
  return <ClipboardIcon {...props} />;
}
