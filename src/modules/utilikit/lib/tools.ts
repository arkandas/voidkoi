import {
  AppWindow,
  ArrowRightLeft,
  Binary,
  Braces,
  Calendar,
  CaseSensitive,
  Clock,
  CloudDownload,
  Database,
  Eye,
  FileBadge,
  FileCode,
  FileStack,
  FileText,
  FileType,
  Fingerprint,
  Gauge,
  Globe,
  GitCompare,
  Image,
  Key,
  KeyRound,
  Link,
  Music,
  Network,
  Palette,
  QrCode,
  Regex,
  ScanQrCode,
  Share2,
  Shield,
  Smartphone,
  Video,
  type LucideIcon,
} from 'lucide-react';

/** The tool groups on the home page, in order. Each is a sub-app an account can leave out. */
export const CATEGORIES = ['media', 'developer', 'design', 'text', 'network', 'web'] as const;
export type Category = (typeof CATEGORIES)[number];

/** Where Utilikit lives in the suite. */
export const HOME = '/utilikit';

export const TOOL_IDS = [
  'qr-generator',
  'qr-reader',
  'image-converter',
  'video-converter',
  'audio-converter',
  'video-downloader',
  'document-converter',
  'pdf-tools',
  'json-formatter',
  'base64-converter',
  'hash-generator',
  'password-generator',
  'uuid-generator',
  'timestamp-converter',
  'url-encoder',
  'jwt-decoder',
  'regex-tester',
  'sql-formatter',
  'color-picker',
  'contrast-checker',
  'favicon-generator',
  'markdown-preview',
  'text-diff',
  'case-converter',
  'data-converter',
  'number-converter',
  'unit-converter',
  'cron-builder',
  'ip-calculator',
  'dns-lookup',
  'certificate-decoder',
  'user-agent-parser',
  'og-parser',
] as const;
export type ToolId = (typeof TOOL_IDS)[number];

export interface Tool {
  id: ToolId;
  path: `/utilikit/${ToolId}`;
  category: Category;
  icon: LucideIcon;
  color: string;
}

const TOOL_STYLES: Record<ToolId, [Category, LucideIcon, string]> = {
  'qr-generator': ['media', QrCode, 'tool-violet'],
  'qr-reader': ['media', ScanQrCode, 'tool-indigo'],
  'image-converter': ['media', Image, 'tool-pink'],
  'video-converter': ['media', Video, 'tool-red'],
  'audio-converter': ['media', Music, 'tool-emerald'],
  'video-downloader': ['media', CloudDownload, 'tool-orange'],
  'document-converter': ['media', FileType, 'tool-blue'],
  'pdf-tools': ['media', FileStack, 'tool-rose'],
  'json-formatter': ['developer', Braces, 'tool-amber'],
  'base64-converter': ['developer', FileText, 'tool-cyan'],
  'hash-generator': ['developer', Shield, 'tool-green'],
  'password-generator': ['developer', KeyRound, 'tool-orange'],
  'uuid-generator': ['developer', Fingerprint, 'tool-indigo'],
  'timestamp-converter': ['developer', Clock, 'tool-sky'],
  'url-encoder': ['developer', Link, 'tool-teal'],
  'jwt-decoder': ['developer', Key, 'tool-yellow'],
  'regex-tester': ['developer', Regex, 'tool-pink'],
  'sql-formatter': ['developer', Database, 'tool-blue'],
  'color-picker': ['design', Palette, 'tool-fuchsia'],
  'contrast-checker': ['design', Eye, 'tool-purple'],
  'favicon-generator': ['design', AppWindow, 'tool-amber'],
  'markdown-preview': ['text', FileCode, 'tool-slate'],
  'text-diff': ['text', GitCompare, 'tool-rose'],
  'case-converter': ['text', CaseSensitive, 'tool-violet'],
  'data-converter': ['text', ArrowRightLeft, 'tool-emerald'],
  'number-converter': ['text', Binary, 'tool-lime'],
  'unit-converter': ['text', Gauge, 'tool-stone'],
  'cron-builder': ['network', Calendar, 'tool-blue'],
  'ip-calculator': ['network', Network, 'tool-cyan'],
  'dns-lookup': ['network', Globe, 'tool-green'],
  'certificate-decoder': ['network', FileBadge, 'tool-yellow'],
  'user-agent-parser': ['web', Smartphone, 'tool-neutral'],
  'og-parser': ['web', Share2, 'tool-sky'],
};

export const TOOLS: Tool[] = TOOL_IDS.map(id => ({
  id,
  path: `${HOME}/${id}` as const,
  category: TOOL_STYLES[id][0],
  icon: TOOL_STYLES[id][1],
  color: TOOL_STYLES[id][2],
}));

export function findTool(pathname: string): Tool | undefined {
  return TOOLS.find(tool => pathname === tool.path || pathname.startsWith(`${tool.path}/`));
}

export function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export function filterTools<T extends { name: string; description: string }>(tools: T[], query: string): T[] {
  const needle = normalizeSearch(query);
  if (!needle) return tools;
  return tools.filter(tool => normalizeSearch(`${tool.name} ${tool.description}`).includes(needle));
}
