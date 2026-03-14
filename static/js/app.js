// 루트 클래스: 상태·렌더·도형 로직을 소유하고, TopMenu/EditorInputController 등에 지시·경유

import { EShapeKind, ShapeMenuList } from "./const.js";
import { Util } from "./util.js";
import { EditorInputController } from "./editor_input_controller.js";
import { CanvasRenderer } from "./canvas_renderer.js";
import { TopMenu } from "./top_menu.js";
import { PointShape, LineShape, CircleShape, RectShape, PolygonShape, FreehandShape } from "./shapes.js";
import { ObjectManagerClass } from "./object_manager.js";

class CanvaApp {
    constructor() {
        this.shapeListEl = Util.getRequiredEl("shapeList");
        this.renderer = CanvasRenderer.getInstance({ gridStep: 32 });
        this.objectManager = new ObjectManagerClass();

        this.currentToolMode = EShapeKind.Select;
        this.selectedId = null;
        this.draftShape = null;
        this.draftPolygon = null;
        this.dragShapesSnapshot = null;
        this.dragCopiedOriginal = null;
    }

    /** 렌더러가 관리하는 뷰 오프셋(팬). 좌표 변환용 */
    getViewOffset() {
        return this.renderer.getViewOffset();
    }

    /** 렌더러가 관리하는 뷰 스케일(줌). 좌표 변환·UI 표시용 */
    getViewScale() {
        return this.renderer.getViewScale();
    }

    /** 휠 줌: 화면 좌표 (캔버스 기준)와 deltaY로 확대/축소. 마우스 위치를 중심으로 줌 */
    onWheelZoom(screenX, screenY, deltaY) {
        const MIN_SCALE = 0.1;
        const MAX_SCALE = 5;
        const ZOOM_FACTOR = 1.15;
        const scale = Number(this.getViewScale()) || 1;
        const newScale =
            deltaY < 0 ? scale * ZOOM_FACTOR : scale / ZOOM_FACTOR;
        const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
        if (clamped === scale) {
            return;
        }
        this.renderer.zoomAt(screenX, screenY, clamped);
        TopMenu.getInstance().syncZoomValueOut();
        this.render();
    }

    /** 툴바 줌 인: 캔버스 중심 기준 확대 */
    zoomIn() {
        const r = this.renderer;
        const rect = r.canvas.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const scale = Number(r.getViewScale()) || 1;
        const next = Util.clamp(scale * 1.1, 0.2, 4);
        if (next === scale) return;
        r.zoomAt(centerX, centerY, next);
        TopMenu.getInstance().syncZoomValueOut();
        this.render();
    }

    /** 툴바 줌 아웃: 캔버스 중심 기준 축소 */
    zoomOut() {
        const r = this.renderer;
        const rect = r.canvas.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const scale = Number(r.getViewScale()) || 1;
        const next = Util.clamp(scale / 1.1, 0.2, 4);
        if (next === scale) return;
        r.zoomAt(centerX, centerY, next);
        TopMenu.getInstance().syncZoomValueOut();
        this.render();
    }

    /** ObjectManager가 관리하는 현재 도형 목록 반환 */
    getDisplayShapes() {
        return this.objectManager.getShapes();
    }

    getCurrentShapeStyle() {
        const strokeColorEl = document.getElementById("strokeColor");
        const fillEnabledEl = document.getElementById("fillEnabled");
        const fillColorEl = document.getElementById("fillColor");
        const lineWidthEl = document.getElementById("lineWidth");

        strokeColorEl ?? console.error("[ui] strokeColor 엘리먼트를 찾지 못했습니다.");
        fillEnabledEl ?? console.error("[ui] fillEnabled 엘리먼트를 찾지 못했습니다.");
        fillColorEl ?? console.error("[ui] fillColor 엘리먼트를 찾지 못했습니다.");
        lineWidthEl ?? console.error("[ui] lineWidth 엘리먼트를 찾지 못했습니다.");

        const strokeColor = strokeColorEl?.value ?? "#2f6df6";
        const fillEnabledValue = fillEnabledEl?.checked ?? true;
        const fillColor = fillColorEl?.value ?? "#2f6df633";
        const lineWidthValue = Number(lineWidthEl?.value ?? 3);

        return {
            strokeColor,
            lineWidth: Util.clamp(lineWidthValue, 1, 50),
            fillEnabled: fillEnabledValue,
            fillColor,
        };
    }

    render() {
        this.renderer.render({
            displayShapes: this.getDisplayShapes(),
            currentToolMode: this.currentToolMode,
            selectedId: this.selectedId,
            draftShape: this.draftShape,
            draftPolygon: this.draftPolygon,
        });
        this.renderHistoryList();
    }

    setTool(tool) {
        this.currentToolMode = tool;
        if (this.draftPolygon !== null && tool !== EShapeKind.Polygon) {
            this.finalizePolygon();
        }
        this.render();
    }

    //----------------------------------------------------------------
    // Object Manager
    //----------------------------------------------------------------
    // 히스토리 목록
    renderHistoryList() {
        const displayShapes = this.getDisplayShapes();
        const items = displayShapes
            .slice()
            .reverse()
            .map((shape, idxFromEnd) => {
                const idx = displayShapes.length - 1 - idxFromEnd;
                const title = `${idx + 1}. ${shape.displayName ?? "도형"}`;
                const sub = shape.getSubLabel ? shape.getSubLabel() : "";
                const selected = this.selectedId === shape.id;
                const swatch = shape.style.stroke;
                return { id: shape.id, title, sub, selected, swatch };
            });

        this.shapeListEl.innerHTML = "";
        for (const it of items) {
            const div = document.createElement("div");
            div.className = `shapeItem${it.selected ? " shapeItem--selected" : ""}`;
            div.dataset.id = it.id;

            const sw = document.createElement("div");
            sw.className = "shapeSwatch";
            sw.style.background = it.swatch;

            const meta = document.createElement("div");
            meta.className = "shapeMeta";

            const t = document.createElement("div");
            t.className = "shapeMeta__title";
            t.textContent = it.title;

            const subEl = document.createElement("div");
            subEl.className = "shapeMeta__sub";
            subEl.textContent = it.sub;

            meta.appendChild(t);
            meta.appendChild(subEl);
            div.appendChild(sw);
            div.appendChild(meta);
            div.addEventListener("click", () => {
                this.selectedId = it.id;
                TopMenu.getInstance().setTool(EShapeKind.Select);
            });

            this.shapeListEl.appendChild(div);
        }
    }

    pushTaskHistory(snapshot) {
        this.objectManager.pushTaskHistory(snapshot ?? this.getDisplayShapes().map((s) => s.clone()));
    }

    undo() {
        if (!this.objectManager.restoreFromHistory()) {
            return;
        }
        this.selectedId = null;
        this.draftShape = null;
        this.draftPolygon = null;
        this.render();
    }

    clearAll() {
        this.objectManager.clear();
        this.selectedId = null;
        this.draftShape = null;
        this.draftPolygon = null;
        this.render();
    }

    addDraftShape() {
        const draftShape = this.draftShape ?? null;
        if (draftShape) {
            if (this.isDraftValid(draftShape)) {
                this.pushTaskHistory();
                this.objectManager.addShape(draftShape);
                this.selectedId = draftShape.id;
                this.render();

                this.draftShape = null;
            }
        }
    }

    deleteSelected() {
        if (this.selectedId === null) {
            return;
        }
        const idx = this.objectManager.findIndexById(this.selectedId);
        if (idx < 0) {
            return;
        }
        this.pushTaskHistory();
        this.objectManager.removeShapeAtIndex(idx);
        this.selectedId = null;
        this.render();
    }

    finalizePolygon() {
        if (this.draftPolygon === null) {
            return;
        }
        if (this.draftPolygon.points.length >= 3) {
            this.pushTaskHistory();
            const draft = this.draftPolygon;
            const final = new PolygonShape({
                id: draft.id,
                points: draft.points.map((p) => ({ ...p })),
                isClosed: true,
                style: draft.style,
            });
            this.objectManager.addShape(final);
            this.selectedId = final.id;
        }
        this.draftPolygon = null;
        this.render();
    }

    /** ObjectManager.pickShape 위임 (포인터 위치에서 맨 위 도형 반환) */
    pickShape(pointerPoint) {
        return this.objectManager.pickShape(pointerPoint);
    }

    /** 지정 인덱스 도형을 이동된 도형으로 교체 (드래그 완료 시 사용) */
    replaceShapeAtIndex(index, shape) {
        this.objectManager.replaceShapeAtIndex(index, shape);
    }

    isDraftValid(shape) {
        if (shape.kind === EShapeKind.LINE) {
            return Util.distance(shape.start, shape.end) >= 3;
        }
        if (shape.kind === EShapeKind.RECT) {
            const rect = Util.rectFromPoints(shape.start, shape.end);
            return rect.w >= 3 && rect.h >= 3;
        }
        if (shape.kind === EShapeKind.CIRCLE) {
            return shape.radius >= 3;
        }
        if (shape.kind === EShapeKind.FREEHAND) {
            return (
                shape.points.length >= 2 &&
                Util.distance(shape.points[0], shape.points[shape.points.length - 1]) >= 2
            );
        }
        return true;
    }

    uid(prefix) {
        return Util.uid(prefix);
    }

    createShape(pointerDownPoint) {
        const currentStyle = this.getCurrentShapeStyle();
        if (currentStyle === null) {
            return null;
        }

        if (this.currentToolMode === EShapeKind.Point) {
            this.objectManager.addShape(new PointShape({
                id: this.uid("pt"),
                position: pointerDownPoint,
                radius: Math.max(2, this.getCurrentShapeStyle().lineWidth + 1),
                style: currentStyle,
            }));
            return;
        }

        if (this.currentToolMode === EShapeKind.Polygon) {
            if (this.draftPolygon === null) {
                this.draftPolygon = new PolygonShape({
                    id: this.uid("poly"),
                    points: [pointerDownPoint],
                    isClosed: false,
                    style: currentStyle,
                });
            } else {
                this.draftPolygon.points.push(pointerDownPoint);
            }
            this.render();
            return;
        }

        const draftShape = this.createDraftShape(pointerDownPoint);
        if (draftShape !== null) {
            this.draftShape = draftShape;
            this.render();
        }
    }

    /** 도구 + 시작점 + 스타일로 초기 draft 생성 (line/circle/rect/freehand만) */
    createDraftShape(pointerPoint) {
        const currentStyle = this.getCurrentShapeStyle() ?? null;
        if (currentStyle === null) {
            return null;
        }

        if (this.currentToolMode === EShapeKind.LINE) {
            return new LineShape({
                id: this.uid("ln"),
                start: pointerPoint,
                end: pointerPoint,
                style: currentStyle,
            });
        }
        if (this.currentToolMode === EShapeKind.CIRCLE) {
            return new CircleShape({
                id: this.uid("ci"),
                center: pointerPoint,
                radius: 0,
                style: currentStyle,
            });
        }
        if (this.currentToolMode === EShapeKind.RECT) {
            return new RectShape({
                id: this.uid("rc"),
                start: pointerPoint,
                end: pointerPoint,
                style: currentStyle,
            });
        }
        if (this.currentToolMode === EShapeKind.FREEHAND) {
            return new FreehandShape({
                id: this.uid("fh"),
                points: [pointerPoint],
                style: currentStyle,
            });
        }
        return null;
    }

    /** 현재 draft를 포인터 위치로 직접 수정 (end/radius/points만 갱신). */
    updateDraftShape(pointerPoint) {
        const draftShape = this.draftShape ?? null;
        if (draftShape === null) {
            return;
        }
        draftShape.updateDraftShape(pointerPoint);
        this.render();
    }

    //----------------------------------------------------------------
    // Input Event Handler
    //----------------------------------------------------------------
    onPointerDown(pointerPoint) {
        if (this.currentToolMode === EShapeKind.Select) {
            const hit = this.pickShape(pointerPoint);
            this.selectedId = hit ? hit.id : null;
            this.dragCopiedOriginal = new Map();
            const displayShapes = this.getDisplayShapes();
            this.dragShapesSnapshot =
                this.selectedId ? displayShapes.map((s) => s.clone()) : null;

            if (this.selectedId !== null) {
                const selectedShapeCandidate = displayShapes.find((shape) => shape.id === this.selectedId) ?? null;
                selectedShapeCandidate ?? console.warn("[select] 선택된 도형을 찾지 못했습니다.");
                if (selectedShapeCandidate) {
                    this.dragCopiedOriginal.set(selectedShapeCandidate.id, selectedShapeCandidate.clone());
                }
                this.renderer.endPan();
            } else {
                this.renderer.startPan();
            }

            this.render();
            return;
        }

        this.createShape(pointerPoint);
    }

    onPointerUp(pointerPoint) {
        if (this.currentToolMode === EShapeKind.Select) {
            if (this.selectedId !== null && this.dragShapesSnapshot !== null) {
                const displayShapes = this.getDisplayShapes();
                const now = displayShapes.find((shape) => shape.id === this.selectedId) ?? null;
                const original = this.dragCopiedOriginal.get(this.selectedId) ?? null;
                if (now && original) {
                    const changed = JSON.stringify(now) !== JSON.stringify(original);
                    if (changed) {
                        this.pushTaskHistory(this.dragShapesSnapshot);
                    }
                }
            }

            this.dragShapesSnapshot = null;
            this.dragCopiedOriginal = new Map();
            this.renderer.endPan();
            this.render();
            return;
        }

        this.addDraftShape();
    }

    onPointerMove(pointerPoint, dragStart) {
        if (this.currentToolMode === EShapeKind.Select) {
            if (this.selectedId === null) {
                this.renderer.updatePan(
                    pointerPoint.x - dragStart.x,
                    pointerPoint.y - dragStart.y
                );
                this.render();
                return;
            }

            const original = this.dragCopiedOriginal.get(this.selectedId) ?? null;
            original ?? console.warn("[drag] 원본 스냅샷을 찾지 못했습니다.");
            if (!original) {
                return;
            }

            const deltaX = pointerPoint.x - dragStart.x;
            const deltaY = pointerPoint.y - dragStart.y;
            const movedShape = original.translate(deltaX, deltaY);

            const displayShapes = this.getDisplayShapes();
            const shapeIndex = displayShapes.findIndex((shape) => shape.id === this.selectedId);
            if (shapeIndex >= 0) {
                this.replaceShapeAtIndex(shapeIndex, movedShape);
            }

            this.render();
            return;
        }

        if (this.draftShape === null) {
            this.render();
            return;
        }

        this.updateDraftShape(pointerPoint);
    }

    onDoubleClick() {
        if (this.currentToolMode === EShapeKind.Polygon) {
            this.finalizePolygon();
        }
    }
    onKeyDown() {}

    defaultShapes() {
        const style1 = { stroke: "#2f6df6", lineWidth: 3, fillEnabled: true, fill: "rgba(47,109,246,0.20)" };
        const style2 = { stroke: "#32d583", lineWidth: 4, fillEnabled: true, fill: "rgba(50,213,131,0.20)" };
        const style3 = { stroke: "#ffb020", lineWidth: 3, fillEnabled: false, fill: "rgba(0,0,0,0)" };

        this.objectManager.addShape(
            new RectShape({
                id: this.uid("rc"),
                start: { x: 120, y: 100 },
                end: { x: 420, y: 280 },
                style: style1,
            })
        );
        this.objectManager.addShape(
            new CircleShape({
                id: this.uid("ci"),
                center: { x: 650, y: 220 },
                radius: 90,
                style: style2,
            })
        );
        this.objectManager.addShape(
            new LineShape({
                id: this.uid("ln"),
                start: { x: 160, y: 420 },
                end: { x: 520, y: 540 },
                style: style3,
            })
        );
        this.objectManager.addShape(
            new PointShape({
                id: this.uid("pt"),
                position: { x: 820, y: 420 },
                radius: 6,
                style: { ...style3, stroke: "#ff4d4d" },
            })
        );
        this.objectManager.addShape(
            new PolygonShape({
                id: this.uid("poly"),
                points: [
                    { x: 880, y: 120 },
                    { x: 1030, y: 150 },
                    { x: 1080, y: 260 },
                    { x: 960, y: 300 },
                    { x: 860, y: 220 },
                ],
                isClosed: true,
                style: { stroke: "#c084fc", lineWidth: 3, fillEnabled: true, fill: "rgba(192,132,252,0.22)" },
            })
        );
    }

    init() {
        const toolOptionInfos = ShapeMenuList;

        const topMenu = TopMenu.getInstance({ toolOptionInfos });
        topMenu.bindApp(this);
        topMenu.createToolSelectOptions(toolOptionInfos);
        const defaultToolValue = topMenu.getDefaultToolValue(toolOptionInfos);
        topMenu.setTool(defaultToolValue);
        topMenu.bindEventListeners();

        const inputController = EditorInputController.getInstance({ toolOptionInfos });
        inputController.bindApp(this);
        inputController.bindEventListeners();

        this.defaultShapes();
        this.render();
        window.addEventListener("resize", () => this.render());
    }
}

const app = new CanvaApp();
app.init();
