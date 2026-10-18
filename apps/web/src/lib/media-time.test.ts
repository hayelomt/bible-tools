import { describe, expect, it } from 'vitest';
import { linkHost, momentUrl, webAddress } from './media-time.ts';

describe('links at a moment', () => {
  it('jump on YouTube, Vimeo and audio or video files', () => {
    expect(momentUrl('https://www.youtube.com/watch?v=abc123', 585)).toBe(
      'https://www.youtube.com/watch?v=abc123&t=585',
    );
    expect(momentUrl('https://youtu.be/abc123?t=10', 585)).toBe('https://youtu.be/abc123?t=585');
    expect(momentUrl('https://youtube.com/live/abc123', 60)).toBe(
      'https://youtube.com/live/abc123?t=60',
    );
    expect(momentUrl('https://m.youtube.com/watch?v=abc&start=5', 1)).toBe(
      'https://m.youtube.com/watch?v=abc&t=1',
    );
    expect(momentUrl('https://vimeo.com/123456', 585)).toBe('https://vimeo.com/123456#t=9m45s');
    expect(momentUrl('https://vimeo.com/123456', 3730)).toBe('https://vimeo.com/123456#t=1h2m10s');
    expect(momentUrl('https://vimeo.com/123456', 5)).toBe('https://vimeo.com/123456#t=5s');
    expect(momentUrl('https://cdn.example.org/sermons/2026-10-12.mp3', 585.7)).toBe(
      'https://cdn.example.org/sermons/2026-10-12.mp3#t=585',
    );
  });

  it('can’t jump anywhere else', () => {
    expect(momentUrl('https://www.youtube.com/@gracechapel', 585)).toBeNull();
    expect(momentUrl('https://gracechapel.org/sermons/good-shepherd', 585)).toBeNull();
    expect(momentUrl('https://podcasts.apple.com/us/podcast/id1', 585)).toBeNull();
    expect(momentUrl('not a link', 585)).toBeNull();
  });

  it('name the site', () => {
    expect(linkHost('https://www.youtube.com/watch?v=abc')).toBe('youtube.com');
    expect(linkHost('nonsense')).toBe('nonsense');
  });

  it('take a typed address with or without https', () => {
    expect(webAddress(' gracechapel.org/sermons ')).toBe('https://gracechapel.org/sermons');
    expect(webAddress('http://example.org/a.mp3')).toBe('http://example.org/a.mp3');
    expect(webAddress('ftp://example.org')).toBeNull();
    expect(webAddress('Sunday service')).toBeNull();
    expect(webAddress('javascript:alert(1)')).toBeNull();
  });
});
