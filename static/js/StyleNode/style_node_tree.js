// StyleNode 계층: 그룹(중첩) + 리프(도형) + 위젯(라벨 등). 기하는 부모 그룹 로컬 좌표.

import { Util } from "../util.js";
import { getLabelWidgetBoundingBox } from "./label_widget.js";
import { getShapeBoundingBox } from "./shape_bounds.js";

export const NodeType = {
    GROUP: "group",
    LEAF: "leaf",
    WIDGET: "widget",
};

function getNodeChildren(node) {
    if (node === null || node === undefined) return [];
    if (node.nodeType === NodeType.GROUP || node.nodeType === NodeType.LEAF) {
        return Array.isArray(node.children) ? node.children : [];
    }
    return [];
}

function getLeafChildLocalOrigin(leafNode) {
    if (leafNode === null || leafNode === undefined || leafNode.nodeType !== NodeType.LEAF) {
        return { x: 0, y: 0 };
    }
    const bounds = getShapeBoundingBox(leafNode.shape);
    if (bounds === null) {
        return { x: 0, y: 0 };
    }
    return { x: bounds.minX, y: bounds.minY };
}

export function getNodeContentWorldOrigin(root, nodeId, ox = 0, oy = 0) {
    if (root === null || root === undefined || nodeId === null || nodeId === undefined) return null;
    if (root.nodeType === NodeType.GROUP) {
        const gx = ox + root.transform.x;
        const gy = oy + root.transform.y;
        if (root.id === nodeId) {
            return { x: gx, y: gy };
        }
        for (const ch of root.children) {
            const r = getNodeContentWorldOrigin(ch, nodeId, gx, gy);
            if (r !== null) return r;
        }
        return null;
    }
    if (root.nodeType === NodeType.LEAF) {
        const childOrigin = getLeafChildLocalOrigin(root);
        if (root.id === nodeId) {
            return { x: ox + childOrigin.x, y: oy + childOrigin.y };
        }
        for (const ch of getNodeChildren(root)) {
            const r = getNodeContentWorldOrigin(ch, nodeId, ox + childOrigin.x, oy + childOrigin.y);
            if (r !== null) return r;
        }
    }
    return null;
}

/**
 * 빈 작업 세션 그룹을 만든다. 문서 루트의 자식으로 두거나 단독(구버전)으로 쓸 수 있다.
 */
export function createSessionRoot() {
    return {
        nodeType: NodeType.GROUP,
        id: Util.uid("session"),
        name: "작업 세션",
        transform: { x: 0, y: 0 },
        children: [],
    };
}

/**
 * 문서 최상위 루트. 첫 자식은 "작업 세션"이며, 선택 해제 시 추가되는 도형·그룹은 이 자식들과 형제로 둔다.
 */
export function createDocumentRoot() {
    return {
        nodeType: NodeType.GROUP,
        id: Util.uid("doc"),
        name: "문서",
        transform: { x: 0, y: 0 },
        children: [createSessionRoot()],
    };
}

/**
 * 구버전(최상위가 곧 "작업 세션" 그룹이던 트리)을 문서 루트로 감싼다.
 * @param {object | null} root
 */
export function ensureDocumentRootTree(root) {
    if (root === null || root === undefined) {
        return createDocumentRoot();
    }
    if (root.nodeType !== NodeType.GROUP) {
        return createDocumentRoot();
    }
    if (root.name === "문서") {
        return root;
    }
    if (root.name === "작업 세션") {
        return {
            nodeType: NodeType.GROUP,
            id: Util.uid("doc"),
            name: "문서",
            transform: { x: 0, y: 0 },
            children: [root],
        };
    }
    return root;
}

/**
 * @param {{ id?: string, name?: string, transform?: { x: number, y: number } }} options
 */
export function createGroupNode(options) {
    const o = options ?? {};
    return {
        nodeType: NodeType.GROUP,
        id: o.id ?? Util.uid("grp"),
        name: typeof o.name === "string" && o.name.trim() !== "" ? o.name.trim() : "Group",
        transform: {
            x: typeof o.transform?.x === "number" ? o.transform.x : 0,
            y: typeof o.transform?.y === "number" ? o.transform.y : 0,
        },
        children: [],
    };
}

/**
 * @param {{ id?: string, shape: import("./shapes.js").BaseShape, children?: object[] }} options
 */
export function createLeafNode(options) {
    const sh = options?.shape ?? null;
    if (sh === null) {
        console.warn("[style_node_tree] createLeafNode: shape 없음");
        return null;
    }
    return {
        nodeType: NodeType.LEAF,
        id: options.id ?? sh.id,
        shape: sh,
        children: Array.isArray(options?.children) ? options.children : [],
    };
}

/**
 * @param {{ id?: string, widget: import("./label_widget.js").LabelWidget }} options
 */
export function createWidgetNode(options) {
    const w = options?.widget ?? null;
    if (w === null) {
        console.warn("[style_node_tree] createWidgetNode: widget 없음");
        return null;
    }
    return {
        nodeType: NodeType.WIDGET,
        id: options.id ?? w.id,
        widget: w,
    };
}

/**
 * rootSubtree 트리 안에서 needleId가 rootSubtree 자식 이하(자기 자신은 제외)에 있으면 참. 그룹 드롭 금지 판별용.
 * @param {object} rootSubtree
 * @param {string} needleId
 * @returns {boolean}
 */
export function isStrictDescendantId(rootSubtree, needleId) {
    if (rootSubtree === null || rootSubtree === undefined || needleId === null || needleId === undefined) {
        return false;
    }
    if (rootSubtree.nodeType !== NodeType.GROUP && rootSubtree.nodeType !== NodeType.LEAF) {
        return false;
    }
    for (const ch of getNodeChildren(rootSubtree)) {
        if (ch.id === needleId) {
            return true;
        }
        if (isStrictDescendantId(ch, needleId)) {
            return true;
        }
    }
    return false;
}

export function findNodeWithParent(root, id) {
    if (root === null || root === undefined || id === null || id === undefined) {
        return null;
    }
    if (root.id === id) {
        return { node: root, parent: null, index: -1 };
    }
    if (root.nodeType !== NodeType.GROUP && root.nodeType !== NodeType.LEAF) {
        return null;
    }
    const children = getNodeChildren(root);
    for (let i = 0; i < children.length; i++) {
        const ch = children[i];
        if (ch.id === id) {
            return { node: ch, parent: root, index: i };
        }
        const sub = findNodeWithParent(ch, id);
        if (sub !== null) return sub;
    }
    return null;
}

/**
 * 그룹의 자식이 속한 경우, 해당 그룹 기준 누적 원점(월드)을 구한다.
 * @returns {{ x: number, y: number } | null}
 */
export function getGroupContentWorldOrigin(root, groupId, ox = 0, oy = 0) {
    if (root === null || root === undefined) return null;
    if (root.nodeType === NodeType.GROUP && root.id === groupId) {
        return { x: ox + root.transform.x, y: oy + root.transform.y };
    }
    if (root.nodeType === NodeType.GROUP) {
        const gx = ox + root.transform.x;
        const gy = oy + root.transform.y;
        for (const ch of root.children) {
            const r = getGroupContentWorldOrigin(ch, groupId, gx, gy);
            if (r !== null) return r;
        }
        return null;
    }
    if (root.nodeType !== NodeType.LEAF) return null;
    const childOrigin = getLeafChildLocalOrigin(root);
    for (const ch of getNodeChildren(root)) {
        const r = getGroupContentWorldOrigin(ch, groupId, ox + childOrigin.x, oy + childOrigin.y);
        if (r !== null) return r;
    }
    return null;
}

/** 깊이 우선으로 리프 노드를 순서대로 나열한다. */
export function collectLeafNodes(node, out) {
    if (node === null || node === undefined) return;
    if (node.nodeType === NodeType.LEAF) {
        out.push(node);
    }
    for (const ch of getNodeChildren(node)) {
        collectLeafNodes(ch, out);
    }
}

/** 리프의 shape만 순서대로 (렌더·히트·HUD용) */
export function flattenShapesInPaintOrder(root) {
    const leaves = [];
    collectLeafNodes(root, leaves);
    return leaves.map((n) => n.shape);
}

/** 위젯 노드만 문서 순서대로 (목록·HUD용) */
export function flattenWidgetsInPaintOrder(root) {
    const out = [];
    function walk(n) {
        if (n === null || n === undefined) return;
        if (n.nodeType === NodeType.WIDGET) {
            out.push(n);
            return;
        }
        for (const ch of getNodeChildren(n)) {
            walk(ch);
        }
    }
    walk(root);
    return out;
}

function getNodeWorldBounds(node, ox, oy) {
    if (node === null || node === undefined) return null;
    if (node.nodeType === NodeType.WIDGET) {
        const widgetBounds = getLabelWidgetBoundingBox(node.widget);
        if (widgetBounds === null) return null;
        return {
            minX: widgetBounds.minX + ox,
            minY: widgetBounds.minY + oy,
            maxX: widgetBounds.maxX + ox,
            maxY: widgetBounds.maxY + oy,
        };
    }
    if (node.nodeType === NodeType.LEAF) {
        const shapeBounds = getShapeBoundingBox(node.shape);
        let minX = shapeBounds !== null && shapeBounds !== undefined ? shapeBounds.minX + ox : Infinity;
        let minY = shapeBounds !== null && shapeBounds !== undefined ? shapeBounds.minY + oy : Infinity;
        let maxX = shapeBounds !== null && shapeBounds !== undefined ? shapeBounds.maxX + ox : -Infinity;
        let maxY = shapeBounds !== null && shapeBounds !== undefined ? shapeBounds.maxY + oy : -Infinity;
        const childOrigin = getLeafChildLocalOrigin(node);
        for (const ch of getNodeChildren(node)) {
            const childBounds = getNodeWorldBounds(ch, ox + childOrigin.x, oy + childOrigin.y);
            if (childBounds === null) continue;
            minX = Math.min(minX, childBounds.minX);
            minY = Math.min(minY, childBounds.minY);
            maxX = Math.max(maxX, childBounds.maxX);
            maxY = Math.max(maxY, childBounds.maxY);
        }
        if (!Number.isFinite(minX)) return null;
        return { minX, minY, maxX, maxY };
    }
    if (node.nodeType !== NodeType.GROUP) return null;
    return getGroupWorldBounds(node, ox, oy);
}

/**
 * 그룹의 모든 자손 리프 월드 바운딩을 합친다.
 * @returns {{ minX: number, minY: number, maxX: number, maxY: number } | null}
 */
export function getGroupWorldBounds(group, ox, oy) {
    if (group === null || group === undefined || group.nodeType !== NodeType.GROUP) {
        return null;
    }
    const gx = ox + group.transform.x;
    const gy = oy + group.transform.y;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const merge = (b) => {
        if (b === null) return;
        minX = Math.min(minX, b.minX);
        minY = Math.min(minY, b.minY);
        maxX = Math.max(maxX, b.maxX);
        maxY = Math.max(maxY, b.maxY);
    };

    for (const ch of group.children) {
        merge(getNodeWorldBounds(ch, gx, gy));
    }

    if (!Number.isFinite(minX)) {
        return { minX: gx, minY: gy, maxX: gx + 1, maxY: gy + 1 };
    }
    return { minX, minY, maxX, maxY };
}

function pointInBounds(px, py, b) {
    return px >= b.minX && px <= b.maxX && py >= b.minY && py <= b.maxY;
}

/**
 * 월드 좌표에서 최상단(나중에 그린) 노드를 고른다. 리프 우선, 그다음 부모 그룹 빈 영역.
 * documentRoot는 바운딩으로만 잡히면 팬이 막이므로 그룹 선택에서 제외한다.
 * @param {object} documentRoot — 최상위 세션 루트(참조 비교)
 * @returns {{ kind: "leaf" | "widget" | "group", node: object } | null}
 */
export function pickNodeAtWorld(worldX, worldY, node, ox, oy, documentRoot) {
    if (node === null || node === undefined) return null;
    if (node.nodeType === NodeType.WIDGET) {
        const lx = worldX - ox;
        const ly = worldY - oy;
        if (node.widget.hitTestLocal({ x: lx, y: ly })) {
            return { kind: "widget", node };
        }
        return null;
    }
    if (node.nodeType === NodeType.LEAF) {
        const childOrigin = getLeafChildLocalOrigin(node);
        const children = getNodeChildren(node);
        for (let i = children.length - 1; i >= 0; i--) {
            const hitChild = pickNodeAtWorld(worldX, worldY, children[i], ox + childOrigin.x, oy + childOrigin.y, documentRoot);
            if (hitChild !== null) return hitChild;
        }
        const lx = worldX - ox;
        const ly = worldY - oy;
        const sh = node.shape;
        const tolerance = Math.max(6, (sh.style?.lineWidth ?? 3) + 6);
        if (sh.hitTest({ x: lx, y: ly }, tolerance)) {
            return { kind: "leaf", node };
        }
        return null;
    }

    if (node.nodeType !== NodeType.GROUP) return null;

    const gx = ox + node.transform.x;
    const gy = oy + node.transform.y;

    for (let i = node.children.length - 1; i >= 0; i--) {
        const ch = node.children[i];
        const hit = pickNodeAtWorld(worldX, worldY, ch, gx, gy, documentRoot);
        if (hit !== null) return hit;
    }

    const gb = getGroupWorldBounds(node, ox, oy);
    if (gb !== null && pointInBounds(worldX, worldY, gb)) {
        if (node === documentRoot) {
            return null;
        }
        return { kind: "group", node };
    }
    return null;
}

/**
 * 옵션 B: 그룹 자식이 바뀐 뒤, 합산 월드 AABB 좌상단을 새 콘텐츠 원점으로 삼고 transform·직접 자식 로컬을 맞춘다.
 * @param {object} group — GROUP 노드
 * @param {number} parentWorldX 부모 콘텐츠 원점의 월드 X
 * @param {number} parentWorldY
 */
export function recalculateGroupOriginOptionB(group, parentWorldX, parentWorldY) {
    if (group === null || group === undefined || group.nodeType !== NodeType.GROUP) {
        console.warn("[style_node_tree] recalculateGroupOriginOptionB: 그룹 아님");
        return;
    }
    const gb = getGroupWorldBounds(group, parentWorldX, parentWorldY);
    if (gb === null) return;

    const oldOx = parentWorldX + group.transform.x;
    const oldOy = parentWorldY + group.transform.y;
    const newOx = gb.minX;
    const newOy = gb.minY;
    const dx = oldOx - newOx;
    const dy = oldOy - newOy;

    group.transform.x = newOx - parentWorldX;
    group.transform.y = newOy - parentWorldY;

    for (const ch of group.children) {
        if (ch.nodeType === NodeType.LEAF) {
            ch.shape = ch.shape.translate(dx, dy);
        } else if (ch.nodeType === NodeType.WIDGET) {
            ch.widget = ch.widget.translate(dx, dy);
        } else if (ch.nodeType === NodeType.GROUP) {
            ch.transform.x += dx;
            ch.transform.y += dy;
        }
    }
}

/**
 * 문서 루트를 깊은 복사한다(undo용). shape는 clone().
 */
/**
 * 리프 shape를 월드로 옮기기 위한 누적 translate (조상 그룹 transform 합).
 * @returns {{ x: number, y: number } | null}
 */
/**
 * 리프·위젯 노드 id(또는 리프의 shape.id)에 대한 부모 체인 누적 원점.
 * @returns {{ x: number, y: number } | null}
 */
export function getAccumulatedOffsetForNode(root, nodeId, ox = 0, oy = 0) {
    if (root === null || root === undefined) return null;
    if (root.nodeType === NodeType.LEAF && (root.id === nodeId || root.shape.id === nodeId)) {
        return { x: ox, y: oy };
    }
    if (root.nodeType === NodeType.WIDGET && root.id === nodeId) {
        return { x: ox, y: oy };
    }
    if (root.nodeType === NodeType.GROUP) {
        const gx = ox + root.transform.x;
        const gy = oy + root.transform.y;
        for (const ch of root.children) {
            const r = getAccumulatedOffsetForNode(ch, nodeId, gx, gy);
            if (r !== null) return r;
        }
    } else if (root.nodeType === NodeType.LEAF) {
        const childOrigin = getLeafChildLocalOrigin(root);
        for (const ch of getNodeChildren(root)) {
            const r = getAccumulatedOffsetForNode(ch, nodeId, ox + childOrigin.x, oy + childOrigin.y);
            if (r !== null) return r;
        }
    }
    return null;
}

/** @deprecated 이름 호환 — getAccumulatedOffsetForNode와 동일 */
export function getAccumulatedOffsetForLeaf(root, leafShapeId, ox = 0, oy = 0) {
    return getAccumulatedOffsetForNode(root, leafShapeId, ox, oy);
}

/**
 * 그룹 로컬 원점(0,0)이 월드 좌표계에서 어디인지 반환한다. 조상 그룹 transform을 누적한다.
 * @param {object} root 문서 루트
 * @param {string} groupId 대상 그룹 id
 * @param {number} ox
 * @param {number} oy
 * @returns {{ x: number, y: number } | null}
 */
export function getGroupWorldOrigin(root, groupId, ox = 0, oy = 0) {
    if (root === null || root === undefined) return null;
    if (root.nodeType === NodeType.GROUP) {
        const wx = ox + root.transform.x;
        const wy = oy + root.transform.y;
        if (root.id === groupId) {
            return { x: wx, y: wy };
        }
        for (const ch of root.children) {
            const r = getGroupWorldOrigin(ch, groupId, wx, wy);
            if (r !== null) return r;
        }
        return null;
    }
    if (root.nodeType !== NodeType.LEAF) return null;
    const childOrigin = getLeafChildLocalOrigin(root);
    for (const ch of getNodeChildren(root)) {
        const r = getGroupWorldOrigin(ch, groupId, ox + childOrigin.x, oy + childOrigin.y);
        if (r !== null) return r;
    }
    return null;
}

/**
 * 그룹 자손 콘텐츠의 월드 바운딩 박스 좌상단. 디테일 패널에 표시할 “보이는 위치”용(transform 원점이 아님).
 * @param {object} root
 * @param {string} groupId
 * @returns {{ x: number, y: number } | null}
 */
export function getGroupWorldContentBoundsTopLeft(root, groupId) {
    const fp = findNodeWithParent(root, groupId);
    if (fp === null || fp.node.nodeType !== NodeType.GROUP) return null;
    const g = fp.node;
    const parent = fp.parent;
    let ox = 0;
    let oy = 0;
    if (parent !== null) {
        if (parent.nodeType === NodeType.GROUP) {
            const po = getGroupWorldOrigin(root, parent.id);
            if (po === null) return null;
            ox = po.x;
            oy = po.y;
        } else if (parent.nodeType === NodeType.LEAF) {
            const leafOrigin = getAccumulatedOffsetForNode(root, parent.id);
            const childOrigin = getLeafChildLocalOrigin(parent);
            if (leafOrigin === null) return null;
            ox = leafOrigin.x + childOrigin.x;
            oy = leafOrigin.y + childOrigin.y;
        }
    }
    const b = getGroupWorldBounds(g, ox, oy);
    if (b === null) return null;
    return { x: b.minX, y: b.minY };
}

export function cloneDocumentRoot(root) {
    if (root === null || root === undefined) return null;
    if (root.nodeType === NodeType.LEAF) {
        return {
            nodeType: NodeType.LEAF,
            id: root.id,
            shape: root.shape.clone(),
            children: getNodeChildren(root).map((c) => cloneDocumentRoot(c)),
        };
    }
    if (root.nodeType === NodeType.WIDGET) {
        return {
            nodeType: NodeType.WIDGET,
            id: root.id,
            widget: root.widget.clone(),
        };
    }
    if (root.nodeType === NodeType.GROUP) {
        return {
            nodeType: NodeType.GROUP,
            id: root.id,
            name: root.name,
            transform: { ...root.transform },
            children: root.children.map((c) => cloneDocumentRoot(c)),
        };
    }
    return null;
}
