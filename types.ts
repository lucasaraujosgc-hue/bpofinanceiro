export enum TransactionType {
  CREDIT = 'credito',
  DEBIT = 'debito'
}

export enum CategoryType {
  INCOME = 'receita',
  EXPENSE = 'despesa'
}

export interface Bank {
  id: number;
  name: string;
  accountNumber: string;
  nickname?: string;
  logo: string;
  active: boolean;
  balance: number;
}

export interface Category {
  id: number;
  name: string;
  type: CategoryType;
  groupType?: string; // Novo campo para agrupamento no DRE
}

export interface KeywordRule {
  id: number;
  keyword: string;
  type: TransactionType;
  categoryId: number;
  bankId?: number | null;
}

export interface CreditCard {
  id: number;
  bankId: number;
  name: string;
  closingDay: number;
  dueDay: number;
  limitValue?: number;
}

export interface OFXImport {
  id: number;
  fileName: string;
  importDate: string;
  bankId: number;
  transactionCount: number;
}

export interface Transaction {
  id: number;
  date: string; // ISO Date YYYY-MM-DD
  description: string;
  summary?: string;
  type: TransactionType;
  value: number;
  categoryId?: number;
  bankId: number;
  creditCardId?: number | null;
  reconciled: boolean;
  ofxImportId?: number | null;
}

export interface Forecast {
  id: number | string;
  date: string;
  description: string;
  value: number;
  type: TransactionType;
  bankId: number;
  creditCardId?: number | null;
  categoryId: number;
  realized: boolean;
  installmentCurrent?: number;
  installmentTotal?: number;
  groupId?: string;
}

export interface DashboardStats {
  totalBalance: number;
  totalIncome: number;
  totalExpense: number;
  reconciledCount: number;
  pendingCount: number;
}