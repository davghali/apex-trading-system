import { SessionName, KillzoneModel, Direction, BiasStrength } from '../enums/index.js';

export interface KillzoneDefinition {
  name: SessionName;
  startNY: string;
  endNY: string;
  instruments: string[];
  preferredSetups: KillzoneModel[];
  maxTrades: number;
}

export interface SessionStatus {
  currentSession: SessionName;
  isActive: boolean;
  timeRemaining: number;
  progress: number;
  nextSession: SessionName;
  nextSessionIn: number;
}

export interface KillzoneAnalysis {
  model: KillzoneModel;
  direction: Direction;
  logic: string;
  entryType: string;
  target: string;
  confidence: BiasStrength;
}

export interface SessionData {
  name: string;
  high: number;
  low: number;
  open: number;
  close: number;
}
