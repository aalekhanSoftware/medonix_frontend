import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { ProductBatchStock, ProductBatchStockSearchRequest, ProductBatchStockResponse } from '../models/product-batch-stock.model';

@Injectable({
  providedIn: 'root'
})
export class ProductBatchStockService {
  private apiUrl = `${environment.apiUrl}/api/product-batch-stock`;

  constructor(private http: HttpClient) { }

  /**
   * Create a new product batch stock entry
   */
  createProductBatchStock(batchStock: Partial<ProductBatchStock>): Observable<any> {
    return this.http.post(`${this.apiUrl}/create`, batchStock);
  }

  /**
   * Update an existing product batch stock entry
   */
  updateProductBatchStock(batchStock: Partial<ProductBatchStock>): Observable<any> {
    return this.http.post(`${this.apiUrl}/update`, batchStock);
  }

  /**
   * Delete a product batch stock entry by ID
   */
  deleteProductBatchStock(id: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/delete`, { id });
  }

  /**
   * Search product batch stock entries with filters and pagination
   */
  searchProductBatchStock(params: ProductBatchStockSearchRequest): Observable<ProductBatchStockResponse> {
    return this.http.post<ProductBatchStockResponse>(`${this.apiUrl}/search`, params);
  }

  /**
   * Get a specific product batch stock entry by ID
   */
  getProductBatchStockById(id: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/get-by-id`, { id });
  }

  /**
   * Get all batch stock entries for a specific product
   */
  getProductBatchStockByProduct(productId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/get-by-product`, { productId });
  }

  /**
   * Get available batch names for a specific product
   */
  getAvailableBatchNames(productId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/get-available-batch-names`, { productId });
  }
}
