# StyleNode (서버)

Preview **Style Nodes** 페이지(`/preview`)와 문서 **저장·로드 API**를 이 패키지에서 관리한다.

## 경로

| 항목 | 위치 |
|------|------|
| 블루프린트 | `routes.py` (`style_node_bp`) |
| 저장 파일 | 프로젝트 루트 `data/StyleNode/{uuid}.json` |

## API

- `POST /api/style-node/save` — 요청 body: JSON 객체 → 새 UUID 파일로 저장, 응답 `{ "id": "<uuid>" }`
- `GET /api/style-node/load/<doc_id>` — 해당 id의 JSON 반환 (없으면 404)

프론트에서는 Preview 페이지 상단 툴바 **서버** 그룹의 **서버 저장** / **불러오기** 버튼으로 호출한다. 파일은 `data/StyleNode/{uuid}.json` 에 저장된다.

I/O는 시작·종료·실패 시 로그를 남긴다.

## 원점 규칙 (그룹 로컬 좌표, **옵션 B**)

- 그룹에 **첫 자식**이 들어올 때: 그 자식 **월드 AABB 좌상단**을 그룹 원점에 맞추고, 해당 자식 기하를 로컬로 정규화한다.
- **옵션 B**: 기준 도형 삭제·변경 후 **남은 자식들**을 기준으로 그룹 원점·로컬 좌표를 **재계산**한다 (구체 알고리즘은 프론트 `static/js/StyleNode`에서 구현).

## 앱 등록

`server/app.py`에서 `style_node_bp`를 등록한다. 블루프린트를 추가·제거할 때 이 파일과 `routes.py`를 함께 유지한다.
