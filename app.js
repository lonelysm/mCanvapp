// 루트 클래스: 상태·렌더·도형 로직을 소유하고, TopMenu/EditorInputController 등에 지시·경유

import { EShapeKind, EToolValue, ShapeMenuList } from "./const.js";
import { Util } from "./util.js";
import { EditorInputController } from "./editor_input_controller.js";
import { CanvasRenderer } from "./canvas_renderer.js";
import { TopMenu } from "./top_menu.js";
import { PointShape, LineShape, CircleShape, RectShape, PolygonShape } from "./shapes.js";

class CanvaApp {
    constructor() {
        this.shapeListEl = Util.getRequiredEl("shapeList");
        this.renderer = CanvasRenderer.getInstance({ gridStep: 32 });

        this.state = {
            currentTool: "line",
            displayShapes: [],
            undoStack: [],
            selectedId: null,
            viewScale: 1,
            pointerPos: null,
            draftShape: null,
            draftPolygon: null,
            dragStart: null,
            dragShapesSnapshot: null,
            dragOriginal: new Map(),
        };
    }

    getState() {
        return this.state;
    }

    initShapeStyle() {
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
        this.renderer.render(this.state);
        this.renderShapeList();
    }

    renderShapeList() {
        const items = this.state.displayShapes
            .slice()
            .reverse()
            .map((shape, idxFromEnd) => {
                const idx = this.state.displayShapes.length - 1 - idxFromEnd;
                const title = `${idx + 1}. ${shape.displayName ?? "도형"}`;
                const sub = shape.getSubLabel ? shape.getSubLabel() : "";
                const selected = this.state.selectedId === shape.id;
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
                this.state.selectedId = it.id;
                TopMenu.getInstance().setTool(EToolValue.Select);
            });

            this.shapeListEl.appendChild(div);
        }
    }

    pushUndoSnapshot(snapshot) {
        this.state.undoStack.push(snapshot ?? this.state.displayShapes.map((s) => s.clone()));
        if (this.state.undoStack.length > 50) {
            this.state.undoStack.shift();
        }
    }

    setTool(tool) {
        this.state.currentTool = tool;
        if (this.state.draftPolygon !== null && tool !== EShapeKind.Polygon) {
            this.finalizePolygon();
        }
        this.render();
    }

    undo() {
        const prev = this.state.undoStack.pop();
        if (!prev) {
            return;
        }
        this.state.displayShapes = prev;
        this.state.selectedId = null;
        this.state.draftShape = null;
        this.state.draftPolygon = null;
        this.render();
    }

    clearAll() {
        this.pushUndoSnapshot();
        this.state.displayShapes = [];
        this.state.selectedId = null;
        this.state.draftShape = null;
        this.state.draftPolygon = null;
        this.render();
    }

    addShape(shape) {
        this.pushUndoSnapshot();
        this.state.displayShapes.push(shape);
        this.state.selectedId = shape.id;
        this.render();
    }

    deleteSelected() {
        if (this.state.selectedId === null) {
            return;
        }
        const idx = this.state.displayShapes.findIndex((s) => s.id === this.state.selectedId);
        if (idx < 0) {
            return;
        }
        this.pushUndoSnapshot();
        this.state.displayShapes.splice(idx, 1);
        this.state.selectedId = null;
        this.render();
    }

    finalizePolygon() {
        if (this.state.draftPolygon === null) {
            return;
        }
        if (this.state.draftPolygon.points.length >= 3) {
            this.pushUndoSnapshot();
            const draft = this.state.draftPolygon;
            const final = new PolygonShape({
                id: draft.id,
                points: draft.points.map((p) => ({ ...p })),
                isClosed: true,
                style: draft.style,
            });
            this.state.displayShapes.push(final);
            this.state.selectedId = final.id;
        }
        this.state.draftPolygon = null;
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

    defaultShapes() {
        const style1 = { stroke: "#2f6df6", lineWidth: 3, fillEnabled: true, fill: "rgba(47,109,246,0.20)" };
        const style2 = { stroke: "#32d583", lineWidth: 4, fillEnabled: true, fill: "rgba(50,213,131,0.20)" };
        const style3 = { stroke: "#ffb020", lineWidth: 3, fillEnabled: false, fill: "rgba(0,0,0,0)" };

        this.state.displayShapes.push(
            new RectShape({
                id: this.uid("rc"),
                start: { x: 120, y: 100 },
                end: { x: 420, y: 280 },
                style: style1,
            })
        );
        this.state.displayShapes.push(
            new CircleShape({
                id: this.uid("ci"),
                center: { x: 650, y: 220 },
                radius: 90,
                style: style2,
            })
        );
        this.state.displayShapes.push(
            new LineShape({
                id: this.uid("ln"),
                start: { x: 160, y: 420 },
                end: { x: 520, y: 540 },
                style: style3,
            })
        );
        this.state.displayShapes.push(
            new PointShape({
                id: this.uid("pt"),
                position: { x: 820, y: 420 },
                radius: 6,
                style: { ...style3, stroke: "#ff4d4d" },
            })
        );
        this.state.displayShapes.push(
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
