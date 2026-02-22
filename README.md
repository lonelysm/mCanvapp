# mCanvapp

JSON·CSV 등 외부 데이터를 캔버스에서 테이블·UML·노드 등으로 시각화하고, 캔버스 내용을 다시 데이터로 익스포트하는 도구.  
백엔드 Flask, 프론트 Jinja2 + 바닐라 JS(ES 모듈). 자세한 원칙은 [AGENTS.md](AGENTS.md) 참고.

## 실행

- **Flask 서버로 실행**합니다. ES 모듈은 `file://`에서 CORS로 차단되며, 정적 자원은 Flask가 서빙합니다.
- 방법 1: `serve.bat` 더블클릭 후 브라우저에서 **http://127.0.0.1:5000** 접속
- 방법 2: 터미널에서 프로젝트 루트로 이동 후  
  `set FLASK_APP=server.app` (Windows) 또는 `export FLASK_APP=server.app` (Linux/macOS)  
  그 다음 `python -m flask run --host=127.0.0.1 --port=5000`
- 의존성: `pip install -r requirements.txt`

## 구성

- **server/app.py**: Flask 앱, `GET /`, `POST /api/import`, `POST /api/export` (스켈레톤 포함)
- **templates/index.html**: Jinja2 메인 페이지 (초기 데이터 주입용 변수 확장 가능)
- **static/css/style.css**: UI 스타일
- **static/js/**: 캔버스·도형·입력·메뉴 로직
  - **const.js**: 공용 상수(EShapeKind, ShapeMenuList, ToolbarGroupInfos)
  - **util.js**: 공용 유틸(Util)
  - **app.js**: CanvaApp 상태/초기화
  - **editor_input_controller.js**: 마우스/키보드 입력
  - **canvas_renderer.js**: 캔버스 렌더링
  - **top_menu.js**: 툴바/줌/되돌리기
  - **shapes.js**: 도형 클래스(Point, Line, Circle, Rect, Polygon, Freehand)

## API (스켈레톤)

- **POST /api/import**: `file` 멀티파트로 업로드. 서버에서 CSV/JSON 파싱 후 중간 구조를 JSON으로 반환(추후 구현).
- **POST /api/export**: JSON body로 캔버스 상태(노드, 테이블, 연결 등) 전달. 서버에서 JSON/CSV 등으로 저장(추후 구현).  
  요청/응답 형식은 [API.md](API.md) 참고.
