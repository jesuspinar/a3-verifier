import type { TranslationMessage } from '../services/i18n.service';

export const RECONCILIATION_STATUSES = ['Matches', 'No PDF receipt', 'Manual review'] as const;

export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number];

export interface A3Record {
  readonly id: string;
  readonly nif: string;
  readonly model: string;
  readonly period: string;
  readonly companyName: string;
  readonly filingDate: string;
  readonly surname: string;
  readonly name: string;
  readonly rowNumber: number;
}

export interface PdfReceipt {
  readonly id: string;
  readonly nif: string;
  readonly model: string;
  readonly period: string;
  readonly companyName: string;
  readonly filingDate: string;
  readonly fileName: string;
  readonly extractionWarning?: string;
}

export interface ReconciliationResult {
  readonly id: string;
  readonly key: string;
  readonly nif: string;
  readonly model: string;
  readonly period: string;
  readonly companyName: string;
  readonly filingDate: string;
  readonly pdfFileName: string;
  readonly status: ReconciliationStatus;
  readonly explanation: string;
  readonly warning: string;
  readonly suggestion: string;
  readonly explanationMessage: TranslationMessage;
  readonly warningMessage?: TranslationMessage;
  readonly suggestionMessage?: TranslationMessage;
  readonly a3Count: number;
  readonly pdfCount: number;
}

export interface ReconciliationSummary {
  readonly matches: number;
  readonly incidents: number;
  readonly total: number;
}

export interface ParsedCsv {
  readonly records: A3Record[];
  readonly warnings: TranslationMessage[];
}
