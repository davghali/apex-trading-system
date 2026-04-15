import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '..', '.env') });

export const env = {
  NODE_PORT: parseInt(process.env.NODE_PORT || '3001', 10),
  ENGINE_URL: process.env.ENGINE_URL || 'http://localhost:8000',
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '',
  DB_PATH: process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'apex.db'),
  NODE_ENV: process.env.NODE_ENV || 'development',
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
} as const;

export type Env = typeof env;
