'use strict';

/**
 * Pollinations.ai image URL builder.
 * Generates deterministic URLs — no API key needed; images render on demand.
 */

const STYLE_PREFIXES = {
  Realistic: 'realistic photo, ',
  Cartoonish: 'cartoon illustration, ',
  Minimalist: 'minimalist flat illustration, ',
};

function imageUrl(imageStyle, prompt, { width = 1024, height = 1024 } = {}) {
  const prefix = STYLE_PREFIXES[imageStyle] || '';
  const encoded = encodeURIComponent(prefix + String(prompt));
  return `https://image.pollinations.ai/prompt/${encoded}?width=${width}&height=${height}&nologo=true&model=flux`;
}

function coverUrl(imageStyle, title, theme) {
  return imageUrl(imageStyle, `epic fantasy book cover art for a text adventure game titled "${title}": ${theme}`);
}

function roomUrl(imageStyle, roomName, roomDescription) {
  return imageUrl(imageStyle, `scene of a text adventure game location called "${roomName}": ${roomDescription}`);
}

module.exports = { imageUrl, coverUrl, roomUrl, STYLE_PREFIXES };
