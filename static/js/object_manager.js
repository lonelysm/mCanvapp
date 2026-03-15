// 도형 목록(displayShapes), 작업 이력, 툴/선택/draft 상태 관리
// 캔버스 포인터 이벤트로 선택·드래그·도형 추가·draft 처리 (팬/줌은 Renderer에서 처리)

import { EShapeKind } from "./const.js";
import { Util } from "./util.js";
import { PointShape, LineShape, CircleShape, RectShape, PolygonShape, FreehandShape } from "./shapes.js";

const TASK_HISTORY_MAX = 50;

class ObjectManagerClass {
    constructor() {
        this.shapes = [];
        this.taskHistories = [];

        this.currentToolMode = EShapeKind.Select;
        this.selectedId = null;
        this.draftShape = null;
        this.draftPolygon = null;
        this.dragShapesSnapshot = null;
        this.dragCopiedOriginal = null;

        this._isDraggingOrDrafting = false;
        this._pointerDownPos = null;
        this._dragStart = null;
        this._lastPointerWorld = null;

        this._canvas = null;
        this._getWorldPointFromEvent = null;
        this._requestRender = null;
        this._getCurrentShapeStyle = null;
        this._uid = null;
        this._renderer = null;

        this._onPointerDownBound = (e) => this._onPointerDown(e);
        this._onPointerMoveBound = (e) => this._onPointerMove(e);
        this._onPointerUpBound = (e) => this._onPointerUp(e);
        this._onDoubleClickBound = (e) => this._onDoubleClick(e);
    }

    /** 포인터 이벤트 바인드. ObjectManager를 먼저 등록해 도형 히트 시 처리·stopImmediatePropagation */
    bindPointerEvents(canvas, getWorldPointFromEvent, requestRender, getCurrentShapeStyle, uid, renderer) {
        this._canvas = canvas;
        this._getWorldPointFromEvent = getWorldPointFromEvent;
        this._requestRender = requestRender;
        this._getCurrentShapeStyle = getCurrentShapeStyle;
        this._uid = uid;
        this._renderer = renderer;

        this._canvas.addEventListener("pointerdown", this._onPointerDownBound);
        this._canvas.addEventListener("pointermove", this._onPointerMoveBound);
        this._canvas.addEventListener("pointerup", this._onPointerUpBound);
        this._canvas.addEventListener("dblclick", this._onDoubleClickBound);
    }

    unbindPointerEvents() {
        if (this._canvas === null) return;
        this._canvas.removeEventListener("pointerdown", this._onPointerDownBound);
        this._canvas.removeEventListener("pointermove", this._onPointerMoveBound);
        this._canvas.removeEventListener("pointerup", this._onPointerUpBound);
        this._canvas.removeEventListener("dblclick", this._onDoubleClickBound);
        this._canvas = null;
    }

    setTool(tool) {
        this.currentToolMode = tool;
        if (this.draftPolygon !== null && tool !== EShapeKind.Polygon) {
            this.finalizePolygon();
        }
    }

    getCurrentToolMode() {
        return this.currentToolMode;
    }

    /** 렌더러에 넘길 상태 (displayShapes + 툴/선택/draft + 포인터 위치) */
    getRenderState() {
        return {
            displayShapes: this.shapes,
            currentToolMode: this.currentToolMode,
            selectedId: this.selectedId,
            draftShape: this.draftShape,
            draftPolygon: this.draftPolygon,
            pointerPos: this._lastPointerWorld ?? null,
        };
    }

    getShapes() {
        return this.shapes;
    }

    setShapes(newShapes) {
        this.shapes = Array.isArray(newShapes) ? newShapes : [];
    }

    addShape(shape) {
        if (shape != null) {
            this.shapes.push(shape);
        }
    }

    findIndexById(id) {
        return this.shapes.findIndex((s) => s.id === id);
    }

    replaceShapeAtIndex(index, shape) {
        if (index >= 0 && index < this.shapes.length && shape != null) {
            this.shapes[index] = shape;
        }
    }

    removeShapeAtIndex(index) {
        if (index >= 0 && index < this.shapes.length) {
            this.shapes.splice(index, 1);
        }
    }

    pushTaskHistory(snapshot) {
        const toPush = snapshot ?? this.shapes.map((s) => s.clone());
        this.taskHistories.push(toPush);
        if (this.taskHistories.length > TASK_HISTORY_MAX) {
            this.taskHistories.shift();
        }
    }

    restoreFromHistory() {
        const prev = this.taskHistories.pop();
        if (prev == null) return false;
        this.setShapes(prev);
        return true;
    }

    clear() {
        this.pushTaskHistory();
        this.setShapes([]);
    }

    pickShape(pointerPoint) {
        for (let i = this.shapes.length - 1; i >= 0; i--) {
            const shape = this.shapes[i];
            const tolerance = Math.max(6, (shape.style?.lineWidth ?? 3) + 6);
            if (shape.hitTest(pointerPoint, tolerance)) return shape;
        }
        return null;
    }

    undo() {
        if (!this.restoreFromHistory()) return;
        this.selectedId = null;
        this.draftShape = null;
        this.draftPolygon = null;
        this._requestRender?.();
    }

    clearAll() {
        this.clear();
        this.selectedId = null;
        this.draftShape = null;
        this.draftPolygon = null;
        this._requestRender?.();
    }

    isDraftValid(shape) {
        if (shape.kind === EShapeKind.LINE) return Util.distance(shape.start, shape.end) >= 3;
        if (shape.kind === EShapeKind.RECT) {
            const rect = Util.rectFromPoints(shape.start, shape.end);
            return rect.w >= 3 && rect.h >= 3;
        }
        if (shape.kind === EShapeKind.CIRCLE) return shape.radius >= 3;
        if (shape.kind === EShapeKind.FREEHAND) {
            return (
                shape.points.length >= 2 &&
                Util.distance(shape.points[0], shape.points[shape.points.length - 1]) >= 2
            );
        }
        return true;
    }

    addDraftShape() {
        const draft = this.draftShape ?? null;
        if (!draft) return;
        if (this.isDraftValid(draft)) {
            this.pushTaskHistory();
            this.addShape(draft);
            this.selectedId = draft.id;
            this.draftShape = null;
            this._requestRender?.();
        }
    }

    deleteSelected() {
        if (this.selectedId === null) return;
        const idx = this.findIndexById(this.selectedId);
        if (idx < 0) return;
        this.pushTaskHistory();
        this.removeShapeAtIndex(idx);
        this.selectedId = null;
        this._requestRender?.();
    }

    finalizePolygon() {
        if (this.draftPolygon === null) return;
        if (this.draftPolygon.points.length >= 3) {
            this.pushTaskHistory();
            const draft = this.draftPolygon;
            const final = new PolygonShape({
                id: draft.id,
                points: draft.points.map((p) => ({ ...p })),
                isClosed: true,
                style: draft.style,
            });
            this.addShape(final);
            this.selectedId = final.id;
        }
        this.draftPolygon = null;
        this._requestRender?.();
    }

    _createShape(pointerDownPoint) {
        const currentStyle = this._getCurrentShapeStyle?.();
        if (!currentStyle) return;

        if (this.currentToolMode === EShapeKind.Point) {
            this.addShape(
                new PointShape({
                    id: this._uid("pt"),
                    position: pointerDownPoint,
                    radius: Math.max(2, currentStyle.lineWidth + 1),
                    style: currentStyle,
                })
            );
            this._requestRender?.();
            return;
        }

        if (this.currentToolMode === EShapeKind.Polygon) {
            if (this.draftPolygon === null) {
                this.draftPolygon = new PolygonShape({
                    id: this._uid("poly"),
                    points: [pointerDownPoint],
                    isClosed: false,
                    style: currentStyle,
                });
            } else {
                this.draftPolygon.points.push(pointerDownPoint);
            }
            this._requestRender?.();
            return;
        }

        const draftShape = this._createDraftShape(pointerDownPoint);
        if (draftShape !== null) {
            this.draftShape = draftShape;
            this._requestRender?.();
        }
    }

    _createDraftShape(pointerPoint) {
        const currentStyle = this._getCurrentShapeStyle?.();
        if (!currentStyle) return null;

        if (this.currentToolMode === EShapeKind.LINE) {
            return new LineShape({
                id: this._uid("ln"),
                start: pointerPoint,
                end: pointerPoint,
                style: currentStyle,
            });
        }
        if (this.currentToolMode === EShapeKind.CIRCLE) {
            return new CircleShape({
                id: this._uid("ci"),
                center: pointerPoint,
                radius: 0,
                style: currentStyle,
            });
        }
        if (this.currentToolMode === EShapeKind.RECT) {
            return new RectShape({
                id: this._uid("rc"),
                start: pointerPoint,
                end: pointerPoint,
                style: currentStyle,
            });
        }
        if (this.currentToolMode === EShapeKind.FREEHAND) {
            return new FreehandShape({
                id: this._uid("fh"),
                points: [pointerPoint],
                style: currentStyle,
            });
        }
        return null;
    }

    _onPointerDown(e) {
        const getWorld = this._getWorldPointFromEvent;
        const requestRender = this._requestRender;
        if (!getWorld || !requestRender) return;

        const worldPoint = getWorld(e);
        this._pointerDownPos = worldPoint;
        this._dragStart = worldPoint;

        if (this.currentToolMode === EShapeKind.Select) {
            const hit = this.pickShape(worldPoint);
            this.selectedId = hit ? hit.id : null;
            this.dragCopiedOriginal = new Map();
            this.dragShapesSnapshot = this.selectedId ? this.shapes.map((s) => s.clone()) : null;

            if (this.selectedId !== null) {
                const selected = this.shapes.find((s) => s.id === this.selectedId) ?? null;
                if (selected) {
                    this.dragCopiedOriginal.set(selected.id, selected.clone());
                }
                this._renderer?.endPan();
                this._isDraggingOrDrafting = true;
                e.stopImmediatePropagation();
                this._canvas.setPointerCapture(e.pointerId);
            }
            requestRender();
            return;
        }

        this._createShape(worldPoint);
        this._isDraggingOrDrafting = this.draftShape !== null || this.draftPolygon !== null;
        if (this._isDraggingOrDrafting) {
            e.stopImmediatePropagation();
            this._canvas.setPointerCapture(e.pointerId);
        }
    }

    _onPointerMove(e) {
        const getWorld = this._getWorldPointFromEvent;
        const requestRender = this._requestRender;
        if (!getWorld || !requestRender) return;

        const worldPoint = getWorld(e);
        this._lastPointerWorld = worldPoint;

        if (this._isDraggingOrDrafting) {
            e.stopImmediatePropagation();
            if (this.currentToolMode === EShapeKind.Select && this.selectedId !== null) {
                const original = this.dragCopiedOriginal?.get(this.selectedId) ?? null;
                if (original) {
                    const deltaX = worldPoint.x - this._dragStart.x;
                    const deltaY = worldPoint.y - this._dragStart.y;
                    const moved = original.translate(deltaX, deltaY);
                    const idx = this.shapes.findIndex((s) => s.id === this.selectedId);
                    if (idx >= 0) this.replaceShapeAtIndex(idx, moved);
                }
            } else if (this.draftShape !== null) {
                this.draftShape.updateDraftShape(worldPoint);
            }
            requestRender();
            return;
        }

        requestRender();
    }

    _onPointerUp(e) {
        const getWorld = this._getWorldPointFromEvent;
        const requestRender = this._requestRender;
        if (!requestRender) return;

        if (this._isDraggingOrDrafting) {
            e.stopImmediatePropagation();
            this._canvas.releasePointerCapture(e.pointerId);

            if (this.currentToolMode === EShapeKind.Select) {
                if (this.selectedId !== null && this.dragShapesSnapshot !== null) {
                    const now = this.shapes.find((s) => s.id === this.selectedId) ?? null;
                    const original = this.dragCopiedOriginal?.get(this.selectedId) ?? null;
                    if (now && original && JSON.stringify(now) !== JSON.stringify(original)) {
                        this.pushTaskHistory(this.dragShapesSnapshot);
                    }
                }
                this.dragShapesSnapshot = null;
                this.dragCopiedOriginal = new Map();
            } else {
                this.addDraftShape();
            }

            this._renderer?.endPan();
            this._isDraggingOrDrafting = false;
            this._pointerDownPos = null;
            this._dragStart = null;
            requestRender();
            return;
        }

        this._renderer?.endPan();
        this._pointerDownPos = null;
        this._dragStart = null;
    }

    _onDoubleClick(e) {
        e.preventDefault();
        if (this.currentToolMode === EShapeKind.Polygon) {
            this.finalizePolygon();
        }
    }
}

export { ObjectManagerClass };
