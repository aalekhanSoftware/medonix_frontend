import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatDialogModule } from '@angular/material/dialog';
import { ScrollingModule } from '@angular/cdk/scrolling';

import { SaleRoutingModule } from './sale-routing.module';
import { SaleComponent } from './sale/sale.component';
import { AddSaleComponent } from './add-sale/add-sale.component';
import { AddSaleReturnComponent } from './add-sale-return/add-sale-return.component';
import { SaleReturnListComponent } from './sale-return-list/sale-return-list.component';
import { LoaderComponent } from '../../shared/components/loader/loader.component';
import { SearchableSelectComponent } from '../../shared/components/searchable-select/searchable-select.component';
import { SaleProductSelectComponent } from './shared/sale-product-select/sale-product-select.component';
import { PaginationComponent } from '../../shared/components/pagination/pagination.component';
import { RoundPipe } from '../../round.pipe';
import { SaleModalComponent } from '../sale-modal/sale-modal.component';
import { TransactionLabelPipe } from '../../shared/pipes/transaction-label.pipe';

@NgModule({
  declarations: [
    SaleComponent,
    AddSaleComponent,
    AddSaleReturnComponent,
    SaleReturnListComponent
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    RouterModule,
    MatDialogModule,
    ScrollingModule,
    SaleRoutingModule,
    LoaderComponent,
    SearchableSelectComponent,
    SaleProductSelectComponent,
    PaginationComponent,
    RoundPipe,
    SaleModalComponent,
    TransactionLabelPipe
  ]
})
export class SaleModule { }

