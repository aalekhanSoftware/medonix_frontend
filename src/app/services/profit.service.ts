import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ProfitSearchRequest {
  page: number;
  size: number;
  search?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ProfitService {
  private apiUrl = `${environment.apiUrl}/api/profits`;

  constructor(private http: HttpClient) {}

  searchProfits(params: ProfitSearchRequest): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/search`, params);
  }

  getDailyProfits(params: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/daily`, params);
  }
} 