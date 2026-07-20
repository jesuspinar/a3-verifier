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

@Injectable({ providedIn: 'root' })
export class ReconciliationEngineService {
  reconcile(
    a3Records: readonly A3Record[],
    pdfReceipts: readonly PdfReceipt[],
  ): ReconciliationResult[] {
    const a3ByKey = this.groupComplete(a3Records);
    const pdfByKey = this.groupComplete(pdfReceipts);
    const completeKeys = new Set([...a3ByKey.keys(), ...pdfByKey.keys()]);
    const results = [...completeKeys].map((key) =>
      this.reconcileKey(key, a3ByKey.get(key) ?? [], pdfByKey.get(key) ?? []),
    );

    for (const record of a3Records.filter((item) => !buildKey(item))) {
      results.push(this.incompleteA3(record, pdfReceipts));
    }
    for (const receipt of pdfReceipts.filter((item) => !buildKey(item))) {
      results.push(this.incompletePdf(receipt, a3Records));
    }

    return results.sort(
      (left, right) => left.key.localeCompare(right.key) || left.id.localeCompare(right.id),
    );
  }

  private reconcileKey(
    key: string,
    a3Records: readonly A3Record[],
    pdfReceipts: readonly PdfReceipt[],
  ): ReconciliationResult {
    const a3 = a3Records[0];
    const pdf = pdfReceipts[0];
    let status: ReconciliationStatus;
    let explanation: string;
    let explanationMessage: TranslationMessage;

    if (a3Records.length > 1 || pdfReceipts.length > 1) {
      status = 'Duplicate';
      explanation = `The key occurs ${a3Records.length} time(s) in A3 and ${pdfReceipts.length} time(s) in the PDF folder.`;
      explanationMessage = {
        key: 'reconciliation.explanation.duplicate',
        params: { a3Count: a3Records.length, pdfCount: pdfReceipts.length },
      };
    } else if (!pdf) {
      status = 'No PDF receipt';
      explanation = 'The A3 record has no PDF receipt with the same exact key.';
      explanationMessage = { key: 'reconciliation.explanation.noPdf' };
    } else if (!a3) {
      status = 'PDF not found in A3';
      explanation = 'The PDF receipt has no A3 record with the same exact key.';
      explanationMessage = { key: 'reconciliation.explanation.noA3' };
    } else {
      status = 'Matches';
      explanation = 'Exactly one A3 record and one PDF receipt have the same key.';
      explanationMessage = { key: 'reconciliation.explanation.matches' };
    }

    const warning =
      a3 &&
      pdf &&
      a3.companyName &&
      pdf.companyName &&
      !namesAreSimilar(a3.companyName, pdf.companyName)
        ? `Company name differs: A3 “${a3.companyName}”; PDF “${pdf.companyName}”.`
        : '';
    const warningMessage =
      a3 && pdf && warning
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

  private incompleteA3(record: A3Record, pdfReceipts: readonly PdfReceipt[]): ReconciliationResult {
    const suggestion = this.findSuggestion(record.companyName, pdfReceipts, 'PDF');
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

  private incompletePdf(receipt: PdfReceipt, a3Records: readonly A3Record[]): ReconciliationResult {
    const suggestion = this.findSuggestion(receipt.companyName, a3Records, 'A3');
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
    candidates: readonly (A3Record | PdfReceipt)[],
    origin: 'A3' | 'PDF',
  ): SuggestionResult {
    if (!normalizeText(companyName)) {
      return { text: '' };
    }
    const candidate = candidates.find((item) => namesAreSimilar(companyName, item.companyName));
    if (!candidate) {
      return { text: '' };
    }
    const descriptor =
      'fileName' in candidate ? candidate.fileName : `CSV row ${candidate.rowNumber}`;
    return {
      text: `Possible ${origin} match by name only: ${descriptor}.`,
      message: {
        key: 'reconciliation.suggestion.nameOnly',
        params: { origin, descriptor },
      },
    };
  }

  private groupComplete<T extends A3Record | PdfReceipt>(items: readonly T[]): Map<string, T[]> {
    const groups = new Map<string, T[]>();
    for (const item of items) {
      const key = buildKey(item);
      if (!key) {
        continue;
      }
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return groups;
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
      pdfFile: source.pdf?.file ?? null,
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
