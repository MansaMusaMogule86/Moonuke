/**
 * Coarse user-agent families for security events. Only the family names are
 * kept (never versions or the raw string), which is enough to notice "a new
 * kind of device" without fingerprinting anyone.
 */
export type DeviceCategory = "desktop" | "mobile" | "tablet" | "bot" | "unknown";
export type UaFamilies = { device: DeviceCategory; browser: string; os: string };

const BROWSERS: [RegExp, string][] = [
  [/Edg(e|A|iOS)?\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/CriOS\/|Chrome\//, "Chrome"],
  [/Version\/[\d.]+.*Safari\//, "Safari"],
];
const OSES: [RegExp, string][] = [
  [/Windows NT/, "Windows"],
  [/iPhone|iPad|iPod/, "iOS"],
  [/Android/, "Android"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/CrOS/, "ChromeOS"],
  [/Linux/, "Linux"],
];

export function uaFamilies(ua: string | null | undefined): UaFamilies {
  const s = (ua ?? "").slice(0, 512);
  if (!s) return { device: "unknown", browser: "Other", os: "Other" };
  const bot = /bot|crawler|spider|curl|wget|python-requests|headless/i.test(s);
  const tablet = /iPad|Tablet|Android(?!.*Mobile)/i.test(s);
  const mobile = /Mobi|iPhone|iPod|Android.*Mobile/i.test(s);
  const device: DeviceCategory = bot ? "bot" : tablet ? "tablet" : mobile ? "mobile" : /Windows|Macintosh|X11|CrOS/.test(s) ? "desktop" : "unknown";
  const browser = BROWSERS.find(([re]) => re.test(s))?.[1] ?? "Other";
  const os = OSES.find(([re]) => re.test(s))?.[1] ?? "Other";
  return { device, browser, os };
}
