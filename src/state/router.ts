import { useEffect, useState } from 'react';

export interface Location {
  path: string;
  query: URLSearchParams;
}

function parse(): Location {
  const hash = window.location.hash.replace(/^#/, '') || '/';
  const [path, qs] = hash.split('?');
  return { path: path || '/', query: new URLSearchParams(qs ?? '') };
}

let lastDirection: 1 | -1 = 1;
const history: string[] = [];

export function useLocation(): Location {
  const [loc, setLoc] = useState(parse);
  useEffect(() => {
    const onChange = () => setLoc(parse());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return loc;
}

export function navigate(to: string, opts: { replace?: boolean } = {}): void {
  lastDirection = 1;
  if (opts.replace) {
    const url = `${window.location.pathname}${window.location.search}#${to}`;
    window.history.replaceState(null, '', url);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    history.push(to);
    window.location.hash = to;
  }
}

export function goBack(fallback = '/'): void {
  lastDirection = -1;
  if (history.length > 0) {
    history.pop();
    window.history.back();
  } else {
    navigate(fallback, { replace: true });
    lastDirection = -1;
  }
}

export const navigationDirection = (): 1 | -1 => lastDirection;

/** Découpe un chemin selon un motif `/revue/:month`. */
export function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean);
  const s = path.split('/').filter(Boolean);
  if (p.length !== s.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return params;
}
