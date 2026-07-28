import { A3Record, PdfReceipt } from '../models/reconciliation.models';
import { ReconciliationEngineService } from './reconciliation-engine.service';

describe('ReconciliationEngineService', () => {
  let service: ReconciliationEngineService;

  beforeEach(() => {
    service = new ReconciliationEngineService();
  });

  it('matches one A3 record with one PDF receipt by key', () => {
    const results = service.reconcile([a3Record()], [pdfReceipt()]);

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('Matches');
  });

  it('keeps one A3 record with no matching PDF as a missing receipt', () => {
    const results = service.reconcile([a3Record()], []);

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('No PDF receipt');
  });

  it('keeps incomplete A3 records for manual review', () => {
    const results = service.reconcile([a3Record({ period: '' })], []);

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('Manual review');
  });

  it('ignores PDF receipts that have no matching A3 row', () => {
    const results = service.reconcile([], [pdfReceipt()]);

    expect(results).toEqual([]);
  });

  it('ignores duplicated A3 keys', () => {
    const results = service.reconcile(
      [a3Record({ id: 'a3-1' }), a3Record({ id: 'a3-2', rowNumber: 2 })],
      [],
    );

    expect(results).toEqual([]);
  });

  it('ignores duplicated PDF keys', () => {
    const results = service.reconcile(
      [a3Record()],
      [pdfReceipt({ id: 'pdf-1' }), pdfReceipt({ id: 'pdf-2', fileName: 'receipt-2.pdf' })],
    );

    expect(results).toEqual([]);
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
    rowNumber: 1,
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
    file: new File(['receipt'], 'receipt.pdf', { type: 'application/pdf' }),
    fileName: 'receipt.pdf',
    ...overrides,
  };
}
