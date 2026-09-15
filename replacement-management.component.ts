import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ReplacementService } from '../../../core/services/replacement.service';
import { SnackbarService } from '../../../core/services/snackbar.service';
import {
  ReplacementRequest,
  ReplacementStatus,
  ReplacementPagination
} from '../../../core/models/replacement.model';

@Component({
  selector: 'app-replacement-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './replacement-management.component.html',
  styleUrls: ['./replacement-management.component.scss']
})
export class ReplacementManagementComponent implements OnInit {
  private service = inject(ReplacementService);
  private snackbar = inject(SnackbarService);

  requests = signal<ReplacementRequest[]>([]);
  pagination = signal<ReplacementPagination>({ currentPage: 1, totalPages: 1, totalRequests: 0 });
  loading = signal<boolean>(false);
  error = signal<string | null>(null);

  statusFilter = signal<ReplacementStatus | ''>('');
  page = signal<number>(1);
  readonly limit = 10;

  // Detail
  selected = signal<ReplacementRequest | null>(null);
  detailLoading = signal<boolean>(false);
  videoDownloaded = signal<boolean>(false);
  videoDownloading = signal<boolean>(false);
  videoUnavailable = signal<boolean>(false);

  // Approve dialog
  showApproveDialog = signal<boolean>(false);
  approveUpiId = '';
  approveUpiRequired = signal<boolean>(false);
  approveSubmitting = signal<boolean>(false);

  // Reject dialog
  showRejectDialog = signal<boolean>(false);
  rejectReason = '';
  rejectSubmitting = signal<boolean>(false);

  // Reveal UPI
  revealedUpi = signal<string | null>(null);
  revealingUpi = signal<boolean>(false);

  readonly statuses: (ReplacementStatus | '')[] = ['', 'PENDING', 'APPROVED', 'REJECTED'];

  pageNumbers = computed(() => {
    const total = this.pagination().totalPages;
    return Array.from({ length: total }, (_, i) => i + 1);
  });

  ngOnInit(): void {
    this.loadList();
  }

  async loadList(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const response = await firstValueFrom(
        this.service.getAdminReplacements(this.statusFilter(), this.page(), this.limit)
      );
      this.requests.set(response.data?.requests ?? []);
      if (response.data?.pagination) {
        this.pagination.set(response.data.pagination);
      }
    } catch (err: any) {
      this.error.set(err.error?.message || 'Failed to load replacement requests');
    } finally {
      this.loading.set(false);
    }
  }

  onFilterChange(status: ReplacementStatus | ''): void {
    this.statusFilter.set(status);
    this.page.set(1);
    this.loadList();
  }

  goToPage(p: number): void {
    if (p < 1 || p > this.pagination().totalPages || p === this.page()) return;
    this.page.set(p);
    this.loadList();
  }

  orderOf(req: ReplacementRequest | null): any {
    return req?.order && typeof req.order === 'object' ? req.order : null;
  }

  userOf(req: ReplacementRequest | null): any {
    return req?.user && typeof req.user === 'object' ? req.user : null;
  }

  productOf(req: ReplacementRequest | null): any {
    return req?.productId && typeof req.productId === 'object' ? req.productId : null;
  }

  statusClass(status?: string): string {
    return `badge-${(status || '').toLowerCase()}`;
  }

  // ---- Detail ----

  async openDetail(req: ReplacementRequest): Promise<void> {
    this.selected.set(req);
    this.detailLoading.set(true);
    this.videoDownloaded.set(false);
    this.videoUnavailable.set(false);
    this.revealedUpi.set(null);
    try {
      const response = await firstValueFrom(this.service.getAdminReplacement(req._id));
      if (response.data) {
        this.selected.set(response.data);
        this.videoDownloaded.set(!!response.data.videoDownloaded);
      }
    } catch (err: any) {
      this.snackbar.error(err.error?.message || 'Failed to load request details');
    } finally {
      this.detailLoading.set(false);
    }
  }

  closeDetail(): void {
    this.selected.set(null);
    this.showApproveDialog.set(false);
    this.showRejectDialog.set(false);
  }

  // ---- Video (download once) ----

  async downloadVideo(): Promise<void> {
    const req = this.selected();
    if (!req) return;
    const confirmed = window.confirm(
      'This video can be downloaded only once. Continue with the download?'
    );
    if (!confirmed) return;

    this.videoDownloading.set(true);
    try {
      const blob = await firstValueFrom(this.service.downloadVideo(req._id));
      this.triggerBlobDownload(blob, `replacement-${req._id}-video`);
      this.videoDownloaded.set(true);
      this.snackbar.success('Video downloaded. This link is now used up.');
    } catch (err: any) {
      const status = err.status;
      const message = await this.extractBlobErrorMessage(err);
      if (status === 403) {
        this.videoDownloaded.set(true);
        this.snackbar.error(message || 'Video already downloaded');
      } else if (status === 404) {
        this.videoUnavailable.set(true);
        this.snackbar.error(message || 'Video not found');
      } else {
        this.snackbar.error(message || 'Failed to download video');
      }
    } finally {
      this.videoDownloading.set(false);
    }
  }

  private triggerBlobDownload(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  /** Error bodies from blob requests arrive as Blob; parse the JSON message. */
  private async extractBlobErrorMessage(err: any): Promise<string | null> {
    try {
      if (err.error instanceof Blob) {
        const text = await err.error.text();
        return JSON.parse(text)?.message ?? null;
      }
      return err.error?.message ?? null;
    } catch {
      return null;
    }
  }

  // ---- Approve ----

  openApproveDialog(): void {
    this.approveUpiId = '';
    this.approveUpiRequired.set(false);
    this.showApproveDialog.set(true);
  }

  closeApproveDialog(): void {
    this.showApproveDialog.set(false);
  }

  async confirmApprove(): Promise<void> {
    const req = this.selected();
    if (!req) return;

    if (this.approveUpiRequired() && !this.approveUpiId.trim()) {
      this.snackbar.warning('UPI id is required to refund a COD order');
      return;
    }

    this.approveSubmitting.set(true);
    try {
      const response = await firstValueFrom(
        this.service.approveReplacement(req._id, this.approveUpiId)
      );
      if (response.data) {
        this.selected.set(response.data);
      }
      const resolution = response.data?.resolution;
      const refundStatus = response.data?.refund?.status;
      this.snackbar.success(
        `Approved.${resolution ? ' Resolution: ' + resolution + '.' : ''}${refundStatus ? ' Refund: ' + refundStatus + '.' : ''}`
      );
      this.showApproveDialog.set(false);
      this.loadList();
    } catch (err: any) {
      const message = err.error?.message || 'Failed to approve request';
      if (message === 'UPI id is required to refund a COD order') {
        this.approveUpiRequired.set(true);
        this.showApproveDialog.set(true);
        this.snackbar.warning(message);
      } else {
        this.snackbar.error(message);
      }
    } finally {
      this.approveSubmitting.set(false);
    }
  }

  // ---- Reject ----

  openRejectDialog(): void {
    this.rejectReason = '';
    this.showRejectDialog.set(true);
  }

  closeRejectDialog(): void {
    this.showRejectDialog.set(false);
  }

  async confirmReject(): Promise<void> {
    const req = this.selected();
    if (!req) return;

    if (!this.rejectReason.trim()) {
      this.snackbar.warning('Rejection reason is required');
      return;
    }

    this.rejectSubmitting.set(true);
    try {
      const response = await firstValueFrom(
        this.service.rejectReplacement(req._id, this.rejectReason.trim())
      );
      if (response.data) {
        this.selected.set(response.data);
      }
      this.snackbar.success('Request rejected');
      this.showRejectDialog.set(false);
      this.loadList();
    } catch (err: any) {
      this.snackbar.error(err.error?.message || 'Failed to reject request');
    } finally {
      this.rejectSubmitting.set(false);
    }
  }

  // ---- Reveal manual-refund UPI ----

  get canRevealUpi(): boolean {
    return this.selected()?.refund?.method === 'UPI_MANUAL';
  }

  async revealUpi(): Promise<void> {
    const req = this.selected();
    if (!req) return;
    const confirmed = window.confirm('Reveal the customer UPI id for this manual refund?');
    if (!confirmed) return;

    this.revealingUpi.set(true);
    try {
      const response = await firstValueFrom(this.service.revealRefundUpi(req._id));
      this.revealedUpi.set(response.data?.upiId ?? null);
    } catch (err: any) {
      this.snackbar.error(err.error?.message || 'No manual UPI found for this request');
    } finally {
      this.revealingUpi.set(false);
    }
  }

  maskUpi(upi: string | null): string {
    if (!upi) return '';
    const [name, handle] = upi.split('@');
    if (!handle) return upi;
    const visible = name.slice(0, 2);
    return `${visible}${'•'.repeat(Math.max(name.length - 2, 2))}@${handle}`;
  }

  async copyUpi(): Promise<void> {
    const upi = this.revealedUpi();
    if (!upi) return;
    try {
      await navigator.clipboard.writeText(upi);
      this.snackbar.success('UPI id copied to clipboard');
    } catch {
      this.snackbar.error('Failed to copy');
    }
  }
}
