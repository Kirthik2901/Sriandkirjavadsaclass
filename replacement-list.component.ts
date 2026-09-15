import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ReplacementService } from '../../../core/services/replacement.service';
import { ReplacementRequest } from '../../../core/models/replacement.model';

@Component({
  selector: 'app-replacement-list',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './replacement-list.component.html',
  styleUrls: ['./replacement-list.component.scss']
})
export class ReplacementListComponent implements OnInit {
  private replacementService = inject(ReplacementService);

  requests = signal<ReplacementRequest[]>([]);
  loading = signal<boolean>(false);
  error = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const response = await firstValueFrom(this.replacementService.getMyReplacements());
      this.requests.set(response.data ?? []);
    } catch (err: any) {
      this.error.set(err.error?.message || 'Failed to load your replacement requests');
    } finally {
      this.loading.set(false);
    }
  }

  orderOf(request: ReplacementRequest): any {
    return request.order && typeof request.order === 'object' ? request.order : null;
  }

  statusClass(status: string): string {
    return `badge-${status?.toLowerCase()}`;
  }
}
