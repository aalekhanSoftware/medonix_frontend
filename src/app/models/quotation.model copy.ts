export enum QuotationStatus {
    Q = 'Quote',
    A = 'Accepted',
    D = 'Declined',
    R = 'Ready',
    P = 'Processing',
    PC = 'Packaging',
    C = 'Completed',
    I = 'Invoiced'
  }

  export enum QuotationItemStatus {
    O = 'Open',
    I = 'In Progress',
    C = 'Completed',
    B = 'Billed',
  }
  
  export interface QuotationItem {
    id?: number;
    productId: number;
    quantity: number;
    unitPrice: number;
    taxPercentage: number;
    numberOfRoll?: number;
    weightPerRoll?: number;
    brandId?: number;
    remarks?: string;
    finalPrice?: number;
    status?: string;
    price?: number;
    taxAmount?: number;
    quotationDiscountAmount?: number;
    discountPercentage?: number;
    discountAmount?: number;
    discountPrice?: number;
  }
  
  export interface CreateQuotationRequest {
    customerId?: number;
    customerName: string;
    referenceName?: string;
    quoteDate: string;
    validUntil: string;
    remarks?: string;
    termsConditions?: string;
    transportMasterId?: number;
    caseNumber?: string;
    packagingAndForwadingCharges?: number;
    address?: string;
    contactNumber?: string;
    quotationDiscountPercentage?: number;
    items: QuotationItem[];
  }
  
  export interface QuotationResponse {
    success: boolean;
    message: string;
  }
  
  export interface StatusOption {
    label: string;
    value: string;
    disabled: boolean;
  }

  // Quotation Item search request/response models
  export interface QuotationItemSearchRequest {
    isProduction?: boolean;
    quotationItemStatus?: string;
    quotationItemStatuses?: string[];
    brandId?: number;
    page?: number;
    size?: number;
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
  }

  export interface QuotationItemSearchResultItem {
    id: number;
    quotationId: number;
    productId: number;
    quantity: number;
    unitPrice: number;
    discountPrice?: number;
    quotationDiscountPercentage?: number;
    quotationDiscountAmount?: number;
    quotationDiscountPrice?: number;
    taxPercentage?: number;
    taxAmount?: number;
    finalPrice?: number;
    clientId?: number;
    brandId?: number;
    numberOfRoll?: number;
    createdRoll?: number;
    weightPerRoll?: number;
    remarks?: string;
    isProduction?: boolean;
    quotationItemStatus?: string;
    productName?: string;
    brandName?: string;
  }

  export interface QuotationItemSearchResponseData {
    content: QuotationItemSearchResultItem[];
    totalElements: number;
    totalPages: number;
  }

  export interface QuotationItemSearchApiResponse {
    status: string;
    message: string;
    data: QuotationItemSearchResponseData;
  }