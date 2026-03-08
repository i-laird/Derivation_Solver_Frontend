import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { DerivativeRequest } from '../../models/derivative-request.model';
import { DerivativeResponse } from '../../models/derivative-response.model';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class CalculatorApiService {
  private readonly baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getDerivative(request: DerivativeRequest): Observable<DerivativeResponse> {
    return this.http.post<DerivativeResponse>(`${this.baseUrl}/derivative`, request);
  }

  evaluateExpression(request: DerivativeRequest): Observable<number> {
    return this.http.post<number>(`${this.baseUrl}/expression`, request);
  }
}
