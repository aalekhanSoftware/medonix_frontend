import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QcPurchaseChallanComponent } from './qc-purchase-challan.component';

describe('QcPurchaseChallanComponent', () => {
  let component: QcPurchaseChallanComponent;
  let fixture: ComponentFixture<QcPurchaseChallanComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QcPurchaseChallanComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(QcPurchaseChallanComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

