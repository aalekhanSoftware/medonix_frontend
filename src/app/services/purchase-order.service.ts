import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { PurchaseOrder, PurchaseOrderCreateUpdateRequest, PurchaseOrderResponse, PurchaseOrderSearchRequest } from '../models/purchase-order.model';

@Injectable({
  providedIn: 'root'
})
export class PurchaseOrderService {
  private apiUrl = `${environment.apiUrl}/api/purchase-orders`;

  constructor(private http: HttpClient) {}

  searchPurchaseOrders(params: PurchaseOrderSearchRequest): Observable<PurchaseOrderResponse> {
    return this.http.post<PurchaseOrderResponse>(`${this.apiUrl}/search`, params);
  }

  createPurchaseOrder(purchaseOrder: PurchaseOrderCreateUpdateRequest): Observable<any> {
    return this.http.post(`${this.apiUrl}/create`, purchaseOrder);
  }

  updatePurchaseOrder(purchaseOrder: PurchaseOrderCreateUpdateRequest): Observable<any> {
    return this.http.post(`${this.apiUrl}/create`, purchaseOrder);
  }

  deletePurchaseOrder(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  getPurchaseOrderDetails(id: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/detail`, { id });
  }

  generatePdf(id: number): Observable<{ blob: Blob; filename: string }> {
    return this.http.post(`${this.apiUrl}/generate-pdf`, { id }, {
      responseType: 'blob',
      observe: 'response'
    }).pipe(
      map(response => {
        const contentDisposition = response.headers.get('Content-Disposition');
        const filename = contentDisposition?.split('filename=')[1]?.replace(/"/g, '') || 'purchase-order.pdf';
        const blob = new Blob([response.body!], { type: 'application/pdf' });
        return { blob, filename };
      })
    );
  }

  convertToPurchase(data: { id: number; invoiceNumber?: string; packagingAndForwadingCharges: number; purchaseOrderItemIds: number[]; purchaseId?: number | null }): Observable<any> {
    return this.http.post(`${this.apiUrl}/convert-to-purchase`, data);
  }

  updatePurchaseOrderItemGetQuantity(payload: { id: number; getQuantity: number | null }): Observable<any> {
    return this.http.put(`${environment.apiUrl}/api/purchase-order-items/update-get-quantity`, payload);
  }

  searchPendingPurchaseOrderItems(request: {
    id?: number;
    productId?: number;
    customerId?: number;
    page?: number;
    size?: number;
  }): Observable<any> {
    return this.http.post(`${environment.apiUrl}/api/purchase-order-items/pending-item/search`, request);
  }
}