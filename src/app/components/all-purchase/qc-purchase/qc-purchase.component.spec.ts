import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QcPurchaseComponent } from './qc-purchase.component';

describe('QcPurchaseComponent', () => {
  let component: QcPurchaseComponent;
  let fixture: ComponentFixture<QcPurchaseComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [QcPurchaseComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(QcPurchaseComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
