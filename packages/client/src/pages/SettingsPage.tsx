import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Settings,
  DollarSign,
  Shield,
  Bell,
  Send,
  Key,
  Monitor,
  Save,
  CheckCircle,
  Loader2,
  Eye,
  EyeOff,
  AlertTriangle,
  Sliders,
} from 'lucide-react';
import Card from '@/components/common/Card';
import Badge from '@/components/common/Badge';
import { useStore } from '@/store';
import api from '@/services/api';

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

function InputField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  suffix,
  masked = false,
}: {
  label: string;
  value: string | number;
  onChange: (val: string) => void;
  type?: string;
  placeholder?: string;
  suffix?: string;
  masked?: boolean;
}) {
  const [showValue, setShowValue] = useState(!masked);

  return (
    <div>
      <label className="text-[10px] text-ict-muted uppercase tracking-wider mb-1.5 block">{label}</label>
      <div className="relative">
        <input
          type={masked && !showValue ? 'password' : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 rounded-lg bg-ict-bg border border-ict-border/30 text-sm font-mono text-ict-text placeholder-ict-muted/40 focus:border-ict-accent/50 focus:outline-none transition-colors"
        />
        {suffix && !masked && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ict-muted">{suffix}</span>
        )}
        {masked && (
          <button
            onClick={() => setShowValue(!showValue)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ict-muted hover:text-ict-text transition-colors"
          >
            {showValue ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
      </div>
    </div>
  );
}

function ToggleSwitch({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <span className="text-xs font-medium text-ict-text">{label}</span>
        {description && <p className="text-[10px] text-ict-muted mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-colors ${
          checked ? 'bg-ict-accent' : 'bg-ict-border/50'
        }`}
      >
        <motion.div
          className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow"
          animate={{ left: checked ? 22 : 2 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      </button>
    </div>
  );
}

export default function SettingsPage() {
  try {
    const store = useStore();
    const [saved, setSaved] = useState(false);
    const [saving, setSaving] = useState(false);
    const [testingTelegram, setTestingTelegram] = useState(false);
    const [telegramTestResult, setTelegramTestResult] = useState<'success' | 'error' | null>(null);

    // Account settings
    const [accountSize, setAccountSize] = useState(store.accountSize.toString());
    const [riskPercent, setRiskPercent] = useState(store.riskPercent.toString());

    // Trading rules
    const [maxDailyTrades, setMaxDailyTrades] = useState(store.tradingRules.maxDailyTrades.toString());
    const [maxDailyLoss, setMaxDailyLoss] = useState(store.tradingRules.maxDailyLoss.toString());
    const [maxWeeklyLoss, setMaxWeeklyLoss] = useState((store.tradingRules.maxWeeklyLoss || 6).toString());
    const [minRR, setMinRR] = useState(store.tradingRules.minRR.toString());
    const [minConfluence, setMinConfluence] = useState(store.tradingRules.minConfluenceScore.toString());
    const [beLevel, setBELevel] = useState((store.tradingRules.beLevel || 1.5).toString());

    // API Keys
    const [twelveData, setTwelveData] = useState(store.apiKeys?.twelveData || '');
    const [oandaKey, setOandaKey] = useState(store.apiKeys?.oanda || '');
    const [finnhubKey, setFinnhubKey] = useState(store.apiKeys?.finnhub || '');
    const [alphaVantageKey, setAlphaVantageKey] = useState(store.apiKeys?.alphaVantage || '');

    // Telegram
    const [telegramBotToken, setTelegramBotToken] = useState(store.telegramBotToken || '');
    const [telegramChatId, setTelegramChatId] = useState(store.telegramChatId || '');
    const [telegramEnabled, setTelegramEnabled] = useState(store.telegramEnabled || false);

    // Notifications
    const [soundAlerts, setSoundAlerts] = useState(store.soundAlerts ?? true);
    const [desktopNotifs, setDesktopNotifs] = useState(store.desktopNotifications ?? true);

    const handleSave = useCallback(async () => {
      setSaving(true);
      try {
        store.setAccountSize(parseFloat(accountSize) || 100000);
        store.setRiskPercent(parseFloat(riskPercent) || 1);
        store.updateTradingRules({
          maxDailyTrades: parseInt(maxDailyTrades) || 3,
          maxDailyLoss: parseFloat(maxDailyLoss) || 3,
          maxWeeklyLoss: parseFloat(maxWeeklyLoss) || 6,
          minRR: parseFloat(minRR) || 2,
          minConfluenceScore: parseInt(minConfluence) || 65,
          beLevel: parseFloat(beLevel) || 1.5,
        });
        store.updateAPIKeys({
          twelveData,
          oanda: oandaKey,
          finnhub: finnhubKey,
          alphaVantage: alphaVantageKey,
        });
        store.updateSettings({
          telegramEnabled,
          telegramChatId,
          telegramBotToken,
          soundAlerts,
          desktopNotifications: desktopNotifs,
        });

        // Save to server (PUT /api/settings expects flat key-value pairs)
        try {
          await api.put('/settings', {
            default_risk_percent: parseFloat(riskPercent) || 1,
            max_daily_risk_percent: parseFloat(maxDailyLoss) || 3,
            max_daily_trades: parseInt(maxDailyTrades) || 3,
            daily_loss_limit: (parseFloat(accountSize) || 100000) * (parseFloat(maxDailyLoss) || 3) / 100,
            require_confluence_min: parseInt(minConfluence) || 65,
            telegram_enabled: telegramEnabled,
          });
        } catch {
          // Server save may fail if not connected, but local state is saved
          console.warn('[Settings] Server save failed, settings saved locally only');
        }

        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } finally {
        setSaving(false);
      }
    }, [
      store, accountSize, riskPercent, maxDailyTrades, maxDailyLoss, maxWeeklyLoss,
      minRR, minConfluence, beLevel, twelveData, oandaKey, finnhubKey, alphaVantageKey,
      telegramEnabled, telegramChatId, telegramBotToken, soundAlerts, desktopNotifs,
    ]);

    const handleTestTelegram = async () => {
      setTestingTelegram(true);
      setTelegramTestResult(null);
      try {
        await api.post('/telegram/test', {
          botToken: telegramBotToken,
          chatId: telegramChatId,
        });
        setTelegramTestResult('success');
      } catch {
        setTelegramTestResult('error');
      } finally {
        setTestingTelegram(false);
        setTimeout(() => setTelegramTestResult(null), 3000);
      }
    };

    return (
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="space-y-4 max-w-4xl"
      >
        {/* Header */}
        <motion.div variants={itemVariants} className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-ict-text">Settings</h1>
            <p className="text-xs text-ict-muted mt-0.5">Configure your APEX Trading System</p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              saved
                ? 'bg-ict-bullish/10 border border-ict-bullish/30 text-ict-bullish'
                : 'bg-ict-accent/10 border border-ict-accent/30 text-ict-accent hover:bg-ict-accent/20'
            } disabled:opacity-50`}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> :
             saved ? <CheckCircle size={14} /> : <Save size={14} />}
            {saved ? 'Saved!' : saving ? 'Saving...' : 'Save Settings'}
          </button>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Account Settings */}
          <motion.div variants={itemVariants}>
            <Card title="Account Settings" accent="cyan">
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-ict-border/20">
                  <DollarSign size={14} className="text-ict-accent" />
                  <span className="text-xs font-semibold text-ict-text">Account Configuration</span>
                </div>
                <InputField
                  label="Account Size"
                  value={accountSize}
                  onChange={setAccountSize}
                  type="number"
                  suffix="USD"
                />
                <InputField
                  label="Risk Per Trade"
                  value={riskPercent}
                  onChange={setRiskPercent}
                  type="number"
                  suffix="%"
                />
              </div>
            </Card>
          </motion.div>

          {/* Trading Rules */}
          <motion.div variants={itemVariants}>
            <Card title="Trading Rules" accent="bearish">
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-ict-border/20">
                  <Shield size={14} className="text-ict-bearish" />
                  <span className="text-xs font-semibold text-ict-text">Risk Management</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <InputField label="Max Daily Trades" value={maxDailyTrades} onChange={setMaxDailyTrades} type="number" />
                  <InputField label="Max Daily Loss" value={maxDailyLoss} onChange={setMaxDailyLoss} type="number" suffix="%" />
                  <InputField label="Max Weekly Loss" value={maxWeeklyLoss} onChange={setMaxWeeklyLoss} type="number" suffix="%" />
                  <InputField label="Min Risk:Reward" value={minRR} onChange={setMinRR} type="number" />
                  <InputField label="Min Confluence" value={minConfluence} onChange={setMinConfluence} type="number" suffix="/100" />
                  <InputField label="Break-Even Level" value={beLevel} onChange={setBELevel} type="number" suffix="R" />
                </div>

                <div>
                  <label className="text-[10px] text-ict-muted uppercase tracking-wider mb-2 block">
                    Allowed Sessions
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {['ASIAN', 'LONDON', 'NY_AM', 'NY_PM'].map((session) => {
                      const isAllowed = store.tradingRules.allowedSessions.includes(session);
                      return (
                        <Badge
                          key={session}
                          variant={isAllowed ? 'bullish' : 'muted'}
                          size="sm"
                          dot={isAllowed}
                        >
                          {session}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* API Keys */}
          <motion.div variants={itemVariants}>
            <Card title="API Keys" accent="cyan">
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-ict-border/20">
                  <Key size={14} className="text-ict-accent" />
                  <span className="text-xs font-semibold text-ict-text">Data Provider Keys</span>
                </div>
                <InputField
                  label="Twelve Data API Key"
                  value={twelveData}
                  onChange={setTwelveData}
                  placeholder="Enter your Twelve Data key"
                  masked
                />
                <InputField
                  label="OANDA API Key"
                  value={oandaKey}
                  onChange={setOandaKey}
                  placeholder="Enter your OANDA key"
                  masked
                />
                <InputField
                  label="Finnhub API Key"
                  value={finnhubKey}
                  onChange={setFinnhubKey}
                  placeholder="Enter your Finnhub key"
                  masked
                />
                <InputField
                  label="Alpha Vantage API Key"
                  value={alphaVantageKey}
                  onChange={setAlphaVantageKey}
                  placeholder="Enter your Alpha Vantage key"
                  masked
                />
                <p className="text-[10px] text-ict-muted/60">
                  Keys are stored locally and sent to the server for data fetching
                </p>
              </div>
            </Card>
          </motion.div>

          {/* Telegram */}
          <motion.div variants={itemVariants}>
            <Card title="Telegram Notifications" accent="cyan">
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-ict-border/20">
                  <Send size={14} className="text-ict-accent" />
                  <span className="text-xs font-semibold text-ict-text">Telegram Setup</span>
                </div>
                <ToggleSwitch
                  label="Enable Telegram"
                  description="Receive trade signals and alerts via Telegram"
                  checked={telegramEnabled}
                  onChange={setTelegramEnabled}
                />
                {telegramEnabled && (
                  <>
                    <InputField
                      label="Bot Token"
                      value={telegramBotToken}
                      onChange={setTelegramBotToken}
                      placeholder="Your Telegram bot token"
                      masked
                    />
                    <InputField
                      label="Chat ID"
                      value={telegramChatId}
                      onChange={setTelegramChatId}
                      placeholder="Your Telegram chat ID"
                    />
                    <button
                      onClick={handleTestTelegram}
                      disabled={testingTelegram || !telegramBotToken || !telegramChatId}
                      className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all ${
                        telegramTestResult === 'success'
                          ? 'bg-ict-bullish/10 border border-ict-bullish/30 text-ict-bullish'
                          : telegramTestResult === 'error'
                          ? 'bg-ict-bearish/10 border border-ict-bearish/30 text-ict-bearish'
                          : 'bg-ict-card border border-ict-border/30 text-ict-text hover:border-ict-accent/30'
                      } disabled:opacity-50`}
                    >
                      {testingTelegram ? <Loader2 size={14} className="animate-spin" /> :
                       telegramTestResult === 'success' ? <CheckCircle size={14} /> :
                       telegramTestResult === 'error' ? <AlertTriangle size={14} /> :
                       <Send size={14} />}
                      {telegramTestResult === 'success' ? 'Test Sent!' :
                       telegramTestResult === 'error' ? 'Test Failed' :
                       testingTelegram ? 'Sending...' : 'Send Test Message'}
                    </button>
                  </>
                )}
              </div>
            </Card>
          </motion.div>

          {/* Notifications */}
          <motion.div variants={itemVariants}>
            <Card title="Alerts & Notifications">
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-ict-border/20">
                  <Bell size={14} className="text-ict-accent" />
                  <span className="text-xs font-semibold text-ict-text">Alert Preferences</span>
                </div>
                <ToggleSwitch
                  label="Sound Alerts"
                  description="Play sound on new alerts and signals"
                  checked={soundAlerts}
                  onChange={setSoundAlerts}
                />
                <ToggleSwitch
                  label="Desktop Notifications"
                  description="Show browser notifications for important events"
                  checked={desktopNotifs}
                  onChange={setDesktopNotifs}
                />
              </div>
            </Card>
          </motion.div>
        </div>

        {/* System info */}
        <motion.div variants={itemVariants}>
          <Card>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Monitor size={14} className="text-ict-muted" />
                <span className="text-xs text-ict-muted">APEX Trading System</span>
                <Badge variant="accent" size="xs">v4.0</Badge>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-ict-muted">Engine: ICT/SMC Analysis</span>
                <span className="text-[10px] text-ict-muted">
                  Status: {store.connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
          </Card>
        </motion.div>
      </motion.div>
    );
  } catch {
    return (
      <div className="text-center py-12">
        <AlertTriangle size={24} className="text-ict-bearish mx-auto mb-2" />
        <span className="text-sm text-ict-muted">Settings page encountered an error. Please refresh.</span>
      </div>
    );
  }
}
