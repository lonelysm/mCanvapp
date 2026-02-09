// 마우스(포인터) + 키보드 입력 컨트롤러
// bindApp(app)으로 CanvaApp에 연결한 뒤, 이벤트 시 app 멤버 호출

import { EShapeKind } from "./const.js";
import { Util } from "./util.js";
import { TopMenu } from "./top_menu.js";
import { PointShape, LineShape, CircleShape, RectShape, PolygonShape, FreehandShape } from "./shapes.js";

class EditorInputController {
    static #instance = null;

    static getInstance(args) {
        if (EditorInputController.#instance === null) {
            EditorInputController.#instance = new EditorInputController(args ?? {});
        }
        return EditorInputController.#instance;
    }

    constructor(args) {
        if (EditorInputController.#instance !== null) {
            return EditorInputController.#instance;
        }

        this.canvasElement = Util.getRequiredEl("canvas");
        this.app = null;
        this.state = null;

        this.pointerPos = null;
        this.pointerDownPos = null;
        this.isPointerDown = false;

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

        this.onPointerDownBound = (e) => this.onPointerDown(e);
        this.onPointerMoveBound = (e) => this.onPointerMove(e);
        this.onPointerUpBound = (e) => this.onPointerUp(e);
        this.onDoubleClickBound = (e) => this.onDoubleClick(e);
        this.onKeyDownBound = (e) => this.onKeyDown(e);

        EditorInputController.#instance = this;
    }

    bindApp(app) {
        this.app = app;
        this.state = app !== null ? app.getState() : null;
    }

    getPointerPos() {
        return this.pointerPos;
    }

    bindEventListeners() {
        this.canvasElement.addEventListener("pointerdown", this.onPointerDownBound);
        this.canvasElement.addEventListener("pointermove", this.onPointerMoveBound);
        this.canvasElement.addEventListener("pointerup", this.onPointerUpBound);
        this.canvasElement.addEventListener("dblclick", this.onDoubleClickBound);
        window.addEventListener("keydown", this.onKeyDownBound);
    }

     unbindEventListeners() {
        this.canvasElement.removeEventListener("pointerdown", this.onPointerDownBound);
        this.canvasElement.removeEventListener("pointermove", this.onPointerMoveBound);
        this.canvasElement.removeEventListener("pointerup", this.onPointerUpBound);
        this.canvasElement.removeEventListener("dblclick", this.onDoubleClickBound);
        window.removeEventListener("keydown", this.onKeyDownBound);
    }

    getCanvasPointFromEvent = (event) => {
        const state = this.state ?? this.app?.getState() ?? null;
        const scale = state !== null ? Number(state.viewScale) || 1 : 1;
        const rect = this.canvasElement.getBoundingClientRect();
        return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
    };

    /** 도구 + 시작점 + 스타일로 초기 draft 생성 (line/circle/rect/freehand만) */
    createDraftShape(tool, pointerPoint, style) {
        const app = this.app;
        if (app === null) {
            return null;
        }
        if (tool === "line") {
            return new LineShape({
                id: app.uid("ln"),
                start: pointerPoint,
                end: pointerPoint,
                style,
            });
        }
        if (tool === "circle") {
            return new CircleShape({
                id: app.uid("ci"),
                center: pointerPoint,
                radius: 0,
                style,
            });
        }
        if (tool === "rect") {
            return new RectShape({
                id: app.uid("rc"),
                start: pointerPoint,
                end: pointerPoint,
                style,
            });
        }
        if (tool === "freehand") {
            return new FreehandShape({
                id: app.uid("fh"),
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
        const state = this.state;
        if (state === null) {
            return null;
        }
        // 상단(나중에 그린 것) 우선
        for (let shapeIndex = state.displayShapes.length - 1; shapeIndex >= 0; shapeIndex--) {
            const shape = state.displayShapes[shapeIndex];
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
        const state = this.state;
        const app = this.app;
        if (state === null || app === null) {
            return;
        }
        this.isPointerDown = true;
        this.pointerDownPos = this.getCanvasPointFromEvent(e);
        this.pointerPos = this.pointerDownPos;
        this.canvasElement.setPointerCapture(e.pointerId);

        const style = app.initShapeStyle();
        const pointerDownPoint = this.pointerDownPos;

        if (state.currentTool === "select") {
            const hit = this.pickShape(pointerDownPoint);
            state.selectedId = hit ? hit.id : null;
            state.dragStart = pointerDownPoint;
            state.dragOriginal = new Map();
            state.dragShapesSnapshot =
                state.selectedId ? state.displayShapes.map((s) => s.clone()) : null;

            if (state.selectedId !== null) {
                const selectedShapeCandidate = state.displayShapes.find((shape) => shape.id === state.selectedId) ?? null;
                selectedShapeCandidate ?? console.warn("[select] 선택된 도형을 찾지 못했습니다.");
                if (selectedShapeCandidate) {
                    state.dragOriginal.set(selectedShapeCandidate.id, selectedShapeCandidate.clone());
                }
            }

            app.render();
            return;
        }

        if (state.currentTool === "point") {
            app.addShape(
                new PointShape({
                    id: app.uid("pt"),
                    position: pointerDownPoint,
                    radius: Math.max(2, style.lineWidth + 1),
                    style,
                })
            );
            return;
        }

        if (state.currentTool === "polygon") {
            if (state.draftPolygon === null) {
                state.draftPolygon = new PolygonShape({
                    id: app.uid("poly"),
                    points: [pointerDownPoint],
                    isClosed: false,
                    style,
                });
            } else {
                state.draftPolygon.points.push(pointerDownPoint);
            }
            app.render();
            return;
        }

        const draft = this.createDraftShape(state.currentTool, pointerDownPoint, style);
        if (draft !== null) {
            state.draftShape = draft;
            app.render();
        }
    }

    onPointerMove(e) {
        const state = this.state;
        const app = this.app;
        this.pointerPos = this.getCanvasPointFromEvent(e);

        if (!this.isPointerDown) {
            app?.render();
            return;
        }
        if (this.pointerDownPos === null || state === null || app === null) {
            return;
        }

        const pointerPoint = this.pointerPos;

        if (state.currentTool === "select") {
            if (state.selectedId === null || state.dragStart === null) {
                app.render();
                return;
            }

            const original = state.dragOriginal.get(state.selectedId) ?? null;
            original ?? console.warn("[drag] 원본 스냅샷을 찾지 못했습니다.");
            if (!original) {
                return;
            }

            const deltaX = pointerPoint.x - state.dragStart.x;
            const deltaY = pointerPoint.y - state.dragStart.y;
            const movedShape = this.moveShape(original, deltaX, deltaY);
            const shapeIndex = state.displayShapes.findIndex((shape) => shape.id === state.selectedId);
            if (shapeIndex >= 0) {
                state.displayShapes[shapeIndex] = movedShape;
            }
            app.render();
            return;
        }

        if (state.draftShape === null) {
            app.render();
            return;
        }

        this.updateDraftShape(state.draftShape, pointerPoint);
        app.render();
    }

    onPointerUp(e) {
        const state = this.state;
        const app = this.app;
        this.isPointerDown = false;
        this.canvasElement.releasePointerCapture(e.pointerId);

        if (state === null || app === null) {
            return;
        }

        if (state.currentTool === "select") {
            if (state.selectedId !== null && state.dragShapesSnapshot !== null) {
                const now = state.displayShapes.find((shape) => shape.id === state.selectedId) ?? null;
                const original = state.dragOriginal.get(state.selectedId) ?? null;
                if (now && original) {
                    const changed = JSON.stringify(now) !== JSON.stringify(original);
                    if (changed) {
                        app.pushUndoSnapshot(state.dragShapesSnapshot);
                    }
                }
            }

            state.dragStart = null;
            state.dragShapesSnapshot = null;
            state.dragOriginal = new Map();
            app.render();
            return;
        }

        if (state.draftShape !== null) {
            if (app.isDraftValid(state.draftShape)) {
                app.addShape(state.draftShape);
            }
            state.draftShape = null;
            app.render();
        }
    }

    onDoubleClick(e) {
        const state = this.state;
        const app = this.app;
        if (state === null || state.currentTool !== "polygon") {
            return;
        }
        e.preventDefault();
        app?.finalizePolygon();
    }

    onKeyDown(e) {
        const state = this.state;
        const app = this.app;
        const key = e.key.toLowerCase();

        if ((e.ctrlKey || e.metaKey) && key === "z") {
            e.preventDefault();
            app?.undo();
            return;
        }

        if (key === "delete" || key === "backspace") {
            if (state?.currentTool === "select") {
                app?.deleteSelected();
            }
            return;
        }

        if (key === "enter" && state?.currentTool === "polygon") {
            app?.finalizePolygon();
            return;
        }

        const toolValue = this.shortcutToToolValue.get(key) ?? null;
        if (toolValue !== null) {
            TopMenu.getInstance().setTool(toolValue);
        }
    }
}

export { EditorInputController };

