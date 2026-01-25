// Canvas 렌더링 전용 클래스
// - devicePixelRatio(고해상도) 스케일 리사이즈
// - 그리드/도형/선택 아웃라인 렌더링
// - HUD 텍스트 업데이트

window.EShapeKind ??
  console.error("[init] EShapeKind를 찾지 못했습니다. index.html에서 const.js 로드 순서를 확인하세요.");
if (window.EShapeKind === undefined) {
  throw new Error("EShapeKind가 없어 실행할 수 없습니다.");
}

class CanvasRenderer {
  constructor(args) {
    this.canvas = args.canvas;
    this.hud = args.hud ?? null;
    this.gridStep = typeof args.gridStep === "number" ? Math.max(4, Math.floor(args.gridStep)) : 32;

    const screenCtx = this.canvas.getContext("2d");
    if (screenCtx === null) {
      throw new Error("2D 컨텍스트를 얻지 못했습니다.");
    }
    this.screenCtx = screenCtx;
  }

  setGridStep(step) {
    this.gridStep = Math.max(4, Math.floor(step));
  }

  resizeToDisplaySize() {
    const canvasRect = this.canvas.getBoundingClientRect();
    const devicePixelRatio = window.devicePixelRatio || 1;
    const w = Math.max(2, Math.floor(canvasRect.width * devicePixelRatio));
    const h = Math.max(2, Math.floor(canvasRect.height * devicePixelRatio));

    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    return devicePixelRatio;
  }

  // state: { shapes, draftShape, draftPolygon, selectedId, pointerPos, currentTool }
  render(state) {
    const devicePixelRatio = this.resizeToDisplaySize();
    const viewScale = typeof state.viewScale === "number" && Number.isFinite(state.viewScale) ? state.viewScale : 1;

    const canvasRectWidth = this.canvas.getBoundingClientRect().width;
    const canvasRectHeight = this.canvas.getBoundingClientRect().height;
    // clear: unscaled css space
    this.screenCtx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    this.screenCtx.clearRect(0, 0, canvasRectWidth, canvasRectHeight);

    // draw: scaled world space
    this.screenCtx.setTransform(devicePixelRatio * viewScale, 0, 0, devicePixelRatio * viewScale, 0, 0);
    const worldW = canvasRectWidth / viewScale;
    const worldH = canvasRectHeight / viewScale;
    this._drawGrid(worldW, worldH);

    for (const shape of state.shapes) this._drawShape(shape);
    if (state.draftShape !== null) {
      this._drawShape(state.draftShape);
    }
    if (state.draftPolygon !== null) {
      this._drawShape(state.draftPolygon);
    }

    const selectedShape = state.selectedId ? state.shapes.find((shape) => shape.id === state.selectedId) : null;
    if (selectedShape !== null) {
      this._drawSelectionOutline(selectedShape);
    }

    this._updateHud(state);
  }

  _applyStyle(style) {
    this.screenCtx.strokeStyle = style.stroke;
    this.screenCtx.fillStyle = style.fill;
    this.screenCtx.lineWidth = style.lineWidth;
    this.screenCtx.lineJoin = "round";
    this.screenCtx.lineCap = "round";
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

    if (shape.kind === EShapeKind.POINT) {
      this.screenCtx.beginPath();
      this.screenCtx.arc(shape.position.x, shape.position.y, shape.radius, 0, Math.PI * 2);
      this.screenCtx.fillStyle = shape.style.stroke;
      this.screenCtx.fill();
      return;
    }

    if (shape.kind === EShapeKind.LINE) {
      this.screenCtx.beginPath();
      this.screenCtx.moveTo(shape.start.x, shape.start.y);
      this.screenCtx.lineTo(shape.end.x, shape.end.y);
      this.screenCtx.stroke();
      return;
    }

    if (shape.kind === EShapeKind.CIRCLE) {
      this.screenCtx.beginPath();
      this.screenCtx.arc(shape.center.x, shape.center.y, Math.max(0, shape.radius), 0, Math.PI * 2);
      if (shape.style.fillEnabled) {
        this.screenCtx.fill();
      }
      this.screenCtx.stroke();
      return;
    }

    if (shape.kind === EShapeKind.RECT) {
      const rect = this._rectFromPoints(shape.start, shape.end);
      this.screenCtx.beginPath();
      this.screenCtx.rect(rect.x, rect.y, rect.w, rect.h);
      if (shape.style.fillEnabled) {
        this.screenCtx.fill();
      }
      this.screenCtx.stroke();
      return;
    }

    if (shape.kind === EShapeKind.POLYGON) {
      if (shape.points.length < 2) {
        return;
      }
      this.screenCtx.beginPath();
      this.screenCtx.moveTo(shape.points[0].x, shape.points[0].y);
      for (let pointIndex = 1; pointIndex < shape.points.length; pointIndex++) {
        this.screenCtx.lineTo(shape.points[pointIndex].x, shape.points[pointIndex].y);
      }
      if (shape.isClosed) {
        this.screenCtx.closePath();
      }
      if (shape.isClosed && shape.style.fillEnabled) {
        this.screenCtx.fill();
      }
      this.screenCtx.stroke();
      return;
    }

    if (shape.kind === EShapeKind.FREEHAND) {
      if (shape.points.length < 2) {
        return;
      }
      this.screenCtx.beginPath();
      this.screenCtx.moveTo(shape.points[0].x, shape.points[0].y);
      for (let pointIndex = 1; pointIndex < shape.points.length; pointIndex++) {
        this.screenCtx.lineTo(shape.points[pointIndex].x, shape.points[pointIndex].y);
      }
      this.screenCtx.stroke();
      return;
    }
  }

  _drawSelectionOutline(shape) {
    this.screenCtx.save();
    this.screenCtx.strokeStyle = "rgba(255,255,255,0.85)";
    this.screenCtx.lineWidth = 1.5;
    this.screenCtx.setLineDash([6, 6]);
    this.screenCtx.lineCap = "butt";
    this.screenCtx.lineJoin = "miter";

    if (shape.kind === EShapeKind.POINT) {
      this.screenCtx.beginPath();
      this.screenCtx.arc(shape.position.x, shape.position.y, shape.radius + 6, 0, Math.PI * 2);
      this.screenCtx.stroke();
    } else if (shape.kind === EShapeKind.LINE) {
      this.screenCtx.beginPath();
      this.screenCtx.moveTo(shape.start.x, shape.start.y);
      this.screenCtx.lineTo(shape.end.x, shape.end.y);
      this.screenCtx.stroke();
    } else if (shape.kind === EShapeKind.CIRCLE) {
      this.screenCtx.beginPath();
      this.screenCtx.arc(shape.center.x, shape.center.y, Math.max(0, shape.radius) + 6, 0, Math.PI * 2);
      this.screenCtx.stroke();
    } else if (shape.kind === EShapeKind.RECT) {
      const rect = this._rectFromPoints(shape.start, shape.end);
      this.screenCtx.strokeRect(rect.x - 4, rect.y - 4, rect.w + 8, rect.h + 8);
    } else if (shape.kind === EShapeKind.POLYGON) {
      if (shape.points.length >= 2) {
        this.screenCtx.beginPath();
        this.screenCtx.moveTo(shape.points[0].x, shape.points[0].y);
        for (let pointIndex = 1; pointIndex < shape.points.length; pointIndex++) {
          this.screenCtx.lineTo(shape.points[pointIndex].x, shape.points[pointIndex].y);
        }
        if (shape.isClosed) {
          this.screenCtx.closePath();
        }
        this.screenCtx.stroke();
      }
    } else if (shape.kind === EShapeKind.FREEHAND) {
      if (shape.points.length >= 2) {
        this.screenCtx.beginPath();
        this.screenCtx.moveTo(shape.points[0].x, shape.points[0].y);
        for (let pointIndex = 1; pointIndex < shape.points.length; pointIndex++) {
          this.screenCtx.lineTo(shape.points[pointIndex].x, shape.points[pointIndex].y);
        }
        this.screenCtx.stroke();
      }
    }

    this.screenCtx.restore();
  }

  _drawGrid(w, h) {
    this.screenCtx.save();
    this.screenCtx.lineWidth = 1;
    this.screenCtx.strokeStyle = "rgba(255,255,255,0.06)";

    const step = this.gridStep;
    for (let x = 0; x <= w; x += step) {
      this.screenCtx.beginPath();
      this.screenCtx.moveTo(x, 0);
      this.screenCtx.lineTo(x, h);
      this.screenCtx.stroke();
    }
    for (let y = 0; y <= h; y += step) {
      this.screenCtx.beginPath();
      this.screenCtx.moveTo(0, y);
      this.screenCtx.lineTo(w, y);
      this.screenCtx.stroke();
    }
    this.screenCtx.restore();
  }

  _updateHud(state) {
    if (this.hud === null) {
      return;
    }
    const pointerPosition = state.pointerPos;
    const posText = pointerPosition ? `${Math.round(pointerPosition.x)}, ${Math.round(pointerPosition.y)}` : "-";
    const countText = `${state.shapes.length}개`;
    const selText = state.selectedId ? "선택됨" : "없음";
    const polyText = state.draftPolygon ? `다각형 점 ${state.draftPolygon.points.length}개` : "";
    const viewScale = typeof state.viewScale === "number" && Number.isFinite(state.viewScale) ? state.viewScale : 1;
    const zoomText = `${Math.round(viewScale * 100)}%`;
    this.hud.textContent = `도구: ${state.currentTool} | 줌: ${zoomText} | 포인터: ${posText} | 도형: ${countText} | 선택: ${selText} ${polyText}`;
  }
}

// 전역으로 노출 (모듈 번들 없이 사용)
window.CanvasRenderer = CanvasRenderer;

