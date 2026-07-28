import { computed, inject, Injectable, signal } from '@angular/core';
import {
  A3Record,
  PdfReceipt,
  ReconciliationResult,
  ReconciliationSummary,
} from '../models/reconciliation.models';
import { CsvParserService } from './csv-parser.service';
import { I18nService } from './i18n.service';
import type { TranslationMessage } from './i18n.service';
import { PdfExtractionService } from './pdf-extraction.service';
import { ReconciliationEngineService } from './reconciliation-engine.service';

const MAX_CONCURRENT_PDF_EXTRACTIONS = 2;

interface ReconciliationState {
  readonly loading: boolean;
  readonly error: string | null;
  readonly a3Records: readonly A3Record[];
  readonly pdfReceipts: readonly PdfReceipt[];
  readonly results: readonly ReconciliationResult[];
  readonly csvWarnings: readonly TranslationMessage[];
}

const INITIAL_STATE: ReconciliationState = {
  loading: false,
  error: null,
  a3Records: [],
  pdfReceipts: [],
  results: [],
  csvWarnings: [],
};

@Injectable({ providedIn: 'root' })
export class ReconciliationService {
  private readonly csvParser = inject(CsvParserService);
  private readonly i18n = inject(I18nService);
  private readonly pdfExtractor = inject(PdfExtractionService);
  private readonly engine = inject(ReconciliationEngineService);
  private readonly state = signal<ReconciliationState>(INITIAL_STATE);

  readonly loading = computed(() => this.state().loading);
  readonly error = computed(() => this.state().error);
  readonly results = computed(() => this.state().results);
  readonly csvWarnings = computed(() => this.state().csvWarnings);
  readonly hasResults = computed(() => this.results().length > 0);
  readonly summary = computed<ReconciliationSummary>(() => {
    const current = this.state();
    const results = current.results;
    const matches = results.filter((result) => result.status === 'Matches').length;
    const noPdfReceipts = results.filter((result) => result.status === 'No PDF receipt').length;
    return { matches, noPdfReceipts, total: current.a3Records.length };
  });

  async process(csvFile: File, pdfFiles: readonly File[]): Promise<void> {
    this.updateState({ loading: true, error: null, results: [], csvWarnings: [] });
    try {
      const parsedCsv = await this.csvParser.parse(csvFile);
      const pdfReceipts = await this.extractPdfReceipts(pdfFiles);
      const results = this.engine.reconcile(parsedCsv.records, pdfReceipts);
      this.updateState({
        a3Records: parsedCsv.records,
        pdfReceipts,
        results,
        csvWarnings: parsedCsv.warnings,
      });
    } catch (error) {
      console.error('Reconciliation error:', error);
      const message =
        error instanceof Error ? error.message : this.i18n.t('dashboard.error.fallback');
      this.updateState({ error: message });
      throw error;
    } finally {
      this.updateState({ loading: false });
    }
  }

  reset(): void {
    this.state.set(INITIAL_STATE);
  }

  private updateState(partial: Partial<ReconciliationState>): void {
    this.state.update((current) => ({ ...current, ...partial }));
  }

  private async extractPdfReceipts(pdfFiles: readonly File[]): Promise<PdfReceipt[]> {
    const receipts = new Array<PdfReceipt>(pdfFiles.length);
    let nextIndex = 0;
    const workerCount = Math.min(MAX_CONCURRENT_PDF_EXTRACTIONS, pdfFiles.length);

    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (nextIndex < pdfFiles.length) {
          const index = nextIndex;
          nextIndex += 1;
          receipts[index] = await this.pdfExtractor.extract(pdfFiles[index], index);
        }
      }),
    );

    return receipts;
  }
}
