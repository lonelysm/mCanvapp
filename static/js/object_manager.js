// 도형 목록(displayShapes)과 작업 이력(taskHistories) 관리
// 외부 데이터(CSV/JSON)와 shape 매칭·관리는 추후 확장

const TASK_HISTORY_MAX = 50;

class ObjectManagerClass {
    constructor() {
        this.shapes = [];
        this.taskHistories = [];
    }

    /** 현재 도형 목록 참조 반환 (배열 자체를 반환) */
    getShapes() {
        return this.shapes;
    }

    /** 도형 목록을 주어진 배열로 교체 */
    setShapes(newShapes) {
        this.shapes = Array.isArray(newShapes) ? newShapes : [];
    }

    /** 도형 한 개 추가 */
    addShape(shape) {
        if (shape != null) {
            this.shapes.push(shape);
        }
    }

    /** id에 해당하는 도형의 인덱스 반환, 없으면 -1 */
    findIndexById(id) {
        return this.shapes.findIndex((s) => s.id === id);
    }

    /** 지정 인덱스의 도형을 새 인스턴스로 교체 */
    replaceShapeAtIndex(index, shape) {
        if (index >= 0 && index < this.shapes.length && shape != null) {
            this.shapes[index] = shape;
        }
    }

    /** 지정 인덱스의 도형 제거 */
    removeShapeAtIndex(index) {
        if (index >= 0 && index < this.shapes.length) {
            this.shapes.splice(index, 1);
        }
    }

    /** 현재 상태 스냅샷을 taskHistories에 추가 (snapshot 없으면 현재 shapes clone) */
    pushTaskHistory(snapshot) {
        const toPush = snapshot ?? this.shapes.map((s) => s.clone());
        this.taskHistories.push(toPush);
        if (this.taskHistories.length > TASK_HISTORY_MAX) {
            this.taskHistories.shift();
        }
    }

    /** 이전 작업 상태로 복원. 복원했으면 true, 이력 없으면 false */
    restoreFromHistory() {
        const prev = this.taskHistories.pop();
        if (prev == null) {
            return false;
        }
        this.setShapes(prev);
        return true;
    }

    /** 현재 상태를 이력에 넣고 도형 목록 비우기 */
    clear() {
        this.pushTaskHistory();
        this.setShapes([]);
    }

    /**
     * 포인터 위치에서 맨 위(나중에 그린) 도형 하나 반환.
     * 없으면 null. 톨러런스는 도형별 lineWidth 기반 계산.
     */
    pickShape(pointerPoint) {
        for (let i = this.shapes.length - 1; i >= 0; i--) {
            const shape = this.shapes[i];
            const tolerance = Math.max(6, (shape.style?.lineWidth ?? 3) + 6);
            if (shape.hitTest(pointerPoint, tolerance)) {
                return shape;
            }
        }
        return null;
    }
}

export { ObjectManagerClass };
