// 마우스(포인터) + 키보드 입력 컨트롤러
// - app.js의 상태/도형 로직을 호출하여 편집 동작을 수행

import { EShapeKind } from "./const.js";
import { Util } from "./util.js";
import { PointShape, LineShape, CircleShape, RectShape, PolygonShape, FreehandShape } from "./shapes.js";

class EditorInputController {
    static #instance = null;

    static getInstance(args) {
        if (EditorInputController.#instance === null) {
            EditorInputController.#instance = new EditorInputController(args);
        }
        return EditorInputController.#instance;
    }

    constructor(args) {
        if (EditorInputController.#instance !== null) {
            return EditorInputController.#instance;
        }

        this.canvasElement = Util.getRequiredEl("canvas");
        this.state = args.state;

        const toolOptionInfosCandidate = args.toolOptionInfos ?? null;
        this.toolOptionInfos = Array.isArray(toolOptionInfosCandidate) ? toolOptionInfosCandidate : [];
        this.shortcutToToolValue = new Map();
        for (const tool of this.toolOptionInfos) {
            const shortcutText = typeof tool?.shortcut === "string" ? tool.shortcut.trim() : "";
            if (shortcutText.length <= 0) {
                continue;
            }
            const key = shortcutText.toLowerCase();
            this.shortcutToToolValue.set(key, tool.value);
        }

        this.service = args.service ?? null;

        this.onPointerDownBound = (e) => this.onPointerDown(e);
        this.onPointerMoveBound = (e) => this.onPointerMove(e);
        this.onPointerUpBound = (e) => this.onPointerUp(e);
        this.onDoubleClickBound = (e) => this.onDoubleClick(e);
        this.onKeyDownBound = (e) => this.onKeyDown(e);

        EditorInputController.#instance = this;
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

    getCanvasPointFromEvent = (event) => {
        const rect = this.canvasElement.getBoundingClientRect();
        const scale = Number(this.state.viewScale) || 1;
        return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
    };

    /** 도구 + 시작점 + 스타일로 초기 draft 생성 (line/circle/rect/freehand만) */
    createDraftShape(tool, pointerPoint, style) {
        if (tool === "line") {
            return new LineShape({
                id: this.service.uid("ln"),
                start: pointerPoint,
                end: pointerPoint,
                style,
            });
        }
        if (tool === "circle") {
            return new CircleShape({
                id: this.service.uid("ci"),
                center: pointerPoint,
                radius: 0,
                style,
            });
        }
        if (tool === "rect") {
            return new RectShape({
                id: this.service.uid("rc"),
                start: pointerPoint,
                end: pointerPoint,
                style,
            });
        }
        if (tool === "freehand") {
            return new FreehandShape({
                id: this.service.uid("fh"),
                points: [pointerPoint],
                style,
            });
        }
        return null;
    }

    /** 현재 draft를 포인터 위치로 직접 수정 (end/radius/points만 갱신). */
    updateDraftShape(draft, pointerPoint) {
        const p = { x: pointerPoint.x, y: pointerPoint.y };
        if (draft.kind === EShapeKind.LINE) {
            draft.end = p;
            return;
        }
        if (draft.kind === EShapeKind.RECT) {
            draft.end = p;
            return;
        }
        if (draft.kind === EShapeKind.CIRCLE) {
            draft.radius = Math.hypot(pointerPoint.x - draft.center.x, pointerPoint.y - draft.center.y);
            return;
        }
        if (draft.kind === EShapeKind.FREEHAND) {
            const lastPoint = draft.points[draft.points.length - 1] ?? null;
            lastPoint ?? console.warn("[freehand] last 포인트가 없습니다.");
            if (lastPoint) {
                const stepDistance = Math.hypot(pointerPoint.x - lastPoint.x, pointerPoint.y - lastPoint.y);
                if (stepDistance >= 1.5) {
                    draft.points.push(p);
                }
            }
        }
    }

    // ---------- 좌표/히트테스트 ----------
    hitTest(shape, pointerPoint) {
        const tolerance = Math.max(6, shape.style.lineWidth + 6);
        return shape.hitTest(pointerPoint, tolerance);
    }

    pickShape(pointerPoint) {
        // 상단(나중에 그린 것) 우선
        for (let shapeIndex = this.state.displayShapes.length - 1; shapeIndex >= 0; shapeIndex--) {
            const shape = this.state.displayShapes[shapeIndex];
            if (this.hitTest(shape, pointerPoint)) {
                return shape;
            }
        }
        return null;
    }

    moveShape(shape, deltaX, deltaY) {
        return shape.translate(deltaX, deltaY);
    }
    
    onPointerDown(e) {
        this.state.isPointerDown = true;
        this.state.pointerDownPos = this.getCanvasPointFromEvent(e);
        this.state.pointerPos = this.state.pointerDownPos;
        this.canvasElement.setPointerCapture(e.pointerId);

        const style = this.service.initShapeStyle();
        const pointerDownPoint = this.state.pointerDownPos;

        if (this.state.currentTool === "select") {
            const hit = this.pickShape(pointerDownPoint);
            this.state.selectedId = hit ? hit.id : null;
            this.state.dragStart = pointerDownPoint;
            this.state.dragOriginal = new Map();
            this.state.dragShapesSnapshot =
                this.state.selectedId ? this.state.displayShapes.map((s) => s.clone()) : null;

            if (this.state.selectedId !== null) {
                const selectedShapeCandidate = this.state.displayShapes.find((shape) => shape.id === this.state.selectedId) ?? null;
                selectedShapeCandidate ?? console.warn("[select] 선택된 도형을 찾지 못했습니다.");
                if (selectedShapeCandidate) {
                    this.state.dragOriginal.set(selectedShapeCandidate.id, selectedShapeCandidate.clone());
                }
            }

            this.service.render();
            return;
        }

        if (this.state.currentTool === "point") {
            this.service.addShape(
                new PointShape({
                    id: this.service.uid("pt"),
                    position: pointerDownPoint,
                    radius: Math.max(2, style.lineWidth + 1),
                    style,
                })
            );
            return;
        }

        if (this.state.currentTool === "polygon") {
            if (this.state.draftPolygon === null) {
                this.state.draftPolygon = new PolygonShape({
                    id: this.service.uid("poly"),
                    points: [pointerDownPoint],
                    isClosed: false,
                    style,
                });
            } else {
                this.state.draftPolygon.points.push(pointerDownPoint);
            }
            this.service.render();
            return;
        }

        const draft = this.createDraftShape(this.state.currentTool, pointerDownPoint, style);
        if (draft !== null) {
            this.state.draftShape = draft;
            this.service.render();
            return;
        }
    }

    onPointerMove(e) {
        this.state.pointerPos = this.getCanvasPointFromEvent(e);

        if (!this.state.isPointerDown) {
            this.service.render();
            return;
        }
        if (this.state.pointerDownPos === null) {
            return;
        }

        const pointerPoint = this.state.pointerPos;

        if (this.state.currentTool === "select") {
            if (this.state.selectedId === null || this.state.dragStart === null) {
                this.service.render();
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
                this.state.displayShapes[shapeIndex] = movedShape;
            }
            this.service.render();
            return;
        }

        if (this.state.draftShape === null) {
            this.service.render();
            return;
        }

        this.updateDraftShape(this.state.draftShape, pointerPoint);
        this.service.render();
    }

    onPointerUp(e) {
        this.state.isPointerDown = false;
        this.canvasElement.releasePointerCapture(e.pointerId);

        if (this.state.currentTool === "select") {
            if (this.state.selectedId !== null && this.state.dragShapesSnapshot !== null) {
                const now = this.state.displayShapes.find((shape) => shape.id === this.state.selectedId) ?? null;
                const original = this.state.dragOriginal.get(this.state.selectedId) ?? null;
                if (now && original) {
                    const changed = JSON.stringify(now) !== JSON.stringify(original);
                    if (changed) {
                        this.service.pushUndoSnapshot(this.state.dragShapesSnapshot);
                    }
                }
            }

            this.state.dragStart = null;
            this.state.dragShapesSnapshot = null;
            this.state.dragOriginal = new Map();
            this.service.render();
            return;
        }

        if (this.state.draftShape !== null) {
            if (this.service.isDraftValid(this.state.draftShape)) {
                this.service.addShape(this.state.draftShape);
            }
            this.state.draftShape = null;
            this.service.render();
        }
    }

    onDoubleClick(e) {
        if (this.state.currentTool !== "polygon") {
            return;
        }
        e.preventDefault();
        this.service.finalizePolygon();
    }

    onKeyDown(e) {
        const key = e.key.toLowerCase();

        if ((e.ctrlKey || e.metaKey) && key === "z") {
            e.preventDefault();
            this.service.undo();
            return;
        }

        if (key === "delete" || key === "backspace") {
            if (this.state.currentTool === "select") {
                this.service.deleteSelected();
            }
            return;
        }

        if (key === "enter" && this.state.currentTool === "polygon") {
            this.service.finalizePolygon();
            return;
        }

        const toolValue = this.shortcutToToolValue.get(key) ?? null;
        if (toolValue !== null) {
            this.service.setTool(toolValue);
        }
    }
}

export { EditorInputController };

