import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DataCenterComponent } from './data-center.component';

describe('DataCenterComponent', () => {
  let component: DataCenterComponent;
  let fixture: ComponentFixture<DataCenterComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [DataCenterComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(DataCenterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
