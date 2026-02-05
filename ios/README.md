# iOS 네이티브 앱 설정 가이드

이 디렉토리는 Protractor 컨트롤러의 iOS 하이브리드 앱 버전 소스 코드를 포함하고 있습니다. 이 앱은 웹 인터페이스를 네이티브 셸로 감싸 다음과 같은 기능을 제공합니다:

1.  **WiFi 제어**: Mixed Content 제한을 우회하여 HTTPS 환경에서도 HTTP(ESP32) 통신이 가능합니다.
2.  **BLE 제어**: 네이티브 CoreBluetooth를 사용하여 Bluefy 같은 별도 브라우저 없이도 블루투스 연결이 가능합니다.

## 설정 방법 (Setup Instructions)

`.xcodeproj` 파일을 직접 생성할 수 없으므로, Xcode에서 수동으로 프로젝트를 생성해야 합니다.

### 1. Xcode 프로젝트 생성
1.  **Xcode**를 실행합니다.
2.  **Create a new Xcode project**를 선택합니다.
3.  **iOS** -> **App**을 선택합니다.
4.  다음 정보를 입력합니다:
    -   **Product Name**: `ProtractorApp`
    -   **Interface**: `Storyboard` (또는 SwiftUI도 가능하지만, 제공된 코드는 UIKit/Storyboard 수명 주기를 기반으로 합니다. `SceneDelegate`가 있어 호환되지만, 안전하게 **Storyboard**를 선택하세요).
    -   **Language**: `Swift`.
5.  프로젝트를 `.../Protractor/ios/` 경로에 저장합니다.

### 2. 소스 파일 교체
1.  Finder에서 `.../Protractor/ios/ProtractorApp/` 폴더로 이동합니다.
2.  제가 생성해둔 파일들이 보일 것입니다: `ViewController.swift`, `Info.plist`, `AppDelegate.swift`, `SceneDelegate.swift`.
3.  이 파일들을 Xcode 프로젝트 네비게이터로 **드래그 앤 드롭**하여 기존 파일들을 교체(덮어쓰기)합니다.
    -   **"Copy items if needed"** 옵션이 **체크**되어 있는지 확인하세요.
    -   앱 타겟이 **체크**되어 있는지 확인하세요.

### 3. 웹 리소스 추가 (중요!)
1.  루트 `.../Protractor/` 디렉토리에 있는 `index.html`, `styles.css`, `app.js` 파일을 찾습니다.
2.  이 3개의 파일을 Xcode 프로젝트로 **드래그 앤 드롭**합니다.
3.  **중요**: 파일 추가 옵션 창에서:
    -   **"Create folder references"**를 선택하세요 (파란색 폴더 아이콘으로 추가되어야 합니다. 그래야 `index.html`이 `app.js`를 올바르게 찾을 수 있습니다).
    -   앱 타겟이 **체크**되어 있는지 확인하세요.

### 4. 빌드 및 실행
1.  아이폰을 Mac에 연결합니다.
2.  Xcode 상단에서 연결된 아이폰을 실행 대상으로 선택합니다.
3.  **Cmd + R**을 눌러 실행합니다.
4.  앱이 실행되면 권한 요청(로컬 네트워크, 블루투스, 카메라)을 모두 **허용**해주세요.

## 문제 해결 (Troubleshooting)
-   **"index.html not found" 오류**: 웹 파일들을 추가할 때 **"Folder References"** (파란색 폴더 아이콘)로 추가했는지 확인하세요.
-   **흰 화면만 나올 때**: Xcode 콘솔 로그를 확인하여 웹 파일 로딩 에러가 있는지 확인하세요.

## 주의사항: 시뮬레이터 (Simulator) 제한
**iOS 시뮬레이터**에서는 이 앱의 핵심 기능을 테스트할 수 없습니다.
1.  **WiFi 연결 불가**: 시뮬레이터는 Mac의 인터넷을 공유할 뿐, 특정 WiFi(ESP32)에 접속하는 기능이 없습니다.
2.  **블루투스(BLE) 불가**: 시뮬레이터는 블루투스를 지원하지 않습니다.

**반드시 실제 아이폰을 Mac에 연결하여 테스트해주세요.**

## 유료 개발자 계정 없이 테스트하기 (Free Provisioning)

연 $99의 유료 개발자 프로그램에 가입하지 않아도, 실제로 자신의 아이폰에 앱을 설치하고 테스트할 수 있습니다.

1.  Xcode 좌측 파일 네비게이터에서 최상단 프로젝트 아이콘을 클릭합니다.
2.  **Signing & Capabilities** 탭을 선택합니다.
3.  **Team** 항목에서 **Add an Account...**를 선택하고 본인의 일반 Apple ID로 로그인합니다.
4.  로그인 후, **Personal Team** (예: "홍길동 (Personal Team)")을 선택합니다.
5.  **Bundle Identifier**를 고유한 값으로 변경합니다 (예: `com.honggildong.ProtractorApp`).
6.  아이폰을 연결하고 **Run** 버튼을 클릭합니다.
7.  **개발자 신뢰 설정**:
    -   처음 실행 시 아이폰에서 "신뢰할 수 없는 개발자(Untrusted Developer)" 오류가 뜹니다.
    -   아이폰의 **설정(Settings)** -> **일반(General)** -> **VPN 및 기기 관리(VPN & Device Management)** (또는 프로파일 및 기기 관리)로 이동합니다.
    -   "개발자 앱" 항목 아래의 본인 Apple ID를 탭합니다.
    -   **"Apple ID"를 신뢰함**을 선택합니다.
8.  다시 Xcode에서 앱을 실행하면 정상적으로 열립니다.

*참고: 무료 계정으로 설치한 앱은 7일 후에 만료됩니다. 앱이 열리지 않으면 다시 컴퓨터에 연결하고 Xcode에서 Run을 눌러 재설치(서명 갱신)해주면 됩니다.*
