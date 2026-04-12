import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class AttendanceService {
  private apiUrl = `${environment.apiUrl}/api/attendance`;

  constructor(private http: HttpClient) {}

  createAttendance(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/create`, data);
  }

  searchAttendance(params: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/search`, params);
  }

  deleteAttendances(attendanceIds: number[]): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/delete`, { attendanceIds });
  }

  generatePdf(params: { employeeId: number, startDate: string }): Observable<{ blob: Blob; filename: string }> {
    return this.http.post(`${this.apiUrl}/pdf`, params, {
      responseType: 'blob',
      observe: 'response'
    }).pipe(
      map(response => {
        const contentDisposition = response.headers.get('Content-Disposition');
        const filename = contentDisposition?.split('filename=')[1]?.replace(/"/g, '') || 'attendance.pdf';
        const blob = new Blob([response.body!], { type: 'application/pdf' });
        return { blob, filename };
      })
    );
  }
} 