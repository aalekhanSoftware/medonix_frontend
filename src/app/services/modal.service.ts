import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

interface ModalState {
  isOpen: boolean;
  modalType?: string;
  data?: any;
}

@Injectable({
  providedIn: 'root'
})
export class ModalService {
  private initialState: ModalState = {
    isOpen: false,
    modalType: undefined,
    data: undefined
  };

  private modalState = new BehaviorSubject<ModalState>(this.initialState);
  modalState$ = this.modalState.asObservable();

  open(modalType?: string, data?: any) {
    document.body.style.overflow = 'hidden';
    this.modalState.next({
      isOpen: true,
      modalType,
      data
    });
  }

  close() {
    document.body.style.overflow = 'auto';
    this.modalState.next(this.initialState);
  }

  getData() {
    return this.modalState.value.data;
  }

  getModalType() {
    return this.modalState.value.modalType;
  }

  isOpen() {
    return this.modalState.value.isOpen;
  }
} 