'use strict';

/**
 * Groq client wrapper.
 *
 * Model: process.env.GROQ_MODEL (default 'openai/gpt-oss-120b').
 * API key resolution order: explicit `apiKey` argument (e.g. the per-request
 * `x-groq-key` header value), then process.env.GROQ_API_KEY.
 * Keys are never sent to the client — they live server-side only.
 */

const { Groq } = require('groq-sdk');

// Default model verified available on the owner's key 2026-10-03;
// override with GROQ_MODEL if the account offers other models.
const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

function resolveKey(explicitKey) {
  const key = explicitKey || process.env.GROQ_API_KEY;
  if (!key) {
    throw new Error('Groq is not configured: no API key provided');
  }
  return key;
}

/**
 * Chat completion.
 * @param {object} opts
 * @param {string} [opts.apiKey] - explicit key override (per-request)
 * @param {Array} opts.messages - OpenAI-style messages
 * @param {number} [opts.maxTokens]
 * @param {number} [opts.temperature]
 * @param {boolean} [opts.jsonMode] - use response_format json_object
 * @returns {Promise<string>} the assistant message content
 */
async function chat({ apiKey, messages, maxTokens, temperature, jsonMode = false }) {
  const client = new Groq({ apiKey: resolveKey(apiKey) });
  const params = {
    model: MODEL,
    messages,
    ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
    ...(temperature !== undefined ? { temperature } : {}),
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
  };
  const res = await client.chat.completions.create(params);
  const content = res?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Groq returned an empty response');
  }
  return content;
}

module.exports = { chat, MODEL };
