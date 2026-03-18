export interface DerivativeRequest {
  expression: string;
  withRespectTo: string;
  points: { [key: string]: number };
}
