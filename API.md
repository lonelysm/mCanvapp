# API 데이터 형식 (스켈레톤 기준)

AGENTS.md 데이터 흐름에 맞춘 임포트/익스포트 API의 요청·응답 형식입니다.  
실제 파싱·저장 로직은 추후 구현합니다.

## POST /api/import

- **요청**: `multipart/form-data`, 필드명 `file` (CSV 또는 JSON 파일).
- **응답(성공)**: JSON. 서버가 파싱한 **중간 구조**(리스트/딕셔너리)를 그대로 반환.
  - 예: `{ "rows": [ ["col1", "col2"], ["a", "b"] ], "filename": "data.csv" }`
  - 프론트(JS)는 이 데이터를 받아 테이블/UML/노드 뷰로 렌더링.
- **응답(실패)**: `400`/`500` + `{ "error": "메시지" }`.

## POST /api/export

- **요청**: JSON body. JS가 캔버스 상태를 구조화한 객체.
  - 예: `{ "viewMode": "table"|"uml"|"nodes", "shapes": [ ... ], "connections": [ ... ] }`
  - 구체 필드는 뷰 모드별로 확장.
- **응답(성공)**: `{ "ok": true, "saved_path": "..." }` 또는 파일 다운로드 처리(추후).
- **응답(실패)**: `400`/`500` + `{ "error": "메시지" }`.

현재 서버는 스켈레톤만 구현되어 있으며, `/api/import`는 raw 미리보기, `/api/export`는 수신 키 목록만 반환합니다.
