import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { PurchaseChallanComponent } from './purchase-challan/purchase-challan.component';
import { AddPurchaseChallanComponent } from './add-purchase-challan/add-purchase-challan.component';
import { PurchaseChallanRoutingModule } from './purchase-challan-routing.module';
import { QcPurchaseChallanComponent } from './qc-purchase-challan/qc-purchase-challan.component';
import { LoaderComponent } from '../../shared/components/loader/loader.component';
import { SearchableSelectComponent } from '../../shared/components/searchable-select/searchable-select.component';
import { PaginationComponent } from '../../shared/components/pagination/pagination.component';

@NgModule({
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    PurchaseChallanRoutingModule,
    LoaderComponent,
    SearchableSelectComponent,
    PaginationComponent,
    PurchaseChallanComponent,
    AddPurchaseChallanComponent,
    QcPurchaseChallanComponent
  ]
})
export class PurchaseChallanModule { }

