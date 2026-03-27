// 상단 메뉴(툴 선택, 선 두께, 줌, 되돌리기, 전체 삭제) 전용 클래스
// 싱글턴(ObjectManager/Renderer) 직접 참조로 이벤트 처리

import { EShapeKind, ShapeMenuList, ToolbarGroupInfos } from "./const.js";
import { Util } from "./util.js";
import { CanvasRenderer } from "./canvas_renderer.js";
import { ObjectManagerClass } from "./object_manager.js";

class TopMenu {
    static #instance = null;

    static getInstance(args) {
        if (TopMenu.#instance === null) {
            TopMenu.#instance = new TopMenu(args ?? {});
        }
        return TopMenu.#instance;
    }

    constructor(args) {
        if (TopMenu.#instance !== null) {
            return TopMenu.#instance;
        }

        this.renderer = CanvasRenderer.getInstance();
        const toolOptionInfosCandidate = args.toolOptionInfos ?? null;
        this.toolOptionInfos = Array.isArray(toolOptionInfosCandidate) ? toolOptionInfosCandidate : [...ShapeMenuList];

        const toolbarContainerEl = Util.getRequiredEl("toolbarContainer");
        this.buildToolbar(toolbarContainerEl);

        this.toolSelectEl = Util.getRequiredEl("toolSelect");
        this.lineWidthEl = Util.getRequiredEl("lineWidth");
        this.lineWidthOutEl = Util.getRequiredEl("lineWidthOut");
        this.zoomOutBtnEl = Util.getRequiredEl("zoomOutBtn");
        this.zoomInBtnEl = Util.getRequiredEl("zoomInBtn");
        this.zoomValueOutEl = Util.getRequiredEl("zoomValueOut");
        this.undoBtnEl = Util.getRequiredEl("undoBtn");
        this.clearBtnEl = Util.getRequiredEl("clearBtn");

        TopMenu.#instance = this;
    }

    /**
     * ToolbarGroupInfos for문으로 툴바 DOM 동적 생성 (mAutoTrader 템플릿 for문과 동일한 방식).
     */
    buildToolbar(containerEl) {
        containerEl.innerHTML = "";
        for (const groupInfo of ToolbarGroupInfos) {
            const wrapperTag = groupInfo.wrapperTag ?? "label";
            const wrapperDescriptor = {
                tag: wrapperTag,
                className: "toolbar__group",
                children: [],
            };
            if (groupInfo.role !== undefined) {
                wrapperDescriptor.role = groupInfo.role;
            }
            if (groupInfo.ariaLabel !== undefined) {
                wrapperDescriptor.ariaLabel = groupInfo.ariaLabel;
            }
            if (typeof groupInfo.label === "string") {
                wrapperDescriptor.children.push({
                    tag: "span",
                    className: "toolbar__label",
                    textContent: groupInfo.label,
                });
            }
            const controls = groupInfo.controls ?? [];
            for (const controlDesc of controls) {
                const desc = { ...controlDesc };
                wrapperDescriptor.children.push(desc);
            }
            const wrapperEl = Util.createElement(wrapperDescriptor);
            containerEl.appendChild(wrapperEl);
        }
    }

    setTool(tool) {
        const objectManager = ObjectManagerClass.getInstance();
        objectManager.setTool(tool);
        this.renderer.requestRender();
        this.toolSelectEl.value = tool;
    }

    createToolSelectOptions(inTools) {
        const tools = Array.isArray(inTools) ? inTools : this.toolOptionInfos;
        this.toolSelectEl.innerHTML = "";
        for (const tool of tools) {
            const option = document.createElement("option");
            option.value = tool.value;
            option.textContent = tool.shortcut ? `${tool.display} (${tool.shortcut})` : tool.display;
            this.toolSelectEl.appendChild(option);
        }
    }

    getDefaultToolValue(inTools) {
        const tools = Array.isArray(inTools) ? inTools : this.toolOptionInfos;
        const defaultTool = tools.find((t) => t && t.isDefault) ?? null;
        if (defaultTool !== null) {
            return defaultTool.value;
        }
        const firstTool = tools[0] ?? null;
        if (firstTool !== null) {
            return firstTool.value;
        }
        return EShapeKind.Line;
    }

    /** 렌더러 viewScale을 zoomValueOut에 반영 (휠/버튼 줌 등 스케일 변경 시 호출) */
    syncZoomValueOut() {
        const scale = Number(this.renderer.getViewScale()) || 1;
        this.zoomValueOutEl.value = `${Math.round(scale * 100)}%`;
    }

    bindEventListeners() {
        this.lineWidthOutEl.value = String(this.lineWidthEl.value);
        this.zoomValueOutEl.value = `${Math.round((this.renderer.getViewScale?.() ?? 1) * 100)}%`;

        this.toolSelectEl.addEventListener("change", () => {
            this.setTool(this.toolSelectEl.value);
        });

        this.lineWidthEl.addEventListener("input", () => {
            this.lineWidthOutEl.value = String(this.lineWidthEl.value);
            if (this.renderer !== null) {
                this.renderer.requestRender();
            }
        });

        this.zoomOutBtnEl.addEventListener("click", () => {
            if (this.renderer !== null) {
                this.renderer.zoomOut();
            }
        });

        this.zoomInBtnEl.addEventListener("click", () => {
            if (this.renderer !== null) {
                this.renderer.zoomIn();
            }
        });

        this.undoBtnEl.addEventListener("click", () => {
            ObjectManagerClass.getInstance().undo();
        });

        this.clearBtnEl.addEventListener("click", () => {
            ObjectManagerClass.getInstance().clearAll();
        });
    }
}

export { TopMenu };
