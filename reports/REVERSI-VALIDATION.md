# 리버시 구현·검증 결과

## 구현 범위

- 독립적인 8×8 규칙, 8방향 동시 뒤집기, 자동 패스와 실제 돌 개수 판정.
- 오목과 독립적인 세션·선호 저장, 초기 상태에서 합법 착수 기록을 재생하여 검증.
- 공통 Worker 요청 세대 관리와 게임 세션 세대로 이전 결과를 폐기. 각 게임의 규칙·AI·Worker 엔트리는 분리.
- 3D 에메랄드 보드·좌표 표기·양면 원판·순차 180도 뒤집기, 합법 수 안내와 PC·터치·키보드 입력.
- 같은 보드 장면의 카메라·Raycaster·자원 해제를 공유하고, 오목의 기존 기본 파라미터는 유지.

## 규칙·탐색 검증

`npm test` 107개 통과: 기존 오목 60개와 리버시 47개입니다. 초기 D3/C4/F5/E6, 8방향, 다방향, 잘못된 수의 불변성, 경계, 자동 패스, 빈 칸이 있는 종료, 승패·무승부·실제 개수, 저장 복구를 검증했습니다.

전문가의 6빈칸 상태 3개는 공개 불변 규칙 API로 만든 독립 완전 탐색 기준과 최종 점수·선택 수의 값이 일치했습니다. 전이표 사용/미사용을 각각 비교했습니다. 한 종반 사례에서는 전문가가 입문 휴리스틱보다 더 좋은 최종 돌 수 차이를 얻었습니다. 협력적 생성기의 일시 중단 전후 고정 노드 결과 일치와 원본 보드 불변성도 검증했습니다. 고정 노드 예산의 시드 재현성, 시간·노드 제한 반환과 미완료 정확 탐색의 `solved: false`도 확인했습니다.

## 기본 계산 예산: 3개 위치씩

Node.js v24.22.1에서 4·24·58개 돌이 놓인 위치를 각 난이도당 한 번씩 측정했습니다. 동기 API의 계산 시간으로, Worker 기동, 비동기 실행 양보, 초기 그래픽 준비와 UI 연출 대기는 제외합니다. 브라우저 Worker는 같은 탐색 생성기에서 약 8ms마다 약 2ms 실행을 양보하고, 보드·전이표·탐색 스택을 유지합니다. 브라우저의 완료 깊이는 이 양보와 환경 부하로 달라질 수 있습니다.

| 난이도 | 예산(ms) | 평균(ms) | 최대(ms) | 완료 깊이(4/24/58개 돌) |
| ------ | -------: | -------: | -------: | ----------------------- |
| 입문   |      100 |     0.25 |     0.63 | 0 / 0 / 0               |
| 쉬움   |      300 |     0.07 |     0.10 | 0 / 0 / 0               |
| 보통   |     1000 |    17.67 |    32.16 | 4 / 4 / 4               |
| 어려움 |     2000 |   374.87 |   957.39 | 6 / 6 / 6               |
| 전문가 |     3000 |  2002.11 |  3000.65 | 9 / 6 / 6               |

전문가는 빈 칸 10개 이하에서 남은 깊이 전체를 목표로 탐색합니다. 다음은 별도 측정한 2개 종반 사례입니다.

| 빈 칸 | 시간(ms) | 완료 깊이 | 정확 탐색 완료 | 전이표 적중 |
| ----: | -------: | --------: | -------------- | ----------: |
|     8 |    20.34 |         8 | True           |          24 |
|    10 |    99.15 |        10 | True           |         327 |

이 두 사례는 10빈칸 종반 탐색을 시도하는 기준의 초기 측정 근거이며 모든 종반의 완료 시간을 보장하지 않습니다. 예산에 도달하면 마지막 완료 깊이의 수를 반환하고 미해결로 남깁니다.

기록: [reversi-default-budget.json](reversi-default-budget.json), [reversi-endgame-budget.json](reversi-endgame-budget.json).

## 흑백 교대 40경기

실행: `npm run reversi:evaluate`의 기본 5% 계산 예산. 서로 다른 4수 개막 2개를 각 조합에서 흑백 교대로 사용했습니다. 난이도마다 흑 8·백 8경기입니다.

| 난이도 |  승 |  패 | 무승부 | 미완료 |   승률 | 평균(ms/수) | 최대(ms/수) | 강제 패스 당함 | 예산 도달 반환 | 불법 수 | 오류 |
| ------ | --: | --: | -----: | -----: | -----: | ----------: | ----------: | -------------: | -------------: | ------: | ---: |
| 입문   |   1 |  15 |      0 |      0 |  6.25% |        3.32 |     1280.28 |             41 |              0 |       0 |    0 |
| 쉬움   |   4 |  12 |      0 |      0 | 25.00% |        2.07 |      493.26 |             39 |              0 |       0 |    0 |
| 보통   |   7 |   9 |      0 |      0 | 43.75% |       27.58 |      511.44 |             16 |             69 |       0 |    0 |
| 어려움 |  13 |   3 |      0 |      0 | 81.25% |       90.65 |      818.97 |              3 |            351 |       0 |    0 |
| 전문가 |  15 |   1 |      0 |      0 | 93.75% |      164.57 |     3252.89 |              5 |            392 |       0 |    0 |

40경기가 모두 규칙상 정상 종료했습니다. 승률은 난이도 순으로 증가했지만, 두 개막과 단축 예산의 소규모 표본만으로 일반적인 강약이나 전문가의 무패를 보장하지 않습니다. 전체 기본 예산의 다양한 개막 리그가 추가로 필요합니다.

단축 예산은 5·15·50·100·150ms입니다. 일부 벽시계 최대 시간은 예산을 크게 초과했습니다. 타이머 검사는 OS의 선점·정지·GC 시간을 제어하지 못하며 구간별 평가 작업도 포함됩니다. 정확한 초과 원인 분리와 실기기 측정은 남은 과제입니다. 예산 도달 후 반환한 합법 수는 계산 오류나 중단 경기로 세지 않습니다.

전체 착수 인덱스·개막·패스 기록과 통계: [reversi-round-robin.json](reversi-round-robin.json).

## 한계와 다음 단계

- 안정적인 돌은 코너에서 이어진 연속 가장자리만 계산하는 보수적 하한입니다. 내부 안정성 전체를 판정하지 않습니다. 지역 패리티 역시 휴리스틱입니다.
- 보통·어려움은 후보 폭과 깊이가 제한됩니다. 전문가는 모든 합법 후보를 탐색하지만 시간 예산으로 인해 최대 설정 깊이에 도달하지 않을 수 있습니다.
- 같은 시드라도 벽시계 제한에서는 머신 부하로 결과가 달라질 수 있습니다. 결정적인 회귀 비교에는 고정 노드 예산을 사용합니다.
- 실제 iOS/Android/Safari·Firefox 및 장시간 발열·메모리는 미검증입니다. 클라우드 브라우저는 Chromium + Pixel 7 에뮬레이션 + SwiftShader입니다.
- 다음 개선은 기본 예산의 큰 표본 리그, 증분 이동 가능성·안정성 평가, 종반 수 정렬과 실기기 검증입니다.

## 브라우저 검증

- 최종 상태 기준 **오목 12개 + 리버시 10개 = 22개 시나리오 통과**입니다. 전체 실행에서는 20개 통과·무작위 색상 관련 2개 실패였고, 해당 검사 수정 후 PC·모바일 2개가 모두 통과했습니다. 스킵된 시나리오는 없습니다.
- 초기 검사에서 사용한 전역 난수 고정은 렌더러 난수에도 영향을 주므로 제거했습니다. 최종 검사는 실제 배정된 색상(흑 또는 백)이 재개 후 그대로 유지되는지 확인합니다. AI 선공 대기는 초기 그래픽 준비를 포함해 최대 15초로 검증하며 실제 검색 예산과 구분합니다.
- 실제 WebGL의 마우스·터치 착수와 뒤집기, 불법 수 거부, 합법 수 안내, 돌 개수·차례, 자동 패스, 저장·재개, 카메라 캔버스 이미지 변화, 재시작과 양방향 게임 전환을 확인했습니다.
- 난이도·색상·다음 대국 적용, 오목과 설정 분리, 저장 실패 시 현재 선택 보존, 무작위 색상 재개를 확인했습니다.
- 실제 Worker 시작 사건 이후 전문가 계산 중 PC·모바일 모두 약 1.2초에 **72회 프레임 갱신**을 확인했습니다. 최대 간격은 PC 16.8ms·모바일 16.7ms, 30ms 타이머도 각각 40회 실행됐습니다. 단일 표본이며 실제 기기 전체 성능의 보장은 아닙니다.
- 계산 중 오목→리버시, 리버시→오목으로 전환한 후 이전 수가 새 대국에 반영되지 않았습니다.
- 초기에 타이머는 실행되는데 그래픽 프레임이 지연되는 현상이 있었습니다. 첫 GPU 작업 완료를 동기식으로 막지 않고 fence로 확인한 뒤 AI를 시작하고, 동일 크기 ResizeObserver의 재렌더링을 줄였습니다. Worker는 탐색 스택·전이표를 보존하면서 짧은 구간마다 실행을 양보합니다.

기록: [reversi-browser-validation.json](reversi-browser-validation.json).

## 배포와 실행

`npm install`, `npm run dev`, `npm run build`, `npm test`, `npm run preview`, `npm run test:e2e`를 유지했습니다. `npm run reversi:evaluate`와 `npm run build:html`을 추가했습니다. 후자는 두 게임과 AI Worker가 내장된 `dist/world-table-games.html`을 생성합니다.

`/table/` 하위 경로 빌드를 임시 HTTP 서버에서 실행해 두 게임과 두 Worker가 모두 해당 경로 아래에서 로딩되고 AI 선공하는 것을 검증했습니다: [reversi-subpath-smoke.json](reversi-subpath-smoke.json).

환경 게시·원격 푸시·공개 배포·저장소 공개 설정 변경은 수행하지 않았습니다.

단일 HTML도 외부 자원 요청을 모두 차단한 HTTP 검증에서 오목·리버시 AI의 선공과 응답, 두 Blob Worker, PC·모바일 레이아웃을 확인했습니다. 이 검증은 직접 `file://` 실행이나 실제 iOS 기기 검증과 구분합니다: [reversi-single-html.json](reversi-single-html.json).


## 생성·수정 파일

- `AGENTS.md`
- `README.md`
- `ROADMAP.md`
- `package.json`
- `reports/REVERSI-VALIDATION.md`
- `reports/reversi-browser-validation.json`
- `reports/reversi-default-budget.json`
- `reports/reversi-endgame-budget.json`
- `reports/reversi-round-robin.json`
- `reports/reversi-single-html.json`
- `reports/reversi-subpath-smoke.json`
- `reversi-evaluation.config.ts`
- `scripts/export-html.mjs`
- `src/core/ai.ts`
- `src/core/catalog.ts`
- `src/core/storage.ts`
- `src/engine/ai-client.ts`
- `src/engine/board-view.ts`
- `src/engine/sound.ts`
- `src/games/gomoku/ai/client.ts`
- `src/games/gomoku/ai/difficulty.ts`
- `src/games/reversi/ai.ts`
- `src/games/reversi/client.ts`
- `src/games/reversi/coordinates.ts`
- `src/games/reversi/difficulty.ts`
- `src/games/reversi/evaluator.ts`
- `src/games/reversi/rules.ts`
- `src/games/reversi/storage.ts`
- `src/games/reversi/worker.ts`
- `src/style.css`
- `src/ui/app.ts`
- `src/ui/dialog.ts`
- `src/ui/reversi.ts`
- `tests/e2e/game.spec.ts`
- `tests/e2e/reversi.spec.ts`
- `tests/reversi-evaluation.ts`
- `tests/reversi-fixtures.ts`
- `tests/reversi-performance.ts`
- `tests/reversi.test.ts`
