const useColor = !process.env["NO_COLOR"];

const code = (n: number) => (useColor ? `\x1b[${n}m` : "");
const reset = code(0);
const bold = code(1);
const dim = code(2);
const green = code(32);
const yellow = code(33);
const red = code(31);
const cyan = code(36);

export function ok(label: string, message: string): string {
  return `  ${green}[OK]${reset}   ${bold}${label}${reset}: ${message}`;
}

export function fail(label: string, message: string): string {
  return `  ${red}[FAIL]${reset} ${bold}${label}${reset}: ${message}`;
}

export function warn(label: string, message: string): string {
  return `  ${yellow}[WARN]${reset} ${bold}${label}${reset}: ${message}`;
}

export function skip(label: string, message: string): string {
  return `  ${dim}[SKIP]${reset} ${bold}${label}${reset}: ${dim}${message}${reset}`;
}

export function heading(text: string): string {
  return `${cyan}${bold}${text}${reset}`;
}

export function info(label: string, message: string): string {
  return `  ${bold}${label}:${reset} ${message}`;
}

export type CheckStatus = "pass" | "fail" | "warn" | "skip";

export function check(status: CheckStatus, label: string, message: string): string {
  switch (status) {
    case "pass": return ok(label, message);
    case "fail": return fail(label, message);
    case "warn": return warn(label, message);
    case "skip": return skip(label, message);
  }
}
