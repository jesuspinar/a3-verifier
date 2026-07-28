import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatListModule } from '@angular/material/list';
import { ReconciliationResult } from '../../models/reconciliation.models';
import { I18nService } from '../../services/i18n.service';

@Component({
  selector: 'app-result-details-dialog',
  imports: [MatButtonModule, MatDialogModule, MatDividerModule, MatListModule],
  templateUrl: './result-details-dialog.component.html',
  styleUrl: './result-details-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultDetailsDialogComponent {
  readonly data = inject<ReconciliationResult>(MAT_DIALOG_DATA);
  readonly i18n = inject(I18nService);
  private readonly dialogRef = inject(MatDialogRef<ResultDetailsDialogComponent>);

  close(): void {
    this.dialogRef.close();
  }
}
