import UIKit
import WebKit
import CoreBluetooth

class ViewController: UIViewController, WKScriptMessageHandler, CBCentralManagerDelegate, CBPeripheralDelegate, WKUIDelegate {
    
    var webView: WKWebView!
    
    // BLE Variables
    var centralManager: CBCentralManager!
    var peripheral: CBPeripheral?
    var angleCharacteristic: CBCharacteristic?
    
    // Constants
    let BLE_SERVICE_UUID = CBUUID(string: "12345678-1234-5678-1234-56789abcdef0")
    let BLE_ANGLE_CHAR_UUID = CBUUID(string: "12345678-1234-5678-1234-56789abcdef1")
    let ESP32_WIFI_URL = "http://192.168.4.1"
    
    override func viewDidLoad() {
        super.viewDidLoad()
        
        setupWebView()
        setupNativeLogic()
    }
    
    func setupWebView() {
        let contentController = WKUserContentController()
        // Register native handler
        contentController.add(self, name: "nativeHandler")
        
        let config = WKWebViewConfiguration()
        config.userContentController = contentController
        
        // Allow media playback and other standard configs
        config.allowsInlineMediaPlayback = true
        if #available(iOS 10.0, *) {
            config.mediaTypesRequiringUserActionForPlayback = []
        }
        
        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.uiDelegate = self
        
        // Disable scroll to feel like an app
        webView.scrollView.bounces = false
        
        view.addSubview(webView)
        
        // Load local index.html
        if let indexPath = Bundle.main.path(forResource: "index", ofType: "html") {
            let fileURL = URL(fileURLWithPath: indexPath)
            // Allow read access to the directory containing index.html
            webView.loadFileURL(fileURL, allowingReadAccessTo: fileURL.deletingLastPathComponent())
        } else {
            print("Error: index.html not found")
        }
    }
    
    func setupNativeLogic() {
        centralManager = CBCentralManager(delegate: self, queue: nil)
    }
    
    // MARK: - WKScriptMessageHandler
    
    // Receive messages from JavaScript
    // Format: window.webkit.messageHandlers.nativeHandler.postMessage({command: "cmd", value: val})
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let dict = message.body as? [String: Any],
              let command = dict["command"] as? String else {
            return
        }
        
        print("Received JS Command: \(command)")
        
        switch command {
        case "connectBLE":
            startBLEScan()
        case "sendAngle":
            if let angle = dict["value"] as? Int {
                sendAngle(angle)
            }
        case "disconnectBLE":
            disconnectBLE()
        case "log":
            if let msg = dict["value"] as? String {
                print("JS Log: \(msg)")
            }
        default:
            break
        }
    }
    
    // MARK: - Control Logic
    
    func sendAngle(_ angle: Int) {
        // Try BLE first if available
        if let p = peripheral, let c = angleCharacteristic, p.state == .connected {
            let str = String(angle)
            if let data = str.data(using: .utf8) {
                // Write without response for speed, if possible (property check logic omitted for brevity, assuming supported as per ESP32 code)
                p.writeValue(data, for: c, type: .withoutResponse)
                notifyWeb("Angle sent via BLE: \(angle)")
            }
            return
        }
        
        // Try WiFi (HTTP) if BLE not ready
        // Native HTTP request bypasses Mixed Content issues
        sendViaWiFi(angle)
    }
    
    func sendViaWiFi(_ angle: Int) {
        guard let url = URL(string: "\(ESP32_WIFI_URL)/angle?value=\(angle)") else { return }
        
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 2.0 // Short timeout for UDP-like feel
        
        let task = URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                print("WiFi Error: \(error.localizedDescription)")
                // Optional: Notify web about error
            } else {
                print("WiFi Success: \(angle)")
            }
        }
        task.resume()
    }
    
    func notifyWeb(_ message: String) {
        let js = "console.log('[Native] \(message)');"
        DispatchQueue.main.async {
            self.webView.evaluateJavaScript(js, completionHandler: nil)
        }
    }
    
    func updateWebBLEStatus(_ status: String) {
        // Call a JS function to update status UI
        // Assuming app.js has a function exposed or we simply log for now
        // A better approach: define a global function in app.js 'window.updateNativeStatus(mode, status)'
        let js = "if(window.updateNativeStatus) window.updateNativeStatus('ble', '\(status)');"
        DispatchQueue.main.async {
            self.webView.evaluateJavaScript(js, completionHandler: nil)
        }
    }
    
    // MARK: - CoreBluetooth Delegate
    
    func startBLEScan() {
        if centralManager.state == .poweredOn {
            centralManager.scanForPeripherals(withServices: [BLE_SERVICE_UUID], options: nil)
            notifyWeb("Scanning for Protractor-Servo...")
        } else {
            notifyWeb("Bluetooth is not ready.")
        }
    }
    
    func disconnectBLE() {
        if let p = peripheral {
            centralManager.cancelPeripheralConnection(p)
        }
    }
    
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        switch central.state {
        case .poweredOn:
            print("Bluetooth ON")
        case .poweredOff:
            print("Bluetooth OFF")
            updateWebBLEStatus("disconnected")
        case .unauthorized:
            print("Bluetooth Unauthorized")
        default:
            break
        }
    }
    
    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String : Any], rssi RSSI: NSNumber) {
        print("Discovered: \(peripheral.name ?? "Unknown")")
        
        // Connect automatically to our device
        self.peripheral = peripheral
        self.peripheral?.delegate = self
        centralManager.stopScan()
        centralManager.connect(peripheral, options: nil)
        notifyWeb("Connecting to \(peripheral.name ?? "Device")...")
    }
    
    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        print("Connected to \(peripheral.name ?? "n/a")")
        updateWebBLEStatus("connected")
        peripheral.discoverServices([BLE_SERVICE_UUID])
    }
    
    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        print("Disconnected")
        updateWebBLEStatus("disconnected")
        self.peripheral = nil
        self.angleCharacteristic = nil
    }
    
    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        if let services = peripheral.services {
            for service in services {
                peripheral.discoverCharacteristics([BLE_ANGLE_CHAR_UUID], for: service)
            }
        }
    }
    
    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        if let characteristics = service.characteristics {
            for characteristic in characteristics {
                if characteristic.uuid == BLE_ANGLE_CHAR_UUID {
                    self.angleCharacteristic = characteristic
                    print("Angle Characteristic Found")
                    notifyWeb("BLE Ready!")
                }
            }
        }
    }
}
