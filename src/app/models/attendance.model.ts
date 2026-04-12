export interface AttendanceRequest {
  employeeIds: number[];
  startDateTime: string;
  endDateTime: string;
  remarks?: string;
}

export interface AttendanceResponse {
  success: boolean;
  message: string;
  data?: any;
} 