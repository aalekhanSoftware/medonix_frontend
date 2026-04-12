import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class PriceService {
  private apiUrl = `${environment.apiUrl}/api/price`;
  private customerPricesApiUrl = `${environment.apiUrl}/api/customer-prices`;

  constructor(private http: HttpClient) {}

  getLatestPrices(data: { productId: number; customerId: number }): Observable<any> {
    return this.http.post(`${this.apiUrl}/latest`, data);
  }

  getCustomerPrice(data: { customerId?: number; productId: number }): Observable<any> {
    return this.http.post(`${this.customerPricesApiUrl}/get`, data);
  }

  searchCustomerPrices(data: {
    customerId?: number;
    productId?: number;
    search?: string;
    page?: number;
    size?: number;
  }): Observable<any> {
    return this.http.post(`${this.customerPricesApiUrl}/search`, data);
  }

  getProductsWithPrices(data: {
    customerId?: number;
    page?: number;
    size?: number;
    sortBy?: string;
    sortDir?: string;
    search?: string;
  }): Observable<any> {
    return this.http.post(`${this.customerPricesApiUrl}/products-with-prices`, data);
  }

  saveCustomerPrice(data: {
    id?: number | null;
    customerId: number;
    productId: number;
    price: number;
  }): Observable<any> {
    return this.http.post(this.customerPricesApiUrl, data);
  }

  deleteCustomerPrice(id: number): Observable<any> {
    return this.http.post(`${this.customerPricesApiUrl}/delete`, { id });
  }
} 