// 루트 클래스: 상태·렌더·도형 로직을 소유하고, TopMenu/EditorInputController 등에 지시·경유

import { EShapeKind, ShapeMenuList } from "./const.js";
import { Util } from "./util.js";
import { EditorInputController } from "./editor_input_controller.js";
import { CanvasRenderer } from "./canvas_renderer.js";
import { TopMenu } from "./top_menu.js";
import { PointShape, LineShape, CircleShape, RectShape, PolygonShape, FreehandShape } from "./shapes.js";

class CanvaApp {
    constructor() {
        this.shapeListEl = Util.getRequiredEl("shapeList");
        this.renderer = CanvasRenderer.getInstance({ gridStep: 32 });

        this.editorState = {
            currentTool: EShapeKind.Select,
            selectedId: null,
            viewScale: 1,
            displayShapes: [],
            undoStack: [],
            draftShape: null,
            draftPolygon: null,
            dragShapesSnapshot: null,
        };
    }

    getEditorState() {
        return this.editorState;
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
        this.renderer.render(this.getEditorState());
        this.renderShapeList();
    }

    setTool(tool) {
        this.getEditorState().currentTool = tool;
        if (this.getEditorState().draftPolygon !== null && tool !== EShapeKind.Polygon) {
            this.finalizePolygon();
        }
        this.render();
    }

    //----------------------------------------------------------------
    // Object Manager
    //----------------------------------------------------------------
    renderShapeList() {
        const items = this.getEditorState().displayShapes
            .slice()
            .reverse()
            .map((shape, idxFromEnd) => {
                const idx = this.getEditorState().displayShapes.length - 1 - idxFromEnd;
                const title = `${idx + 1}. ${shape.displayName ?? "도형"}`;
                const sub = shape.getSubLabel ? shape.getSubLabel() : "";
                const selected = this.getEditorState().selectedId === shape.id;
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
                this.getEditorState().selectedId = it.id;
                TopMenu.getInstance().setTool(EShapeKind.Select);
            });

            this.shapeListEl.appendChild(div);
        }
    }

    pushUndoSnapshot(snapshot) {
        this.getEditorState().undoStack.push(snapshot ?? this.getEditorState().displayShapes.map((s) => s.clone()));
        if (this.getEditorState().undoStack.length > 50) {
            this.getEditorState().undoStack.shift();
        }
    }

    undo() {
        const prev = this.getEditorState().undoStack.pop();
        if (!prev) {
            return;
        }
        this.getEditorState().displayShapes = prev;
        this.getEditorState().selectedId = null;
        this.getEditorState().draftShape = null;
        this.getEditorState().draftPolygon = null;
        this.render();
    }

    clearAll() {
        this.pushUndoSnapshot();
        this.getEditorState().displayShapes = [];
        this.getEditorState().selectedId = null;
        this.getEditorState().draftShape = null;
        this.getEditorState().draftPolygon = null;
        this.render();
    }

    addDraftShape() {
        const draftShape = this.getEditorState().draftShape ?? null;
        if (draftShape) {
            if (this.isDraftValid(draftShape)) {
                this.pushUndoSnapshot();
                this.getEditorState().displayShapes.push(draftShape);
                this.getEditorState().selectedId = draftShape.id;
                this.render();

                this.getEditorState().draftShape = null;
            }
        }
    }

    deleteSelected() {
        if (this.getEditorState().selectedId === null) {
            return;
        }
        const idx = this.getEditorState().displayShapes.findIndex((s) => s.id === this.getEditorState().selectedId);
        if (idx < 0) {
            return;
        }
        this.pushUndoSnapshot();
        this.getEditorState().displayShapes.splice(idx, 1);
        this.getEditorState().selectedId = null;
        this.render();
    }

    finalizePolygon() {
        if (this.getEditorState().draftPolygon === null) {
            return;
        }
        if (this.getEditorState().draftPolygon.points.length >= 3) {
            this.pushUndoSnapshot();
            const draft = this.getEditorState().draftPolygon;
            const final = new PolygonShape({
                id: draft.id,
                points: draft.points.map((p) => ({ ...p })),
                isClosed: true,
                style: draft.style,
            });
            this.getEditorState().displayShapes.push(final);
            this.getEditorState().selectedId = final.id;
        }
        this.getEditorState().draftPolygon = null;
        this.render();
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
        const editorState = this.getEditorState() ?? null;
        const currentStyle = this.getCurrentShapeStyle();
        if (editorState === null || currentStyle === null) {
            return null;
        }

        if (editorState?.currentTool === EShapeKind.Point) {
            return new PointShape({
                id: this.uid("pt"),
                position: pointerDownPoint,
                radius: Math.max(2, this.getCurrentShapeStyle().lineWidth + 1),
                style: currentStyle,
            });
        }

        if (editorState?.currentTool === EShapeKind.Polygon) {
            if (editorState.draftPolygon === null) {
                editorState.draftPolygon = new PolygonShape({
                    id: this.uid("poly"),
                    points: [pointerDownPoint],
                    isClosed: false,
                    style: currentStyle,
                });
            } else {
                editorState.draftPolygon.points.push(pointerDownPoint);
            }
            this.render();
            return;
        }

        const draftShape = this.createDraftShape(pointerDownPoint);
        if (draftShape !== null) {
            editorState.draftShape = draftShape;
            this.render();
        }
    }

    /** 도구 + 시작점 + 스타일로 초기 draft 생성 (line/circle/rect/freehand만) */
    createDraftShape(pointerPoint) {
        const editorState = this.getEditorState() ?? null;
        const currentStyle = this.getCurrentShapeStyle() ?? null;
        if (editorState === null || currentStyle === null) {
            return null;
        }

        if (editorState?.currentTool === EShapeKind.LINE) {
            return new LineShape({
                id: this.uid("ln"),
                start: pointerPoint,
                end: pointerPoint,
                style: currentStyle,
            });
        }
        if (editorState?.currentTool === EShapeKind.CIRCLE) {
            return new CircleShape({
                id: this.uid("ci"),
                center: pointerPoint,
                radius: 0,
                style: currentStyle,
            });
        }
        if (editorState?.currentTool === EShapeKind.RECT) {
            return new RectShape({
                id: this.uid("rc"),
                start: pointerPoint,
                end: pointerPoint,
                style: currentStyle,
            });
        }
        if (editorState?.currentTool === EShapeKind.FREEHAND) {
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
        const draftShape = this.getEditorState().draftShape ?? null;
        if (draftShape === null) {
            return;
        }

        if (draftShape.kind === EShapeKind.LINE) {
            draftShape.end = pointerPoint;
            return;
        }
        if (draftShape.kind === EShapeKind.RECT) {
            draftShape.end = pointerPoint;
            return;
        }
        if (draftShape.kind === EShapeKind.CIRCLE) {
            draftShape.radius = Math.hypot(pointerPoint.x - draftShape.center.x, pointerPoint.y - draftShape.center.y);
            return;
        }
        if (draftShape.kind === EShapeKind.FREEHAND) {
            const lastPoint = draftShape.points[draftShape.points.length - 1] ?? null;
            lastPoint ?? console.warn("[freehand] last 포인트가 없습니다.");
            if (lastPoint) {
                const stepDistance = Math.hypot(pointerPoint.x - lastPoint.x, pointerPoint.y - lastPoint.y);
                if (stepDistance >= 1.5) {
                    draftShape.points.push(pointerPoint);
                }
            }
        }

        this.render();
    }

    defaultShapes() {
        const style1 = { stroke: "#2f6df6", lineWidth: 3, fillEnabled: true, fill: "rgba(47,109,246,0.20)" };
        const style2 = { stroke: "#32d583", lineWidth: 4, fillEnabled: true, fill: "rgba(50,213,131,0.20)" };
        const style3 = { stroke: "#ffb020", lineWidth: 3, fillEnabled: false, fill: "rgba(0,0,0,0)" };

        this.getEditorState().displayShapes.push(
            new RectShape({
                id: this.uid("rc"),
                start: { x: 120, y: 100 },
                end: { x: 420, y: 280 },
                style: style1,
            })
        );
        this.getEditorState().displayShapes.push(
            new CircleShape({
                id: this.uid("ci"),
                center: { x: 650, y: 220 },
                radius: 90,
                style: style2,
            })
        );
        this.getEditorState().displayShapes.push(
            new LineShape({
                id: this.uid("ln"),
                start: { x: 160, y: 420 },
                end: { x: 520, y: 540 },
                style: style3,
            })
        );
        this.getEditorState().displayShapes.push(
            new PointShape({
                id: this.uid("pt"),
                position: { x: 820, y: 420 },
                radius: 6,
                style: { ...style3, stroke: "#ff4d4d" },
            })
        );
        this.getEditorState().displayShapes.push(
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
