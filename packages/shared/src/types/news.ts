export interface EconomicEvent {
  id: string;
  name: string;
  currency: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  time: string;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
}

export interface NewsSafety {
  safeToTrade: boolean;
  algoActive: boolean;
  blockingNews: BlockingNews[];
  nextClearTime: string | null;
  status: string;
  actionForOpenTrades: 'NONE' | 'MOVE_TO_BE_OR_CLOSE';
}

export interface BlockingNews {
  name: string;
  time: string;
  impact: string;
  currency: string;
  exclusionEnd: string;
}
