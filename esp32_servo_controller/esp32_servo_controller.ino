/*
 * ESP32 서보 모터 컨트롤러
 * Protractor 웹앱과 WiFi AP 모드로 연결하여 서보 모터를 제어합니다.
 * 
 * 연결:
 *   - 서보 모터 신호선: GPIO 13
 *   - 서보 모터 VCC: 5V (또는 외부 전원)
 *   - 서보 모터 GND: GND
 * 
 * WiFi AP 설정:
 *   - SSID: Protractor-Servo
 *   - 비밀번호: 12345678
 *   - IP: 192.168.4.1
 */

#include <WiFi.h>
#include <WebServer.h>
#include <ESP32Servo.h>

// WiFi AP 설정
const char* AP_SSID = "Protractor-Servo";
const char* AP_PASSWORD = "12345678";

// 서보 모터 설정
const int SERVO_PIN = 13;  // GPIO 13 (D13)
const int SERVO_MIN_PULSE = 500;   // 최소 펄스 폭 (마이크로초)
const int SERVO_MAX_PULSE = 2400;  // 최대 펄스 폭 (마이크로초)

// 각도 범위 (각도기 값)
const int ANGLE_MIN = -90;  // 좌측 최대
const int ANGLE_MAX = 90;   // 우측 최대

Servo servo;
WebServer server(80);

// 현재 각도
int currentAngle = 0;

void setup() {
  Serial.begin(115200);
  Serial.println();
  Serial.println("=== ESP32 Protractor Servo Controller ===");
  
  // 서보 모터 초기화
  ESP32PWM::allocateTimer(0);
  servo.setPeriodHertz(50);  // 서보는 50Hz
  servo.attach(SERVO_PIN, SERVO_MIN_PULSE, SERVO_MAX_PULSE);
  
  // 서보를 중앙 위치로 이동
  setServoAngle(0);
  Serial.println("서보 모터 초기화 완료 (중앙 위치)");
  
  // WiFi AP 모드 시작
  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID, AP_PASSWORD);
  
  IPAddress IP = WiFi.softAPIP();
  Serial.print("AP IP 주소: ");
  Serial.println(IP);
  Serial.print("SSID: ");
  Serial.println(AP_SSID);
  Serial.print("비밀번호: ");
  Serial.println(AP_PASSWORD);
  
  // 웹서버 라우트 설정
  server.on("/", handleRoot);
  server.on("/angle", handleAngle);
  server.on("/status", handleStatus);
  server.onNotFound(handleNotFound);
  
  // CORS 프리플라이트 요청 처리
  server.on("/angle", HTTP_OPTIONS, handleCORS);
  server.on("/status", HTTP_OPTIONS, handleCORS);
  
  server.begin();
  Serial.println("웹서버 시작됨");
  Serial.println("==========================================");
}

void loop() {
  server.handleClient();
}

// 각도를 서보 모터 값으로 변환 후 설정
// 입력: -90 ~ +90 (각도기 값)
// 출력: 0 ~ 180 (서보 모터 값)
void setServoAngle(int angle) {
  // 범위 제한
  angle = constrain(angle, ANGLE_MIN, ANGLE_MAX);
  
  // 각도기 값을 서보 값으로 변환: -90 → 0, 0 → 90, +90 → 180
  int servoAngle = angle + 90;
  
  servo.write(servoAngle);
  currentAngle = angle;
  
  Serial.print("각도 설정: ");
  Serial.print(angle);
  Serial.print("° → 서보: ");
  Serial.print(servoAngle);
  Serial.println("°");
}

// CORS 헤더 추가
void addCORSHeaders() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
}

// CORS 프리플라이트 요청 처리
void handleCORS() {
  addCORSHeaders();
  server.send(204);
}

// 루트 페이지
void handleRoot() {
  addCORSHeaders();
  
  String html = "<!DOCTYPE html><html><head>";
  html += "<meta charset='UTF-8'>";
  html += "<meta name='viewport' content='width=device-width, initial-scale=1'>";
  html += "<title>Protractor Servo Controller</title>";
  html += "<style>";
  html += "body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; ";
  html += "max-width: 400px; margin: 50px auto; padding: 20px; text-align: center; ";
  html += "background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; }";
  html += ".card { background: white; border-radius: 20px; padding: 30px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); }";
  html += "h1 { color: #333; margin-bottom: 20px; }";
  html += ".angle { font-size: 48px; font-weight: bold; color: #667eea; }";
  html += ".label { color: #666; margin-top: 10px; }";
  html += ".status { margin-top: 20px; padding: 10px; background: #e8f5e9; border-radius: 10px; color: #2e7d32; }";
  html += "</style></head><body>";
  html += "<div class='card'>";
  html += "<h1>📐 Protractor Servo</h1>";
  html += "<div class='angle'>" + String(currentAngle) + "°</div>";
  html += "<div class='label'>현재 각도</div>";
  html += "<div class='status'>✓ 서보 모터 연결됨</div>";
  html += "</div></body></html>";
  
  server.send(200, "text/html", html);
}

// 각도 설정 엔드포인트
// GET /angle?value=45
void handleAngle() {
  addCORSHeaders();
  
  if (server.hasArg("value")) {
    int angle = server.arg("value").toInt();
    
    // 범위 검증
    if (angle < ANGLE_MIN || angle > ANGLE_MAX) {
      server.send(400, "application/json", 
        "{\"error\":\"Invalid angle. Range: " + String(ANGLE_MIN) + " to " + String(ANGLE_MAX) + "\"}");
      return;
    }
    
    setServoAngle(angle);
    
    String response = "{\"success\":true,\"angle\":" + String(currentAngle) + 
                      ",\"servoAngle\":" + String(currentAngle + 90) + "}";
    server.send(200, "application/json", response);
  } else {
    // 인자 없이 호출 시 현재 각도 반환
    String response = "{\"angle\":" + String(currentAngle) + 
                      ",\"servoAngle\":" + String(currentAngle + 90) + "}";
    server.send(200, "application/json", response);
  }
}

// 상태 확인 엔드포인트 (연결 테스트용)
void handleStatus() {
  addCORSHeaders();
  
  String response = "{";
  response += "\"connected\":true,";
  response += "\"angle\":" + String(currentAngle) + ",";
  response += "\"servoAngle\":" + String(currentAngle + 90) + ",";
  response += "\"ssid\":\"" + String(AP_SSID) + "\",";
  response += "\"ip\":\"" + WiFi.softAPIP().toString() + "\",";
  response += "\"clients\":" + String(WiFi.softAPgetStationNum());
  response += "}";
  
  server.send(200, "application/json", response);
}

// 404 처리
void handleNotFound() {
  addCORSHeaders();
  server.send(404, "application/json", "{\"error\":\"Not found\"}");
}
