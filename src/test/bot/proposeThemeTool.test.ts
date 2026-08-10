import { describe, expect, it } from 'vitest';
import { parseProposedTheme } from '../../bot/proposeThemeTool';

describe('parseProposedTheme (§B4)', () => {
  it('parses a full valid proposal', () => {
    expect(
      parseProposedTheme({ name: 'Autumn Hearth', mode: 'dark', background: '#1a1410', accent: '#c25e3a', secondary: '#e8a33d' }),
    ).toEqual({ name: 'Autumn Hearth', mode: 'dark', background: '#1A1410', accent: '#C25E3A', secondary: '#E8A33D' });
  });

  it('adds a missing # and expands 3-digit shorthand', () => {
    const p = parseProposedTheme({ name: 'x', mode: 'light', background: 'fff', accent: '#abc', secondary: '123456' });
    expect(p).toEqual({ name: 'x', mode: 'light', background: '#FFFFFF', accent: '#AABBCC', secondary: '#123456' });
  });

  it('defaults mode to light and name when absent', () => {
    const p = parseProposedTheme({ background: '#000000', accent: '#111111', secondary: '#222222' });
    expect(p?.mode).toBe('light');
    expect(p?.name).toBe('Custom theme');
  });

  it('returns null when a colour is missing or malformed', () => {
    expect(parseProposedTheme({ name: 'x', mode: 'light', background: '#000000', accent: 'not-a-color', secondary: '#222222' })).toBeNull();
    expect(parseProposedTheme({ name: 'x', mode: 'light', accent: '#111111', secondary: '#222222' })).toBeNull();
    expect(parseProposedTheme(null)).toBeNull();
  });

  it('keeps valid token overrides and drops unknown keys / bad hex (batch-2 A1)', () => {
    const p = parseProposedTheme({
      name: 'x',
      mode: 'light',
      background: '#000000',
      accent: '#111111',
      secondary: '#222222',
      overrides: { ink2: 'abc', amber: '#ff8800', bogusKey: '#ffffff', red: 'not-a-color' },
    });
    expect(p?.overrides).toEqual({ ink2: '#AABBCC', amber: '#FF8800' });
  });

  it('omits overrides entirely when none are valid', () => {
    const p = parseProposedTheme({
      name: 'x',
      mode: 'light',
      background: '#000000',
      accent: '#111111',
      secondary: '#222222',
      overrides: { bogusKey: '#ffffff' },
    });
    expect(p).not.toHaveProperty('overrides');
  });
});
