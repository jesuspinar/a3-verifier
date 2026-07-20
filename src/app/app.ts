import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DashboardComponent } from './shared/components/dashboard/dashboard.component';

@Component({
  selector: 'app-root',
  imports: [DashboardComponent],
  template: '<app-dashboard />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
