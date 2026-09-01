import { describe, expect, it } from 'vitest';
import { isSafeUrl, safeHref } from './safeUrl';

describe('isSafeUrl / safeHref — scheme allowlist for stored service URLs', () => {
  it('allows http and https URLs', () => {
    expect(isSafeUrl('https://plex.example.com')).toBe(true);
    expect(isSafeUrl('http://10.0.0.5:8080/admin')).toBe(true);
    expect(safeHref('https://plex.example.com')).toBe('https://plex.example.com');
  });

  it('allows relative and protocol-relative URLs (they resolve to the page origin scheme)', () => {
    expect(isSafeUrl('/local/path')).toBe(true);
    expect(isSafeUrl('//host.example.com/x')).toBe(true);
  });

  it('neutralizes javascript: URLs, including obfuscated casing/whitespace', () => {
    expect(safeHref('javascript:alert(document.cookie)')).toBe('#');
    expect(safeHref('JaVaScRiPt:alert(1)')).toBe('#');
    expect(safeHref(' \n javascript:alert(1)')).toBe('#');
  });

  it('neutralizes data:, vbscript:, file: and other non-http(s) schemes', () => {
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBe('#');
    expect(safeHref('vbscript:msgbox(1)')).toBe('#');
    expect(safeHref('file:///etc/passwd')).toBe('#');
    expect(safeHref('blob:https://x/y')).toBe('#');
  });
});
