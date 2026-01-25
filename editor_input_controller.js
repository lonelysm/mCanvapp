// 마우스(포인터) + 키보드 입력 컨트롤러
// - app.js의 상태/도형 로직을 호출하여 편집 동작을 수행

window.EShapeKind ??
  console.error("[init] EShapeKind를 찾지 못했습니다. index.html에서 const.js 로드 순서를 확인하세요.");
if (window.EShapeKind === undefined) {
  throw new Error("EShapeKind가 없어 실행할 수 없습니다.");
}

class EditorInputController {
  constructor(args) {
    this.canvasElement = args.canvasElement;
    this.state = args.state;

    const toolDefinitionsCandidate = args.toolDefinitions ?? null;
    this.toolDefinitions = Array.isArray(toolDefinitionsCandidate) ? toolDefinitionsCandidate : [];
    this.shortcutToToolValue = new Map();
    for (const tool of this.toolDefinitions) {
      const shortcutText = typeof tool?.shortcut === "string" ? tool.shortcut.trim() : "";
      if (shortcutText.length <= 0) {
        continue;
      }
      const key = shortcutText.toLowerCase();
      this.shortcutToToolValue.set(key, tool.value);
    }

    this.readStyleFromUI = args.readStyleFromUI;
    this.getCanvasPointFromEvent = args.getCanvasPointFromEvent;

    this.render = args.render;
    this.setTool = args.setTool;
    this.pickShape = args.pickShape;
    this.addShape = args.addShape;
    this.moveShape = args.moveShape;
    this.finalizePolygon = args.finalizePolygon;
    this.deleteSelected = args.deleteSelected;
    this.undo = args.undo;
    this.pushUndoSnapshot = args.pushUndoSnapshot;
    this.isDraftValid = args.isDraftValid;

    this.uid = args.uid;

    this.onPointerDownBound = (e) => this.onPointerDown(e);
    this.onPointerMoveBound = (e) => this.onPointerMove(e);
    this.onPointerUpBound = (e) => this.onPointerUp(e);
    this.onDoubleClickBound = (e) => this.onDoubleClick(e);
    this.onKeyDownBound = (e) => this.onKeyDown(e);
  }

  attach() {
    this.canvasElement.addEventListener("pointerdown", this.onPointerDownBound);
    this.canvasElement.addEventListener("pointermove", this.onPointerMoveBound);
    this.canvasElement.addEventListener("pointerup", this.onPointerUpBound);
    this.canvasElement.addEventListener("dblclick", this.onDoubleClickBound);
    window.addEventListener("keydown", this.onKeyDownBound);
  }

  dispose() {
    this.canvasElement.removeEventListener("pointerdown", this.onPointerDownBound);
    this.canvasElement.removeEventListener("pointermove", this.onPointerMoveBound);
    this.canvasElement.removeEventListener("pointerup", this.onPointerUpBound);
    this.canvasElement.removeEventListener("dblclick", this.onDoubleClickBound);
    window.removeEventListener("keydown", this.onKeyDownBound);
  }

  onPointerDown(e) {
    this.state.isPointerDown = true;
    this.state.pointerDownPos = this.getCanvasPointFromEvent(e);
    this.state.pointerPos = this.state.pointerDownPos;
    this.canvasElement.setPointerCapture(e.pointerId);

    const style = this.readStyleFromUI();
    const pointerDownPoint = this.state.pointerDownPos;

    if (this.state.currentTool === "select") {
      const hit = this.pickShape(pointerDownPoint);
      this.state.selectedId = hit ? hit.id : null;
      this.state.dragStart = pointerDownPoint;
      this.state.dragOriginal = new Map();
      this.state.dragShapesSnapshot = this.state.selectedId ? structuredClone(this.state.shapes) : null;

      if (this.state.selectedId !== null) {
        const selectedShapeCandidate = this.state.shapes.find((shape) => shape.id === this.state.selectedId) ?? null;
        selectedShapeCandidate ?? console.warn("[select] 선택된 도형을 찾지 못했습니다.");
        if (selectedShapeCandidate) {
          this.state.dragOriginal.set(selectedShapeCandidate.id, structuredClone(selectedShapeCandidate));
        }
      }

      this.render();
      return;
    }

    if (this.state.currentTool === "point") {
      this.addShape({
        id: this.uid("pt"),
        kind: EShapeKind.POINT,
        position: pointerDownPoint,
        radius: Math.max(2, style.lineWidth + 1),
        style,
      });
      return;
    }

    if (this.state.currentTool === "polygon") {
      if (this.state.draftPolygon === null) {
        this.state.draftPolygon = {
          id: this.uid("poly"),
          kind: EShapeKind.POLYGON,
          points: [pointerDownPoint],
          isClosed: false,
          style,
        };
      } else {
        this.state.draftPolygon.points.push(pointerDownPoint);
      }
      this.render();
      return;
    }

    if (this.state.currentTool === "line") {
      this.state.draftShape = {
        id: this.uid("ln"),
        kind: EShapeKind.LINE,
        start: pointerDownPoint,
        end: pointerDownPoint,
        style,
      };
      this.render();
      return;
    }

    if (this.state.currentTool === "circle") {
      this.state.draftShape = {
        id: this.uid("ci"),
        kind: EShapeKind.CIRCLE,
        center: pointerDownPoint,
        radius: 0,
        style,
      };
      this.render();
      return;
    }

    if (this.state.currentTool === "rect") {
      this.state.draftShape = {
        id: this.uid("rc"),
        kind: EShapeKind.RECT,
        start: pointerDownPoint,
        end: pointerDownPoint,
        style,
      };
      this.render();
      return;
    }

    if (this.state.currentTool === "freehand") {
      this.state.draftShape = {
        id: this.uid("fh"),
        kind: EShapeKind.FREEHAND,
        points: [pointerDownPoint],
        style,
      };
      this.render();
      return;
    }
  }

  onPointerMove(e) {
    this.state.pointerPos = this.getCanvasPointFromEvent(e);

    if (!this.state.isPointerDown) {
      this.render();
      return;
    }
    if (this.state.pointerDownPos === null) {
      return;
    }

    const pointerPoint = this.state.pointerPos;

    if (this.state.currentTool === "select") {
      if (this.state.selectedId === null || this.state.dragStart === null) {
        this.render();
        return;
      }

      const original = this.state.dragOriginal.get(this.state.selectedId) ?? null;
      original ?? console.warn("[drag] 원본 스냅샷을 찾지 못했습니다.");
      if (!original) {
        return;
      }

      const deltaX = pointerPoint.x - this.state.dragStart.x;
      const deltaY = pointerPoint.y - this.state.dragStart.y;
      const movedShape = this.moveShape(original, deltaX, deltaY);
      const shapeIndex = this.state.shapes.findIndex((shape) => shape.id === this.state.selectedId);
      if (shapeIndex >= 0) {
        this.state.shapes[shapeIndex] = movedShape;
      }
      this.render();
      return;
    }

    if (this.state.draftShape === null) {
      this.render();
      return;
    }

    if (this.state.draftShape.kind === EShapeKind.LINE) {
      this.state.draftShape = { ...this.state.draftShape, end: pointerPoint };
    } else if (this.state.draftShape.kind === EShapeKind.RECT) {
      this.state.draftShape = { ...this.state.draftShape, end: pointerPoint };
    } else if (this.state.draftShape.kind === EShapeKind.CIRCLE) {
      const circleCenter = this.state.draftShape.center;
      const radius = Math.hypot(pointerPoint.x - circleCenter.x, pointerPoint.y - circleCenter.y);
      this.state.draftShape = { ...this.state.draftShape, radius };
    } else if (this.state.draftShape.kind === EShapeKind.FREEHAND) {
      const points = this.state.draftShape.points.slice();
      const lastPoint = points[points.length - 1] ?? null;
      lastPoint ?? console.warn("[freehand] last 포인트가 없습니다.");
      if (lastPoint) {
        const stepDistance = Math.hypot(pointerPoint.x - lastPoint.x, pointerPoint.y - lastPoint.y);
        if (stepDistance >= 1.5) {
          points.push(pointerPoint);
        }
      }
      this.state.draftShape = { ...this.state.draftShape, points };
    }

    this.render();
  }

  onPointerUp(e) {
    this.state.isPointerDown = false;
    this.canvasElement.releasePointerCapture(e.pointerId);

    if (this.state.currentTool === "select") {
      if (this.state.selectedId !== null && this.state.dragShapesSnapshot !== null) {
        const now = this.state.shapes.find((shape) => shape.id === this.state.selectedId) ?? null;
        const original = this.state.dragOriginal.get(this.state.selectedId) ?? null;
        if (now && original) {
          const changed = JSON.stringify(now) !== JSON.stringify(original);
          if (changed) {
            this.pushUndoSnapshot(this.state.dragShapesSnapshot);
          }
        }
      }

      this.state.dragStart = null;
      this.state.dragShapesSnapshot = null;
      this.state.dragOriginal = new Map();
      this.render();
      return;
    }

    if (this.state.draftShape !== null) {
      if (this.isDraftValid(this.state.draftShape)) {
        this.addShape(this.state.draftShape);
      }
      this.state.draftShape = null;
      this.render();
    }
  }

  onDoubleClick(e) {
    if (this.state.currentTool !== "polygon") {
      return;
    }
    e.preventDefault();
    this.finalizePolygon();
  }

  onKeyDown(e) {
    const key = e.key.toLowerCase();

    if ((e.ctrlKey || e.metaKey) && key === "z") {
      e.preventDefault();
      this.undo();
      return;
    }

    if (key === "delete" || key === "backspace") {
      if (this.state.currentTool === "select") {
        this.deleteSelected();
      }
      return;
    }

    if (key === "enter" && this.state.currentTool === "polygon") {
      this.finalizePolygon();
      return;
    }

    const toolValue = this.shortcutToToolValue.get(key) ?? null;
    if (toolValue !== null) {
      this.setTool(toolValue);
    }
  }
}

// 전역으로 노출
window.EditorInputController = EditorInputController;

