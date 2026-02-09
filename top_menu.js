// 상단 메뉴(툴 선택, 선 두께, 줌, 되돌리기, 전체 삭제) 전용 클래스
// bindApp(app)으로 CanvaApp에 연결한 뒤, 이벤트 시 app 멤버 호출

import { EShapeKind, ShapeMenuList, ToolbarGroupInfos } from "./const.js";
import { Util } from "./util.js";

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

        this.app = null;
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

    bindApp(app) {
        this.app = app;
    }

    setTool(tool) {
        if (this.app === null) {
            return;
        }
        this.app.setTool(tool);
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

    bindEventListeners() {
        const state = this.app !== null ? this.app.getState() : null;
        state ?? console.warn("[TopMenu] bindEventListeners: app가 바인드되지 않았습니다.");
        if (state !== null) {
            this.lineWidthOutEl.value = String(this.lineWidthEl.value);
            this.zoomValueOutEl.value = `${Math.round(state.viewScale * 100)}%`;
        }

        this.toolSelectEl.addEventListener("change", () => {
            this.setTool(this.toolSelectEl.value);
        });

        this.lineWidthEl.addEventListener("input", () => {
            this.lineWidthOutEl.value = String(this.lineWidthEl.value);
            if (this.app !== null) {
                this.app.render();
            }
        });

        this.zoomOutBtnEl.addEventListener("click", () => {
            if (this.app === null) {
                return;
            }
            const state = this.app.getState();
            const nextScale = Util.clamp(Number(state.viewScale) / 1.1, 0.2, 4);
            state.viewScale = Math.round(nextScale * 100) / 100;
            this.zoomValueOutEl.value = `${Math.round(state.viewScale * 100)}%`;
            this.app.render();
        });

        this.zoomInBtnEl.addEventListener("click", () => {
            if (this.app === null) {
                return;
            }
            const state = this.app.getState();
            const nextScale = Util.clamp(Number(state.viewScale) * 1.1, 0.2, 4);
            state.viewScale = Math.round(nextScale * 100) / 100;
            this.zoomValueOutEl.value = `${Math.round(state.viewScale * 100)}%`;
            this.app.render();
        });

        this.undoBtnEl.addEventListener("click", () => {
            if (this.app !== null) {
                this.app.undo();
            }
        });

        this.clearBtnEl.addEventListener("click", () => {
            if (this.app !== null) {
                this.app.clearAll();
            }
        });
    }
}

export { TopMenu };
