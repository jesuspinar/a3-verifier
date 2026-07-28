import { ChangeDetectionStrategy, Component, effect, inject, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import {
  RECONCILIATION_STATUSES,
  ReconciliationResult,
  ReconciliationStatus,
} from '../../models/reconciliation.models';
import { I18nService } from '../../services/i18n.service';
import type { TranslationKey, TranslationMessage } from '../../services/i18n.service';
import { ReconciliationService } from '../../services/reconciliation.service';

interface TableFilter {
  query: string;
  status: ReconciliationStatus | '';
}

@Component({
  selector: 'app-results',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatPaginatorModule,
    MatSelectModule,
    MatSortModule,
    MatTableModule,
  ],
  templateUrl: './results.component.html',
  styleUrl: './results.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultsComponent {
  readonly statuses = RECONCILIATION_STATUSES;
  readonly i18n = inject(I18nService);
  readonly reconciliation = inject(ReconciliationService);
  readonly displayedColumns = [
    'nif',
    'model',
    'period',
    'companyName',
    'filingDate',
    'status',
    'actions',
  ];
  readonly dataSource = new MatTableDataSource<ReconciliationResult>([]);

  private readonly paginator = viewChild(MatPaginator);
  private readonly sort = viewChild(MatSort);
  private readonly dialog = inject(MatDialog);
  private filter: TableFilter = { query: '', status: '' };

  constructor() {
    this.dataSource.filterPredicate = (row, serializedFilter) =>
      this.matchesFilter(row, serializedFilter);
    effect(() => {
      this.dataSource.data = [...this.reconciliation.results()];
      this.dataSource.paginator = this.paginator() ?? null;
      this.dataSource.sort = this.sort() ?? null;
      this.dataSource.filter = JSON.stringify(this.filter);
    });
  }

  applyTextFilter(event: Event): void {
    this.filter = {
      ...this.filter,
      query: (event.target as HTMLInputElement).value.trim().toLowerCase(),
    };
    this.updateFilter();
  }

  applyStatusFilter(status: ReconciliationStatus | ''): void {
    this.filter = { ...this.filter, status };
    this.updateFilter();
  }

  async showDetails(result: ReconciliationResult): Promise<void> {
    const { ResultDetailsDialogComponent } =
      await import('../result-details-dialog/result-details-dialog.component');
    this.dialog.open(ResultDetailsDialogComponent, { data: result, width: 'min(42rem, 95vw)' });
  }

  statusClass(status: ReconciliationStatus): string {
    return `status-${status.toLowerCase().replace(/[^a-z]+/g, '-')}`;
  }

  statusLabel(status: ReconciliationStatus): string {
    return this.i18n.t(`status.${status}` as TranslationKey);
  }

  message(message: TranslationMessage): string {
    return this.i18n.message(message);
  }

  incidentText(row: ReconciliationResult): string {
    return (
      this.i18n.message(row.warningMessage) ||
      this.i18n.message(row.suggestionMessage) ||
      this.i18n.message(row.explanationMessage)
    );
  }

  private updateFilter(): void {
    this.dataSource.filter = JSON.stringify(this.filter);
    this.dataSource.paginator?.firstPage();
  }

  private matchesFilter(row: ReconciliationResult, serializedFilter: string): boolean {
    const filter = JSON.parse(serializedFilter || '{}') as Partial<TableFilter>;
    const searchable = [
      row.nif,
      row.model,
      row.period,
      row.companyName,
      row.filingDate,
      row.pdfFileName,
      this.statusLabel(row.status),
      this.i18n.message(row.explanationMessage),
      this.i18n.message(row.warningMessage),
      this.i18n.message(row.suggestionMessage),
    ]
      .join(' ')
      .toLowerCase();
    return (
      (!filter.status || row.status === filter.status) &&
      (!filter.query || searchable.includes(filter.query))
    );
  }
}
