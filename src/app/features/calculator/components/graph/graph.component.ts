import { Component, Input, OnChanges, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { Chart, registerables } from 'chart.js';
import { evaluate, simplify, parse } from 'mathjs';
import { DerivativeResponse } from '../../../../models/derivative-response.model';

Chart.register(...registerables);

const CURVE_COLORS = [
  '#e91e63', // f'  — pink
  '#4caf50', // f'' — green
  '#ff9800', // f'''— orange
  '#9c27b0', // f⁽⁴⁾— purple
  '#00bcd4', // f⁽⁵⁾— cyan
  '#795548', // f⁽⁶⁾— brown
];

@Component({
  selector: 'app-graph',
  standalone: false,
  templateUrl: './graph.component.html',
  styleUrls: ['./graph.component.scss']
})
export class GraphComponent implements OnChanges, OnDestroy {
  @Input() expression: string | null = null;
  @Input() derivativeExpressions: DerivativeResponse[] = [];

  private _canvasRef: ElementRef<HTMLCanvasElement> | undefined;
  @ViewChild('chartCanvas') set canvasRef(el: ElementRef<HTMLCanvasElement>) {
    this._canvasRef = el;
    if (el && this.pendingRender && this.hasData) {
      this.pendingRender = false;
      setTimeout(() => this.renderChart(), 0);
    }
  }

  hasData = false;
  curves: { label: string; expression: string; color: string }[] = [];
  private chart: Chart | null = null;
  private pendingRender = false;

  ngOnChanges(): void {
    this.hasData = !!(this.expression && this.derivativeExpressions.length);
    if (this.hasData) {
      this.curves = [
        { label: 'f(x)', expression: this.prettify(this.expression!), color: '#3f51b5' },
        ...this.derivativeExpressions.map((d, i) => ({
          label: this.derivativeLabel(i + 1),
          expression: this.prettify(d.antiderivative),
          color: CURVE_COLORS[i % CURVE_COLORS.length],
        })),
      ];
      this.pendingRender = true;
      if (this._canvasRef) {
        this.pendingRender = false;
        setTimeout(() => this.renderChart(), 0);
      }
    } else {
      this.curves = [];
      this.pendingRender = false;
      this.destroyChart();
    }
  }

  ngOnDestroy(): void {
    this.destroyChart();
  }

  private destroyChart(): void {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
  }

  // Fix backend artifacts then simplify via mathjs
  prettify(expr: string): string {
    try {
      const cleaned = this.repair(expr);
      return simplify(cleaned).toString();
    } catch {
      return expr;
    }
  }

  private repair(expr: string): string {
    return expr
      // Remove extraneous ^ ( 1 ) — x^1 === x
      .replace(/\^\s*\(\s*1\s*\)/g, '')
      // Fix double-asterisk artifacts from backend (e.g. "0 * * 3")
      .replace(/\*\s*\*/g, '*')
      // Remove multiply-by-one noise
      .replace(/\*\s*1\b/g, '')
      .replace(/\b1\s*\*/g, '')
      // Trig aliases mathjs doesn't know
      .replace(/\barcsin\(/g, 'asin(')
      .replace(/\barccos\(/g, 'acos(')
      .replace(/\barctan\(/g, 'atan(')
      .replace(/\bln\(/g, 'log(')
      // Collapse runs of whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }

  private normalise(expr: string): string {
    return this.repair(expr);
  }

  private evalAt(expr: string, x: number): number | null {
    try {
      const result = evaluate(expr, { x });
      if (typeof result !== 'number' || !isFinite(result) || Math.abs(result) > 50) return null;
      return result;
    } catch {
      return null;
    }
  }

  private derivativeLabel(order: number): string {
    if (order === 1) return "f'(x)";
    if (order === 2) return "f''(x)";
    if (order === 3) return "f'''(x)";
    return `f⁽${order}⁾(x)`;
  }

  private renderChart(): void {
    if (!this.expression || !this.derivativeExpressions.length || !this._canvasRef) return;

    const xValues: number[] = [];
    for (let i = -50; i <= 50; i++) xValues.push(i / 10);

    const fExpr = this.normalise(this.expression);
    const fData = xValues.map(x => this.evalAt(fExpr, x));

    const derivativeDatasets = this.derivativeExpressions.map((d, i) => {
      const expr = this.normalise(d.antiderivative);
      const color = CURVE_COLORS[i % CURVE_COLORS.length];
      return {
        label: this.derivativeLabel(i + 1),
        data: xValues.map(x => this.evalAt(expr, x)) as number[],
        borderColor: color,
        backgroundColor: color + '14',
        borderWidth: 2,
        tension: 0.3,
        pointRadius: 0,
        spanGaps: false,
      };
    });

    this.destroyChart();

    this.chart = new Chart(this._canvasRef.nativeElement, {
      type: 'line',
      data: {
        labels: xValues.map(x => x.toFixed(1)),
        datasets: [
          {
            label: 'f(x)',
            data: fData as number[],
            borderColor: '#3f51b5',
            backgroundColor: 'rgba(63, 81, 181, 0.08)',
            borderWidth: 2,
            tension: 0.3,
            pointRadius: 0,
            spanGaps: false,
          },
          ...derivativeDatasets,
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        animation: { duration: 300 },
        plugins: {
          legend: {
            position: 'top',
            labels: { font: { family: 'Roboto', size: 13 }, usePointStyle: true }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(0,0,0,0.06)' },
            ticks: {
              maxTicksLimit: 11,
              callback: (val, i) => xValues[i] % 1 === 0 ? xValues[i].toString() : ''
            }
          },
          y: {
            min: -10,
            max: 10,
            grid: { color: 'rgba(0,0,0,0.06)' }
          }
        }
      }
    });
  }
}
