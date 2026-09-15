import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { ImageKitService } from './imagekit.service';
import {
  ReplacementPhoto,
  ReplacementRequest,
  ReplacementPagination,
  ReplacementStatus
} from '../models/replacement.model';

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data?: T;
}

interface AdminListData {
  requests: ReplacementRequest[];
  pagination: ReplacementPagination;
}

@Injectable({
  providedIn: 'root'
})
export class ReplacementService {
  private http = inject(HttpClient);
  private imagekit = inject(ImageKitService);
  private apiUrl = environment.apiUrl;

  /** Uploads one image straight to ImageKit and returns {url, fileId}. */
  async uploadPhoto(file: File): Promise<ReplacementPhoto> {
    const result = await this.imagekit.uploadImage(file, 'replacements', 'product');
    return { url: result.url, fileId: result.fileId };
  }

  // ---- Customer ----

  submitReplacement(orderId: string, formData: FormData): Observable<ApiEnvelope<ReplacementRequest>> {
    return this.http.post<ApiEnvelope<ReplacementRequest>>(
      `${this.apiUrl}/replacements/${orderId}`,
      formData
    );
  }

  getMyReplacements(): Observable<ApiEnvelope<ReplacementRequest[]>> {
    return this.http.get<ApiEnvelope<ReplacementRequest[]>>(`${this.apiUrl}/replacements`);
  }

  // ---- Admin ----

  getAdminReplacements(
    status?: ReplacementStatus | '',
    page = 1,
    limit = 10
  ): Observable<ApiEnvelope<AdminListData>> {
    let params = new HttpParams().set('page', String(page)).set('limit', String(limit));
    if (status) {
      params = params.set('status', status);
    }
    return this.http.get<ApiEnvelope<AdminListData>>(
      `${this.apiUrl}/admin/replacement-requests`,
      { params }
    );
  }

  getAdminReplacement(id: string): Observable<ApiEnvelope<ReplacementRequest>> {
    return this.http.get<ApiEnvelope<ReplacementRequest>>(
      `${this.apiUrl}/admin/replacement-requests/${id}`
    );
  }

  /** Downloads the evidence video as a blob (single-use on the server). */
  downloadVideo(id: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/admin/replacement-requests/${id}/video`, {
      responseType: 'blob'
    });
  }

  approveReplacement(id: string, upiId?: string): Observable<ApiEnvelope<ReplacementRequest>> {
    const body: { upiId?: string } = {};
    if (upiId && upiId.trim()) {
      body.upiId = upiId.trim();
    }
    return this.http.patch<ApiEnvelope<ReplacementRequest>>(
      `${this.apiUrl}/admin/replacement-requests/${id}/approve`,
      body
    );
  }

  rejectReplacement(id: string, rejectionReason: string): Observable<ApiEnvelope<ReplacementRequest>> {
    return this.http.patch<ApiEnvelope<ReplacementRequest>>(
      `${this.apiUrl}/admin/replacement-requests/${id}/reject`,
      { rejectionReason }
    );
  }

  revealRefundUpi(id: string): Observable<ApiEnvelope<{ upiId: string }>> {
    return this.http.get<ApiEnvelope<{ upiId: string }>>(
      `${this.apiUrl}/admin/replacement-requests/${id}/refund-upi`
    );
  }
}
