// 마우스(포인터) + 키보드 입력 컨트롤러
// bindApp(app)으로 CanvaApp에 연결한 뒤, 이벤트 시 app 멤버 호출

import { EShapeKind } from "./const.js";
import { Util } from "./util.js";
import { TopMenu } from "./top_menu.js";

class EditorInputController {
    static #instance = null;

    static getInstance(args) {
        if (EditorInputController.#instance === null) {
            EditorInputController.#instance = new EditorInputController(args ?? {});
        }
        return EditorInputController.#instance;
    }

    constructor(args) {
        if (EditorInputController.#instance !== null) {
            return EditorInputController.#instance;
        }

        this.canvasElement = Util.getRequiredEl("canvas");
        this.app = null;
        this.editorState = null;

        this.pointerPos = null;
        this.pointerDownPos = null;
        this.isPointerDown = false;
        this.dragStart = null;

        const toolOptionInfosCandidate = args.toolOptionInfos ?? null;
        this.toolOptionInfos = Array.isArray(toolOptionInfosCandidate) ? toolOptionInfosCandidate : [];
        this.shortcutToToolValue = new Map();
        for (const tool of this.toolOptionInfos) {
            const shortcutText = typeof tool?.shortcut === "string" ? tool.shortcut.trim() : "";
            if (shortcutText.length <= 0) {
                continue;
            }
            const key = shortcutText.toLowerCase();
            this.shortcutToToolValue.set(key, tool.value);
        }

        this.onPointerDownBound = (e) => this.onPointerDown(e);
        this.onPointerMoveBound = (e) => this.onPointerMove(e);
        this.onPointerUpBound = (e) => this.onPointerUp(e);
        this.onDoubleClickBound = (e) => this.onDoubleClick(e);
        this.onKeyDownBound = (e) => this.onKeyDown(e);

        EditorInputController.#instance = this;
    }

    bindApp(app) {
        this.app = app;
        this.editorState = app !== null ? app.getEditorState() : null;
    }

    getPointerPos() {
        return this.pointerPos;
    }

    bindEventListeners() {
        this.canvasElement.addEventListener("pointerdown", this.onPointerDownBound);
        this.canvasElement.addEventListener("pointermove", this.onPointerMoveBound);
        this.canvasElement.addEventListener("pointerup", this.onPointerUpBound);
        this.canvasElement.addEventListener("dblclick", this.onDoubleClickBound);
        window.addEventListener("keydown", this.onKeyDownBound);
    }

     unbindEventListeners() {
        this.canvasElement.removeEventListener("pointerdown", this.onPointerDownBound);
        this.canvasElement.removeEventListener("pointermove", this.onPointerMoveBound);
        this.canvasElement.removeEventListener("pointerup", this.onPointerUpBound);
        this.canvasElement.removeEventListener("dblclick", this.onDoubleClickBound);
        window.removeEventListener("keydown", this.onKeyDownBound);
    }

    /** 화면(캔버스 요소) 좌표를 월드 좌표로 변환 (viewScale, viewOffset 반영) */
    getCanvasPointFromEvent = (event) => {
        const state = this.editorState ?? this.app?.getEditorState() ?? null;
        const scale = state !== null ? Number(state.viewScale) || 1 : 1;
        const viewOffset = this.app?.getViewOffset?.() ?? { x: 0, y: 0 };
        const ox = typeof viewOffset.x === "number" ? viewOffset.x : 0;
        const oy = typeof viewOffset.y === "number" ? viewOffset.y : 0;
        const rect = this.canvasElement.getBoundingClientRect();
        return {
            x: (event.clientX - rect.left - ox) / scale,
            y: (event.clientY - rect.top - oy) / scale,
        };
    };

    // ---------- 좌표/도형 이동 ----------
    onPointerDown(e) {
        const state = this.editorState;
        const app = this.app;
        if (state === null || app === null) {
            return;
        }
        this.isPointerDown = true;
        this.pointerDownPos = this.getCanvasPointFromEvent(e);
        this.pointerPos = this.pointerDownPos;
        this.canvasElement.setPointerCapture(e.pointerId);

        const pointerDownPoint = this.pointerDownPos;
        app.onPointerDown(pointerDownPoint);

        // Select: 드래그 델타 계산용, Line/Rect/Circle 등: onPointerMove 호출해 draftShape 갱신용
        this.dragStart = pointerDownPoint;
    }

    onPointerMove(e) {
        const app = this.app;
        this.pointerPos = this.getCanvasPointFromEvent(e);

        if (!this.isPointerDown) {
            app?.render();
            return;
        }

        if (this.pointerDownPos === null || app === null) {
            return;
        }
        if (this.dragStart === null) {
            app.render();
            return;
        }

        app.onPointerMove(this.pointerPos, this.dragStart);
    }

    onPointerUp(e) {
        this.isPointerDown = false;
        this.canvasElement.releasePointerCapture(e.pointerId);

        if (this.app) {
            this.app.onPointerUp(this.pointerPos);
        }

        if (this.dragStart) {
            this.dragStart = null;
        }
    }

    onDoubleClick(e) {
        e.preventDefault();

        if (this.app) {
            app.onDoubleClick();
        }
    }

    onKeyDown(e) {
        const state = this.editorState;
        const app = this.app;
        const key = e.key.toLowerCase();

        if ((e.ctrlKey || e.metaKey) && key === "z") {
            e.preventDefault();
            app?.undo();
            return;
        }

        if (key === "delete" || key === "backspace") {
            if (state?.currentToolMode === EShapeKind.Select) {
                app?.deleteSelected();
            }
            return;
        }

        if (key === "enter" && state?.currentToolMode === EShapeKind.Polygon) {
            app?.finalizePolygon();
            return;
        }

        const toolValue = this.shortcutToToolValue.get(key) ?? null;
        if (toolValue !== null) {
            TopMenu.getInstance().setTool(toolValue);
        }
    }
}

export { EditorInputController };
