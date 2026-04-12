import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class CombinedPurchaseSaleService {
  private apiUrl = `${environment.apiUrl}/api/combined-purchase-sale`;

  constructor(private http: HttpClient) {}

  createCombinedPurchaseSale(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/create`, data);
  }

  // Add additional methods as needed for listing, updating, or deleting combined entries
  getCombinedEntries(params: any = {}): Observable<any> {
    return this.http.get(`${this.apiUrl}`, { params });
  }

  getCombinedEntryById(id: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}`);
  }

  updateCombinedEntry(id: number, data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}`, data);
  }

  deleteCombinedEntry(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }
} 