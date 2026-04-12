import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DailyProfitComponent } from './daily-profit.component';

describe('DailyProfitComponent', () => {
  let component: DailyProfitComponent;
  let fixture: ComponentFixture<DailyProfitComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [DailyProfitComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(DailyProfitComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
