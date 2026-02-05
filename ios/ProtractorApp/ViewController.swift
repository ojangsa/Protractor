import UIKit
import WebKit
import CoreBluetooth

class ViewController: UIViewController, WKScriptMessageHandler, CBCentralManagerDelegate, CBPeripheralDelegate, WKUIDelegate, WKNavigationDelegate {
    
    var webView: WKWebView!
    var statusLabel: UILabel!
    
    // BLE Variables
    var centralManager: CBCentralManager!
    var peripheral: CBPeripheral?
    var angleCharacteristic: CBCharacteristic?
    
    // Constants
    let BLE_SERVICE_UUID = CBUUID(string: "12345678-1234-5678-1234-56789abcdef0")
    let BLE_ANGLE_CHAR_UUID = CBUUID(string: "12345678-1234-5678-1234-56789abcdef1")
    let BLE_STATUS_CHAR_UUID = CBUUID(string: "12345678-1234-5678-1234-56789abcdef2")
    let ESP32_WIFI_URL = "http://192.168.4.1"
    
    override func viewDidLoad() {
        super.viewDidLoad()
        
        setupUI() // Must be called FIRST to initialize statusLabel
        setupWebView()
        setupNativeLogic()
    }

    func setupUI() {
        // Toast/Status Label
        statusLabel = UILabel()
        statusLabel.frame = CGRect(x: 20, y: 100, width: view.bounds.width - 40, height: 50)
        statusLabel.backgroundColor = UIColor(white: 0, alpha: 0.7)
        statusLabel.layer.cornerRadius = 10
        statusLabel.clipsToBounds = true
        statusLabel.textColor = .white
        statusLabel.textAlignment = .center
        statusLabel.font = UIFont.boldSystemFont(ofSize: 14)
        statusLabel.alpha = 0 // Hidden by default
        statusLabel.isUserInteractionEnabled = false
        view.addSubview(statusLabel)
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
        webView.navigationDelegate = self
        
        // Disable scroll and adjust safe area behavior
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        
        view.addSubview(webView)
        
        // Bring status label to front
        view.bringSubviewToFront(statusLabel)
        
        // Load local index.html
        if let indexPath = Bundle.main.path(forResource: "index", ofType: "html") {
            let fileURL = URL(fileURLWithPath: indexPath)
            // Allow read access to the directory containing index.html
            webView.loadFileURL(fileURL, allowingReadAccessTo: fileURL.deletingLastPathComponent())
            statusLabel.text = "Loading index.html..."
        } else {
            print("Error: index.html not found")
            statusLabel.text = "Error: index.html not found.\nPlease add 'index.html' folder reference to Xcode project."
            view.bringSubviewToFront(statusLabel)
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        statusLabel.text = "" // Clear status on success
        statusLabel.isHidden = true
        print("WebView loaded.")
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        statusLabel.text = "Load Error: \(error.localizedDescription)"
        statusLabel.isHidden = false
        view.bringSubviewToFront(statusLabel)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        statusLabel.text = "Nav Error: \(error.localizedDescription)"
        statusLabel.isHidden = false
        view.bringSubviewToFront(statusLabel)
    }
    
    func setupNativeLogic() {
        centralManager = CBCentralManager(delegate: self, queue: nil)
    }
    
    // MARK: - WKScriptMessageHandler
    
    // Receive messages from JavaScript
    // Format: window.webkit.messageHandlers.nativeHandler.postMessage({command: "cmd", value: val})
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        print("Received JS Message Body: \(message.body)")
        
        guard let dict = message.body as? [String: Any],
              let command = dict["command"] as? String else {
            print("Error: Invalid message format")
            return
        }
        
        print("Processing Command: \(command)")
        
        switch command {
        case "connectBLE":
            if let p = peripheral, p.state == .connected {
                showToast("⚠️ Already Connected")
                notifyWeb("Already connected to \(p.name ?? "Device")")
            } else {
                startBLEScan()
            }
        case "sendAngle":
            if let angle = dict["value"] as? Int {
                print("Command: sendAngle, Value: \(angle)")
                sendAngle(angle)
            } else {
                print("Error: 'value' is not an Int. Raw value: \(String(describing: dict["value"]))")
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
        print("Attempting to send angle: \(angle)")
        
        // Try BLE first if available
        if let p = peripheral, let c = angleCharacteristic {
            if p.state == .connected {
                let str = String(angle)
                if let data = str.data(using: .utf8) {
                    // Write without response for speed, if possible (property check logic omitted for brevity, assuming supported as per ESP32 code)
                    p.writeValue(data, for: c, type: .withoutResponse)
                    print("BLE Write Success: \(angle) (Data: \(str))")
                    notifyWeb("Angle sent via BLE: \(angle)")
                } else {
                    print("Error: Failed to encode string to data")
                }
                return
            } else {
                print("Error: Peripheral is not connected (State: \(p.state.rawValue))")
            }
        } else {
            print("Error: Peripheral or Characteristic is nil. P: \(peripheral == nil ? "nil" : "ok"), C: \(angleCharacteristic == nil ? "nil" : "ok")")
        }
        
        // Try WiFi (HTTP) if BLE not ready
        // Native HTTP request bypasses Mixed Content issues
        print("Falling back to WiFi...")
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
                self.notifyWeb("WiFi Send Error: \(error.localizedDescription)")
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
    
    func showToast(_ message: String) {
        DispatchQueue.main.async {
            self.statusLabel.text = message
            self.statusLabel.alpha = 1
            
            // Fade out after 3 seconds
            UIView.animate(withDuration: 0.5, delay: 3.0, options: .curveEaseOut, animations: {
                self.statusLabel.alpha = 0
            }, completion: nil)
        }
    }
    
    func updateWebBLEStatus(_ status: String) {
        // Call a JS function to update status UI
        let js = "if(window.updateNativeStatus) window.updateNativeStatus('ble', '\(status)');"
        DispatchQueue.main.async {
            self.webView.evaluateJavaScript(js, completionHandler: nil)
        }
    }
    
    // MARK: - CoreBluetooth Delegate
    
    func startBLEScan() {
        if centralManager.state == .poweredOn {
            // Scan for ALL devices (nil) to avoid missing the device if UUID is not in adv packet
            centralManager.scanForPeripherals(withServices: nil, options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
            notifyWeb("Scanning for Protractor-Servo...")
            showToast("🔍 Scanning for Device...")
        } else {
            notifyWeb("Bluetooth is not ready.")
            showToast("❌ Bluetooth not ready")
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
        
        // Filter by Name since UUID scanning can be flaky
        // Search for "Pro-Servo" (New) or "Protractor" (Old/Cached)
        if let name = peripheral.name, (name.contains("Pro") || name.contains("Protractor")) {
            // Connect automatically to our device
            self.peripheral = peripheral
            self.peripheral?.delegate = self
            centralManager.stopScan()
            centralManager.connect(peripheral, options: nil)
            notifyWeb("Connecting to \(name)...")
            showToast("✅ Found \(name)! Connecting...")
        }
    }
    
    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        print("Connected to \(peripheral.name ?? "n/a")")
        updateWebBLEStatus("connected")
        peripheral.discoverServices([BLE_SERVICE_UUID])
        showToast("🔗 Connected!")
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
                // Discover Angle AND Status characteristics
                peripheral.discoverCharacteristics([BLE_ANGLE_CHAR_UUID, BLE_STATUS_CHAR_UUID], for: service)
            }
        }
    }
    
    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        if let characteristics = service.characteristics {
            for characteristic in characteristics {
                if characteristic.uuid == BLE_ANGLE_CHAR_UUID {
                    self.angleCharacteristic = characteristic
                    print("✅ Angle Characteristic Found")
                    notifyWeb("BLE Ready!")
                } else if characteristic.uuid == BLE_STATUS_CHAR_UUID {
                    print("✅ Status Characteristic Found - Enabling Notify")
                    peripheral.setNotifyValue(true, for: characteristic)
                }
            }
        }
    }
    
    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        if let error = error {
            print("Error receiving notification: \(error.localizedDescription)")
            return
        }
        
        if characteristic.uuid == BLE_STATUS_CHAR_UUID, let data = characteristic.value {
            let statusStr = String(data: data, encoding: .utf8) ?? "Invalid Data"
            print("📩 ESP32 Status Update: \(statusStr)")
            showToast("ESP32 Ack: \(statusStr)")
        }
    }
}
