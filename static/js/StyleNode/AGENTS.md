# StyleNode (프론트)

`/create-style-node` 페이지 전용 바닐라 JS(ES 모듈). 캔버스·도형·툴바·세션 저장 로직이 여기 모인다.

## 레이아웃

| 역할 | 파일 |
|------|------|
| 엔트리 | `app.js` |
| 상수·툴바 정의 | `const.js` |
| 도형 클래스 | `shapes.js` |
| 객체/포인터 | `object_manager.js` |
| 렌더·팬줌 | `canvas_renderer.js` |
| 상단 툴바 | `top_menu.js` |
| 키보드 | `editor_input_controller.js` |
| sessionStorage 스냅샷 | `preview_session_store.js` |
| 도형 ↔ JSON | `shape_snapshot.js` |
| 바운딩 박스 | `shape_bounds.js` |
| 계층 트리·디테일 패널 | `hierarchy_detail_ui.js` |
| 그룹/리프 문서 트리 | `style_node_tree.js` |
| 트리 JSON 직렬화 | `shape_tree_snapshot.js` |
| 서버 저장·로드 API 호출 | `style_node_server_io.js` |

공용 유틸은 상위 폴더 `static/js/util.js` — import 시 `../util.js` 로 참조한다.

## 원점 규칙 (그룹 로컬 좌표, **옵션 B**)

- 그룹 **첫 자식** 배치 시: 그 자식의 **바운딩 박스 좌상단**을 그룹 로컬 `(0,0)` 에 둔다.
- **옵션 B**: 기준에 해당하는 자식이 사라지거나 구조가 바뀌면, **남은 자식들의 월드 기하**로 그룹 원점과 각 요소의 **로컬 좌표를 다시 맞춘다** (재계산 시점·합동 변환 규칙은 구현 시 이 문서에 보강).

## 서버 연동

문서 저장·로드는 `server/StyleNode/routes.py` 의 API와 맞출 것:

- `POST /api/style-node/save`
- `GET /api/style-node/load/<id>`

## 코딩 메모

- 프로젝트 루트 `AGENTS.md` 의 공통 규칙(주석 한글, I/O 로그 등)을 따른다.
