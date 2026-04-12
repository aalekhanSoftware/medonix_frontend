import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DispatchQuotationListComponent } from './dispatch-quotation-list.component';

describe('DispatchQuotationListComponent', () => {
  let component: DispatchQuotationListComponent;
  let fixture: ComponentFixture<DispatchQuotationListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [DispatchQuotationListComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(DispatchQuotationListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
