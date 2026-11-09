export type DeviceType = 'desktop' | 'mobile' | 'tablet' | 'bot' | 'unknown';

export interface SoftwareInfo {
  name: string | null;
  version: string | null;
}

export interface DeviceInfo {
  type: DeviceType;
  vendor: string | null;
  model: string | null;
}

export interface ParsedUserAgent {
  browser: SoftwareInfo;
  os: SoftwareInfo;
  engine: SoftwareInfo;
  device: DeviceInfo;
}

type Rule = readonly [pattern: RegExp, name: string];

const BOT = /(?:^|[\s;(])([\w-]*(?:bot|crawler|spider|slurp)|facebookexternalhit)(?:\/([\d.]+))?/i;

const BROWSERS: readonly Rule[] = [
  [/Edg(?:e|A|iOS)?\/([\d.]+)/, 'Microsoft Edge'],
  [/(?:OPR|Opera)\/([\d.]+)/, 'Opera'],
  [/SamsungBrowser\/([\d.]+)/, 'Samsung Internet'],
  [/(?:Firefox|FxiOS)\/([\d.]+)/, 'Mozilla Firefox'],
  [/(?:Chrome|CriOS)\/([\d.]+)/, 'Google Chrome'],
  [/Version\/([\d.]+).*Safari\//, 'Safari'],
  [/(?:MSIE |Trident\/.*rv:)([\d.]+)/, 'Internet Explorer'],
];

const ENGINES: readonly Rule[] = [
  [/Edge\/([\d.]+)/, 'EdgeHTML'],
  [/Chrome\/([\d.]+)/, 'Blink'],
  [/AppleWebKit\/([\d.]+)/, 'WebKit'],
  [/Trident\/([\d.]+)/, 'Trident'],
  [/Presto\/([\d.]+)/, 'Presto'],
  [/rv:([\d.]+)\).*Gecko\//, 'Gecko'],
];

const VENDORS: readonly Rule[] = [
  [/^(?:SM|GT)-|samsung/i, 'Samsung'],
  [/^(?:Pixel|Nexus)\b/i, 'Google'],
  [/huawei/i, 'Huawei'],
  [/xiaomi|^(?:Redmi|POCO|Mi)\b/i, 'Xiaomi'],
  [/^moto/i, 'Motorola'],
  [/oneplus/i, 'OnePlus'],
];

const WINDOWS_VERSIONS: Record<string, string> = {
  '10.0': '10',
  '6.3': '8.1',
  '6.2': '8',
  '6.1': '7',
  '6.0': 'Vista',
  '5.2': 'XP',
  '5.1': 'XP',
};

const PLACEHOLDER_MODEL = /^(?:K|wv|Mobile|Tablet|rv:.*|[a-z]{2}[-_][a-z]{2})$/i;

function capture(ua: string, pattern: RegExp): string | null {
  return ua.match(pattern)?.[1] ?? null;
}

function detect(ua: string, rules: readonly Rule[]): SoftwareInfo {
  for (const [pattern, name] of rules) {
    const match = ua.match(pattern);
    if (match) return { name, version: match[1] ?? null };
  }
  return { name: null, version: null };
}

function detectOs(ua: string): SoftwareInfo {
  if (/\b(?:iPhone|iPad|iPod)\b/.test(ua)) {
    return { name: 'iOS', version: capture(ua, /OS (\d+(?:_\d+)*) like Mac OS X/)?.replace(/_/g, '.') ?? null };
  }
  if (ua.includes('Android')) return { name: 'Android', version: capture(ua, /Android (\d+(?:\.\d+)*)/) };
  if (ua.includes('CrOS')) return { name: 'ChromeOS', version: capture(ua, /CrOS \S+ ([\d.]+)/) };
  if (ua.includes('Windows')) {
    const nt = capture(ua, /Windows NT (\d+\.\d+)/);
    return { name: 'Windows', version: nt ? (WINDOWS_VERSIONS[nt] ?? null) : null };
  }
  if (/Macintosh|Mac OS X/.test(ua)) {
    return { name: 'macOS', version: capture(ua, /Mac OS X (\d+(?:[._]\d+)*)/)?.replace(/_/g, '.') ?? null };
  }
  if (/Linux|X11/.test(ua)) return { name: 'Linux', version: null };
  return { name: null, version: null };
}

function detectDevice(ua: string, os: string | null): DeviceInfo {
  const apple = capture(ua, /\b(iPhone|iPad|iPod)\b/);
  if (apple) {
    return { type: apple === 'iPad' ? 'tablet' : 'mobile', vendor: 'Apple', model: apple === 'iPod' ? 'iPod touch' : apple };
  }

  if (os === 'Android') {
    const found = capture(ua, /Android[^;)]*;\s*([^;)]+?)(?:\s+Build\/[^;)]*)?\s*[;)]/);
    const model = found && !PLACEHOLDER_MODEL.test(found) ? found : null;
    return {
      type: ua.includes('Mobile') ? 'mobile' : 'tablet',
      vendor: model ? (VENDORS.find(([pattern]) => pattern.test(model))?.[1] ?? null) : null,
      model,
    };
  }

  const type: DeviceType = /Mobi|Phone/.test(ua) ? 'mobile' : /Tablet/.test(ua) ? 'tablet' : os ? 'desktop' : 'unknown';
  const mac = os === 'macOS';
  return { type, vendor: mac ? 'Apple' : null, model: mac ? 'Macintosh' : null };
}

export function parseUserAgent(ua: string): ParsedUserAgent {
  const os = detectOs(ua);
  const bot = ua.match(BOT);

  return {
    browser: bot ? { name: bot[1], version: bot[2] ?? null } : detect(ua, BROWSERS),
    os,
    engine: detect(ua, ENGINES),
    device: bot ? { type: 'bot', vendor: null, model: null } : detectDevice(ua, os.name),
  };
}

export const USER_AGENT_EXAMPLES = [
  {
    name: 'Chrome (Windows)',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  },
  {
    name: 'Safari (macOS)',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  },
  {
    name: 'Firefox (Windows)',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  },
  {
    name: 'Edge (Windows)',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
  },
  {
    name: 'Chrome (Android)',
    ua: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36',
  },
  {
    name: 'Safari (iPhone)',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
  },
  {
    name: 'Googlebot',
    ua: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  },
];
