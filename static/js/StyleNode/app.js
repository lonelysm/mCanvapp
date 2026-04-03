// 루트: 렌더·히스토리 UI·초기화. 팬/줌은 Renderer, 도형/선택/draft는 ObjectManager가 각자 이벤트로 처리

import { EShapeKind, ShapeMenuList } from "./const.js";
import { Util } from "../util.js";
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
import { HierarchyDetailUi } from "./hierarchy_detail_ui.js";
import { loadStyleNodeDocumentFromServer, saveStyleNodeDocumentToServer } from "./style_node_server_io.js";
import { flattenWidgetsInPaintOrder } from "./style_node_tree.js";

/** Create Style Node 페이지 사이드바 접이 패널(제목 클릭) 바인딩. 기본은 펼침(aria-expanded=true). */
function bindPreviewSidePanelCollapsibles() {
    const side = document.querySelector(".side");
    if (side === null) {
        console.warn("[app] .side 없음 — 접이 패널 바인드 생략");
        return;
    }
    const toggles = side.querySelectorAll(".panel__toggle");
    for (const btn of toggles) {
        btn.addEventListener("click", () => {
            const panel = btn.closest(".panel--collapsible");
            if (panel === null) return;
            const expanded = btn.getAttribute("aria-expanded") === "true";
            const nextExpanded = !expanded;
            btn.setAttribute("aria-expanded", String(nextExpanded));
            panel.classList.toggle("panel--collapsed", !nextExpanded);
        });
    }
}

class CanvaApp {
    constructor() {
        this.shapeListEl = Util.getRequiredEl("shapeList");
        this.renderer = CanvasRenderer.getInstance({ gridStep: 32 });
        this.objectManager = ObjectManagerClass.getInstance();
        this.hierarchyDetailUi = new HierarchyDetailUi({
            objectManager: this.objectManager,
            renderer: this.renderer,
        });
        this._onCanvasRenderedBound = () => {
            this.renderHistoryList();
            this.hierarchyDetailUi.syncAfterRender();
        };
        this._onDetailUpdatedBound = () => this.renderHistoryList();
    }

    renderHistoryList() {
        const displayShapes = this.objectManager.getShapes();
        const widgetNodes = flattenWidgetsInPaintOrder(this.objectManager.documentRoot);
        const selectedId = this.objectManager.selectedId;
        const selectedKind = this.objectManager.selectedKind;

        const shapeItems = displayShapes
            .slice()
            .reverse()
            .map((shape, idxFromEnd) => {
                const idx = displayShapes.length - 1 - idxFromEnd;
                const title = `${idx + 1}. ${shape.displayName ?? "도형"}`;
                const sub = shape.getSubLabel ? shape.getSubLabel() : "";
                const selected = selectedId === shape.id && selectedKind === "leaf";
                const swatch = shape.style.stroke;
                return { id: shape.id, kind: "leaf", title, sub, selected, swatch };
            });

        const widgetItems = widgetNodes
            .slice()
            .reverse()
            .map((wn, idxFromEnd) => {
                const idx = widgetNodes.length - 1 - idxFromEnd;
                const txt = wn.widget.text ?? "라벨";
                const title = `W${idx + 1}. ${txt.length > 36 ? `${txt.slice(0, 36)}…` : txt}`;
                const selected = selectedId === wn.id && selectedKind === "widget";
                const sw = wn.widget.style.color ?? "#e6edf3";
                return { id: wn.id, kind: "widget", title, sub: "라벨 위젯", selected, swatch: sw };
            });

        const items = shapeItems.concat(widgetItems);

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
                this.objectManager.selectedKind = it.kind === "widget" ? "widget" : "leaf";
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
        this._bindStyleNodeServerIo(topMenu);
        bindPreviewSidePanelCollapsibles();
        this.objectManager.bindPointerEvents(canvas, this.renderer);
        this.renderer.bindPanZoomEvents();

        const inputController = EditorInputController.getInstance({ toolOptionInfos });
        inputController.bindObjectManager(this.objectManager);
        inputController.bindEventListeners();

        window.addEventListener("canvas:rendered", this._onCanvasRenderedBound);
        window.addEventListener("styleNode:detailUpdated", this._onDetailUpdatedBound);
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

    /** 툴바 서버 저장·불러오기 버튼을 API에 연결한다. */
    _bindStyleNodeServerIo(topMenu) {
        const saveBtn = document.getElementById("styleNodeSaveBtn");
        const loadBtn = document.getElementById("styleNodeLoadBtn");
        const idOut = document.getElementById("styleNodeDocIdOut");

        const deps = () => ({
            objectManager: this.objectManager,
            renderer: this.renderer,
            topMenu,
        });

        if (saveBtn !== null) {
            saveBtn.addEventListener("click", async () => {
                console.info("[app] 서버 저장 버튼 클릭");
                try {
                    const result = await saveStyleNodeDocumentToServer(deps());
                    if (idOut !== null && result?.id !== undefined) {
                        idOut.value = result.id;
                    }
                    window.alert(`서버에 저장했습니다.\n문서 ID: ${result.id}`);
                } catch (err) {
                    window.alert(`저장에 실패했습니다: ${err?.message ?? err}`);
                }
            });
        }

        if (loadBtn !== null) {
            loadBtn.addEventListener("click", async () => {
                console.info("[app] 불러오기 버튼 클릭");
                const defaultId = idOut !== null ? idOut.value : "";
                const id = window.prompt("불러올 문서 ID(UUID)를 입력하세요.", defaultId ?? "");
                if (id === null || String(id).trim() === "") {
                    console.info("[app] 불러오기 취소 또는 빈 ID");
                    return;
                }
                try {
                    await loadStyleNodeDocumentFromServer(String(id).trim(), deps());
                    if (idOut !== null) idOut.value = String(id).trim();
                    this.hierarchyDetailUi.refresh();
                    this.renderHistoryList();
                } catch (err) {
                    window.alert(`불러오기에 실패했습니다: ${err?.message ?? err}`);
                }
            });
        }
    }
}

const app = new CanvaApp();
app.init();
