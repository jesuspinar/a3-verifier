import { TestBed } from '@angular/core/testing';
import * as Papa from 'papaparse';
import { CsvParserService, resolvePapaParseModule } from './csv-parser.service';

describe('CsvParserService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('parses A3 records from a CSV file', async () => {
    const service = TestBed.inject(CsvParserService);
    const file = new File(
      [
        '\uFEFFModelo;Período;Razón social / Apellidos, Nombre;N.I.F.;Fecha de presentación\n',
        '303;1T/2024;Acme SL;B12345678;02/04/2024\n',
      ],
      'a3.csv',
      { type: 'text/csv' },
    );

    const parsed = await service.parse(file);

    expect(parsed.records).toEqual([
      {
        id: 'a3-2',
        nif: 'B12345678',
        model: '303',
        period: '1T/2024',
        companyName: 'Acme SL',
        filingDate: '02/04/2024',
        surname: 'Acme SL',
        name: '',
        rowNumber: 2,
      },
    ]);
    expect(parsed.warnings).toEqual([]);
  });

  it('decodes Windows-1252 CSV content', async () => {
    const service = TestBed.inject(CsvParserService);
    const file = new File(
      [
        new Uint8Array([
          ...ascii('Modelo;Periodo;Razon social / Apellidos, Nombre;N.I.F.;Presentacion\n'),
          ...ascii('303;1T/2024;Mu'),
          0xf1,
          ...ascii('oz '),
          0xc1,
          ...ascii('lvarez SL;B12345678;02/04/2024\n'),
        ]),
      ],
      'a3-windows-1252.csv',
      { type: 'text/csv' },
    );

    const parsed = await service.parse(file);

    expect(parsed.records[0].companyName).toBe('Muñoz Álvarez SL');
    expect(parsed.records[0].surname).toBe('Muñoz Álvarez SL');
    expect(parsed.warnings).toEqual([]);
  });

  it('accepts PapaParse when it is exposed as a default CommonJS export', () => {
    const module = resolvePapaParseModule({ default: Papa } as typeof Papa & {
      readonly default: typeof Papa;
    });

    expect(module.parse).toBe(Papa.parse);
  });
});

function ascii(value: string): number[] {
  return Array.from(value, (char) => char.charCodeAt(0));
}
