# WorldTableGames · 3D Gomoku

Godot 4 / GDScript로 만든 로컬 2인용 3D 오목. 첫 게임인 오목을 독립 폴더에 두어 향후 다른 보드게임을 추가할 수 있게 구성했습니다.

## 실행

Godot **4.6.3 stable 일반 버전**을 권장합니다. C#/.NET은 필요 없습니다.
Godot 프로젝트 관리자에서 `project.godot`를 가져온 뒤 F6 대신 **F5**로 전체 게임을 실행하세요.

```bash
# Codex Cloud에 설치된 래퍼를 사용하는 경우
export PATH=/workspace/godot-cloud/bin:$PATH
cd /workspace/hightech-boardgame
godot --path .
```

화면 없는 클라우드에서 시작만 검사하려면:

```bash
godot --headless --path . --editor --import
godot --headless --path . --quit-after 120
```

## 플레이와 규칙

- 흑 선공, 백과 번갈아 빈 교차점을 클릭하거나 터치합니다.
- 15×15, 금수 없는 자유룰입니다. 가로·세로·양 대각선으로 **5개 이상** 연속이면 승리합니다. 장목도 승리입니다.
- 225칸이 차고 승자가 없으면 무승부입니다. 승리 판정이 무승부 판정보다 우선합니다.
- 착수 애니메이션 중에는 다음 입력을 잠시 막습니다. 금색 점은 마지막 착수, 금빛 돌은 승리한 줄을 표시합니다.
- `New game`으로 언제든 즉시 재시작할 수 있습니다.

## 구조

```text
games/gomoku/rules/gomoku_rules.gd        순수 규칙/상태, SceneTree 없이 동작
games/gomoku/presentation/gomoku_table.gd 카메라, 메시, UI, 입력, 애니메이션
scenes/gomoku.tscn                       실제 실행 씬
shaders/walnut.gdshader                  외부 텍스처 없는 원목 셰이더
tests/run_tests.gd                       규칙 및 실제 씬 통합 검사
```

규칙 모델은 입력의 유효성을 검사하고 신호로 착수/종료를 알립니다. 화면은 모델을 읽어 메시와 UI를 갱신합니다. 원목판, 인레이, 흑백 돌은 Godot 메시로 생성하므로 외부 모델·에셋·라이선스 의존성이 없습니다. 다른 게임은 `games/<game>/rules`, `presentation` 구조로 추가하고 오목 규칙을 재사용 전제로 추상화하지 않습니다.

## 자동 검사

Python 3와 PATH에 있는 Godot 일반 버전을 사용합니다. 다른 경로는 `GODOT_BIN`으로 지정할 수 있습니다.

```bash
python3 tools/check_project.py .
godot --headless --path . --script res://tests/run_tests.gd
```

규칙/씬 테스트는 실패 시 종료 코드 1을 반환합니다. 정상 결과는 `RESULT: 351 checks, 0 failures`입니다. 범위/중복/턴, 양 플레이어의 네 방향 승리, 장목, 공백, 종료 후 입력, 225수 무승부, 초기화, 실제 카메라 레이 선택, 클릭, 애니메이션, 애니메이션 중 재시작을 검사합니다. Python 검사기는 Godot 종료 코드와 오류 로그를 함께 검사합니다.

헤드리스는 dummy 렌더러를 사용하므로 화면·셰이더·GPU 검증을 대신하지 않습니다.

## 플랫폼과 내보내기

기본 렌더러는 **Compatibility**입니다. 창 크기에 따라 카메라가 보드 전체를 보이도록 조정됩니다. 터치를 마우스 입력으로 연결하며 네이티브 확장이나 OS 종속 API는 사용하지 않습니다.

동일한 **4.6.3 Export Templates**가 필요합니다. 에디터의 `Editor → Manage Export Templates`에서 설치할 수 있습니다. Cloud의 `/workspace/godot-cloud/install.sh`는 공식 배포 ZIP/TPZ와 SHA-512 검증으로 같은 버전을 설치합니다.

```bash
mkdir -p exports/web
godot --headless --path . --export-release Web exports/web/index.html
python3 -m http.server 8000 --directory exports/web
```

Web 프리셋은 저장소에 포함되어 있고 스레드를 사용하지 않습니다. HTTP 서버로 열어야 하며 WebGL 2 지원 브라우저가 필요합니다.

| 플랫폼 | 현재 준비 상태 |
| --- | --- |
| Web | 프리셋 포함, release export 및 Chromium 소프트웨어 WebGL 실행 검증 |
| Windows | 일반 Godot Windows Desktop 프리셋으로 내보낼 수 있는 구조. 실제 빌드/실행 미검증 |
| Android | 터치 입력 및 화면 비율 대응. Android SDK/JDK, 서명키와 별도 프리셋 필요. 기기 미검증 |
| iOS | 모바일 호환 GDScript/Compatibility 구조. macOS/Xcode와 서명·프로비저닝 필요. 빌드/기기 미검증 |

이번 구현 범위는 로컬 오목입니다. AI, 온라인 대전, 저장, 게임 선택 메뉴, 사운드는 포함하지 않습니다.
