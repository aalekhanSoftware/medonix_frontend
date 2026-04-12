import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ScrollingModule } from '@angular/cdk/scrolling';

import { PurchaseComponent } from './purchase/purchase.component';
import { AddPurchaseComponent } from './add-purchase/add-purchase.component';
import { PurchaseRoutingModule } from './purchase-routing.module';
import { QcPurchaseComponent } from './qc-purchase/qc-purchase.component';
import { AddPurchaseReturnComponent } from './add-purchase-return/add-purchase-return.component';
import { AddStandalonePurchaseReturnComponent } from './add-standalone-purchase-return/add-standalone-purchase-return.component';
import { PurchaseReturnListComponent } from './purchase-return-list/purchase-return-list.component';
import { LoaderComponent } from '../../shared/components/loader/loader.component';
import { SearchableSelectComponent } from '../../shared/components/searchable-select/searchable-select.component';
import { PaginationComponent } from '../../shared/components/pagination/pagination.component';

@NgModule({
  declarations: [
    QcPurchaseComponent,
    AddPurchaseReturnComponent,
    AddStandalonePurchaseReturnComponent,
    PurchaseReturnListComponent
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    ScrollingModule,
    PurchaseRoutingModule,
    LoaderComponent,
    SearchableSelectComponent,
    PaginationComponent
  ]
})
export class PurchaseModule { }