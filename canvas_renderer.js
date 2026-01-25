// Canvas 렌더링 전용 클래스
// - DPR(고해상도) 스케일 리사이즈
// - 그리드/도형/선택 아웃라인 렌더링
// - HUD 텍스트 업데이트

class CanvasRenderer {
  constructor(args) {
    this.canvas = args.canvas;
    this.hud = args.hud ?? null;
    this.gridStep = typeof args.gridStep === "number" ? Math.max(4, Math.floor(args.gridStep)) : 32;

    const ctx = this.canvas.getContext("2d");
    if (ctx === null) throw new Error("2D 컨텍스트를 얻지 못했습니다.");
    this.ctx = ctx;
  }

  setGridStep(step) {
    this.gridStep = Math.max(4, Math.floor(step));
  }

  resizeToDisplaySize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(2, Math.floor(rect.width * dpr));
    const h = Math.max(2, Math.floor(rect.height * dpr));

    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // state: { shapes, draftShape, polygonDraft, selectedId, pointerPos, currentTool }
  render(state) {
    this.resizeToDisplaySize();

    const cssW = this.canvas.getBoundingClientRect().width;
    const cssH = this.canvas.getBoundingClientRect().height;
    this.ctx.clearRect(0, 0, cssW, cssH);

    this._drawGrid(cssW, cssH);

    for (const shape of state.shapes) this._drawShape(shape);
    if (state.draftShape !== null) this._drawShape(state.draftShape);
    if (state.polygonDraft !== null) this._drawShape(state.polygonDraft);

    const selectedShape = state.selectedId ? state.shapes.find((shape) => shape.id === state.selectedId) : null;
    if (selectedShape !== null) this._drawSelectionOutline(selectedShape);

    this._updateHud(state);
  }

  _applyStyle(style) {
    this.ctx.strokeStyle = style.stroke;
    this.ctx.fillStyle = style.fill;
    this.ctx.lineWidth = style.lineWidth;
    this.ctx.lineJoin = "round";
    this.ctx.lineCap = "round";
  }

  _rectFromPoints(startPoint, endPoint) {
    const x1 = Math.min(startPoint.x, endPoint.x);
    const y1 = Math.min(startPoint.y, endPoint.y);
    const x2 = Math.max(startPoint.x, endPoint.x);
    const y2 = Math.max(startPoint.y, endPoint.y);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  _drawShape(shape) {
    this._applyStyle(shape.style);

    if (shape.kind === "point") {
      this.ctx.beginPath();
      this.ctx.arc(shape.position.x, shape.position.y, shape.radius, 0, Math.PI * 2);
      this.ctx.fillStyle = shape.style.stroke;
      this.ctx.fill();
      return;
    }

    if (shape.kind === "line") {
      this.ctx.beginPath();
      this.ctx.moveTo(shape.start.x, shape.start.y);
      this.ctx.lineTo(shape.end.x, shape.end.y);
      this.ctx.stroke();
      return;
    }

    if (shape.kind === "circle") {
      this.ctx.beginPath();
      this.ctx.arc(shape.center.x, shape.center.y, Math.max(0, shape.radius), 0, Math.PI * 2);
      if (shape.style.fillEnabled) this.ctx.fill();
      this.ctx.stroke();
      return;
    }

    if (shape.kind === "rect") {
      const rect = this._rectFromPoints(shape.start, shape.end);
      this.ctx.beginPath();
      this.ctx.rect(rect.x, rect.y, rect.w, rect.h);
      if (shape.style.fillEnabled) this.ctx.fill();
      this.ctx.stroke();
      return;
    }

    if (shape.kind === "polygon") {
      if (shape.points.length < 2) return;
      this.ctx.beginPath();
      this.ctx.moveTo(shape.points[0].x, shape.points[0].y);
      for (let pointIndex = 1; pointIndex < shape.points.length; pointIndex++) {
        this.ctx.lineTo(shape.points[pointIndex].x, shape.points[pointIndex].y);
      }
      if (shape.isClosed) this.ctx.closePath();
      if (shape.isClosed && shape.style.fillEnabled) this.ctx.fill();
      this.ctx.stroke();
      return;
    }

    if (shape.kind === "freehand") {
      if (shape.points.length < 2) return;
      this.ctx.beginPath();
      this.ctx.moveTo(shape.points[0].x, shape.points[0].y);
      for (let pointIndex = 1; pointIndex < shape.points.length; pointIndex++) {
        this.ctx.lineTo(shape.points[pointIndex].x, shape.points[pointIndex].y);
      }
      this.ctx.stroke();
      return;
    }
  }

  _drawSelectionOutline(shape) {
    this.ctx.save();
    this.ctx.strokeStyle = "rgba(255,255,255,0.85)";
    this.ctx.lineWidth = 1.5;
    this.ctx.setLineDash([6, 6]);
    this.ctx.lineCap = "butt";
    this.ctx.lineJoin = "miter";

    if (shape.kind === "point") {
      this.ctx.beginPath();
      this.ctx.arc(shape.position.x, shape.position.y, shape.radius + 6, 0, Math.PI * 2);
      this.ctx.stroke();
    } else if (shape.kind === "line") {
      this.ctx.beginPath();
      this.ctx.moveTo(shape.start.x, shape.start.y);
      this.ctx.lineTo(shape.end.x, shape.end.y);
      this.ctx.stroke();
    } else if (shape.kind === "circle") {
      this.ctx.beginPath();
      this.ctx.arc(shape.center.x, shape.center.y, Math.max(0, shape.radius) + 6, 0, Math.PI * 2);
      this.ctx.stroke();
    } else if (shape.kind === "rect") {
      const rect = this._rectFromPoints(shape.start, shape.end);
      this.ctx.strokeRect(rect.x - 4, rect.y - 4, rect.w + 8, rect.h + 8);
    } else if (shape.kind === "polygon") {
      if (shape.points.length >= 2) {
        this.ctx.beginPath();
        this.ctx.moveTo(shape.points[0].x, shape.points[0].y);
        for (let pointIndex = 1; pointIndex < shape.points.length; pointIndex++) {
          this.ctx.lineTo(shape.points[pointIndex].x, shape.points[pointIndex].y);
        }
        if (shape.isClosed) this.ctx.closePath();
        this.ctx.stroke();
      }
    } else if (shape.kind === "freehand") {
      if (shape.points.length >= 2) {
        this.ctx.beginPath();
        this.ctx.moveTo(shape.points[0].x, shape.points[0].y);
        for (let pointIndex = 1; pointIndex < shape.points.length; pointIndex++) {
          this.ctx.lineTo(shape.points[pointIndex].x, shape.points[pointIndex].y);
        }
        this.ctx.stroke();
      }
    }

    this.ctx.restore();
  }

  _drawGrid(w, h) {
    this.ctx.save();
    this.ctx.lineWidth = 1;
    this.ctx.strokeStyle = "rgba(255,255,255,0.06)";

    const step = this.gridStep;
    for (let x = 0; x <= w; x += step) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, h);
      this.ctx.stroke();
    }
    for (let y = 0; y <= h; y += step) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(w, y);
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  _updateHud(state) {
    if (this.hud === null) return;
    const pointerPosition = state.pointerPos;
    const posText = pointerPosition ? `${Math.round(pointerPosition.x)}, ${Math.round(pointerPosition.y)}` : "-";
    const countText = `${state.shapes.length}개`;
    const selText = state.selectedId ? "선택됨" : "없음";
    const polyText = state.polygonDraft ? `다각형 점 ${state.polygonDraft.points.length}개` : "";
    this.hud.textContent = `도구: ${state.currentTool} | 포인터: ${posText} | 도형: ${countText} | 선택: ${selText} ${polyText}`;
  }
}

// 전역으로 노출 (모듈 번들 없이 사용)
window.CanvasRenderer = CanvasRenderer;

