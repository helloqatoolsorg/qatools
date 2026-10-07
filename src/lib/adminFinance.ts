export type FinancePoint = { date: string; endDate: string; orders: number; payments: number; refunds: number; remaining: number };
export type FinanceSummary = { currency: string; orders: number; payments: number; refunds: number; remaining: number;
  refundedOrders: number; reviewOrders: number; monthPayments: number; monthRefunds: number; monthRemaining: number; last30DaysRemaining: number;
  periodOrders: number; periodPayments: number; periodRefunds: number; periodRemaining: number; points: FinancePoint[] };
export type FinanceReport = { environment: string; period: string; timezone: string; generatedAt: string;
  startDate: string; endDate: string; currencies: FinanceSummary[] };
