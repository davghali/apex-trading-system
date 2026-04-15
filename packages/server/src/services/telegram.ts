import axios from 'axios';
import { env } from '../config/env.js';

// ── Types ───────────────────────────────────────────────────

interface Alert {
  id?: number;
  instrument?: string;
  alert_type: string;
  priority: string;
  title: string;
  message: string;
}

interface SetupAlert {
  instrument: string;
  direction: 'long' | 'short';
  setup_type: string;
  entry: number;
  stop_loss: number;
  take_profit: number;
  rr_ratio: number;
  confluence_score: number;
  killzone: string;
  bias: string;
  notes?: string;
}

interface BiasUpdate {
  instrument: string;
  bias: string;
  confidence: number;
  timeframe: string;
  key_levels?: string[];
}

interface KillzoneInfo {
  name: string;
  start: string;
  end: string;
  instruments: string[];
}

// ── Rate Limiter ────────────────────────────────────────────

class RateLimiter {
  private timestamps: number[] = [];
  private readonly maxPerMinute: number;

  constructor(maxPerMinute: number = 30) {
    this.maxPerMinute = maxPerMinute;
  }

  canSend(): boolean {
    const now = Date.now();
    const oneMinuteAgo = now - 60_000;

    // Remove timestamps older than 1 minute
    this.timestamps = this.timestamps.filter((t) => t > oneMinuteAgo);

    return this.timestamps.length < this.maxPerMinute;
  }

  record(): void {
    this.timestamps.push(Date.now());
  }

  getRemaining(): number {
    const now = Date.now();
    const oneMinuteAgo = now - 60_000;
    this.timestamps = this.timestamps.filter((t) => t > oneMinuteAgo);
    return Math.max(0, this.maxPerMinute - this.timestamps.length);
  }

  getWaitTime(): number {
    if (this.canSend()) return 0;
    const oldest = this.timestamps[0];
    return oldest ? oldest + 60_000 - Date.now() : 0;
  }
}

// ── Constants ───────────────────────────────────────────────

const TELEGRAM_API = 'https://api.telegram.org';

const PRIORITY_EMOJI: Record<string, string> = {
  critical: '\u{1F534}',   // Red circle
  high: '\u{1F7E0}',       // Orange circle
  medium: '\u{1F7E1}',     // Yellow circle
  low: '\u{1F7E2}',        // Green circle
};

const DIRECTION_EMOJI: Record<string, string> = {
  long: '\u{1F7E2}\u{2B06}\u{FE0F}',   // Green up
  short: '\u{1F534}\u{2B07}\u{FE0F}',   // Red down
};

const rateLimiter = new RateLimiter(30);

// ── Helpers ─────────────────────────────────────────────────

function getBotUrl(method: string): string {
  return `${TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`;
}

function isConfigured(): boolean {
  return Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID);
}

function formatPrice(price: number): string {
  // Smart decimal formatting
  if (price >= 100) return price.toFixed(2);
  if (price >= 1) return price.toFixed(4);
  return price.toFixed(5);
}

// ── Core send ───────────────────────────────────────────────

export async function sendMessage(
  chatId: string,
  text: string,
  parseMode: string = 'HTML'
): Promise<boolean> {
  if (!env.TELEGRAM_BOT_TOKEN) {
    console.warn('[TELEGRAM] Bot token not configured, skipping message');
    return false;
  }

  if (!rateLimiter.canSend()) {
    const wait = rateLimiter.getWaitTime();
    console.warn(`[TELEGRAM] Rate limited. ${rateLimiter.getRemaining()} remaining. Wait ${wait}ms`);
    return false;
  }

  try {
    await axios.post(getBotUrl('sendMessage'), {
      chat_id: chatId,
      text,
      parse_mode: parseMode,
      disable_web_page_preview: true,
    });
    rateLimiter.record();
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[TELEGRAM] Failed to send message: ${msg}`);
    return false;
  }
}

// ── Alert template ──────────────────────────────────────────

export async function sendAlert(alert: Alert): Promise<boolean> {
  if (!isConfigured()) {
    console.warn('[TELEGRAM] Not configured, skipping alert');
    return false;
  }

  const emoji = PRIORITY_EMOJI[alert.priority] || '\u{26AA}';
  const instrument = alert.instrument ? `\u{1F4CA} <b>${alert.instrument}</b>\n` : '';

  const text = [
    `${emoji} <b>${alert.title}</b>`,
    '',
    instrument,
    alert.message,
    '',
    `\u{1F4CB} <i>Type: ${alert.alert_type} | Priority: ${alert.priority.toUpperCase()}</i>`,
    `\u{1F552} <i>${new Date().toLocaleString('fr-FR', { timeZone: 'America/New_York' })} (NY)</i>`,
  ]
    .filter(Boolean)
    .join('\n');

  return sendMessage(env.TELEGRAM_CHAT_ID, text);
}

// ── A+ Setup alert template ────────────────────────────────

export async function sendSetupAlert(setup: SetupAlert): Promise<boolean> {
  if (!isConfigured()) return false;

  const dir = DIRECTION_EMOJI[setup.direction] || '';
  const rrStars = setup.rr_ratio >= 3 ? '\u{2B50}\u{2B50}\u{2B50}' :
                  setup.rr_ratio >= 2 ? '\u{2B50}\u{2B50}' : '\u{2B50}';

  const confluenceBar = setup.confluence_score >= 80
    ? '\u{1F7E2}\u{1F7E2}\u{1F7E2}\u{1F7E2}\u{1F7E2}'
    : setup.confluence_score >= 60
      ? '\u{1F7E2}\u{1F7E2}\u{1F7E2}\u{1F7E2}\u{26AA}'
      : setup.confluence_score >= 40
        ? '\u{1F7E1}\u{1F7E1}\u{1F7E1}\u{26AA}\u{26AA}'
        : '\u{1F534}\u{1F534}\u{26AA}\u{26AA}\u{26AA}';

  const text = [
    `\u{1F3AF} <b>A+ SETUP DETECTED</b> \u{1F3AF}`,
    '',
    `${dir} <b>${setup.instrument}</b> | <b>${setup.direction.toUpperCase()}</b>`,
    `\u{1F4DD} Setup: <b>${setup.setup_type}</b>`,
    '',
    `\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}`,
    `\u{1F4B0} Entry:     <code>${formatPrice(setup.entry)}</code>`,
    `\u{1F6D1} Stop Loss: <code>${formatPrice(setup.stop_loss)}</code>`,
    `\u{1F3C6} Take Profit: <code>${formatPrice(setup.take_profit)}</code>`,
    `\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}`,
    '',
    `${rrStars} R:R = <b>${setup.rr_ratio.toFixed(1)}</b>`,
    `${confluenceBar} Confluence: <b>${setup.confluence_score}%</b>`,
    '',
    `\u{1F30D} Killzone: <b>${setup.killzone}</b>`,
    `\u{1F9ED} Bias: <b>${setup.bias}</b>`,
    setup.notes ? `\n\u{1F4AC} <i>${setup.notes}</i>` : '',
    '',
    `\u{1F552} <i>${new Date().toLocaleString('fr-FR', { timeZone: 'America/New_York' })} (NY)</i>`,
  ]
    .filter(Boolean)
    .join('\n');

  return sendMessage(env.TELEGRAM_CHAT_ID, text);
}

// ── Bias update template ────────────────────────────────────

export async function sendBiasUpdate(bias: BiasUpdate): Promise<boolean> {
  if (!isConfigured()) return false;

  const biasEmoji = bias.bias === 'bullish' ? '\u{1F7E2}\u{2B06}\u{FE0F}'
    : bias.bias === 'bearish' ? '\u{1F534}\u{2B07}\u{FE0F}'
    : '\u{1F7E1}\u{27A1}\u{FE0F}';

  const levels = bias.key_levels?.length
    ? '\n\u{1F4CD} Key levels:\n' +
      bias.key_levels.map((l) => `   \u{2022} <code>${l}</code>`).join('\n')
    : '';

  const text = [
    `\u{1F9ED} <b>BIAS UPDATE</b>`,
    '',
    `\u{1F4CA} <b>${bias.instrument}</b> (${bias.timeframe})`,
    `${biasEmoji} Bias: <b>${bias.bias.toUpperCase()}</b>`,
    `\u{1F4CA} Confidence: <b>${bias.confidence}%</b>`,
    levels,
    '',
    `\u{1F552} <i>${new Date().toLocaleString('fr-FR', { timeZone: 'America/New_York' })} (NY)</i>`,
  ]
    .filter(Boolean)
    .join('\n');

  return sendMessage(env.TELEGRAM_CHAT_ID, text);
}

// ── Killzone start template ─────────────────────────────────

export async function sendKillzoneStart(kz: KillzoneInfo): Promise<boolean> {
  if (!isConfigured()) return false;

  const instruments = kz.instruments.map((i) => `   \u{2022} ${i}`).join('\n');

  const text = [
    `\u{23F0} <b>KILLZONE: ${kz.name.toUpperCase()}</b>`,
    '',
    `\u{1F552} ${kz.start} - ${kz.end} (NY Time)`,
    '',
    `\u{1F4CA} Watch list:`,
    instruments,
    '',
    `<i>Stay focused. Execute the plan.</i>`,
  ]
    .filter(Boolean)
    .join('\n');

  return sendMessage(env.TELEGRAM_CHAT_ID, text);
}

// ── Trade closed template ───────────────────────────────────

export async function sendTradeClosed(trade: {
  instrument: string;
  direction: string;
  pnl: number;
  rr_achieved: number;
  entry_price: number;
  exit_price: number;
  setup_type?: string;
}): Promise<boolean> {
  if (!isConfigured()) return false;

  const resultEmoji = trade.pnl > 0 ? '\u{2705}' : '\u{274C}';
  const resultText = trade.pnl > 0 ? 'WIN' : 'LOSS';

  const text = [
    `${resultEmoji} <b>TRADE CLOSED - ${resultText}</b>`,
    '',
    `\u{1F4CA} <b>${trade.instrument}</b> | ${trade.direction.toUpperCase()}`,
    `\u{1F4B0} PnL: <b>${trade.pnl >= 0 ? '+' : ''}$${trade.pnl.toFixed(2)}</b>`,
    `\u{1F3AF} R:R: <b>${trade.rr_achieved.toFixed(2)}R</b>`,
    '',
    `Entry: <code>${formatPrice(trade.entry_price)}</code>`,
    `Exit:  <code>${formatPrice(trade.exit_price)}</code>`,
    trade.setup_type ? `Setup: <b>${trade.setup_type}</b>` : '',
    '',
    `\u{1F552} <i>${new Date().toLocaleString('fr-FR', { timeZone: 'America/New_York' })} (NY)</i>`,
  ]
    .filter(Boolean)
    .join('\n');

  return sendMessage(env.TELEGRAM_CHAT_ID, text);
}

// ── Error/Warning template ──────────────────────────────────

export async function sendError(title: string, details: string): Promise<boolean> {
  if (!isConfigured()) return false;

  const text = [
    `\u{26A0}\u{FE0F} <b>SYSTEM WARNING</b>`,
    '',
    `<b>${title}</b>`,
    '',
    `<i>${details}</i>`,
    '',
    `\u{1F552} <i>${new Date().toLocaleString('fr-FR', { timeZone: 'America/New_York' })} (NY)</i>`,
  ].join('\n');

  return sendMessage(env.TELEGRAM_CHAT_ID, text);
}

// ── Test connection ─────────────────────────────────────────

export async function testConnection(): Promise<{ success: boolean; message: string }> {
  if (!isConfigured()) {
    return { success: false, message: 'Telegram bot token or chat ID not configured' };
  }

  try {
    const text = [
      `\u{2705} <b>APEX Trading System</b>`,
      '',
      `Telegram connection test successful!`,
      '',
      `\u{1F4CA} Status: Connected`,
      `\u{1F552} ${new Date().toLocaleString('fr-FR', { timeZone: 'America/New_York' })} (NY)`,
      `\u{1F4E8} Rate limit: ${rateLimiter.getRemaining()}/30 messages remaining`,
    ].join('\n');

    const sent = await sendMessage(env.TELEGRAM_CHAT_ID, text);

    if (sent) {
      return { success: true, message: 'Test message sent successfully' };
    }
    return { success: false, message: 'Failed to send test message' };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, message: msg };
  }
}

// ── Rate limiter status ─────────────────────────────────────

export function getRateLimitStatus(): { remaining: number; limit: number } {
  return { remaining: rateLimiter.getRemaining(), limit: 30 };
}
