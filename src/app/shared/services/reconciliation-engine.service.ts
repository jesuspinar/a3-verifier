import { Injectable } from '@angular/core';
import {
  A3Record,
  PdfReceipt,
  ReconciliationResult,
  ReconciliationStatus,
} from '../models/reconciliation.models';
import type { TranslationMessage } from './i18n.service';
import { buildKey, namesAreSimilar, normalizeText } from './normalization';

interface SuggestionResult {
  readonly text: string;
  readonly message?: TranslationMessage;
}

interface SuggestionCandidate {
  readonly normalizedName: string;
  readonly descriptor: string;
}

interface SuggestionIndex {
  readonly exact: Map<string, SuggestionCandidate>;
  readonly candidates: readonly SuggestionCandidate[];
}

@Injectable({ providedIn: 'root' })
export class ReconciliationEngineService {
  reconcile(
    a3Records: readonly A3Record[],
    pdfReceipts: readonly PdfReceipt[],
  ): ReconciliationResult[] {
    const completeA3Records: A3Record[] = [];
    const incompleteA3Records: A3Record[] = [];
    const completePdfReceipts: PdfReceipt[] = [];
    const incompletePdfReceipts: PdfReceipt[] = [];

    this.partitionByCompleteKey(a3Records, completeA3Records, incompleteA3Records);
    this.partitionByCompleteKey(pdfReceipts, completePdfReceipts, incompletePdfReceipts);

    const a3ByKey = this.groupComplete(completeA3Records);
    const pdfByKey = this.groupComplete(completePdfReceipts);
    const a3SuggestionIndex = this.createSuggestionIndex(a3Records);
    const pdfSuggestionIndex = this.createSuggestionIndex(pdfReceipts);
    const completeKeys = new Set([...a3ByKey.keys(), ...pdfByKey.keys()]);
    const results = [...completeKeys].flatMap((key) => {
      const result = this.reconcileKey(key, a3ByKey.get(key) ?? [], pdfByKey.get(key) ?? []);
      return result ? [result] : [];
    });

    for (const record of incompleteA3Records) {
      results.push(this.incompleteA3(record, pdfSuggestionIndex));
    }
    for (const receipt of incompletePdfReceipts) {
      results.push(this.incompletePdf(receipt, a3SuggestionIndex));
    }

    return results.sort(
      (left, right) => left.key.localeCompare(right.key) || left.id.localeCompare(right.id),
    );
  }

  private reconcileKey(
    key: string,
    a3Records: readonly A3Record[],
    pdfReceipts: readonly PdfReceipt[],
  ): ReconciliationResult | null {
    const a3 = a3Records[0];
    const pdf = pdfReceipts[0];
    let status: ReconciliationStatus;
    let explanation: string;
    let explanationMessage: TranslationMessage;

    if (a3Records.length > 1 || !a3) {
      return null;
    }

    if (!pdf) {
      status = 'No PDF receipt';
      explanation = 'The A3 record has no PDF receipt with the same exact key.';
      explanationMessage = { key: 'reconciliation.explanation.noPdf' };
    } else {
      status = 'Matches';
      explanation = 'The A3 record has at least one PDF receipt with the same key.';
      explanationMessage = { key: 'reconciliation.explanation.matches' };
    }

    const pdfFileNames = pdfReceipts.map((receipt) => receipt.fileName).join(', ');
    const hasDuplicatedPdfs = pdfReceipts.length > 1;
    const warning = hasDuplicatedPdfs
      ? `Multiple PDF receipts share this key: ${pdfFileNames}.`
      : a3 &&
          pdf &&
          a3.companyName &&
          pdf.companyName &&
          !namesAreSimilar(a3.companyName, pdf.companyName)
        ? `Company name differs: A3 “${a3.companyName}”; PDF “${pdf.companyName}”.`
        : '';
    const warningMessage: TranslationMessage | undefined = hasDuplicatedPdfs
      ? {
          key: 'reconciliation.warning.duplicatedPdfs' as const,
          params: { count: pdfReceipts.length, fileNames: pdfFileNames },
        }
      : a3 && pdf && warning
        ? {
            key: 'reconciliation.warning.companyNameDiffers' as const,
            params: { a3CompanyName: a3.companyName, pdfCompanyName: pdf.companyName },
          }
        : undefined;

    return this.result({
      id: `key-${key}`,
      key,
      a3,
      pdf,
      status,
      explanation,
      explanationMessage,
      warning,
      warningMessage,
      suggestion: '',
      a3Count: a3Records.length,
      pdfCount: pdfReceipts.length,
    });
  }

  private incompleteA3(
    record: A3Record,
    pdfSuggestionIndex: SuggestionIndex,
  ): ReconciliationResult {
    const suggestion = this.findSuggestion(record.companyName, pdfSuggestionIndex, 'PDF');
    return this.result({
      id: `manual-${record.id}`,
      key: '',
      a3: record,
      pdf: undefined,
      status: 'Manual review',
      explanation:
        'The A3 record is missing NIF, model, or a period with year, so it cannot be matched automatically.',
      explanationMessage: { key: 'reconciliation.explanation.incompleteA3' },
      warning: '',
      warningMessage: undefined,
      suggestion: suggestion.text,
      suggestionMessage: suggestion.message,
      a3Count: 1,
      pdfCount: 0,
    });
  }

  private incompletePdf(
    receipt: PdfReceipt,
    a3SuggestionIndex: SuggestionIndex,
  ): ReconciliationResult {
    const suggestion = this.findSuggestion(receipt.companyName, a3SuggestionIndex, 'A3');
    const extraction = receipt.extractionWarning
      ? ` Text extraction failed: ${receipt.extractionWarning}`
      : '';
    return this.result({
      id: `manual-${receipt.id}`,
      key: '',
      a3: undefined,
      pdf: receipt,
      status: 'Manual review',
      explanation: `The PDF is missing NIF, model, or a period with year, so it cannot be matched automatically.${extraction}`,
      explanationMessage: receipt.extractionWarning
        ? {
            key: 'reconciliation.explanation.incompletePdfWithExtraction',
            params: { message: receipt.extractionWarning },
          }
        : { key: 'reconciliation.explanation.incompletePdf' },
      warning: '',
      warningMessage: undefined,
      suggestion: suggestion.text,
      suggestionMessage: suggestion.message,
      a3Count: 0,
      pdfCount: 1,
    });
  }

  private findSuggestion(
    companyName: string,
    index: SuggestionIndex,
    origin: 'A3' | 'PDF',
  ): SuggestionResult {
    const normalizedName = normalizeText(companyName);
    if (!normalizedName) {
      return { text: '' };
    }
    const candidate =
      index.exact.get(normalizedName) ??
      index.candidates.find(
        (item) =>
          item.normalizedName.includes(normalizedName) ||
          normalizedName.includes(item.normalizedName),
      );
    if (!candidate) {
      return { text: '' };
    }
    return {
      text: `Possible ${origin} match by name only: ${candidate.descriptor}.`,
      message: {
        key: 'reconciliation.suggestion.nameOnly',
        params: { origin, descriptor: candidate.descriptor },
      },
    };
  }

  private groupComplete<T extends A3Record | PdfReceipt>(items: readonly T[]): Map<string, T[]> {
    const groups = new Map<string, T[]>();
    for (const item of items) {
      const key = buildKey(item);
      const group = groups.get(key);
      if (group) {
        group.push(item);
      } else {
        groups.set(key, [item]);
      }
    }
    return groups;
  }

  private partitionByCompleteKey<T extends A3Record | PdfReceipt>(
    items: readonly T[],
    complete: T[],
    incomplete: T[],
  ): void {
    for (const item of items) {
      (buildKey(item) ? complete : incomplete).push(item);
    }
  }

  private createSuggestionIndex(items: readonly (A3Record | PdfReceipt)[]): SuggestionIndex {
    const exact = new Map<string, SuggestionCandidate>();
    const candidates: SuggestionCandidate[] = [];
    for (const item of items) {
      const normalizedName = normalizeText(item.companyName);
      if (!normalizedName) {
        continue;
      }
      const candidate = {
        normalizedName,
        descriptor: 'fileName' in item ? item.fileName : `CSV row ${item.rowNumber}`,
      };
      candidates.push(candidate);
      if (!exact.has(normalizedName)) {
        exact.set(normalizedName, candidate);
      }
    }
    return { exact, candidates };
  }

  private result(source: {
    id: string;
    key: string;
    a3: A3Record | undefined;
    pdf: PdfReceipt | undefined;
    status: ReconciliationStatus;
    explanation: string;
    warning: string;
    suggestion: string;
    explanationMessage: TranslationMessage;
    warningMessage?: TranslationMessage;
    suggestionMessage?: TranslationMessage;
    a3Count: number;
    pdfCount: number;
  }): ReconciliationResult {
    const parts = source.key.split('|');
    return {
      id: source.id,
      key: source.key,
      nif: source.a3?.nif || source.pdf?.nif || parts[0] || '',
      model: source.a3?.model || source.pdf?.model || parts[1] || '',
      period: source.a3?.period || source.pdf?.period || parts[2] || '',
      companyName: source.a3?.companyName || source.pdf?.companyName || '',
      filingDate: source.pdf?.filingDate || source.a3?.filingDate || '',
      pdfFileName: source.pdf?.fileName ?? '',
      status: source.status,
      explanation: source.explanation,
      warning: source.warning,
      suggestion: source.suggestion,
      explanationMessage: source.explanationMessage,
      warningMessage: source.warningMessage,
      suggestionMessage: source.suggestionMessage,
      a3Count: source.a3Count,
      pdfCount: source.pdfCount,
    };
  }
}
