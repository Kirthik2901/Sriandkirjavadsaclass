import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { OrderService } from '../../../core/services/orderService';
import { ReplacementService } from '../../../core/services/replacement.service';
import { SnackbarService } from '../../../core/services/snackbar.service';
import {
  REPLACEMENT_REASONS,
  ALLOWED_VIDEO_MIME_TYPES,
  MAX_VIDEO_SIZE_BYTES,
  ReplacementPhoto
} from '../../../core/models/replacement.model';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-order-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule],
  templateUrl: './order-detail.component.html',
  styleUrls: ['./order-detail.component.scss']
})
export class OrderDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private orderService = inject(OrderService);
  private fb = inject(FormBuilder);
  private replacementService = inject(ReplacementService);
  private snackbar = inject(SnackbarService);

  order = signal<any>(null);
  loading = signal<boolean>(false);
  showReturnForm = signal<boolean>(false);
  returnForm!: FormGroup;
  submitting = signal<boolean>(false);

  // Replacement flow
  readonly reasonOptions = REPLACEMENT_REASONS;
  showReplacementForm = signal<boolean>(false);
  replacementForm!: FormGroup;
  replacementSubmitting = signal<boolean>(false);
  uploadingPhotos = signal<boolean>(false);
  replacementPhotos = signal<ReplacementPhoto[]>([]);
  selectedVideo = signal<File | null>(null);

  ngOnInit(): void {
    this.initReturnForm();
    this.initReplacementForm();
    this.loadOrder();
  }

  private initReturnForm(): void {
    this.returnForm = this.fb.group({
      reason: ['', [Validators.required, Validators.minLength(10)]]
    });
  }

  private initReplacementForm(): void {
    this.replacementForm = this.fb.group({
      reason: ['', [Validators.required]],
      reasonText: [''],
      productId: ['']
    });

    this.replacementForm.get('reason')!.valueChanges.subscribe((reason: string) => {
      const reasonText = this.replacementForm.get('reasonText')!;
      if (reason === 'OTHER') {
        reasonText.setValidators([Validators.required, Validators.minLength(3)]);
      } else {
        reasonText.clearValidators();
      }
      reasonText.updateValueAndValidity();
    });
  }

  private async loadOrder(): Promise<void> {
    this.loading.set(true);
    const orderId = this.route.snapshot.paramMap.get('id');
    
    try {
      const response = await this.orderService.getOrderById(orderId!).toPromise();
      this.order.set(response.data);
    } catch (error) {
      console.error('Failed to load order:', error);
      alert('Failed to load order details');
    } finally {
      this.loading.set(false);
    }
  }

  canRequestReturn(): boolean {
    const order = this.order();
    if (!order) return false;
    
    if (order.status !== 'delivered') return false;
    if (order.returnRequest?.requested) return false;
    
    const deliveryDate = new Date(order.deliveredAt);
    const daysSinceDelivery = Math.floor((Date.now() - deliveryDate.getTime()) / (1000 * 60 * 60 * 24));
    
    return daysSinceDelivery <= 7;
  }

  async submitReturn(): Promise<void> {
    if (this.returnForm.invalid) {
      this.returnForm.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    
    try {
      const response = await this.orderService.requestReturn(
        this.order()._id,
        this.returnForm.value.reason
      ).toPromise();
      
      this.order.set(response.data);
      this.showReturnForm.set(false);
      this.returnForm.reset();
      alert('Return request submitted successfully!');
    } catch (error: any) {
      console.error('Return request error:', error);
      alert(error.error?.message || 'Failed to submit return request');
    } finally {
      this.submitting.set(false);
    }
  }

  downloadInvoice(): void {
    window.open(`/api/orders/${this.order()._id}/invoice`, '_blank');
  }

  getStatusBadgeClass(status: string): string {
    const statusClasses: any = {
      'pending': 'status-pending',
      'confirmed': 'status-confirmed',
      'processing': 'status-processing',
      'shipped': 'status-shipped',
      'delivered': 'status-delivered',
      'cancelled': 'status-cancelled',
      'returned': 'status-returned'
    };
    return statusClasses[status] || '';
  }

  getReturnStatusBadgeClass(status: string): string {
    const statusClasses: any = {
      'pending': 'return-pending',
      'approved': 'return-approved',
      'rejected': 'return-rejected',
      'completed': 'return-completed'
    };
    return statusClasses[status] || '';
  }

  // ---- Replacement flow ----

  /** Delivered and within the 3-day replacement window. */
  canRequestReplacement(): boolean {
    const order = this.order();
    if (!order) return false;
    if (order.status !== 'delivered') return false;
    if (order.replacementRequest?.requested || order.replacementRequestId) return false;
    if (!order.deliveredAt) return false;

    const deliveryDate = new Date(order.deliveredAt);
    const daysSinceDelivery =
      (Date.now() - deliveryDate.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceDelivery <= 3;
  }

  openReplacementForm(): void {
    this.replacementForm.reset({ reason: '', reasonText: '', productId: '' });
    this.replacementPhotos.set([]);
    this.selectedVideo.set(null);
    this.showReplacementForm.set(true);
  }

  cancelReplacementForm(): void {
    this.showReplacementForm.set(false);
  }

  async onPhotosSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const files = Array.from(input.files);
    this.uploadingPhotos.set(true);
    try {
      for (const file of files) {
        if (!file.type.startsWith('image/')) {
          this.snackbar.warning(`${file.name} is not an image and was skipped`);
          continue;
        }
        const photo = await this.replacementService.uploadPhoto(file);
        this.replacementPhotos.update((list: ReplacementPhoto[]) => [...list, photo]);
      }
    } catch (error) {
      console.error('Photo upload error:', error);
      this.snackbar.error('Failed to upload one or more photos. Please try again.');
    } finally {
      this.uploadingPhotos.set(false);
      input.value = '';
    }
  }

  removePhoto(fileId: string): void {
    this.replacementPhotos.update((list: ReplacementPhoto[]) => list.filter(p => p.fileId !== fileId));
  }

  onVideoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (!file) {
      this.selectedVideo.set(null);
      return;
    }

    if (!ALLOWED_VIDEO_MIME_TYPES.includes(file.type)) {
      this.snackbar.error('Only mp4, webm and mov videos are allowed');
      input.value = '';
      this.selectedVideo.set(null);
      return;
    }
    if (file.size > MAX_VIDEO_SIZE_BYTES) {
      this.snackbar.error('Video exceeds the 50MB limit');
      input.value = '';
      this.selectedVideo.set(null);
      return;
    }
    this.selectedVideo.set(file);
  }

  removeVideo(): void {
    this.selectedVideo.set(null);
  }

  async submitReplacement(): Promise<void> {
    if (this.replacementForm.invalid) {
      this.replacementForm.markAllAsTouched();
      if (this.replacementForm.get('reasonText')!.invalid) {
        this.snackbar.warning('reasonText is required when reason is OTHER');
      }
      return;
    }

    const order = this.order();
    const { reason, reasonText, productId } = this.replacementForm.value;

    const formData = new FormData();
    formData.append('reason', reason);
    if (reason === 'OTHER' && reasonText) {
      formData.append('reasonText', reasonText);
    }
    if (productId) {
      formData.append('productId', productId);
    }
    formData.append('photos', JSON.stringify(this.replacementPhotos()));

    const video = this.selectedVideo();
    if (video) {
      formData.append('video', video, video.name);
    }

    this.replacementSubmitting.set(true);
    try {
      const response = await firstValueFrom(
        this.replacementService.submitReplacement(order._id, formData)
      );
      this.snackbar.success(response.message || 'Replacement request submitted successfully!');
      this.showReplacementForm.set(false);
      await this.loadOrder();
    } catch (error: any) {
      console.error('Replacement request error:', error);
      this.snackbar.error(error.error?.message || 'Failed to submit replacement request');
    } finally {
      this.replacementSubmitting.set(false);
    }
  }
}