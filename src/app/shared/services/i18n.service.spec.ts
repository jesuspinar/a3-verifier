import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { I18nService } from './i18n.service';

describe('I18nService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('initializes from persisted language', () => {
    localStorage.setItem('a3-docs-verifier.language', 'en');

    const service = TestBed.inject(I18nService);

    expect(service.language()).toBe('en');
    expect(service.t('dashboard.title')).toBe('Verify A3 filings');
  });

  it('interpolates translation parameters', () => {
    const service = TestBed.inject(I18nService);

    service.setLanguage('es');

    expect(service.t('dashboard.pdfCount', { count: 3 })).toBe('3 PDF seleccionado(s)');
  });

  it('persists language changes and updates the html lang attribute', () => {
    const service = TestBed.inject(I18nService);
    const document = TestBed.inject(DOCUMENT);

    service.setLanguage('en');
    TestBed.tick();

    expect(localStorage.getItem('a3-docs-verifier.language')).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });
});
