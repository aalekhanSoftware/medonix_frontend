import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from '../services/auth.service';

export interface BatchDeleteRequest {
  startDate: string;
  endDate: string;
  type: string[];
}

@Injectable({
  providedIn: 'root'
})
export class BatchService {
  private apiUrl = `${environment.apiUrl}/api/batch`;

  constructor(
    private http: HttpClient
  ) {}

  batchDelete(request: BatchDeleteRequest): Observable<any> {    
    return this.http.post(`${this.apiUrl}/delete`, request);
  }
} 