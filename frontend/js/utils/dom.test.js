import { describe, it, expect } from 'vitest';
import { escapeHtml } from './dom.js';

describe('escapeHtml', () => {
  it('escapes the 5 HTML-relevant characters', () => {
    expect(escapeHtml(`<b>"Käse" & 'Wurst'</b>`)).toBe(
      '&lt;b&gt;&quot;Käse&quot; &amp; &#39;Wurst&#39;&lt;/b&gt;',
    );
  });
  it('turns null/undefined into empty string and numbers into text', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(12.5)).toBe('12.5');
  });
});
