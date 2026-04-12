import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

interface AttendanceDay {
  date: string;
  startTime: string;
  endTime: string;
}

@Component({
  selector: 'app-calendar-view',
  templateUrl: './calendar-view.component.html',
  styleUrls: ['./calendar-view.component.scss'],
  standalone: true,
  imports: [CommonModule]
})
export class CalendarViewComponent implements OnChanges {
  @Input() attendanceRecords: any[] = [];
  @Input() currentMonth: Date = new Date();
  
  calendar: any[][] = [];
  weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  attendanceDays: { [key: string]: AttendanceDay } = {};
  
  ngOnChanges() {
    this.processAttendanceRecords();
    this.generateCalendar();
  }

  private processAttendanceRecords() {
    this.attendanceDays = {};
    this.attendanceRecords.forEach(record => {
      const date = new Date(record.startDateTime);
      const dateStr = this.formatDate(date);
      
      this.attendanceDays[dateStr] = {
        date: dateStr,
        startTime: new Date(record.startDateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        endTime: new Date(record.endDateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
    });
  }

  private generateCalendar() {
    const firstDay = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth(), 1);
    const lastDay = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() + 1, 0);
    
    this.calendar = [];
    let week: any[] = [];
    
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < firstDay.getDay(); i++) {
      week.push(null);
    }
    
    // Fill in the days of the month
    for (let day = 1; day <= lastDay.getDate(); day++) {
      if (week.length === 7) {
        this.calendar.push(week);
        week = [];
      }
      
      const date = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth(), day);
      week.push({
        date,
        attendance: this.attendanceDays[this.formatDate(date)]
      });
    }
    
    // Fill in remaining cells
    while (week.length < 7) {
      week.push(null);
    }
    this.calendar.push(week);
  }

  private formatDate(date: Date): string {
    return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
  }

  isWednesday(date: Date): boolean {
    return date && date.getDay() === 3;
  }

  getTooltipText(day: any): string {
    if (!day?.attendance) return '';
    return `Time: ${day.attendance.startTime} - ${day.attendance.endTime}`;
  }
} 