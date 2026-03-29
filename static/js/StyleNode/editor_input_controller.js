// 키보드 입력만 담당 (Undo, Delete, Enter, 툴 단축키). 포인터/휠은 Renderer·ObjectManager가 직접 바인드

import { EShapeKind } from "./const.js";
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

        const toolOptionInfosCandidate = args.toolOptionInfos ?? null;
        this.toolOptionInfos = Array.isArray(toolOptionInfosCandidate) ? toolOptionInfosCandidate : [];
        this.shortcutToToolValue = new Map();
        for (const tool of this.toolOptionInfos) {
            const shortcutText = typeof tool?.shortcut === "string" ? tool.shortcut.trim() : "";
            if (shortcutText.length <= 0) continue;
            this.shortcutToToolValue.set(shortcutText.toLowerCase(), tool.value);
        }

        this.objectManager = null;
        this.onKeyDownBound = (e) => this.onKeyDown(e);

        EditorInputController.#instance = this;
    }

    /**
     * 텍스트 입력·선택 UI에 포커스가 있으면 true. 이 경우 Delete/Backspace는 캔버스 삭제에 쓰지 않는다.
     * @param {EventTarget | null} target
     */
    _isTypingInEditableField(target) {
        if (target === null || target === undefined) return false;
        const el = /** @type {HTMLElement} */ (target);
        if (typeof el.isContentEditable === "boolean" && el.isContentEditable) return true;
        const tag = el.tagName !== undefined ? String(el.tagName).toLowerCase() : "";
        if (tag === "textarea") return true;
        if (tag === "select") return true;
        if (tag === "input") {
            const inputEl = /** @type {HTMLInputElement} */ (el);
            const type = (inputEl.type ?? "text").toLowerCase();
            const nonTextTypes = ["button", "checkbox", "radio", "submit", "reset", "file", "hidden", "range", "color", "image"];
            return !nonTextTypes.includes(type);
        }
        return false;
    }

    bindObjectManager(objectManager) {
        this.objectManager = objectManager;
    }

    bindEventListeners() {
        window.addEventListener("keydown", this.onKeyDownBound);
    }

    unbindEventListeners() {
        window.removeEventListener("keydown", this.onKeyDownBound);
    }

    onKeyDown(e) {
        const om = this.objectManager;
        if (om === null) return;

        const key = e.key.toLowerCase();

        if ((e.ctrlKey || e.metaKey) && key === "z") {
            e.preventDefault();
            om.undo();
            return;
        }

        if (key === "delete" || key === "backspace") {
            if (this._isTypingInEditableField(e.target)) {
                return;
            }
            if (om.getCurrentToolMode() === EShapeKind.Select) {
                om.deleteSelected();
            }
            return;
        }

        if (key === "enter" && om.getCurrentToolMode() === EShapeKind.Polygon) {
            om.finalizePolygon();
            return;
        }

        const toolValue = this.shortcutToToolValue.get(key) ?? null;
        if (toolValue !== null) {
            TopMenu.getInstance().setTool(toolValue);
        }
    }
}

export { EditorInputController };
