// 마우스(포인터) + 키보드 입력 컨트롤러
// - app.js의 상태/도형 로직을 호출하여 편집 동작을 수행

window.EShapeKind ??
    console.error("[init] EShapeKind를 찾지 못했습니다. index.html에서 const.js 로드 순서를 확인하세요.");
if (window.EShapeKind === undefined) {
    throw new Error("EShapeKind가 없어 실행할 수 없습니다.");
}

window.Util ??
    console.error("[init] Util을 찾지 못했습니다. index.html에서 util.js 로드 순서를 확인하세요.");
if (window.Util === undefined) {
    throw new Error("Util이 없어 실행할 수 없습니다.");
}

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
                const rect = canvasEl.getBoundingClientRect();
                const scale = Number(editorState.viewScale) || 1;
                return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
        };

    onPointerDown(e) {
        this.state.isPointerDown = true;
        this.state.pointerDownPos = this.getCanvasPointFromEvent(e);
        this.state.pointerPos = this.state.pointerDownPos;
        this.canvasElement.setPointerCapture(e.pointerId);

        const style = this.service.initShapeStyle();
        const pointerDownPoint = this.state.pointerDownPos;

        if (this.state.currentTool === "select") {
            const hit = this.service.pickShape(pointerDownPoint);
            this.state.selectedId = hit ? hit.id : null;
            this.state.dragStart = pointerDownPoint;
            this.state.dragOriginal = new Map();
            this.state.dragShapesSnapshot =
                this.state.selectedId ? this.state.shapes.map((s) => s.clone()) : null;

            if (this.state.selectedId !== null) {
                const selectedShapeCandidate = this.state.shapes.find((shape) => shape.id === this.state.selectedId) ?? null;
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
                new window.PointShape({
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
                this.state.draftPolygon = new window.PolygonShape({
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

        if (this.state.currentTool === "line") {
            this.state.draftShape = new window.LineShape({
                id: this.service.uid("ln"),
                start: pointerDownPoint,
                end: pointerDownPoint,
                style,
            });
            this.service.render();
            return;
        }

        if (this.state.currentTool === "circle") {
            this.state.draftShape = new window.CircleShape({
                id: this.service.uid("ci"),
                center: pointerDownPoint,
                radius: 0,
                style,
            });
            this.service.render();
            return;
        }

        if (this.state.currentTool === "rect") {
            this.state.draftShape = new window.RectShape({
                id: this.service.uid("rc"),
                start: pointerDownPoint,
                end: pointerDownPoint,
                style,
            });
            this.service.render();
            return;
        }

        if (this.state.currentTool === "freehand") {
            this.state.draftShape = new window.FreehandShape({
                id: this.service.uid("fh"),
                points: [pointerDownPoint],
                style,
            });
            this.service.render();
            return;
        }
    }

    onPointerMove(e) {
        this.state.pointerPos = this.service.getCanvasPointFromEvent(e);

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
            const movedShape = this.service.moveShape(original, deltaX, deltaY);
            const shapeIndex = this.state.shapes.findIndex((shape) => shape.id === this.state.selectedId);
            if (shapeIndex >= 0) {
                this.state.shapes[shapeIndex] = movedShape;
            }
            this.service.render();
            return;
        }

        if (this.state.draftShape === null) {
            this.service.render();
            return;
        }

        const draft = this.state.draftShape;
        if (draft.kind === EShapeKind.LINE) {
            this.state.draftShape = new window.LineShape({
                id: draft.id,
                start: draft.start,
                end: pointerPoint,
                style: draft.style,
            });
        } else if (draft.kind === EShapeKind.RECT) {
            this.state.draftShape = new window.RectShape({
                id: draft.id,
                start: draft.start,
                end: pointerPoint,
                style: draft.style,
            });
        } else if (draft.kind === EShapeKind.CIRCLE) {
            const circleCenter = draft.center;
            const radius = Math.hypot(pointerPoint.x - circleCenter.x, pointerPoint.y - circleCenter.y);
            this.state.draftShape = new window.CircleShape({
                id: draft.id,
                center: draft.center,
                radius,
                style: draft.style,
            });
        } else if (draft.kind === EShapeKind.FREEHAND) {
            const points = draft.points.slice();
            const lastPoint = points[points.length - 1] ?? null;
            lastPoint ?? console.warn("[freehand] last 포인트가 없습니다.");
            if (lastPoint) {
                const stepDistance = Math.hypot(pointerPoint.x - lastPoint.x, pointerPoint.y - lastPoint.y);
                if (stepDistance >= 1.5) {
                    points.push(pointerPoint);
                }
            }
            this.state.draftShape = new window.FreehandShape({
                id: draft.id,
                points,
                style: draft.style,
            });
        }

        this.service.render();
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

// 전역으로 노출
window.EditorInputController = EditorInputController;

