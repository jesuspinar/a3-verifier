import { TestBed } from '@angular/core/testing';
import { A3Record, PdfReceipt, ReconciliationResult } from '../models/reconciliation.models';
import { CsvParserService } from './csv-parser.service';
import { I18nService } from './i18n.service';
import { PdfExtractionService } from './pdf-extraction.service';
import { ReconciliationEngineService } from './reconciliation-engine.service';
import { ReconciliationService } from './reconciliation.service';

describe('ReconciliationService', () => {
  const csvRecords = [a3Record({ id: 'a3-1' }), a3Record({ id: 'a3-2', rowNumber: 3 })];
  let csvParser: { parse: ReturnType<typeof vi.fn> };
  let pdfExtractor: { extract: ReturnType<typeof vi.fn> };
  let engine: { reconcile: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    csvParser = {
      parse: vi.fn().mockResolvedValue({ records: csvRecords, warnings: [] }),
    };
    pdfExtractor = {
      extract: vi.fn((file: File, index: number) =>
        Promise.resolve(pdfReceipt({ id: `pdf-${index}`, fileName: file.name })),
      ),
    };
    engine = {
      reconcile: vi.fn((_: readonly A3Record[], pdfReceipts: readonly PdfReceipt[]) =>
        pdfReceipts.map((receipt, index) =>
          reconciliationResult({
            id: `result-${index}`,
            pdf: receipt,
            status: index === 0 ? 'Matches' : 'Manual review',
          }),
        ),
      ),
    };

    TestBed.configureTestingModule({
      providers: [
        ReconciliationService,
        I18nService,
        { provide: CsvParserService, useValue: csvParser },
        { provide: PdfExtractionService, useValue: pdfExtractor },
        { provide: ReconciliationEngineService, useValue: engine },
      ],
    });
  });

  it('keeps the A3 record total independent from the number of PDFs', async () => {
    const service = TestBed.inject(ReconciliationService);

    await service.process(new File(['csv'], 'a3.csv'), [new File(['pdf'], 'one.pdf')]);

    expect(service.summary().total).toBe(2);
    expect(service.summary().matches).toBe(1);
    expect(service.summary().noPdfReceipts).toBe(0);
    expect(service.results()).toHaveLength(1);

    await service.process(new File(['csv'], 'a3.csv'), [
      new File(['pdf'], 'one.pdf'),
      new File(['pdf'], 'two.pdf'),
      new File(['pdf'], 'three.pdf'),
    ]);

    expect(service.summary().total).toBe(2);
    expect(service.summary().matches).toBe(1);
    expect(service.summary().noPdfReceipts).toBe(0);
    expect(service.results()).toHaveLength(3);
  });

  it('counts only no-PDF results in the no-PDF summary', async () => {
    engine.reconcile.mockReturnValue([
      reconciliationResult({ id: 'clean-match', pdf: pdfReceipt({ id: 'pdf-1' }) }),
      reconciliationResult({
        id: 'warned-match',
        pdf: pdfReceipt({ id: 'pdf-2', fileName: 'duplicate.pdf' }),
        warningMessage: {
          key: 'reconciliation.warning.duplicatedPdfs',
          params: { count: 2, fileNames: 'one.pdf, duplicate.pdf' },
        },
      }),
      reconciliationResult({
        id: 'manual-review',
        pdf: pdfReceipt({ id: 'pdf-3', fileName: 'unreadable.pdf' }),
        status: 'Manual review',
      }),
      reconciliationResult({
        id: 'missing-pdf',
        pdf: pdfReceipt({ id: 'pdf-4', fileName: '' }),
        status: 'No PDF receipt',
      }),
    ]);
    const service = TestBed.inject(ReconciliationService);

    await service.process(new File(['csv'], 'a3.csv'), [new File(['pdf'], 'one.pdf')]);

    expect(service.summary()).toEqual({ total: 2, matches: 2, noPdfReceipts: 1 });
  });
});

function a3Record(overrides: Partial<A3Record> = {}): A3Record {
  return {
    id: 'a3-1',
    nif: 'B12345678',
    model: '303',
    period: '1T/2026',
    companyName: 'Acme SL',
    filingDate: '01/04/2026',
    surname: '',
    name: '',
    rowNumber: 2,
    ...overrides,
  };
}

function pdfReceipt(overrides: Partial<PdfReceipt> = {}): PdfReceipt {
  return {
    id: 'pdf-1',
    nif: 'B12345678',
    model: '303',
    period: '1T/2026',
    companyName: 'Acme SL',
    filingDate: '01/04/2026',
    fileName: 'receipt.pdf',
    ...overrides,
  };
}

function reconciliationResult(
  overrides: Partial<ReconciliationResult> & { pdf: PdfReceipt },
): ReconciliationResult {
  return {
    id: 'result-1',
    key: '',
    nif: overrides.pdf.nif,
    model: overrides.pdf.model,
    period: overrides.pdf.period,
    companyName: overrides.pdf.companyName,
    filingDate: overrides.pdf.filingDate,
    pdfFileName: overrides.pdf.fileName,
    status: 'Matches',
    explanation: '',
    warning: '',
    suggestion: '',
    explanationMessage: { key: 'reconciliation.explanation.matches' },
    a3Count: 1,
    pdfCount: 1,
    ...overrides,
  };
}
