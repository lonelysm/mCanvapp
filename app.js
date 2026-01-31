window.Util ?? console.error("[init] Util을 찾지 못했습니다. index.html에서 util.js 로드 순서를 확인하세요.");
if (window.Util === undefined) {
    throw new Error("Util이 없어 실행할 수 없습니다.");
}

window.EShapeKind ??
    console.error("[init] EShapeKind를 찾지 못했습니다. index.html에서 const.js 로드 순서를 확인하세요.");
if (window.EShapeKind === undefined) {
    throw new Error("EShapeKind가 없어 실행할 수 없습니다.");
}

window.EToolValue ??
    console.error("[init] EToolValue를 찾지 못했습니다. index.html에서 const.js 로드 순서를 확인하세요.");
if (window.EToolValue === undefined) {
    throw new Error("EToolValue가 없어 실행할 수 없습니다.");
}

window.tools ??
    console.error("[init] tools를 찾지 못했습니다. index.html에서 const.js 로드 순서를 확인하세요.");
if (window.tools === undefined) {
    throw new Error("tools가 없어 실행할 수 없습니다.");
}

function initShapeStyle() {
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

// ---------- DOM ----------

const canvasEl = Util.getRequiredEl("canvas");
const hudEl = Util.getRequiredEl("hud");
const toolSelectEl = Util.getRequiredEl("toolSelect");
const lineWidthEl = Util.getRequiredEl("lineWidth");
const lineWidthOutEl = Util.getRequiredEl("lineWidthOut");
const zoomOutBtnEl = Util.getRequiredEl("zoomOutBtn");
const zoomInBtnEl = Util.getRequiredEl("zoomInBtn");
const zoomValueOutEl = Util.getRequiredEl("zoomValueOut");
const undoBtnEl = Util.getRequiredEl("undoBtn");
const clearBtnEl = Util.getRequiredEl("clearBtn");
const shapeListEl = Util.getRequiredEl("shapeList");

const toolOptionInfos = Array.isArray(window.tools) ? window.tools : [];

//--------------------------------------------------
// Get Object Instance
//--------------------------------------------------
const EditorInputControllerCtor = window.EditorInputController ?? null;
EditorInputControllerCtor ??
    console.error("[init] EditorInputController를 찾지 못했습니다. index.html에서 editor_input_controller.js 로드 순서를 확인하세요.");
if (EditorInputControllerCtor === null) {
    throw new Error("EditorInputController가 없어 실행할 수 없습니다.");
}

const CanvasRendererCtor = window.CanvasRenderer ?? null;
CanvasRendererCtor ??
    console.error("[init] CanvasRenderer를 찾지 못했습니다. index.html에서 canvas_renderer.js 로드 순서를 확인하세요.");
if (CanvasRendererCtor === null) {
    throw new Error("CanvasRenderer가 없어 실행할 수 없습니다.");
}

const renderer = CanvasRendererCtor.getInstance({ gridStep: 32 });

// ---------- 상태 ----------

const editorState = {
    currentTool: "line",
    shapes: [],
    undoStack: [],
    selectedId: null,

    viewScale: 1,

    isPointerDown: false,
    pointerDownPos: null,
    pointerPos: null,

    draftShape: null,
    draftPolygon: null,

    dragStart: null,
    dragShapesSnapshot: null, // 드래그 시작 시 전체 스냅샷
    dragOriginal: new Map(), // 선택된 1개 도형의 원본
};

// ---------- 렌더 ----------

function render() {
    renderer.render({
        shapes: editorState.shapes,
        draftShape: editorState.draftShape,
        draftPolygon: editorState.draftPolygon,
        selectedId: editorState.selectedId,
        pointerPos: editorState.pointerPos,
        currentTool: editorState.currentTool,
        viewScale: editorState.viewScale,
    });
    renderShapeList();
}

function renderShapeList() {
    const items = editorState.shapes
        .slice()
        .reverse()
        .map((s, idxFromEnd) => {
            const idx = editorState.shapes.length - 1 - idxFromEnd;
            const title = `${idx + 1}. ${shapeLabel(s)}`;
            const sub = shapeSub(s);
            const selected = editorState.selectedId === s.id;
            const swatch = s.style.stroke;
            return { id: s.id, title, sub, selected, swatch };
        });

    shapeListEl.innerHTML = "";
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
            editorState.selectedId = it.id;
            setTool(window.EToolValue.Select);
        });

        shapeListEl.appendChild(div);
    }
}

function shapeLabel(shape) {
    return shape.displayName ?? "도형";
}

function shapeSub(shape) {
    return shape.getSubLabel ? shape.getSubLabel() : "";
}

// ---------- 좌표/히트테스트 ----------

function hitTest(shape, pointerPoint) {
    const tolerance = Math.max(6, shape.style.lineWidth + 6);
    return shape.hitTest(pointerPoint, tolerance);
}

function pickShape(pointerPoint) {
    // 상단(나중에 그린 것) 우선
    for (let shapeIndex = editorState.shapes.length - 1; shapeIndex >= 0; shapeIndex--) {
        const shape = editorState.shapes[shapeIndex];
        if (hitTest(shape, pointerPoint)) {
            return shape;
        }
    }
    return null;
}

// ---------- 상태 변경 ----------

function setTool(tool) {
    editorState.currentTool = tool;
    toolSelectEl.value = tool;
    if (editorState.draftPolygon !== null && tool !== EShapeKind.Polygon) {
        finalizePolygon();
    }
    render();
}

function applyToolSelectOptions(inTools) {
    toolSelectEl.innerHTML = "";
    for (const tool of inTools) {
        const option = document.createElement("option");
        option.value = tool.value;
        option.textContent = tool.shortcut ? `${tool.display} (${tool.shortcut})` : tool.display;
        toolSelectEl.appendChild(option);
    }
}

function getDefaultToolValue(inTools) {
    const defaultTool = inTools.find((t) => t && t.isDefault) ?? null;
    if (defaultTool) {
        return defaultTool.value;
    }

    const firstTool = inTools[0] ?? null;
    if (firstTool) {
        return firstTool.value;
    }

    return EShapeKind.Line;
}

function pushUndoSnapshot(snapshot) {
    editorState.undoStack.push(snapshot ?? editorState.shapes.map((s) => s.clone()));
    if (editorState.undoStack.length > 50) {
        editorState.undoStack.shift();
    }
}

function undo() {
    const prev = editorState.undoStack.pop();
    if (!prev) {
        return;
    }
    editorState.shapes = prev;
    editorState.selectedId = null;
    editorState.draftShape = null;
    editorState.draftPolygon = null;
    render();
}

function clearAll() {
    pushUndoSnapshot();
    editorState.shapes = [];
    editorState.selectedId = null;
    editorState.draftShape = null;
    editorState.draftPolygon = null;
    render();
}

function addShape(s) {
    pushUndoSnapshot();
    editorState.shapes.push(s);
    editorState.selectedId = s.id;
    render();
}

function deleteSelected() {
    if (editorState.selectedId === null) {
        return;
    }
    const idx = editorState.shapes.findIndex((s) => s.id === editorState.selectedId);
    if (idx < 0) {
        return;
    }
    pushUndoSnapshot();
    editorState.shapes.splice(idx, 1);
    editorState.selectedId = null;
    render();
}

function finalizePolygon() {
    if (editorState.draftPolygon === null) {
        return;
    }
    if (editorState.draftPolygon.points.length >= 3) {
        pushUndoSnapshot();
        const draft = editorState.draftPolygon;
        const final = new window.PolygonShape({
            id: draft.id,
            points: draft.points.map((p) => ({ ...p })),
            isClosed: true,
            style: draft.style,
        });
        editorState.shapes.push(final);
        editorState.selectedId = final.id;
    }
    editorState.draftPolygon = null;
    render();
}

function isDraftValid(shape) {
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

function moveShape(shape, deltaX, deltaY) {
    return shape.translate(deltaX, deltaY);
}

// ---------- 바인딩 ----------

function bindEventListeners() {
    lineWidthOutEl.value = String(lineWidthEl.value);
    zoomValueOutEl.value = `${Math.round(editorState.viewScale * 100)}%`;

    toolSelectEl.addEventListener("change", () => {
        setTool(toolSelectEl.value);
    });

    lineWidthEl.addEventListener("input", () => {
        lineWidthOutEl.value = String(lineWidthEl.value);
        render();
    });

    zoomOutBtnEl.addEventListener("click", () => {
        const nextScale = Util.clamp(Number(editorState.viewScale) / 1.1, 0.2, 4);
        editorState.viewScale = Math.round(nextScale * 100) / 100;
        zoomValueOutEl.value = `${Math.round(editorState.viewScale * 100)}%`;
        render();
    });

    zoomInBtnEl.addEventListener("click", () => {
        const nextScale = Util.clamp(Number(editorState.viewScale) * 1.1, 0.2, 4);
        editorState.viewScale = Math.round(nextScale * 100) / 100;
        zoomValueOutEl.value = `${Math.round(editorState.viewScale * 100)}%`;
        render();
    });

    undoBtnEl.addEventListener("click", () => undo());
    clearBtnEl.addEventListener("click", () => clearAll());
}

// ---------- 초기 데이터 ----------

function seed() {
    const style1 = { stroke: "#2f6df6", lineWidth: 3, fillEnabled: true, fill: "rgba(47,109,246,0.20)" };
    const style2 = { stroke: "#32d583", lineWidth: 4, fillEnabled: true, fill: "rgba(50,213,131,0.20)" };
    const style3 = { stroke: "#ffb020", lineWidth: 3, fillEnabled: false, fill: "rgba(0,0,0,0)" };

    editorState.shapes.push(
        new window.RectShape({
            id: Util.uid("rc"),
            start: { x: 120, y: 100 },
            end: { x: 420, y: 280 },
            style: style1,
        })
    );
    editorState.shapes.push(
        new window.CircleShape({
            id: Util.uid("ci"),
            center: { x: 650, y: 220 },
            radius: 90,
            style: style2,
        })
    );
    editorState.shapes.push(
        new window.LineShape({
            id: Util.uid("ln"),
            start: { x: 160, y: 420 },
            end: { x: 520, y: 540 },
            style: style3,
        })
    );
    editorState.shapes.push(
        new window.PointShape({
            id: Util.uid("pt"),
            position: { x: 820, y: 420 },
            radius: 6,
            style: { ...style3, stroke: "#ff4d4d" },
        })
    );
    editorState.shapes.push(
        new window.PolygonShape({
            id: Util.uid("poly"),
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

function main() {
        // 툴 옵션 설정
        applyToolSelectOptions(toolOptionInfos);
        const defaultToolValue = getDefaultToolValue(toolOptionInfos);

        editorState.currentTool = defaultToolValue;
        toolSelectEl.value = defaultToolValue;

        // 이벤트 리스너 바인딩
        bindEventListeners();

        const editorService = {
                initShapeStyle,
                render,
                setTool,
                pickShape,
                addShape,
                moveShape,
                finalizePolygon,
                deleteSelected,
                undo,
                pushUndoSnapshot,
                isDraftValid,
                uid: Util.uid,
        };

        const inputController = EditorInputControllerCtor.getInstance({
                state: editorState,
                toolOptionInfos,
                service: editorService,
        });
        inputController.attach();

        seed();
        render();
        window.addEventListener("resize", () => render());
}

main();

