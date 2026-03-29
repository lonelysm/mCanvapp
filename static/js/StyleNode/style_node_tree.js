// StyleNode 계층: 그룹(중첩) + 리프(도형). 리프 기하는 부모 그룹 로컬 좌표.

import { Util } from "../util.js";
import { getShapeBoundingBox } from "./shape_bounds.js";

export const NodeType = {
    GROUP: "group",
    LEAF: "leaf",
};

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
 * @param {{ id?: string, shape: import("./shapes.js").BaseShape }} options
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
    };
}

/**
 * id로 노드와 부모 그룹·인덱스를 찾는다.
 * @returns {{ node: object, parent: object | null, index: number } | null}
 */
export function findNodeWithParent(root, id) {
    if (root === null || root === undefined || id === null || id === undefined) {
        return null;
    }
    if (root.id === id) {
        return { node: root, parent: null, index: -1 };
    }
    if (root.nodeType !== NodeType.GROUP) {
        return null;
    }
    for (let i = 0; i < root.children.length; i++) {
        const ch = root.children[i];
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
    if (root.id === groupId) {
        return { x: ox + root.transform.x, y: oy + root.transform.y };
    }
    if (root.nodeType !== NodeType.GROUP) return null;
    const gx = ox + root.transform.x;
    const gy = oy + root.transform.y;
    for (const ch of root.children) {
        const r = getGroupContentWorldOrigin(ch, groupId, gx, gy);
        if (r !== null) return r;
    }
    return null;
}

/** 깊이 우선으로 리프 노드를 순서대로 나열한다. */
export function collectLeafNodes(node, out) {
    if (node === null || node === undefined) return;
    if (node.nodeType === NodeType.LEAF) {
        out.push(node);
        return;
    }
    if (node.nodeType === NodeType.GROUP) {
        for (const ch of node.children) {
            collectLeafNodes(ch, out);
        }
    }
}

/** 리프의 shape만 순서대로 (렌더·히트·HUD용) */
export function flattenShapesInPaintOrder(root) {
    const leaves = [];
    collectLeafNodes(root, leaves);
    return leaves.map((n) => n.shape);
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
        if (ch.nodeType === NodeType.LEAF) {
            const b = getShapeBoundingBox(ch.shape);
            if (b !== null) {
                merge({
                    minX: b.minX + gx,
                    minY: b.minY + gy,
                    maxX: b.maxX + gx,
                    maxY: b.maxY + gy,
                });
            }
        } else if (ch.nodeType === NodeType.GROUP) {
            const sub = getGroupWorldBounds(ch, gx, gy);
            if (sub !== null) merge(sub);
        }
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
 * @returns {{ kind: "leaf" | "group", node: object } | null}
 */
export function pickNodeAtWorld(worldX, worldY, node, ox, oy, documentRoot) {
    if (node === null || node === undefined) return null;
    if (node.nodeType === NodeType.LEAF) {
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
export function getAccumulatedOffsetForLeaf(root, leafShapeId, ox = 0, oy = 0) {
    if (root === null || root === undefined) return null;
    if (root.nodeType === NodeType.LEAF && (root.id === leafShapeId || root.shape.id === leafShapeId)) {
        return { x: ox, y: oy };
    }
    if (root.nodeType === NodeType.GROUP) {
        const gx = ox + root.transform.x;
        const gy = oy + root.transform.y;
        for (const ch of root.children) {
            const r = getAccumulatedOffsetForLeaf(ch, leafShapeId, gx, gy);
            if (r !== null) return r;
        }
    }
    return null;
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
    if (root.nodeType !== NodeType.GROUP) return null;
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
        const po = getGroupWorldOrigin(root, parent.id);
        if (po === null) return null;
        ox = po.x;
        oy = po.y;
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
