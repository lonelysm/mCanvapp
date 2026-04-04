// 도형 문서 트리(그룹·리프), 작업 이력, 툴/선택/draft
// 리프 기하는 부모 그룹 로컬 좌표, 월드 = 부모 체인 translate 합 + 로컬

import { EShapeKind } from "./const.js";
import { Util } from "../util.js";
import { LabelWidget } from "./label_widget.js";
import { PointShape, LineShape, CircleShape, RectShape, PolygonShape, FreehandShape } from "./shapes.js";
import {
    NodeType,
    cloneDocumentRoot,
    createDocumentRoot,
    createGroupNode,
    createLeafNode,
    createWidgetNode,
    ensureDocumentRootTree,
    findNodeWithParent,
    flattenShapesInPaintOrder,
    flattenWidgetsInPaintOrder,
    getAccumulatedOffsetForLeaf,
    getAccumulatedOffsetForNode,
    getGroupContentWorldOrigin,
    isStrictDescendantId,
    pickNodeAtWorld,
    recalculateGroupOriginOptionB,
} from "./style_node_tree.js";
import { wrapFlatShapesInSessionRoot } from "./shape_tree_snapshot.js";

const TASK_HISTORY_MAX = 50;

/**
 * 툴바 채움 색(#rrggbb 또는 #rrggbbaa)을 캔버스 fillStyle용 rgba 문자열로 바꾼다.
 * @param {string} hex
 * @returns {string}
 */
function toolbarFillHexToRgba(hex) {
    const raw = String(hex ?? "#000000").trim();
    const normalized = raw.startsWith("#") ? raw.slice(1) : raw;
    if (!/^[0-9a-f]+$/i.test(normalized)) {
        return "rgba(47,109,246,0.2)";
    }
    if (normalized.length === 6) {
        const r = parseInt(normalized.slice(0, 2), 16);
        const g = parseInt(normalized.slice(2, 4), 16);
        const b = parseInt(normalized.slice(4, 6), 16);
        return `rgba(${r},${g},${b},0.2)`;
    }
    if (normalized.length === 8) {
        const r = parseInt(normalized.slice(0, 2), 16);
        const g = parseInt(normalized.slice(2, 4), 16);
        const b = parseInt(normalized.slice(4, 6), 16);
        const a = parseInt(normalized.slice(6, 8), 16) / 255;
        return `rgba(${r},${g},${b},${a})`;
    }
    return "rgba(47,109,246,0.2)";
}

class ObjectManagerClass {
    static #instance = null;

    static getInstance() {
        if (ObjectManagerClass.#instance === null) {
            ObjectManagerClass.#instance = new ObjectManagerClass();
        }
        return ObjectManagerClass.#instance;
    }

    constructor() {
        if (ObjectManagerClass.#instance !== null) {
            return ObjectManagerClass.#instance;
        }

        this.documentRoot = createDocumentRoot();
        /** @type {"leaf" | "group" | "widget" | null} */
        this.selectedKind = null;
        this.taskHistories = [];

        this.currentToolMode = EShapeKind.Select;
        this.selectedId = null;
        /** 새 도형이 들어갈 그룹 id (선택 없음: 문서 루트 → 작업 세션과 형제) */
        this.insertTargetGroupId = this.documentRoot.id;

        this.draftShape = null;
        this.draftPolygon = null;
        this.draftWidget = null;
        this.dragShapesSnapshot = null;
        this.dragCopiedOriginal = null;

        this._isDraggingOrDrafting = false;
        this._pointerDownPos = null;
        this._dragStart = null;
        this._lastPointerWorld = null;

        this._canvas = null;
        this._renderer = null;

        this._onPointerDownBound = (e) => this._onPointerDown(e);
        this._onPointerMoveBound = (e) => this._onPointerMove(e);
        this._onPointerUpBound = (e) => this._onPointerUp(e);
        this._onDoubleClickBound = (e) => this._onDoubleClick(e);

        ObjectManagerClass.#instance = this;
    }

    /** 하위 호환: 평면 도형 배열처럼 쓰이는 리프 shape 목록 */
    get shapes() {
        return flattenShapesInPaintOrder(this.documentRoot);
    }

    bindPointerEvents(canvas, renderer) {
        this._canvas = canvas;
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

    getRenderState() {
        return {
            documentRoot: this.documentRoot,
            displayShapes: flattenShapesInPaintOrder(this.documentRoot),
            displayWidgets: flattenWidgetsInPaintOrder(this.documentRoot),
            currentToolMode: this.currentToolMode,
            selectedId: this.selectedId,
            selectedKind: this.selectedKind,
            draftShape: this.draftShape,
            draftPolygon: this.draftPolygon,
            draftWidget: this.draftWidget,
            pointerPos: this._lastPointerWorld ?? null,
        };
    }

    getShapes() {
        return flattenShapesInPaintOrder(this.documentRoot);
    }

    /** 문서 루트(세션) */
    getDocumentRoot() {
        return this.documentRoot;
    }

    /**
     * 평면 도형 배열로 덮어쓴다(v1 마이그레이션 등). 세션 루트 아래 리프로 감싼다.
     * @param {import("./shapes.js").BaseShape[]} newShapes
     */
    setShapes(newShapes) {
        this.documentRoot = wrapFlatShapesInSessionRoot(Array.isArray(newShapes) ? newShapes : []);
        this.insertTargetGroupId = this.documentRoot.id;
    }

    /**
     * 월드 좌표 기준으로 만든 도형을 insertTargetGroupId 그룹에 로컬로 넣는다.
     * @param {import("./shapes.js").BaseShape} shape
     */
    addShape(shape) {
        if (shape == null) return;
        const gid = this.insertTargetGroupId ?? this.documentRoot.id;
        const o = getGroupContentWorldOrigin(this.documentRoot, gid, 0, 0);
        if (o === null) {
            console.warn("[object_manager] addShape: 그룹 원점을 찾지 못함 id=%s", gid);
            return;
        }
        const localShape = shape.translate(-o.x, -o.y);
        const leaf = createLeafNode({ shape: localShape });
        if (leaf === null) return;
        const loc = findNodeWithParent(this.documentRoot, gid);
        if (loc === null || loc.node.nodeType !== NodeType.GROUP) {
            console.warn("[object_manager] addShape: 대상 그룹 없음");
            return;
        }
        loc.node.children.push(leaf);
    }

    /**
     * 월드 좌표에 라벨 위젯을 넣는다(insertTargetGroupId 그룹 로컬).
     * @param {{ x: number, y: number }} worldPoint
     */
    addLabelWidget(worldPoint) {
        if (worldPoint === null || worldPoint === undefined) {
            console.warn("[object_manager] addLabelWidget: 좌표 없음");
            return;
        }
        const gid = this.insertTargetGroupId ?? this.documentRoot.id;
        const o = getGroupContentWorldOrigin(this.documentRoot, gid, 0, 0);
        if (o === null) {
            console.warn("[object_manager] addLabelWidget: 그룹 원점 없음 id=%s", gid);
            return;
        }
        const widgetCount = flattenWidgetsInPaintOrder(this.documentRoot).length;
        const w = new LabelWidget({
            name: `\uB77C\uBCA8${widgetCount + 1}`,
            position: { x: worldPoint.x - o.x, y: worldPoint.y - o.y },
            text: "Contents here",
            style: { color: "#e6edf3", fontSize: 14, fontFamily: "system-ui, sans-serif" },
        });
        const node = createWidgetNode({ widget: w });
        if (node === null) return;
        const loc = findNodeWithParent(this.documentRoot, gid);
        if (loc === null || loc.node.nodeType !== NodeType.GROUP) {
            console.warn("[object_manager] addLabelWidget: 대상 그룹 없음");
            return;
        }
        loc.node.children.push(node);
    }

    /**
     * 월드 좌표 기준 위젯을 현재 타깃 그룹 로컬 좌표로 추가한다.
     * @param {import("./label_widget.js").LabelWidget} widget
     * @returns {object | null}
     */
    addWidget(widget) {
        if (widget === null || widget === undefined) {
            console.warn("[object_manager] addWidget: widget 없음");
            return null;
        }
        const gid = this.insertTargetGroupId ?? this.documentRoot.id;
        const origin = getGroupContentWorldOrigin(this.documentRoot, gid, 0, 0);
        if (origin === null) {
            console.warn("[object_manager] addWidget: 그룹 원점 없음 id=%s", gid);
            return null;
        }
        const localWidget = widget.translate(-origin.x, -origin.y);
        const node = createWidgetNode({ widget: localWidget });
        if (node === null) {
            console.warn("[object_manager] addWidget: widget node 생성 실패");
            return null;
        }
        const found = findNodeWithParent(this.documentRoot, gid);
        if (found === null || found.node.nodeType !== NodeType.GROUP) {
            console.warn("[object_manager] addWidget: 대상 그룹 없음");
            return null;
        }
        found.node.children.push(node);
        return node;
    }

    /** 선택된 그룹(또는 루트) 아래에 빈 자식 그룹을 추가한다. */
    addEmptyChildGroup() {
        this.pushTaskHistory();
        const gid = this.insertTargetGroupId ?? this.documentRoot.id;
        const loc = findNodeWithParent(this.documentRoot, gid);
        if (loc === null || loc.node.nodeType !== NodeType.GROUP) {
            console.warn("[object_manager] addEmptyChildGroup: 대상 그룹 없음");
            return;
        }
        const g = createGroupNode({ name: "Group" });
        loc.node.children.push(g);
        this.selectedId = g.id;
        this.selectedKind = "group";
        this.insertTargetGroupId = g.id;
        this._renderer?.requestRender?.();
    }

    findIndexById(id) {
        const list = this.getShapes();
        return list.findIndex((s) => s.id === id);
    }

    replaceShapeAtIndex(index, shape) {
        const list = this.getShapes();
        if (index < 0 || index >= list.length || shape == null) return;
        const oldId = list[index].id;
        const loc = findNodeWithParent(this.documentRoot, oldId);
        if (loc === null || loc.node.nodeType !== NodeType.LEAF) return;
        loc.node.shape = shape;
    }

    pushTaskHistory(snapshot) {
        const toPush = snapshot ?? cloneDocumentRoot(this.documentRoot);
        this.taskHistories.push(toPush);
        if (this.taskHistories.length > TASK_HISTORY_MAX) {
            this.taskHistories.shift();
        }
    }

    restoreFromHistory() {
        const prev = this.taskHistories.pop();
        if (prev == null) return false;
        if (prev.nodeType !== undefined) {
            this.documentRoot = ensureDocumentRootTree(prev);
            return true;
        }
        if (Array.isArray(prev)) {
            const clones = prev.map((s) => (s.clone ? s.clone() : s));
            this.documentRoot = wrapFlatShapesInSessionRoot(clones);
            return true;
        }
        return false;
    }

    clear() {
        this.pushTaskHistory();
        this.documentRoot = createDocumentRoot();
        this.insertTargetGroupId = this.documentRoot.id;
    }

    /**
     * 팬 차단용: 무언가 맞으면 참. 리프면 shape, 그룹이면 표식 객체.
     * @param {{ x: number, y: number }} pointerPoint
     */
    pickShape(pointerPoint) {
        const hit = this.pickAtWorld(pointerPoint);
        if (hit === null) return null;
        if (hit.kind === "leaf") return hit.node.shape;
        if (hit.kind === "widget") return { isWidgetPick: true };
        return { isGroupPick: true };
    }

    /**
     * @returns {{ kind: "leaf" | "widget" | "group", node: object } | null}
     */
    pickAtWorld(pointerPoint) {
        return pickNodeAtWorld(pointerPoint.x, pointerPoint.y, this.documentRoot, 0, 0, this.documentRoot);
    }

    undo() {
        if (!this.restoreFromHistory()) return;
        this.selectedId = null;
        this.selectedKind = null;
        this.draftShape = null;
        this.draftPolygon = null;
        this.draftWidget = null;
        this.insertTargetGroupId = this.documentRoot.id;
        this._renderer?.requestRender?.();
    }

    clearAll() {
        this.clear();
        this.selectedId = null;
        this.selectedKind = null;
        this.draftShape = null;
        this.draftPolygon = null;
        this.draftWidget = null;
        this._renderer?.requestRender?.();
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
            this.selectedKind = "leaf";
            const fp = findNodeWithParent(this.documentRoot, draft.id);
            if (fp && fp.parent) {
                this.insertTargetGroupId = fp.parent.id;
            }
            this.draftShape = null;
            this._renderer?.requestRender?.();
        }
    }

    /** 드래프트 라벨 위젯을 문서 트리에 반영한다. */
    addDraftWidget() {
        const draft = this.draftWidget ?? null;
        if (draft === null) {
            return;
        }
        this.pushTaskHistory();
        const node = this.addWidget(draft);
        this.draftWidget = null;
        if (node !== null) {
            this.selectedId = node.id;
            this.selectedKind = "widget";
            const fp = findNodeWithParent(this.documentRoot, node.id);
            if (fp && fp.parent) {
                this.insertTargetGroupId = fp.parent.id;
            }
        }
        this._renderer?.requestRender?.();
    }

    deleteSelected() {
        if (this.selectedId === null) return;
        const id = this.selectedId;
        const found = findNodeWithParent(this.documentRoot, id);
        if (found === null || found.parent === null) return;

        this.pushTaskHistory();
        found.parent.children.splice(found.index, 1);

        const parent = found.parent;
        const fp = findNodeWithParent(this.documentRoot, parent.id);
        const grand = fp && fp.parent !== null ? fp.parent : null;
        if (grand === null) {
            recalculateGroupOriginOptionB(parent, 0, 0);
        } else {
            const o = getGroupContentWorldOrigin(this.documentRoot, grand.id, 0, 0);
            if (o !== null) {
                recalculateGroupOriginOptionB(parent, o.x, o.y);
            }
        }

        this.selectedId = null;
        this.selectedKind = null;
        this.insertTargetGroupId = this.documentRoot.id;
        this._renderer?.requestRender?.();
    }

    /**
     * 자식 목록이 바뀐 뒤 옵션 B로 그룹 원점·직접 자식 로컬을 부모 월드에 맞춘다.
     * @param {object} groupNode GROUP 노드
     */
    _recalculateGroupOptionBAfterChildChange(groupNode) {
        if (groupNode === null || groupNode === undefined || groupNode.nodeType !== NodeType.GROUP) {
            return;
        }
        const fp = findNodeWithParent(this.documentRoot, groupNode.id);
        const grand = fp && fp.parent !== null ? fp.parent : null;
        if (grand === null) {
            recalculateGroupOriginOptionB(groupNode, 0, 0);
        } else {
            const o = getGroupContentWorldOrigin(this.documentRoot, grand.id, 0, 0);
            if (o !== null) {
                recalculateGroupOriginOptionB(groupNode, o.x, o.y);
            }
        }
    }

    /**
     * 계층 트리 DnD: 노드를 다른 그룹 아래로 옮긴다. 월드 기하는 유지하고 양쪽 부모에 옵션 B를 적용한다.
     * @param {string} draggedNodeId 리프 또는 그룹 id
     * @param {string} targetGroupId 드롭 대상 그룹 id
     * @returns {boolean}
     */
    reparentNodeToGroup(draggedNodeId, targetGroupId) {
        console.info("[object_manager] reparentNodeToGroup 시작 dragged=%s target=%s", draggedNodeId, targetGroupId);
        if (draggedNodeId === null || draggedNodeId === undefined || targetGroupId === null || targetGroupId === undefined) {
            console.warn("[object_manager] reparentNodeToGroup: id 없음");
            return false;
        }
        if (draggedNodeId === targetGroupId) {
            console.info("[object_manager] reparentNodeToGroup 종료: 자기 자신 — 무시");
            return false;
        }
        const foundDrag = findNodeWithParent(this.documentRoot, draggedNodeId);
        const foundTarget = findNodeWithParent(this.documentRoot, targetGroupId);
        if (foundDrag === null || foundDrag.parent === null) {
            console.warn("[object_manager] reparentNodeToGroup: 이동 노드 없음 또는 문서 루트");
            return false;
        }
        if (foundTarget === null || foundTarget.node.nodeType !== NodeType.GROUP) {
            console.warn("[object_manager] reparentNodeToGroup: 대상이 그룹이 아님");
            return false;
        }
        const draggedNode = foundDrag.node;
        const oldParent = foundDrag.parent;
        const targetGroup = foundTarget.node;

        if (draggedNode.nodeType === NodeType.GROUP && isStrictDescendantId(draggedNode, targetGroupId)) {
            console.warn("[object_manager] reparentNodeToGroup: 자손 그룹으로는 이동 불가");
            return false;
        }

        if (oldParent.id === targetGroup.id) {
            console.info("[object_manager] reparentNodeToGroup 종료: 이미 같은 부모 — 무시");
            return false;
        }

        /** 트리에서 빼기 전에 월드 기하를 구해야 한다 */
        let worldLeafShape = null;
        let worldGroupOrigin = null;
        let worldWidgetCopy = null;
        if (draggedNode.nodeType === NodeType.LEAF) {
            const off = getAccumulatedOffsetForLeaf(this.documentRoot, draggedNodeId, 0, 0);
            if (off === null) {
                console.warn("[object_manager] reparentNodeToGroup: 리프 누적 오프셋 실패");
                return false;
            }
            worldLeafShape = draggedNode.shape.translate(off.x, off.y);
        } else if (draggedNode.nodeType === NodeType.GROUP) {
            const wo = getGroupContentWorldOrigin(this.documentRoot, draggedNodeId, 0, 0);
            if (wo === null) {
                console.warn("[object_manager] reparentNodeToGroup: 그룹 월드 원점 실패");
                return false;
            }
            worldGroupOrigin = { x: wo.x, y: wo.y };
        } else if (draggedNode.nodeType === NodeType.WIDGET) {
            const off = getAccumulatedOffsetForNode(this.documentRoot, draggedNodeId, 0, 0);
            if (off === null) {
                console.warn("[object_manager] reparentNodeToGroup: 위젯 누적 오프셋 실패");
                return false;
            }
            worldWidgetCopy = draggedNode.widget.translate(off.x, off.y);
        } else {
            return false;
        }

        this.pushTaskHistory();

        oldParent.children.splice(foundDrag.index, 1);
        this._recalculateGroupOptionBAfterChildChange(oldParent);

        /** 이전 부모에서 옵션 B 재계산 후, 대상 그룹의 월드 콘텐츠 원점으로 로컬을 맞춘다 */
        const oNew = getGroupContentWorldOrigin(this.documentRoot, targetGroupId, 0, 0);
        if (oNew === null) {
            console.warn("[object_manager] reparentNodeToGroup: 새 부모 콘텐츠 원점 실패 — undo로 복구");
            this.restoreFromHistory();
            return false;
        }

        if (draggedNode.nodeType === NodeType.LEAF) {
            draggedNode.shape = worldLeafShape.translate(-oNew.x, -oNew.y);
        } else if (draggedNode.nodeType === NodeType.WIDGET) {
            draggedNode.widget = worldWidgetCopy.translate(-oNew.x, -oNew.y);
        } else {
            draggedNode.transform.x = worldGroupOrigin.x - oNew.x;
            draggedNode.transform.y = worldGroupOrigin.y - oNew.y;
        }

        targetGroup.children.push(draggedNode);
        this._recalculateGroupOptionBAfterChildChange(targetGroup);

        this.selectedId = draggedNodeId;
        this.selectedKind =
            draggedNode.nodeType === NodeType.LEAF
                ? "leaf"
                : draggedNode.nodeType === NodeType.GROUP
                  ? "group"
                  : "widget";
        this.insertTargetGroupId = targetGroup.id;

        this._renderer?.requestRender?.();
        console.info("[object_manager] reparentNodeToGroup 종료 성공");
        return true;
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
            this.selectedKind = "leaf";
            const fp = findNodeWithParent(this.documentRoot, final.id);
            if (fp && fp.parent) {
                this.insertTargetGroupId = fp.parent.id;
            }
        }
        this.draftPolygon = null;
        this._renderer?.requestRender?.();
    }

    _createShape(pointerDownPoint) {
        const currentStyle = this._getCurrentShapeStyleFromDom();
        if (!currentStyle) return;

        if (this.currentToolMode === EShapeKind.Point) {
            this.pushTaskHistory();
            this.addShape(
                new PointShape({
                    position: pointerDownPoint,
                    radius: Math.max(2, currentStyle.lineWidth + 1),
                    style: currentStyle,
                })
            );
            const shapes = this.getShapes();
            const last = shapes[shapes.length - 1];
            if (last) {
                this.selectedId = last.id;
                this.selectedKind = "leaf";
            }
            this._renderer?.requestRender?.();
            return;
        }

        if (this.currentToolMode === EShapeKind.Label) {
            this.draftWidget = this._createDraftWidget(pointerDownPoint);
            this._renderer?.requestRender?.();
            return;
        }

        if (this.currentToolMode === EShapeKind.Polygon) {
            if (this.draftPolygon === null) {
                this.draftPolygon = new PolygonShape({
                    points: [pointerDownPoint],
                    isClosed: false,
                    style: currentStyle,
                });
            } else {
                this.draftPolygon.points.push(pointerDownPoint);
            }
            this._renderer?.requestRender?.();
            return;
        }

        const draftShape = this._createDraftShape(pointerDownPoint);
        if (draftShape !== null) {
            this.draftShape = draftShape;
            this._renderer?.requestRender?.();
        }
    }

    _createDraftShape(pointerPoint) {
        const currentStyle = this._getCurrentShapeStyleFromDom();
        if (!currentStyle) return null;

        if (this.currentToolMode === EShapeKind.LINE) {
            return new LineShape({
                start: pointerPoint,
                end: pointerPoint,
                style: currentStyle,
            });
        }
        if (this.currentToolMode === EShapeKind.Circle) {
            return new CircleShape({
                center: pointerPoint,
                radius: 0,
                style: currentStyle,
            });
        }
        if (this.currentToolMode === EShapeKind.Rect) {
            return new RectShape({
                start: pointerPoint,
                end: pointerPoint,
                style: currentStyle,
            });
        }
        if (this.currentToolMode === EShapeKind.Freehand) {
            return new FreehandShape({
                points: [pointerPoint],
                style: currentStyle,
            });
        }
        return null;
    }

    /**
     * 라벨 위젯 드래프트를 만든다.
     * @param {{ x: number, y: number }} pointerPoint
     * @returns {import("./label_widget.js").LabelWidget | null}
     */
    _createDraftWidget(pointerPoint) {
        if (pointerPoint === null || pointerPoint === undefined) {
            return null;
        }
        const widgetCount = flattenWidgetsInPaintOrder(this.documentRoot).length;
        const draftWidget = new LabelWidget({
            name: `\uB77C\uBCA8${widgetCount + 1}`,
            position: { x: pointerPoint.x, y: pointerPoint.y },
            text: "Contents here",
            style: { color: "#e6edf3", fontSize: 14, fontFamily: "system-ui, sans-serif" },
        });
        draftWidget.updateDraftLayout(pointerPoint, pointerPoint);
        return draftWidget;
    }

    _onPointerDown(e) {
        if (!this._renderer) return;

        const worldPoint = this._renderer.getWorldPointFromEvent(e);
        this._pointerDownPos = worldPoint;
        this._dragStart = worldPoint;

        if (this.currentToolMode === EShapeKind.Select) {
            const hit = this.pickAtWorld(worldPoint);
            if (hit === null) {
                this.selectedId = null;
                this.selectedKind = null;
                this.insertTargetGroupId = this.documentRoot.id;
            } else {
                this.selectedId = hit.node.id;
                this.selectedKind = hit.kind;
                if (hit.kind === "group") {
                    this.insertTargetGroupId = hit.node.id;
                } else {
                    const fp = findNodeWithParent(this.documentRoot, hit.node.id);
                    this.insertTargetGroupId = fp && fp.parent ? fp.parent.id : this.documentRoot.id;
                }
            }

            this.dragCopiedOriginal = new Map();
            this.dragShapesSnapshot = this.selectedId ? cloneDocumentRoot(this.documentRoot) : null;

            if (this.selectedId !== null) {
                if (this.selectedKind === "leaf") {
                    const sh = hit.node.shape;
                    this.dragCopiedOriginal.set(this.selectedId, sh.clone());
                } else if (this.selectedKind === "widget") {
                    const w = hit.node.widget;
                    this.dragCopiedOriginal.set(this.selectedId, w.clone());
                } else if (this.selectedKind === "group") {
                    const g = hit.node;
                    this.dragCopiedOriginal.set(this.selectedId, {
                        tx: g.transform.x,
                        ty: g.transform.y,
                    });
                }
                this._renderer?.endPan();
                this._isDraggingOrDrafting = true;
                e.stopImmediatePropagation();
                this._canvas.setPointerCapture(e.pointerId);
            }
            this._renderer.requestRender();
            return;
        }

        this._createShape(worldPoint);
        this._isDraggingOrDrafting = this.draftShape !== null || this.draftPolygon !== null || this.draftWidget !== null;
        if (this._isDraggingOrDrafting) {
            e.stopImmediatePropagation();
            this._canvas.setPointerCapture(e.pointerId);
        }
    }

    _onPointerMove(e) {
        if (!this._renderer) return;

        const worldPoint = this._renderer.getWorldPointFromEvent(e);
        this._lastPointerWorld = worldPoint;

        if (this._isDraggingOrDrafting) {
            e.stopImmediatePropagation();
            if (this.currentToolMode === EShapeKind.Select && this.selectedId !== null) {
                const deltaX = worldPoint.x - this._dragStart.x;
                const deltaY = worldPoint.y - this._dragStart.y;
                if (this.selectedKind === "leaf") {
                    const original = this.dragCopiedOriginal?.get(this.selectedId) ?? null;
                    if (original) {
                        const moved = original.translate(deltaX, deltaY);
                        const loc = findNodeWithParent(this.documentRoot, this.selectedId);
                        if (loc && loc.node.nodeType === NodeType.LEAF) {
                            loc.node.shape = moved;
                        }
                    }
                } else if (this.selectedKind === "widget") {
                    const original = this.dragCopiedOriginal?.get(this.selectedId) ?? null;
                    if (original) {
                        const moved = original.translate(deltaX, deltaY);
                        const loc = findNodeWithParent(this.documentRoot, this.selectedId);
                        if (loc && loc.node.nodeType === NodeType.WIDGET) {
                            loc.node.widget = moved;
                        }
                    }
                } else if (this.selectedKind === "group") {
                    const orig = this.dragCopiedOriginal?.get(this.selectedId);
                    const loc = findNodeWithParent(this.documentRoot, this.selectedId);
                    if (orig && loc && loc.node.nodeType === NodeType.GROUP) {
                        loc.node.transform.x = orig.tx + deltaX;
                        loc.node.transform.y = orig.ty + deltaY;
                    }
                }
            } else if (this.draftShape !== null) {
                this.draftShape.updateDraftShape(worldPoint);
            } else if (this.draftWidget !== null && this._pointerDownPos !== null) {
                this.draftWidget.updateDraftLayout(this._pointerDownPos, worldPoint);
            }
            this._renderer.requestRender();
            return;
        }

        this._renderer.requestRender();
    }

    _onPointerUp(e) {
        if (!this._renderer) return;

        if (this._isDraggingOrDrafting) {
            e.stopImmediatePropagation();
            this._canvas.releasePointerCapture(e.pointerId);

            if (this.currentToolMode === EShapeKind.Select) {
                if (this.selectedId !== null && this.dragShapesSnapshot !== null) {
                    const now = cloneDocumentRoot(this.documentRoot);
                    const snap = this.dragShapesSnapshot;
                    if (now && snap && JSON.stringify(now) !== JSON.stringify(snap)) {
                        this.pushTaskHistory(this.dragShapesSnapshot);
                    }
                }
                this.dragShapesSnapshot = null;
                this.dragCopiedOriginal = new Map();
            } else {
                if (this.draftWidget !== null) {
                    this.addDraftWidget();
                } else {
                    this.addDraftShape();
                }
            }

            this._renderer?.endPan();
            this._isDraggingOrDrafting = false;
            this._pointerDownPos = null;
            this._dragStart = null;
            this._renderer.requestRender();
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

    /** 툴바 색·두께 변경 시 드래프트 도형 스타일을 DOM과 맞춘다. */
    syncDraftStyleFromToolbar() {
        const style = this._getCurrentShapeStyleFromDom();
        if (style === null || style === undefined) {
            return;
        }
        if (this.draftShape !== null) {
            this.draftShape.style = { ...style };
        }
        if (this.draftPolygon !== null) {
            this.draftPolygon.style = { ...style };
        }
    }

    _getCurrentShapeStyleFromDom() {
        const strokeColorEl = document.getElementById("strokeColor");
        const fillEnabledEl = document.getElementById("fillEnabled");
        const fillColorEl = document.getElementById("fillColor");
        const lineWidthEl = document.getElementById("lineWidth");

        strokeColorEl ?? console.error("[ui] strokeColor 엘리먼트를 찾지 못했습니다.");
        fillEnabledEl ?? console.error("[ui] fillEnabled 엘리먼트를 찾지 못했습니다.");
        fillColorEl ?? console.error("[ui] fillColor 엘리먼트를 찾지 못했습니다.");
        lineWidthEl ?? console.error("[ui] lineWidth 엘리먼트를 찾지 못했습니다.");

        const stroke = strokeColorEl?.value ?? "#2f6df6";
        const fillEnabled = fillEnabledEl?.checked ?? true;
        const fillHex = fillColorEl?.value ?? "#2f6df6";
        const lineWidthValue = Number(lineWidthEl?.value ?? 3);
        const fill = toolbarFillHexToRgba(fillHex);

        return {
            stroke,
            fill,
            lineWidth: Util.clamp(lineWidthValue, 1, 50),
            fillEnabled,
        };
    }
}

export { ObjectManagerClass };
