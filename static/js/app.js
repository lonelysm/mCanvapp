// 루트: 렌더·히스토리 UI·초기화. 팬/줌은 Renderer, 도형/선택/draft는 ObjectManager가 각자 이벤트로 처리

import { EShapeKind, ShapeMenuList } from "./const.js";
import { Util } from "./util.js";
import { EditorInputController } from "./editor_input_controller.js";
import { CanvasRenderer } from "./canvas_renderer.js";
import { TopMenu } from "./top_menu.js";
import { PointShape, LineShape, CircleShape, RectShape, PolygonShape } from "./shapes.js";
import { ObjectManagerClass } from "./object_manager.js";
import {
    applyPreviewSnapshot,
    bindPreviewSessionUnload,
    buildPreviewSnapshot,
    loadPreviewSnapshotFromStorage,
} from "./preview_session_store.js";

class CanvaApp {
    constructor() {
        this.shapeListEl = Util.getRequiredEl("shapeList");
        this.renderer = CanvasRenderer.getInstance({ gridStep: 32 });
        this.objectManager = ObjectManagerClass.getInstance();
        this._onCanvasRenderedBound = () => this.renderHistoryList();
    }

    // #Todo 나중에 디테일 패널 같은 곳으로 옮기자자
    renderHistoryList() {
        const displayShapes = this.objectManager.getShapes();
        const selectedId = this.objectManager.selectedId;
        const items = displayShapes
            .slice()
            .reverse()
            .map((shape, idxFromEnd) => {
                const idx = displayShapes.length - 1 - idxFromEnd;
                const title = `${idx + 1}. ${shape.displayName ?? "도형"}`;
                const sub = shape.getSubLabel ? shape.getSubLabel() : "";
                const selected = selectedId === shape.id;
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
                this.objectManager.selectedId = it.id;
                TopMenu.getInstance().setTool(EShapeKind.Select);
                this.renderer.requestRender();
            });

            this.shapeListEl.appendChild(div);
        }
    }

    setTool(tool) {
        this.objectManager.setTool(tool);
        this.renderer.requestRender();
    }

    defaultShapes() {
        const style1 = { stroke: "#2f6df6", lineWidth: 3, fillEnabled: true, fill: "rgba(47,109,246,0.20)" };
        const style2 = { stroke: "#32d583", lineWidth: 4, fillEnabled: true, fill: "rgba(50,213,131,0.20)" };
        const style3 = { stroke: "#ffb020", lineWidth: 3, fillEnabled: false, fill: "rgba(0,0,0,0)" };

        this.objectManager.addShape(
            new RectShape({
                start: { x: 120, y: 100 },
                end: { x: 420, y: 280 },
                style: style1,
            })
        );
        this.objectManager.addShape(
            new CircleShape({
                center: { x: 650, y: 220 },
                radius: 90,
                style: style2,
            })
        );
        this.objectManager.addShape(
            new LineShape({
                start: { x: 160, y: 420 },
                end: { x: 520, y: 540 },
                style: style3,
            })
        );
        this.objectManager.addShape(
            new PointShape({
                position: { x: 820, y: 420 },
                radius: 6,
                style: { ...style3, stroke: "#ff4d4d" },
            })
        );
        this.objectManager.addShape(
            new PolygonShape({
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
        const canvas = Util.getRequiredEl("canvas");

        const topMenu = TopMenu.getInstance({ toolOptionInfos });
        topMenu.createToolSelectOptions(toolOptionInfos);

        const snapshot = loadPreviewSnapshotFromStorage();
        if (snapshot !== null) {
            applyPreviewSnapshot(snapshot, {
                objectManager: this.objectManager,
                renderer: this.renderer,
                topMenu,
            });
        } else {
            this.defaultShapes();
            topMenu.setTool(topMenu.getDefaultToolValue(toolOptionInfos));
        }

        topMenu.bindEventListeners();
        this.objectManager.bindPointerEvents(canvas, this.renderer);
        this.renderer.bindPanZoomEvents();

        const inputController = EditorInputController.getInstance({ toolOptionInfos });
        inputController.bindObjectManager(this.objectManager);
        inputController.bindEventListeners();

        window.addEventListener("canvas:rendered", this._onCanvasRenderedBound);
        this.renderer.requestRender();
        window.addEventListener("resize", () => this.renderer.requestRender());

        const appRef = this;
        bindPreviewSessionUnload(() =>
            buildPreviewSnapshot({
                objectManager: appRef.objectManager,
                renderer: appRef.renderer,
                topMenu: TopMenu.getInstance(),
            })
        );
    }
}

const app = new CanvaApp();
app.init();
