export type ReplacementReason =
  | 'DAMAGED'
  | 'WRONG_ITEM'
  | 'SIZE_ISSUE'
  | 'QUALITY_ISSUE'
  | 'OTHER';

export type ReplacementStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type ReplacementResolution = 'REPLACEMENT' | 'REFUND' | null;

export type RefundMethod = 'RAZORPAY' | 'UPI_MANUAL' | null;

export type RefundStatus =
  | 'PENDING'
  | 'PROCESSED'
  | 'MANUAL_PENDING'
  | 'FAILED'
  | null;

export interface ReplacementPhoto {
  url: string;
  fileId: string;
}

export interface ReplacementRefund {
  method?: RefundMethod;
  status?: RefundStatus;
  amount?: number;
  reference?: string;
}

export interface ReplacementOrderRef {
  _id?: string;
  orderNumber?: string;
  status?: string;
  totalAmount?: number;
  paymentMethod?: string;
}

export interface ReplacementUserRef {
  _id?: string;
  username?: string;
  email?: string;
}

export interface ReplacementProductRef {
  _id?: string;
  name?: string;
}

export interface ReplacementRequest {
  _id: string;
  order?: ReplacementOrderRef | string;
  user?: ReplacementUserRef | string;
  productId?: ReplacementProductRef | string;
  reason: ReplacementReason;
  reasonText?: string;
  photos?: ReplacementPhoto[];
  hasVideo?: boolean;
  videoDownloaded?: boolean;
  status: ReplacementStatus;
  resolution?: ReplacementResolution;
  refund?: ReplacementRefund;
  reversePickup?: {
    scheduled?: boolean;
    trackingNumber?: string;
    provider?: string;
    scheduledAt?: string;
  };
  rejectionReason?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ReplacementPagination {
  currentPage: number;
  totalPages: number;
  totalRequests: number;
}

export const REPLACEMENT_REASONS: { value: ReplacementReason; label: string }[] = [
  { value: 'DAMAGED', label: 'Damaged product' },
  { value: 'WRONG_ITEM', label: 'Wrong item received' },
  { value: 'SIZE_ISSUE', label: 'Size issue' },
  { value: 'QUALITY_ISSUE', label: 'Quality issue' },
  { value: 'OTHER', label: 'Other' }
];

export const ALLOWED_VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime'
];

export const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024;
