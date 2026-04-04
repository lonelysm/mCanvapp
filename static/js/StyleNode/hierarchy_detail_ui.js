// 우측 사이드바: 계층(트리) 패널 + 요소 디테일 패널 렌더링

import { EShapeKind } from "./const.js";
import { Util } from "../util.js";
import { TopMenu } from "./top_menu.js";
import { getLabelWidgetBoundingBox } from "./label_widget.js";
import { getShapeBoundingBox } from "./shape_bounds.js";
import {
    NodeType,
    collectLeafNodes,
    findNodeWithParent,
    flattenShapesInPaintOrder,
    flattenWidgetsInPaintOrder,
    getAccumulatedOffsetForLeaf,
    getAccumulatedOffsetForNode,
    getGroupWorldContentBoundsTopLeft,
} from "./style_node_tree.js";

/** 문서 전체에서 첫 리프의 월드 AABB 좌상단 */
function getFirstLeafWorldTopLeft(documentRoot) {
    const shapes = flattenShapesInPaintOrder(documentRoot);
    if (shapes.length === 0) return null;
    const first = shapes[0];
    const off = getAccumulatedOffsetForLeaf(documentRoot, first.id, 0, 0);
    const b = getShapeBoundingBox(first);
    if (b === null || off === null) return null;
    return { x: b.minX + off.x, y: b.minY + off.y };
}

/**
 * 상대 좌표 기준점: 선택 리프와 같은 부모 그룹 안에서 DFS 순 첫 리프의 월드 좌상단.
 * 부모가 없으면 문서 전체 첫 리프와 동일.
 */
function getRelativeBasisLeafWorldTopLeft(documentRoot, selectedLeafNodeId) {
    const fp = findNodeWithParent(documentRoot, selectedLeafNodeId);
    if (fp === null || fp.node.nodeType !== NodeType.LEAF) return null;
    const parent = fp.parent;
    if (parent === null) {
        return getFirstLeafWorldTopLeft(documentRoot);
    }
    const leaves = [];
    collectLeafNodes(parent, leaves);
    if (leaves.length === 0) return null;
    const first = leaves[0].shape;
    const off = getAccumulatedOffsetForLeaf(documentRoot, first.id, 0, 0);
    const b = getShapeBoundingBox(first);
    if (b === null || off === null) return null;
    return { x: b.minX + off.x, y: b.minY + off.y };
}

/** 선택 리프의 월드 AABB 좌상단 */
function getLeafWorldTopLeft(documentRoot, shapeId) {
    const shapes = flattenShapesInPaintOrder(documentRoot);
    const sh = shapes.find((s) => s.id === shapeId) ?? null;
    if (sh === null) return null;
    const off = getAccumulatedOffsetForLeaf(documentRoot, shapeId, 0, 0);
    const b = getShapeBoundingBox(sh);
    if (b === null || off === null) return null;
    return { x: b.minX + off.x, y: b.minY + off.y };
}

/** 문서에서 첫 도형·없으면 첫 위젯의 월드 좌상단 */
function getFirstDrawableWorldTopLeftDocument(documentRoot) {
    const shapes = flattenShapesInPaintOrder(documentRoot);
    if (shapes.length > 0) {
        const first = shapes[0];
        const off = getAccumulatedOffsetForNode(documentRoot, first.id, 0, 0);
        const b = getShapeBoundingBox(first);
        if (b !== null && off !== null) return { x: b.minX + off.x, y: b.minY + off.y };
    }
    const widgets = flattenWidgetsInPaintOrder(documentRoot);
    if (widgets.length === 0) return null;
    const wn = widgets[0];
    const off = getAccumulatedOffsetForNode(documentRoot, wn.id, 0, 0);
    const b = getLabelWidgetBoundingBox(wn.widget);
    if (b === null || off === null) return null;
    return { x: b.minX + off.x, y: b.minY + off.y };
}

/** 같은 부모 그룹에서 DFS 순 첫 리프·위젯의 월드 좌상단 */
function getFirstDrawableWorldTopLeftInGroup(documentRoot, groupNode) {
    if (groupNode === null || groupNode.nodeType !== NodeType.GROUP) return null;
    for (const ch of groupNode.children) {
        if (ch.nodeType === NodeType.LEAF) {
            const off = getAccumulatedOffsetForNode(documentRoot, ch.id, 0, 0);
            const b = getShapeBoundingBox(ch.shape);
            if (b !== null && off !== null) return { x: b.minX + off.x, y: b.minY + off.y };
        }
        if (ch.nodeType === NodeType.WIDGET) {
            const off = getAccumulatedOffsetForNode(documentRoot, ch.id, 0, 0);
            const b = getLabelWidgetBoundingBox(ch.widget);
            if (b !== null && off !== null) return { x: b.minX + off.x, y: b.minY + off.y };
        }
    }
    return null;
}

/** 리프·위젯 공통 상대 기준 월드 좌상단 */
function getRelativeBasisDrawableWorldTopLeft(documentRoot, selectedNodeId) {
    const fp = findNodeWithParent(documentRoot, selectedNodeId);
    if (fp === null) return null;
    if (fp.node.nodeType !== NodeType.LEAF && fp.node.nodeType !== NodeType.WIDGET) return null;
    const parent = fp.parent;
    if (parent === null) {
        return getFirstDrawableWorldTopLeftDocument(documentRoot);
    }
    return getFirstDrawableWorldTopLeftInGroup(documentRoot, parent);
}

/** 선택 위젯 바운딩 월드 좌상단 */
function getWidgetWorldTopLeft(documentRoot, widgetNodeId) {
    const fp = findNodeWithParent(documentRoot, widgetNodeId);
    if (fp === null || fp.node.nodeType !== NodeType.WIDGET) return null;
    const off = getAccumulatedOffsetForNode(documentRoot, widgetNodeId, 0, 0);
    const b = getLabelWidgetBoundingBox(fp.node.widget);
    if (b === null || off === null) return null;
    return { x: b.minX + off.x, y: b.minY + off.y };
}

/** style.fill rgba 문자열에서 색상·불투명도(%) 추출 (실패 시 기본값) */
function parseFillToHexOpacity(rgbaStr) {
    const m = String(rgbaStr ?? "").match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/i);
    if (!m) {
        return { hex: "#2f6df6", opacityPct: 20 };
    }
    const r = Util.clamp(parseInt(m[1], 10), 0, 255);
    const g = Util.clamp(parseInt(m[2], 10), 0, 255);
    const b = Util.clamp(parseInt(m[3], 10), 0, 255);
    const a = m[4] !== undefined ? Util.clamp(parseFloat(m[4]), 0, 1) : 1;
    const hex = `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
    return { hex, opacityPct: Math.round(a * 100) };
}

/** #rrggbb + 불투명도 0~100 → rgba 문자열 */
function buildRgbaFromHexOpacity(hex, opacityPct) {
    const raw = String(hex ?? "#000000").trim();
    const h = raw.startsWith("#") ? raw.slice(1) : raw;
    if (!/^[0-9a-f]{6}$/i.test(h)) {
        return "rgba(47,109,246,0.2)";
    }
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const a = Util.clamp(Number(opacityPct) / 100, 0, 1);
    return `rgba(${r},${g},${b},${a})`;
}

/**
 * 계층 트리·디테일 패널을 objectManager 선택과 동기화한다.
 */
export class HierarchyDetailUi {
    /**
     * @param {{ objectManager: import("./object_manager.js").ObjectManagerClass, renderer: import("./canvas_renderer.js").CanvasRenderer }} deps
     */
    constructor(deps) {
        this.objectManager = deps.objectManager;
        this.renderer = deps.renderer;
        this.hierarchyEl = document.getElementById("hierarchyTree");
        this.detailEl = document.getElementById("detailPanelShell");
        this.detailNameEl = document.getElementById("detailName");
        this.detailRelXEl = document.getElementById("detailRelX");
        this.detailRelYEl = document.getElementById("detailRelY");
        this.detailLeafBlock = document.getElementById("detailLeafBlock");
        this.detailWidgetBlock = document.getElementById("detailWidgetBlock");
        this.detailWidgetRelXEl = document.getElementById("detailWidgetRelX");
        this.detailWidgetRelYEl = document.getElementById("detailWidgetRelY");
        this.detailWidgetText = document.getElementById("detailWidgetText");
        this.detailWidgetPosX = document.getElementById("detailWidgetPosX");
        this.detailWidgetPosY = document.getElementById("detailWidgetPosY");
        this.detailWidgetColor = document.getElementById("detailWidgetColor");
        this.detailWidgetFontSize = document.getElementById("detailWidgetFontSize");
        this.detailGroupBlock = document.getElementById("detailGroupBlock");
        this.detailGroupTxInput = document.getElementById("detailGroupTxInput");
        this.detailGroupTyInput = document.getElementById("detailGroupTyInput");
        this.detailGeomPanelPoint = document.getElementById("detailGeomPanelPoint");
        this.detailGeomPanelLine = document.getElementById("detailGeomPanelLine");
        this.detailGeomPanelCircle = document.getElementById("detailGeomPanelCircle");
        this.detailGeomPanelRect = document.getElementById("detailGeomPanelRect");
        this.detailGeomPanelPath = document.getElementById("detailGeomPanelPath");
        this.detailGeomPointX = document.getElementById("detailGeomPointX");
        this.detailGeomPointY = document.getElementById("detailGeomPointY");
        this.detailGeomPointR = document.getElementById("detailGeomPointR");
        this.detailGeomLineSx = document.getElementById("detailGeomLineSx");
        this.detailGeomLineSy = document.getElementById("detailGeomLineSy");
        this.detailGeomLineEx = document.getElementById("detailGeomLineEx");
        this.detailGeomLineEy = document.getElementById("detailGeomLineEy");
        this.detailGeomCircleCx = document.getElementById("detailGeomCircleCx");
        this.detailGeomCircleCy = document.getElementById("detailGeomCircleCy");
        this.detailGeomCircleR = document.getElementById("detailGeomCircleR");
        this.detailGeomRectX = document.getElementById("detailGeomRectX");
        this.detailGeomRectY = document.getElementById("detailGeomRectY");
        this.detailGeomRectW = document.getElementById("detailGeomRectW");
        this.detailGeomRectH = document.getElementById("detailGeomRectH");
        this.detailStyleStroke = document.getElementById("detailStyleStroke");
        this.detailStyleFillEnabled = document.getElementById("detailStyleFillEnabled");
        this.detailStyleFill = document.getElementById("detailStyleFill");
        this.detailStyleFillOpacity = document.getElementById("detailStyleFillOpacity");
        this.detailStyleFillOpacityOut = document.getElementById("detailStyleFillOpacityOut");
        this.detailStyleLineWidth = document.getElementById("detailStyleLineWidth");
        this.addGroupBtn = document.getElementById("addEmptyGroupBtn");
        this._detailBound = false;
        this._hierarchyDragBound = false;
        if (this.addGroupBtn !== null) {
            this.addGroupBtn.addEventListener("click", () => {
                this.objectManager.addEmptyChildGroup();
                this.renderer.requestRender();
            });
        }
        this._bindHierarchyDragDrop();
    }

    /** 계층 트리 행 드래그로 그룹 노드에 드롭 시 자식으로 재부모화 */
    _bindHierarchyDragDrop() {
        const rootEl = this.hierarchyEl;
        if (rootEl === null || this._hierarchyDragBound) {
            return;
        }
        this._hierarchyDragBound = true;

        const clearDropHover = () => {
            rootEl.querySelectorAll(".treeRow--dropHover").forEach((r) => r.classList.remove("treeRow--dropHover"));
        };

        rootEl.addEventListener("dragstart", (e) => {
            const row = e.target.closest?.(".treeRow[data-drag-node-id]");
            if (row === null || row === undefined) {
                return;
            }
            const id = row.dataset.dragNodeId;
            const kind = row.dataset.dragKind ?? "leaf";
            console.info("[hierarchy_detail_ui] 트리 드래그 시작 id=%s kind=%s", id, kind);
            e.dataTransfer.setData("text/plain", JSON.stringify({ nodeId: id, kind }));
            e.dataTransfer.effectAllowed = "move";
        });

        rootEl.addEventListener("dragend", () => {
            clearDropHover();
            console.info("[hierarchy_detail_ui] 트리 드래그 종료");
        });

        rootEl.addEventListener("dragover", (e) => {
            const row = e.target.closest?.(".treeRow[data-drop-group-id]");
            if (row === null || row === undefined) {
                return;
            }
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            clearDropHover();
            row.classList.add("treeRow--dropHover");
        });

        rootEl.addEventListener("dragleave", (e) => {
            const row = e.target.closest?.(".treeRow[data-drop-group-id]");
            if (row === null || row === undefined) {
                return;
            }
            const rel = e.relatedTarget;
            if (rel !== null && row.contains(rel)) {
                return;
            }
            row.classList.remove("treeRow--dropHover");
        });

        rootEl.addEventListener("drop", (e) => {
            const row = e.target.closest?.(".treeRow[data-drop-group-id]");
            if (row === null || row === undefined) {
                return;
            }
            e.preventDefault();
            clearDropHover();
            let payload = null;
            try {
                const raw = e.dataTransfer.getData("text/plain");
                payload = JSON.parse(raw);
            } catch (err) {
                console.warn("[hierarchy_detail_ui] 드롭 payload 파싱 실패", err);
                return;
            }
            const nodeId = payload?.nodeId;
            const targetGroupId = row.dataset.dropGroupId;
            if (typeof nodeId !== "string" || typeof targetGroupId !== "string") {
                return;
            }
            console.info("[hierarchy_detail_ui] 트리 드롭 node=%s → group=%s", nodeId, targetGroupId);
            const ok = this.objectManager.reparentNodeToGroup(nodeId, targetGroupId);
            if (ok) {
                this.renderer.requestRender();
                window.dispatchEvent(new CustomEvent("styleNode:detailUpdated"));
            }
        });
    }

    /** 디테일 패널 입력·색상 컨트롤에 포커스가 있으면 참 */
    _isDetailFormControlFocused() {
        const active = document.activeElement;
        if (active === null || active === undefined) return false;
        if (active === this.detailNameEl) return true;
        const shell = this.detailEl;
        if (shell === null) return false;
        return shell.contains(active) && (active instanceof HTMLInputElement || active instanceof HTMLSelectElement);
    }

    /** @param {HTMLInputElement | null} el @param {number} fallback */
    _readNumber(el, fallback) {
        if (el === null) return fallback;
        const v = parseFloat(el.value);
        return Number.isFinite(v) ? v : fallback;
    }

    /** 기하 패널 전부 숨김 후 해당 패널만 표시 */
    _setVisibleGeomPanel(kind) {
        const panels = [
            this.detailGeomPanelPoint,
            this.detailGeomPanelLine,
            this.detailGeomPanelCircle,
            this.detailGeomPanelRect,
            this.detailGeomPanelPath,
        ];
        for (const p of panels) {
            if (p !== null) p.hidden = true;
        }
        const map = {
            [EShapeKind.POINT]: this.detailGeomPanelPoint,
            [EShapeKind.LINE]: this.detailGeomPanelLine,
            [EShapeKind.CIRCLE]: this.detailGeomPanelCircle,
            [EShapeKind.RECT]: this.detailGeomPanelRect,
            [EShapeKind.POLYGON]: this.detailGeomPanelPath,
            [EShapeKind.FREEHAND]: this.detailGeomPanelPath,
        };
        const show = map[kind] ?? this.detailGeomPanelPath;
        if (show !== null && show !== undefined) show.hidden = false;
    }

    /** 리프 도형 스타일 필드에 모델 값을 쓴다 */
    _fillLeafStyleFields(shape) {
        const st = shape.style ?? {};
        if (this.detailStyleStroke !== null) {
            const stroke = typeof st.stroke === "string" && st.stroke.startsWith("#") ? st.stroke : "#2f6df6";
            this.detailStyleStroke.value = stroke.length >= 7 ? stroke.slice(0, 7) : "#2f6df6";
        }
        if (this.detailStyleFillEnabled !== null) {
            this.detailStyleFillEnabled.checked = st.fillEnabled !== false;
        }
        const { hex, opacityPct } = parseFillToHexOpacity(st.fill);
        if (this.detailStyleFill !== null) this.detailStyleFill.value = hex;
        if (this.detailStyleFillOpacity !== null) this.detailStyleFillOpacity.value = String(opacityPct);
        if (this.detailStyleFillOpacityOut !== null) this.detailStyleFillOpacityOut.textContent = `${opacityPct}%`;
        if (this.detailStyleLineWidth !== null) {
            this.detailStyleLineWidth.value = String(Math.round(Util.clamp(Number(st.lineWidth) || 3, 1, 50)));
        }
    }

    /** 리프 기하 숫자 필드 채움 (그룹 로컬) */
    _fillLeafGeometryFields(shape) {
        const k = shape.kind;
        if (k === EShapeKind.POINT) {
            if (this.detailGeomPointX !== null) this.detailGeomPointX.value = String(shape.position.x);
            if (this.detailGeomPointY !== null) this.detailGeomPointY.value = String(shape.position.y);
            if (this.detailGeomPointR !== null) this.detailGeomPointR.value = String(shape.radius);
            return;
        }
        if (k === EShapeKind.LINE) {
            if (this.detailGeomLineSx !== null) this.detailGeomLineSx.value = String(shape.start.x);
            if (this.detailGeomLineSy !== null) this.detailGeomLineSy.value = String(shape.start.y);
            if (this.detailGeomLineEx !== null) this.detailGeomLineEx.value = String(shape.end.x);
            if (this.detailGeomLineEy !== null) this.detailGeomLineEy.value = String(shape.end.y);
            return;
        }
        if (k === EShapeKind.CIRCLE) {
            if (this.detailGeomCircleCx !== null) this.detailGeomCircleCx.value = String(shape.center.x);
            if (this.detailGeomCircleCy !== null) this.detailGeomCircleCy.value = String(shape.center.y);
            if (this.detailGeomCircleR !== null) this.detailGeomCircleR.value = String(shape.radius);
            return;
        }
        if (k === EShapeKind.RECT) {
            const rect = Util.rectFromPoints(shape.start, shape.end);
            if (this.detailGeomRectX !== null) this.detailGeomRectX.value = String(rect.x);
            if (this.detailGeomRectY !== null) this.detailGeomRectY.value = String(rect.y);
            if (this.detailGeomRectW !== null) this.detailGeomRectW.value = String(rect.w);
            if (this.detailGeomRectH !== null) this.detailGeomRectH.value = String(rect.h);
        }
    }

    /** 디테일 컨트롤 change/input 리스너를 한 번만 연결한다 */
    _bindDetailPanel() {
        const nameEl = this.detailNameEl;
        if (nameEl !== null) {
            nameEl.addEventListener("change", () => this._onDetailNameChange());
            nameEl.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    nameEl.blur();
                    this._onDetailNameChange();
                }
            });
        }

        const onGeomChange = () => this._onLeafGeometryChange();
        for (const el of [
            this.detailGeomPointX,
            this.detailGeomPointY,
            this.detailGeomPointR,
            this.detailGeomLineSx,
            this.detailGeomLineSy,
            this.detailGeomLineEx,
            this.detailGeomLineEy,
            this.detailGeomCircleCx,
            this.detailGeomCircleCy,
            this.detailGeomCircleR,
            this.detailGeomRectX,
            this.detailGeomRectY,
            this.detailGeomRectW,
            this.detailGeomRectH,
        ]) {
            el?.addEventListener("change", onGeomChange);
        }

        const onStyleChange = () => this._onLeafStyleChange();
        this.detailStyleStroke?.addEventListener("change", onStyleChange);
        this.detailStyleFillEnabled?.addEventListener("change", onStyleChange);
        this.detailStyleFill?.addEventListener("change", onStyleChange);
        this.detailStyleLineWidth?.addEventListener("change", onStyleChange);
        this.detailStyleFillOpacity?.addEventListener("input", () => {
            const v = this.detailStyleFillOpacity?.value ?? "0";
            if (this.detailStyleFillOpacityOut !== null) this.detailStyleFillOpacityOut.textContent = `${v}%`;
        });
        this.detailStyleFillOpacity?.addEventListener("change", onStyleChange);

        const onGroupChange = () => this._onGroupTransformChange();
        this.detailGroupTxInput?.addEventListener("change", onGroupChange);
        this.detailGroupTyInput?.addEventListener("change", onGroupChange);

        const onWidgetChange = () => this._onWidgetDetailChange();
        this.detailWidgetText?.addEventListener("change", onWidgetChange);
        this.detailWidgetPosX?.addEventListener("change", onWidgetChange);
        this.detailWidgetPosY?.addEventListener("change", onWidgetChange);
        this.detailWidgetColor?.addEventListener("change", onWidgetChange);
        this.detailWidgetFontSize?.addEventListener("change", onWidgetChange);
    }

    /** 선택 라벨 위젯 속성을 패널 값으로 반영한다 */
    _onWidgetDetailChange() {
        const sid = this.objectManager.selectedId;
        const sk = this.objectManager.selectedKind;
        if (sid === null || sk !== "widget") return;
        const found = findNodeWithParent(this.objectManager.documentRoot, sid);
        const n = found?.node ?? null;
        if (n === null || n.nodeType !== NodeType.WIDGET) return;
        const w = n.widget;

        this.objectManager.pushTaskHistory();

        const text = this.detailWidgetText?.value ?? w.text;
        const px = this._readNumber(this.detailWidgetPosX, w.position.x);
        const py = this._readNumber(this.detailWidgetPosY, w.position.y);
        const col = this.detailWidgetColor?.value ?? "#e6edf3";
        const fs = Util.clamp(this._readNumber(this.detailWidgetFontSize, w.style.fontSize), 6, 200);

        w.text = String(text);
        w.position.x = px;
        w.position.y = py;
        w.style.color = col.length >= 7 ? col : w.style.color;
        w.style.fontSize = fs;

        this.renderer.requestRender();
        window.dispatchEvent(new CustomEvent("styleNode:detailUpdated"));
        this.updateDetailRelativeCoords();
    }

    /** 선택 리프의 기하를 입력값으로 반영한다 */
    _onLeafGeometryChange() {
        const sid = this.objectManager.selectedId;
        const sk = this.objectManager.selectedKind;
        if (sid === null || sk !== "leaf") return;
        const found = findNodeWithParent(this.objectManager.documentRoot, sid);
        const n = found?.node ?? null;
        if (n === null || n.nodeType !== NodeType.LEAF) return;
        const shape = n.shape;
        const k = shape.kind;

        this.objectManager.pushTaskHistory();

        if (k === EShapeKind.POINT) {
            const x = this._readNumber(this.detailGeomPointX, shape.position.x);
            const y = this._readNumber(this.detailGeomPointY, shape.position.y);
            const r = Math.max(0.5, this._readNumber(this.detailGeomPointR, shape.radius));
            shape.position.x = x;
            shape.position.y = y;
            shape.radius = r;
        } else if (k === EShapeKind.LINE) {
            const sx = this._readNumber(this.detailGeomLineSx, shape.start.x);
            const sy = this._readNumber(this.detailGeomLineSy, shape.start.y);
            const ex = this._readNumber(this.detailGeomLineEx, shape.end.x);
            const ey = this._readNumber(this.detailGeomLineEy, shape.end.y);
            if (Util.distance({ x: sx, y: sy }, { x: ex, y: ey }) < 3) {
                console.warn("[hierarchy_detail_ui] 선 길이가 너무 짧아 반영하지 않음");
                this._fillLeafGeometryFields(shape);
                this.objectManager.taskHistories.pop();
                return;
            }
            shape.start.x = sx;
            shape.start.y = sy;
            shape.end.x = ex;
            shape.end.y = ey;
        } else if (k === EShapeKind.CIRCLE) {
            const cx = this._readNumber(this.detailGeomCircleCx, shape.center.x);
            const cy = this._readNumber(this.detailGeomCircleCy, shape.center.y);
            const rad = Math.max(0.5, this._readNumber(this.detailGeomCircleR, shape.radius));
            shape.center.x = cx;
            shape.center.y = cy;
            shape.radius = rad;
        } else if (k === EShapeKind.RECT) {
            const x = this._readNumber(this.detailGeomRectX, 0);
            const y = this._readNumber(this.detailGeomRectY, 0);
            const w = Math.max(1, this._readNumber(this.detailGeomRectW, 1));
            const h = Math.max(1, this._readNumber(this.detailGeomRectH, 1));
            shape.start = { x, y };
            shape.end = { x: x + w, y: y + h };
        } else {
            this.objectManager.taskHistories.pop();
            return;
        }

        this._fillLeafGeometryFields(shape);
        this.renderer.requestRender();
        window.dispatchEvent(new CustomEvent("styleNode:detailUpdated"));
        this.updateDetailRelativeCoords();
    }

    /** 선택 리프·그룹의 스타일(리프만)을 반영한다 */
    _onLeafStyleChange() {
        const sid = this.objectManager.selectedId;
        const sk = this.objectManager.selectedKind;
        if (sid === null || sk !== "leaf") return;
        const found = findNodeWithParent(this.objectManager.documentRoot, sid);
        const n = found?.node ?? null;
        if (n === null || n.nodeType !== NodeType.LEAF) return;
        const shape = n.shape;

        this.objectManager.pushTaskHistory();

        const stroke = this.detailStyleStroke?.value ?? "#2f6df6";
        const fillEnabled = this.detailStyleFillEnabled?.checked ?? true;
        const fillHex = this.detailStyleFill?.value ?? "#2f6df6";
        const opacityPct = parseInt(this.detailStyleFillOpacity?.value ?? "20", 10);
        const lineWidth = Util.clamp(this._readNumber(this.detailStyleLineWidth, 3), 1, 50);
        const fill = buildRgbaFromHexOpacity(fillHex, Number.isFinite(opacityPct) ? opacityPct : 20);

        shape.style = {
            stroke,
            fill,
            fillEnabled,
            lineWidth,
        };

        this._fillLeafStyleFields(shape);
        this.renderer.requestRender();
        window.dispatchEvent(new CustomEvent("styleNode:detailUpdated"));
        this.updateDetailRelativeCoords();
    }

    /** 선택 그룹 위치 반영 — 입력은 콘텐츠 바운딩 좌상단의 목표 월드 좌표, transform을 그만큼 이동 */
    _onGroupTransformChange() {
        const sid = this.objectManager.selectedId;
        const sk = this.objectManager.selectedKind;
        if (sid === null || sk !== "group") return;
        const root = this.objectManager.documentRoot;
        const found = findNodeWithParent(root, sid);
        const n = found?.node ?? null;
        if (n === null || n.nodeType !== NodeType.GROUP) return;

        this.objectManager.pushTaskHistory();
        const targetX = this._readNumber(this.detailGroupTxInput, 0);
        const targetY = this._readNumber(this.detailGroupTyInput, 0);
        const oldTL = getGroupWorldContentBoundsTopLeft(root, sid);
        if (oldTL === null) {
            console.warn("[hierarchy_detail_ui] 그룹 콘텐츠 월드 좌상단을 찾지 못함");
            this.objectManager.taskHistories.pop();
            return;
        }
        n.transform.x += targetX - oldTL.x;
        n.transform.y += targetY - oldTL.y;

        const wNow = getGroupWorldContentBoundsTopLeft(root, sid);
        if (wNow !== null) {
            if (this.detailGroupTxInput !== null) this.detailGroupTxInput.value = String(Math.round(wNow.x));
            if (this.detailGroupTyInput !== null) this.detailGroupTyInput.value = String(Math.round(wNow.y));
        }
        this.renderer.requestRender();
        window.dispatchEvent(new CustomEvent("styleNode:detailUpdated"));
    }

    /** 계층 트리 DOM을 문서 루트 기준으로 다시 그린다. */
    renderHierarchy() {
        const el = this.hierarchyEl;
        if (el === null) {
            console.warn("[hierarchy_detail_ui] hierarchyTree 없음");
            return;
        }
        const root = this.objectManager.documentRoot;
        el.innerHTML = "";
        const wrap = document.createElement("div");
        wrap.className = "treeRoot";
        wrap.setAttribute("role", "tree");
        this._appendTreeNode(wrap, root, 0);
        el.appendChild(wrap);
    }

    /**
     * @param {HTMLElement} container
     * @param {object} node
     * @param {number} depth
     */
    _appendTreeNode(container, node, depth) {
        if (node === null || node === undefined) return;
        if (node.nodeType === NodeType.LEAF) {
            const row = document.createElement("div");
            row.className = "treeRow treeRow--leaf";
            row.style.paddingLeft = `${8 + depth * 14}px`;
            row.dataset.shapeId = node.id;
            row.setAttribute("role", "treeitem");
            row.setAttribute("tabindex", "0");
            {
                const fpLeaf = findNodeWithParent(this.objectManager.documentRoot, node.id);
                const canDragLeaf = fpLeaf !== null && fpLeaf.parent !== null;
                row.draggable = canDragLeaf;
                if (canDragLeaf) {
                    row.dataset.dragNodeId = node.id;
                    row.dataset.dragKind = "leaf";
                }
            }
            if (this.objectManager.selectedId === node.id && this.objectManager.selectedKind === "leaf") {
                row.classList.add("treeRow--selected");
            }
            const leafIcon = document.createElement("span");
            leafIcon.className = "treeRow__icon treeRow__icon--small";
            leafIcon.textContent = "◆";
            const label = document.createElement("span");
            label.className = "treeRow__label";
            label.textContent = `${node.shape.displayName}`;
            row.appendChild(leafIcon);
            row.appendChild(label);
            row.addEventListener("click", () => {
                this.objectManager.selectedId = node.id;
                this.objectManager.selectedKind = "leaf";
                this.objectManager.insertTargetGroupId =
                    findNodeWithParent(this.objectManager.documentRoot, node.id)?.parent?.id ?? this.objectManager.documentRoot.id;
                TopMenu.getInstance().setTool(EShapeKind.Select);
                this.renderer.requestRender();
            });
            container.appendChild(row);
            if (Array.isArray(node.children) && node.children.length > 0) {
                const sub = document.createElement("div");
                sub.className = "treeGroup";
                for (const ch of node.children) {
                    this._appendTreeNode(sub, ch, depth + 1);
                }
                container.appendChild(sub);
            }
            return;
        }
        if (node.nodeType === NodeType.WIDGET) {
            const row = document.createElement("div");
            row.className = "treeRow treeRow--widget";
            row.style.paddingLeft = `${8 + depth * 14}px`;
            row.dataset.widgetId = node.id;
            row.setAttribute("role", "treeitem");
            row.setAttribute("tabindex", "0");
            {
                const fpW = findNodeWithParent(this.objectManager.documentRoot, node.id);
                const canDragW = fpW !== null && fpW.parent !== null;
                row.draggable = canDragW;
                if (canDragW) {
                    row.dataset.dragNodeId = node.id;
                    row.dataset.dragKind = "widget";
                }
            }
            if (this.objectManager.selectedId === node.id && this.objectManager.selectedKind === "widget") {
                row.classList.add("treeRow--selected");
            }
            const ic = document.createElement("span");
            ic.className = "treeRow__icon treeRow__icon--small";
            ic.textContent = "T";
            const label = document.createElement("span");
            label.className = "treeRow__label";
            const widgetName = node.widget.name ?? node.widget.text ?? "";
            label.textContent = widgetName.length > 32 ? `${widgetName.slice(0, 32)}...` : widgetName || "\uB77C\uBCA8";
            row.appendChild(ic);
            row.appendChild(label);
            row.addEventListener("click", () => {
                this.objectManager.selectedId = node.id;
                this.objectManager.selectedKind = "widget";
                this.objectManager.insertTargetGroupId =
                    findNodeWithParent(this.objectManager.documentRoot, node.id)?.parent?.id ?? this.objectManager.documentRoot.id;
                TopMenu.getInstance().setTool(EShapeKind.Select);
                this.renderer.requestRender();
            });
            container.appendChild(row);
            return;
        }
        if (node.nodeType === NodeType.GROUP) {
            const row = document.createElement("div");
            row.className = `treeRow treeRow--group${depth === 0 ? " treeRow--root" : ""}`;
            row.style.paddingLeft = `${8 + depth * 14}px`;
            row.dataset.groupId = node.id;
            row.setAttribute("role", "treeitem");
            row.setAttribute("tabindex", "0");
            row.dataset.dropGroupId = node.id;
            {
                const fpGrp = findNodeWithParent(this.objectManager.documentRoot, node.id);
                const canDragGrp = fpGrp !== null && fpGrp.parent !== null;
                row.draggable = canDragGrp;
                if (canDragGrp) {
                    row.dataset.dragNodeId = node.id;
                    row.dataset.dragKind = "group";
                }
            }
            if (this.objectManager.selectedId === node.id && this.objectManager.selectedKind === "group") {
                row.classList.add("treeRow--selected");
            }
            const icon = document.createElement("span");
            icon.className = "treeRow__icon";
            icon.textContent = "▾";
            const label = document.createElement("span");
            label.className = "treeRow__label";
            label.textContent = node.name ?? "Group";
            row.appendChild(icon);
            row.appendChild(label);
            row.addEventListener("click", () => {
                this.objectManager.selectedId = node.id;
                this.objectManager.selectedKind = "group";
                this.objectManager.insertTargetGroupId = node.id;
                TopMenu.getInstance().setTool(EShapeKind.Select);
                this.renderer.requestRender();
            });
            container.appendChild(row);

            const sub = document.createElement("div");
            sub.className = "treeGroup";
            for (const ch of node.children) {
                this._appendTreeNode(sub, ch, depth + 1);
            }
            container.appendChild(sub);
        }
    }

    updateDetailRelativeCoords() {
        const root = this.objectManager.documentRoot;
        const sid = this.objectManager.selectedId;
        const sk = this.objectManager.selectedKind;
        const rxEl = this.detailRelXEl;
        const ryEl = this.detailRelYEl;
        const wrx = this.detailWidgetRelXEl;
        const wry = this.detailWidgetRelYEl;
        if (sid === null) return;
        if (sk === "leaf") {
            if (rxEl === null || ryEl === null) return;
            const basis = getRelativeBasisLeafWorldTopLeft(root, sid);
            const cur = getLeafWorldTopLeft(root, sid);
            if (basis === null || cur === null) {
                rxEl.textContent = "—";
                ryEl.textContent = "—";
                return;
            }
            rxEl.textContent = String(Math.round(cur.x - basis.x));
            ryEl.textContent = String(Math.round(cur.y - basis.y));
        }
        if (sk === "widget") {
            if (wrx === null || wry === null) return;
            const basis = getRelativeBasisDrawableWorldTopLeft(root, sid);
            const cur = getWidgetWorldTopLeft(root, sid);
            if (basis === null || cur === null) {
                wrx.textContent = "—";
                wry.textContent = "—";
                return;
            }
            wrx.textContent = String(Math.round(cur.x - basis.x));
            wry.textContent = String(Math.round(cur.y - basis.y));
        }
    }

    renderDetail() {
        const wrap = this.detailEl;
        if (wrap === null) {
            console.warn("[hierarchy_detail_ui] detailPanel 없음");
            return;
        }

        const root = this.objectManager.documentRoot;
        const sid = this.objectManager.selectedId;
        const sk = this.objectManager.selectedKind;
        const nameEl = this.detailNameEl;
        const rxEl = this.detailRelXEl;
        const ryEl = this.detailRelYEl;

        if (nameEl === null || rxEl === null || ryEl === null) {
            console.warn("[hierarchy_detail_ui] 디테일 입력 필드 없음");
            return;
        }

        if (!this._detailBound) {
            this._bindDetailPanel();
            this._detailBound = true;
        }

        const editingName = document.activeElement === nameEl;
        const editingForm = this._isDetailFormControlFocused();

        if (sid === null || sk === null) {
            nameEl.value = "";
            nameEl.disabled = true;
            rxEl.textContent = "—";
            ryEl.textContent = "—";
            if (this.detailWidgetRelXEl !== null) this.detailWidgetRelXEl.textContent = "—";
            if (this.detailWidgetRelYEl !== null) this.detailWidgetRelYEl.textContent = "—";
            wrap.classList.add("detailPanel--empty");
            if (this.detailLeafBlock) this.detailLeafBlock.hidden = true;
            if (this.detailWidgetBlock) this.detailWidgetBlock.hidden = true;
            if (this.detailGroupBlock) this.detailGroupBlock.hidden = true;
            return;
        }

        wrap.classList.remove("detailPanel--empty");
        const found = findNodeWithParent(root, sid);
        const n = found?.node ?? null;

        if (sk === "group" && n !== null && n.nodeType === NodeType.GROUP) {
            if (this.detailLeafBlock) this.detailLeafBlock.hidden = true;
            if (this.detailWidgetBlock) this.detailWidgetBlock.hidden = true;
            if (this.detailGroupBlock) this.detailGroupBlock.hidden = false;
            nameEl.disabled = false;
            if (!editingName) nameEl.value = n.name ?? "Group";
            if (!editingForm) {
                const w = getGroupWorldContentBoundsTopLeft(root, sid);
                if (w !== null) {
                    if (this.detailGroupTxInput !== null) this.detailGroupTxInput.value = String(Math.round(w.x));
                    if (this.detailGroupTyInput !== null) this.detailGroupTyInput.value = String(Math.round(w.y));
                }
            }
        } else if (sk === "leaf" && n !== null && n.nodeType === NodeType.LEAF) {
            if (this.detailLeafBlock) this.detailLeafBlock.hidden = false;
            if (this.detailWidgetBlock) this.detailWidgetBlock.hidden = true;
            if (this.detailGroupBlock) this.detailGroupBlock.hidden = true;
            nameEl.disabled = false;
            if (!editingName) nameEl.value = n.shape.displayName;
            const basis = getRelativeBasisLeafWorldTopLeft(root, sid);
            const cur = getLeafWorldTopLeft(root, sid);
            if (basis === null || cur === null) {
                rxEl.textContent = "—";
                ryEl.textContent = "—";
            } else {
                rxEl.textContent = String(Math.round(cur.x - basis.x));
                ryEl.textContent = String(Math.round(cur.y - basis.y));
            }
            if (!editingForm) {
                this._setVisibleGeomPanel(n.shape.kind);
                this._fillLeafGeometryFields(n.shape);
                this._fillLeafStyleFields(n.shape);
            }
        } else if (sk === "widget" && n !== null && n.nodeType === NodeType.WIDGET) {
            if (this.detailLeafBlock) this.detailLeafBlock.hidden = true;
            if (this.detailWidgetBlock) this.detailWidgetBlock.hidden = false;
            if (this.detailGroupBlock) this.detailGroupBlock.hidden = true;
            nameEl.disabled = false;
            const w = n.widget;
            if (!editingName) nameEl.value = w.name ?? w.text;
            const basis = getRelativeBasisDrawableWorldTopLeft(root, sid);
            const cur = getWidgetWorldTopLeft(root, sid);
            const wrx = this.detailWidgetRelXEl;
            const wry = this.detailWidgetRelYEl;
            if (wrx !== null && wry !== null) {
                if (basis === null || cur === null) {
                    wrx.textContent = "—";
                    wry.textContent = "—";
                } else {
                    wrx.textContent = String(Math.round(cur.x - basis.x));
                    wry.textContent = String(Math.round(cur.y - basis.y));
                }
            }
            if (!editingForm) {
                if (this.detailWidgetText !== null) this.detailWidgetText.value = w.text;
                if (this.detailWidgetPosX !== null) this.detailWidgetPosX.value = String(w.position.x);
                if (this.detailWidgetPosY !== null) this.detailWidgetPosY.value = String(w.position.y);
                const col = typeof w.style.color === "string" && w.style.color.startsWith("#") ? w.style.color : "#e6edf3";
                if (this.detailWidgetColor !== null) this.detailWidgetColor.value = col.length >= 7 ? col.slice(0, 7) : "#e6edf3";
                if (this.detailWidgetFontSize !== null) this.detailWidgetFontSize.value = String(Math.round(w.style.fontSize));
            }
        }
    }

    _onDetailNameChange() {
        const nameEl = this.detailNameEl;
        const sid = this.objectManager.selectedId;
        const sk = this.objectManager.selectedKind;
        if (nameEl === null || sid === null) return;
        const found = findNodeWithParent(this.objectManager.documentRoot, sid);
        const n = found?.node ?? null;
        if (n === null) return;
        if (sk === "leaf" && n.nodeType === NodeType.LEAF) {
            n.shape.setDisplayName(nameEl.value);
        } else if (sk === "widget" && n.nodeType === NodeType.WIDGET) {
            const widgetName = nameEl.value.trim();
            if (widgetName !== "") n.widget.name = widgetName;
        } else if (sk === "group" && n.nodeType === NodeType.GROUP) {
            const t = nameEl.value.trim();
            if (t !== "") n.name = t;
        }
        this.renderer.requestRender();
        window.dispatchEvent(new CustomEvent("styleNode:detailUpdated"));
    }

    refresh() {
        this.renderHierarchy();
        this.renderDetail();
    }

    syncAfterRender() {
        this.renderHierarchy();
        if (this._isDetailFormControlFocused()) {
            this.updateDetailRelativeCoords();
            return;
        }
        this.renderDetail();
    }
}
