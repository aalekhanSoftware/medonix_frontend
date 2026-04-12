import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DealerAddQuotationComponent } from './dealer-add-quotation.component';

describe('DealerAddQuotationComponent', () => {
  let component: DealerAddQuotationComponent;
  let fixture: ComponentFixture<DealerAddQuotationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [DealerAddQuotationComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(DealerAddQuotationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
